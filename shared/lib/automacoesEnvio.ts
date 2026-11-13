/**
 * Fase H: controle do envio real de textos automáticos, decidido na tela (guardado no banco).
 * Padrão: DESLIGADO. Puro: não envia nada. Quem envia é o worker, depois desta decisão.
 *
 * Nesta etapa o envio só pode ir para o NÚMERO DE TESTE, e só para automações marcadas na tela.
 */

export interface ConfigEnvio {
  /** Interruptor geral do envio real. Desligado, o texto continua "simulado". */
  ligado: boolean;
  /** Único destino permitido nesta etapa (somente dígitos, com DDI). */
  numeroTeste: string | null;
  /** Teto de envios reais por dia (0 = nenhum). */
  limitePorDia: number;
  /** Ids das automações liberadas para envio real. */
  automacoesLiberadas: string[];
}

export const ENVIO_PADRAO: ConfigEnvio = { ligado: false, numeroTeste: null, limitePorDia: 0, automacoesLiberadas: [] };

export const LIMITE_ENVIO_DIA_MAX = 1000;

/** Só dígitos. Vazio se não sobrar nada. */
export function somenteDigitos(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

/** Lê a configuração salva. Qualquer dado inválido vira o padrão (desligado). */
export function normalizarEnvio(x: unknown): ConfigEnvio {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { ...ENVIO_PADRAO, automacoesLiberadas: [] };
  const o = x as Record<string, unknown>;
  const numero = somenteDigitos(o.numeroTeste);
  const limite = Number(o.limitePorDia);
  return {
    ligado: o.ligado === true,
    numeroTeste: numero.length >= 10 && numero.length <= 15 ? numero : null,
    limitePorDia: Number.isInteger(limite) && limite >= 0 && limite <= LIMITE_ENVIO_DIA_MAX ? limite : 0,
    automacoesLiberadas: Array.isArray(o.automacoesLiberadas)
      ? [...new Set(o.automacoesLiberadas.filter((i): i is string => typeof i === 'string' && i.length > 0))]
      : [],
  };
}

export interface DecisaoEnvio {
  ok: boolean;
  motivo: string;
}

/**
 * Decide se UM texto pode ser enviado de verdade. Falha fechada: qualquer dúvida bloqueia.
 * `enviadosHoje` = envios reais já feitos hoje.
 */
export function decidirEnvio(cfg: ConfigEnvio, p: { automacaoId: string; telefone: string | null | undefined; enviadosHoje: number }): DecisaoEnvio {
  if (!cfg.ligado) return { ok: false, motivo: 'Envio real desligado na tela: nada foi enviado' };
  if (!cfg.numeroTeste) return { ok: false, motivo: 'Sem número de teste definido: nada foi enviado' };
  if (somenteDigitos(p.telefone) !== cfg.numeroTeste) return { ok: false, motivo: 'Destino não é o número de teste: nada foi enviado' };
  if (!cfg.automacoesLiberadas.includes(p.automacaoId)) return { ok: false, motivo: 'Automação não liberada para envio real: nada foi enviado' };
  if (cfg.limitePorDia <= 0) return { ok: false, motivo: 'Limite por dia zerado: nada foi enviado' };
  if (p.enviadosHoje >= cfg.limitePorDia) return { ok: false, motivo: 'Limite diário de envios atingido: nada foi enviado' };
  return { ok: true, motivo: 'Liberado para o número de teste' };
}
