/**
 * Controle de taxa do disparo em massa (§A10 — Limites de uso).
 *
 * O limite da FluxoAPI é por CREDENCIAL, em janela de 1 MINUTO (Starter 60, Pro 300,
 * Escala 1.200, Enterprise 6.000) e vale para TODA requisição (envio, leitura de catálogo,
 * marcar como lida...). Disparar "30 msgs/segundo" = 1.800/min estoura qualquer plano
 * abaixo de Escala. Por isso o disparo trabalha em mensagens/minuto e reserva uma
 * folga para o atendimento manual (que usa a mesma credencial).
 */

/** Limite do plano, em requisições por minuto (env FLUXO_PLAN_RPM, padrão 60 = Starter). */
export function planRpm(): number {
  const n = Number(process.env.FLUXO_PLAN_RPM);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 60;
}

/** Fração do RPM que o disparo em massa pode usar (env FLUXO_DISPATCH_SHARE, padrão 0.8). */
export function dispatchShare(): number {
  const n = Number(process.env.FLUXO_DISPATCH_SHARE);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.8;
}

/** Teto do disparo em mensagens por minuto (nunca menos que 1). */
export function dispatchRpm(): number {
  return Math.max(1, Math.floor(planRpm() * dispatchShare()));
}

/** Teto do disparo em mensagens por segundo (pode ser fracionário: 48/min = 0,8/s). */
export function maxDispatchPerSecond(): number {
  return dispatchRpm() / 60;
}

/**
 * Velocidade efetiva (msgs/s): o que o usuário pediu, limitado ao teto do plano.
 * Sem pedido válido, usa o próprio teto.
 */
export function effectiveSpeedPerSecond(requestedPerSecond?: number): number {
  const cap = maxDispatchPerSecond();
  const req = Number(requestedPerSecond);
  if (!Number.isFinite(req) || req <= 0) return cap;
  return Math.min(req, cap);
}

/** Atraso (ms) do job de índice `idx` para manter exatamente `perSecond` mensagens por segundo. */
export function delayForIndex(idx: number, perSecond: number): number {
  const safe = perSecond > 0 ? perSecond : maxDispatchPerSecond();
  return Math.floor((idx * 1000) / safe);
}

/** Estimativa de duração (s) de um lote de `total` mensagens. */
export function estimateSeconds(total: number, perSecond: number): number {
  const safe = perSecond > 0 ? perSecond : maxDispatchPerSecond();
  return Math.ceil(total / safe);
}

/**
 * Erro lançado pelo processador de disparo quando a FluxoAPI responde 429.
 * A fila usa `retryAfterSec` para pausar e reprogramar o job (sem laço curto).
 */
export class FluxoRateLimitedError extends Error {
  readonly retryAfterSec: number;
  constructor(retryAfterSec: number, message = 'Limite de requisições da FluxoAPI atingido (429).') {
    super(message);
    this.name = 'FluxoRateLimitedError';
    this.retryAfterSec = Math.max(1, Math.ceil(retryAfterSec || 1));
  }
}
