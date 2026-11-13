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
import { ENVIO_PADRAO, decidirEnvio, type ConfigEnvio } from './automacoesEnvio';
import { dentroDosLimites, registroAuditoria, type LimitesLead, type RegistroAuditoria } from './automacoesLimites';
import { avaliarCondicoes, type EventoLead, type ContextoAvaliacao } from './automacoesEstado';

export interface ContextoLeadWorker extends LeadTokenContext {
  /** Lead que pediu para não receber mensagens. Lido de novo antes de cada passo. */
  optout?: boolean;
  /** Lead pausado ou em revisão pelo motor. */
  pausado?: boolean;
  /** Último comando do cliente, para a condição ultimo_comando. */
  ultimoComando?: EventoLead | null;
  /** Data da última mensagem enviada pelo cliente. Base da janela de 24h. */
  ultimaMensagemDoCliente?: Date | null;
  /** Etiquetas do lead. Ausente = dado indisponível (a condição de etiqueta fica falsa). */
  tags?: string[];
  /** Campos do lead, para as condições de campo. Ausente = indisponível. */
  campos?: Record<string, unknown>;
  /** Status do lead. */
  status?: string;
  /** Regras que já executaram para o lead: id da regra -> quando. Ausente = indisponível. */
  regrasExecutadas?: Record<string, string>;
}

/** Janela de 24h: texto livre só vale até 24h depois da última mensagem do cliente. */
export function dentroDaJanela24h(ultima: Date | null | undefined, agora: Date): boolean {
  if (!ultima) return false;
  const diff = agora.getTime() - ultima.getTime();
  return diff >= 0 && diff < 24 * 60 * 60 * 1000;
}


export interface DepsWorker {
  buscarVencidos: (agora: Date, limite: number) => Promise<ItemFila[]>;
  /** Reserva o item para este ciclo (pendente -> executando). Falso se outro ciclo já pegou. */
  reservar: (id: string) => Promise<boolean>;
  contextoDoLead: (leadId: string) => Promise<ContextoLeadWorker | null>;
  marcarResultado: (id: string, status: 'executado' | 'cancelado', resultado: string, textoFinal: string | null) => Promise<void>;
  /** Datas dos envios automáticos recentes do lead (para os limites). Opcional. */
  enviosRecentes?: (leadId: string, agora: Date) => Promise<Date[]>;
  /**
   * Executor das ações que mudam dados do lead (etiqueta, campo, status, funil, variável, revisão,
   * opt-out, pausa, aviso). Sem ele, a ação é CANCELADA com motivo: nada é aplicado em silêncio.
   */
  aplicarAcao?: (it: ItemFila, ctx: ContextoLeadWorker) => Promise<{ ok: boolean; resultado: string }>;
  /** Marca que a regra executou para o lead (condição "regra já executou"). */
  registrarRegraExecutada?: (leadId: string, regraId: string, quando: Date) => Promise<void>;
  /** Fase H: configuração de envio real, guardada no banco (decidida na tela). Ausente = desligado. */
  lerEnvio?: () => Promise<ConfigEnvio>;
  /** Fase H: quantos envios reais já saíram hoje. Em erro, o envio é bloqueado (falha fechada). */
  contarEnviosReaisHoje?: (agora: Date) => Promise<number>;
  /** Fase H: transporte real do texto. Ausente = envio real não conectado nesta versão (nada sai). */
  enviarTextoReal?: (it: ItemFila, ctx: ContextoLeadWorker, texto: string) => Promise<{ ok: boolean; resultado: string }>;
}

export interface OpcoesWorker {
  /** Pausa geral: não reserva nem executa nada. A fila fica intacta. */
  pausaGeral?: boolean;
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

    // Condições (regra + passo): lidas agora, com o estado atual do lead. Falhou = cancela com o motivo.
    const temCondicao = it.condicoes !== undefined && !(Array.isArray(it.condicoes) ? it.condicoes.length === 0 : 'e' in it.condicoes && it.condicoes.e.length === 0);
    const ctxCond = it.acao === 'esperar' || it.acao === 'esperar_ate' ? (temCondicao ? await deps.contextoDoLead(it.leadId) : null) : await deps.contextoDoLead(it.leadId);
    if (temCondicao) {
      const envios = deps.enviosRecentes ? await deps.enviosRecentes(it.leadId, agora) : undefined;
      const ctxAv: ContextoAvaliacao = {
        optout: Boolean(ctxCond?.optout),
        pausado: Boolean(ctxCond?.pausado),
        janela24h: dentroDaJanela24h(ctxCond?.ultimaMensagemDoCliente, agora),
        agora,
        ultimoComando: ctxCond?.ultimoComando ?? null,
        tags: ctxCond?.tags,
        campos: ctxCond?.campos,
        status: ctxCond?.status,
        envios,
        regraExecutou: ctxCond?.regrasExecutadas !== undefined ? it.automacaoId in ctxCond.regrasExecutadas : undefined,
        eventoEm: it.eventoEm ? new Date(it.eventoEm) : null,
        ultimaMensagemDoCliente: ctxCond?.ultimaMensagemDoCliente ?? null,
      };
      const av = avaliarCondicoes(it.condicoes, ctxAv);
      if (!av.ok) {
        resumo.cancelados++;
        const motivo = `Condição não atendida: ${av.falhas.join(', ')}`;
        resumo.auditoria.push(registroAuditoria('pulou', motivo, agora, { leadId: it.leadId, regraId: it.automacaoId }));
        await deps.marcarResultado(it.id, 'cancelado', motivo, null);
        continue;
      }
    }

