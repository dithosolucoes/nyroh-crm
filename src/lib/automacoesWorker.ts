/**
 * Processador da fila das automações. Executa os passos vencidos, SEM ENVIAR NADA.
 *
 * Este módulo não tem nenhuma função de envio nas dependências. Para uma mensagem sair
 * para o cliente seria preciso adicionar um envio explícito, numa etapa separada e aprovada.
 *
 * Resultado de cada passo:
 *  - espera concluída: marcada como executada;
 *  - enviar texto: mostra o texto final com os dados reais do lead, marca como "simulado";
 *    se faltar algum dado do lead, cancela o passo e registra o motivo;
 *  - outras ações (opt-out, pausar, revisão...): registradas, sem aplicar nada nesta etapa.
 */
import { resolveLeadTokens, type LeadTokenContext } from './leadTokens';
import type { ItemFila } from './automacoesExecucao';
import { dentroDosLimites, registroAuditoria, type LimitesLead, type RegistroAuditoria } from './automacoesLimites';

export interface ContextoLeadWorker extends LeadTokenContext {
  /** Lead que pediu para não receber mensagens. Lido de novo antes de cada passo. */
  optout?: boolean;
}

export interface DepsWorker {
  buscarVencidos: (agora: Date, limite: number) => Promise<ItemFila[]>;
  /** Reserva o item para este ciclo (pendente -> executando). Falso se outro ciclo já pegou. */
  reservar: (id: string) => Promise<boolean>;
  contextoDoLead: (leadId: string) => Promise<ContextoLeadWorker | null>;
  marcarResultado: (id: string, status: 'executado' | 'cancelado', resultado: string, textoFinal: string | null) => Promise<void>;
  /** Datas dos envios automáticos recentes do lead (para os limites). Opcional. */
  enviosRecentes?: (leadId: string, agora: Date) => Promise<Date[]>;
}

export interface OpcoesWorker {
  /** Pausa geral: não reserva nem executa nada. A fila fica intacta. */
  pausaGeral?: boolean;
  limites?: LimitesLead;
}

export interface ResumoWorker {
  processados: number;
  simulados: number;
  cancelados: number;
  /** Itens que outro ciclo já reservou: não são executados aqui. */
  ignorados: number;
  /** Quando a pausa geral está ligada, nada é processado. */
  pausado: boolean;
  auditoria: RegistroAuditoria[];
}

export async function processarVencidos(
  agora: Date,
  deps: DepsWorker,
  limite = 50,
  opcoes: OpcoesWorker = {}
): Promise<ResumoWorker> {
  const resumo: ResumoWorker = { processados: 0, simulados: 0, cancelados: 0, ignorados: 0, pausado: false, auditoria: [] };
  // Pausa geral: para antes de tocar em qualquer item. Os itens continuam pendentes.
  if (opcoes.pausaGeral) {
    resumo.pausado = true;
    return resumo;
  }
  const itens = await deps.buscarVencidos(agora, limite);

  for (const it of itens) {
    // Idempotência: só executa quem conseguir reservar o item. Dois ciclos não pegam o mesmo passo.
    const reservado = await deps.reservar(it.id);
    if (!reservado) {
      resumo.ignorados++;
      continue;
    }
    resumo.processados++;

    if (it.acao === 'esperar') {
      await deps.marcarResultado(it.id, 'executado', 'Espera concluída', null);
      continue;
    }

    if (it.acao === 'enviar_texto') {
      const ctx = await deps.contextoDoLead(it.leadId);
      if (!ctx) {
        resumo.cancelados++;
        await deps.marcarResultado(it.id, 'cancelado', 'Lead não encontrado', null);
        continue;
      }
      // Opt-out: lido de novo neste passo. Se o lead saiu, o passo não executa.
      if (ctx.optout) {
        resumo.cancelados++;
        await deps.marcarResultado(it.id, 'cancelado', 'Lead com opt-out: passo não executado', null);
        continue;
      }
      const r = resolveLeadTokens(it.texto || '', ctx);
      const faltando = [...r.empty, ...r.unknown];
      if (faltando.length > 0) {
        resumo.cancelados++;
        await deps.marcarResultado(it.id, 'cancelado', `Variável sem dado para este lead: ${faltando.join(', ')}`, null);
        continue;
      }
      // Limites por lead: texto automático só sai se o lead ainda estiver dentro dos limites.
      if (deps.enviosRecentes) {
        const envios = await deps.enviosRecentes(it.leadId, agora);
        const lim = dentroDosLimites(envios, agora, opcoes.limites);
        if (!lim.ok) {
          resumo.cancelados++;
          resumo.auditoria.push(registroAuditoria('bloqueou', lim.motivo, agora, { leadId: it.leadId, regraId: it.automacaoId }));
          await deps.marcarResultado(it.id, 'cancelado', lim.motivo, null);
          continue;
        }
      }
      resumo.simulados++;
      resumo.auditoria.push(registroAuditoria('executou', 'Simulado: nada foi enviado', agora, { leadId: it.leadId, regraId: it.automacaoId }));
      await deps.marcarResultado(it.id, 'executado', 'Simulado: envio desligado, nada foi enviado', r.text);
      continue;
    }

    resumo.simulados++;
    await deps.marcarResultado(it.id, 'executado', `Ação ${it.acao} registrada, não aplicada nesta etapa`, null);
  }

  return resumo;
}
