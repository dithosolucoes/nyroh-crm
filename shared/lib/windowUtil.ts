/**
 * Janela de atendimento de 24h do WhatsApp (§ "A janela de 24 horas").
 * Regra da Meta: texto livre só nas 24h seguintes à ÚLTIMA mensagem do contato.
 * Fora disso, apenas modelo aprovado. Mensagem enviada pelo celular do dono NÃO reabre a janela.
 */

export const WINDOW_MS = 24 * 60 * 60 * 1000;

function toMs(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value as any).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Fim da janela (ISO) a partir do instante da última mensagem do contato. */
export function windowExpiryFromInbound(lastInboundAt: string | number | Date | null | undefined): string | null {
  const ms = toMs(lastInboundAt);
  return ms === null ? null : new Date(ms + WINDOW_MS).toISOString();
}

/** Escolhe o fim de janela mais tardio entre vários candidatos válidos (ISO). */
export function latestExpiry(...candidates: Array<string | number | Date | null | undefined>): string | null {
  let best: number | null = null;
  for (const c of candidates) {
    const ms = toMs(c);
    if (ms !== null && (best === null || ms > best)) best = ms;
  }
  return best === null ? null : new Date(best).toISOString();
}

/** A janela está aberta se o fim dela está no futuro. `null`/passado = só modelo. */
export function isWindowOpen(
  expiry: string | number | Date | null | undefined,
  now: number = Date.now()
): boolean {
  const ms = toMs(expiry);
  return ms !== null && ms > now;
}