    if (it.acao === 'esperar' || it.acao === 'esperar_ate') {
      await deps.marcarResultado(it.id, 'executado', it.acao === 'esperar' ? 'Espera concluída' : 'Horário marcado alcançado', null);
      continue;
    }

    if (it.acao === 'enviar_texto') {
      if (!ctxCond) {
        resumo.cancelados++;
        await deps.marcarResultado(it.id, 'cancelado', 'Lead não encontrado', null);
        continue;
      }
      const ctx = ctxCond;
      // Pausa: lead pausado não recebe texto automático (pausa vence automação).
      if (ctx.pausado) {
        resumo.cancelados++;
        await deps.marcarResultado(it.id, 'cancelado', 'Lead pausado: passo não executado', null);
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
        const lim = dentroDosLimites(envios, agora, it.limites);
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
      // Fase H: com o envio ligado na tela, só sai pelo caminho real, depois da decisão (número de teste, liberada, limite).
      const envio = deps.lerEnvio ? await deps.lerEnvio().catch(() => ENVIO_PADRAO) : ENVIO_PADRAO;
      if (envio.ligado) {
        const enviadosHoje = deps.contarEnviosReaisHoje
          ? await deps.contarEnviosReaisHoje(agora).catch(() => Number.MAX_SAFE_INTEGER)
          : Number.MAX_SAFE_INTEGER;
        const d = decidirEnvio(envio, { automacaoId: it.automacaoId, telefone: ctx.phoneNumber, enviadosHoje });
        if (!d.ok) {
          resumo.cancelados++;
          resumo.auditoria.push(registroAuditoria('bloqueou', d.motivo, agora, { leadId: it.leadId, regraId: it.automacaoId }));
          await deps.marcarResultado(it.id, 'cancelado', d.motivo, null);
          continue;
        }
        if (!deps.enviarTextoReal) {
          resumo.cancelados++;
          const motivo = 'Envio real ainda não conectado nesta versão: nada foi enviado';
          resumo.auditoria.push(registroAuditoria('bloqueou', motivo, agora, { leadId: it.leadId, regraId: it.automacaoId }));
          await deps.marcarResultado(it.id, 'cancelado', motivo, null);
          continue;
        }
        const env = await deps.enviarTextoReal(it, ctx, r.text);
        if (env.ok) {
          resumo.auditoria.push(registroAuditoria('executou', env.resultado, agora, { leadId: it.leadId, regraId: it.automacaoId }));
          await deps.registrarRegraExecutada?.(it.leadId, it.automacaoId, agora).catch(() => undefined);
          await deps.marcarResultado(it.id, 'executado', env.resultado, r.text);
        } else {
          resumo.cancelados++;
          resumo.auditoria.push(registroAuditoria('bloqueou', env.resultado, agora, { leadId: it.leadId, regraId: it.automacaoId }));
          await deps.marcarResultado(it.id, 'cancelado', env.resultado, null);
        }
        continue;
      }
      resumo.simulados++;
      await deps.registrarRegraExecutada?.(it.leadId, it.automacaoId, agora).catch(() => undefined);
      resumo.auditoria.push(registroAuditoria('executou', 'Simulado: nada foi enviado', agora, { leadId: it.leadId, regraId: it.automacaoId }));
      await deps.marcarResultado(it.id, 'executado', 'Simulado: envio desligado, nada foi enviado', r.text);
      continue;
    }

    // Modelo aprovado: envio ainda desligado (fase H). Nunca sai nesta etapa.
    if (it.acao === 'enviar_template') {
      resumo.cancelados++;
      const motivo = 'Envio de modelo aprovado ainda desligado (fase H): nada foi enviado';
      resumo.auditoria.push(registroAuditoria('bloqueou', motivo, agora, { leadId: it.leadId, regraId: it.automacaoId }));
      await deps.marcarResultado(it.id, 'cancelado', motivo, null);
      continue;
    }

    // Demais ações: só com executor. Sem executor, cancela com motivo (nunca "sucesso" em silêncio).
    if (!ctxCond) {
      resumo.cancelados++;
      await deps.marcarResultado(it.id, 'cancelado', 'Lead não encontrado', null);
      continue;
    }
    if (!deps.aplicarAcao) {
      resumo.cancelados++;
      const motivo = `Sem executor para "${it.acao}" neste ambiente: nada foi aplicado`;
      resumo.auditoria.push(registroAuditoria('pulou', motivo, agora, { leadId: it.leadId, regraId: it.automacaoId }));
      await deps.marcarResultado(it.id, 'cancelado', motivo, null);
      continue;
    }
    const feito = await deps.aplicarAcao(it, ctxCond);
    if (feito.ok) {
      resumo.simulados++;
      await deps.registrarRegraExecutada?.(it.leadId, it.automacaoId, agora).catch(() => undefined);
      await deps.marcarResultado(it.id, 'executado', feito.resultado, null);
    } else {
      resumo.cancelados++;
      await deps.marcarResultado(it.id, 'cancelado', feito.resultado, null);
    }
  }

  return resumo;
}
