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

export interface DepsWorker {
  buscarVencidos: (agora: Date, limite: number) => Promise<ItemFila[]>;
  contextoDoLead: (leadId: string) => Promise<LeadTokenContext | null>;
  marcarResultado: (id: string, status: 'executado' | 'cancelado', resultado: string, textoFinal: string | null) => Promise<void>;
}

export interface ResumoWorker {
  processados: number;
  simulados: number;
  cancelados: number;
}

export async function processarVencidos(agora: Date, deps: DepsWorker, limite = 50): Promise<ResumoWorker> {
  const itens = await deps.buscarVencidos(agora, limite);
  const resumo: ResumoWorker = { processados: 0, simulados: 0, cancelados: 0 };

  for (const it of itens) {
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
