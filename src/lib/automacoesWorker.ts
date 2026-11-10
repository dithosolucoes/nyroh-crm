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
}

export interface ResumoWorker {
  processados: number;
  simulados: number;
  cancelados: number;
  /** Itens que outro ciclo já reservou: não são executados aqui. */
  ignorados: number;
}

export async function processarVencidos(agora: Date, deps: DepsWorker, limite = 50): Promise<ResumoWorker> {
  const itens = await deps.buscarVencidos(agora, limite);
  const resumo: ResumoWorker = { processados: 0, simulados: 0, cancelados: 0, ignorados: 0 };

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
      resumo.simulados++;
      await deps.marcarResultado(it.id, 'executado', 'Simulado: envio desligado, nada foi enviado', r.text);
      continue;
    }

    resumo.simulados++;
    await deps.marcarResultado(it.id, 'executado', `Ação ${it.acao} registrada, não aplicada nesta etapa`, null);
  }

  return resumo;
}
