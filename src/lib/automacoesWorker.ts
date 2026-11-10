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
import { avaliarCondicoes, type EventoLead } from './automacoesEstado';

export interface ContextoLeadWorker extends LeadTokenContext {
  /** Lead que pediu para não receber mensagens. Lido de novo antes de cada passo. */
  optout?: boolean;
  /** Lead pausado ou em revisão pelo motor. */
  pausado?: boolean;
  /** Último comando do cliente, para a condição ultimo_comando. */
  ultimoComando?: EventoLead | null;
  /** Data da última mensagem enviada pelo cliente. Base da janela de 24h. */
  ultimaMensagemDoCliente?: Date | null;
}

/** Janela de 24h: texto livre só vale até 24h depois da última mensagem do cliente. */
export function dentroDaJanela24h(ultima: Date | null | undefined, agora: Date): boolean {
  if (!ultima) return false;
  const diff = agora.getTime() - ultima.getTime();
  return diff >= 0 && diff < 24 * 60 * 60 * 1000;
}

/** Horário comercial em Brasília: 08:00 às 18:00. Faixa provisória, decisão na fase F. */
export function dentroDoHorarioComercial(agora: Date): boolean {
  const hora = Number(new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(agora));
  return hora >= 8 && hora < 18;
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

    // Condições da regra: lidas agora, com o estado atual do lead. Falhou = cancela com o motivo.
    if (it.condicoes && it.condicoes.length > 0) {
      const ctxCond = await deps.contextoDoLead(it.leadId);
      const av = avaliarCondicoes(it.condicoes, {
        optout: Boolean(ctxCond?.optout),
        pausado: Boolean(ctxCond?.pausado),
        janela24h: dentroDaJanela24h(ctxCond?.ultimaMensagemDoCliente, agora),
        horarioComercial: dentroDoHorarioComercial(agora),
        ultimoComando: ctxCond?.ultimoComando ?? null,
      });
      if (!av.ok) {
        resumo.cancelados++;
        const motivo = `Condição não atendida: ${av.falhas.join(', ')}`;
        resumo.auditoria.push(registroAuditoria('pulou', motivo, agora, { leadId: it.leadId, regraId: it.automacaoId }));
        await deps.marcarResultado(it.id, 'cancelado', motivo, null);
        continue;
      }
    }

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
      // Janela de 24h: texto livre fora dela não sai (blueprint, seção 8). Vai para o motivo claro.
      if (!dentroDaJanela24h(ctx.ultimaMensagemDoCliente, agora)) {
        resumo.cancelados++;
        const motivo = 'Fora da janela de 24h: texto livre não enviado (use um modelo aprovado)';
        resumo.auditoria.push(registroAuditoria('bloqueou', motivo, agora, { leadId: it.leadId, regraId: it.automacaoId }));
        await deps.marcarResultado(it.id, 'cancelado', motivo, null);
        continue;
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
