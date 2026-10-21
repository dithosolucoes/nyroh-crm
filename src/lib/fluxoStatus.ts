/**
 * Status de mensagens da FluxoAPI (§A9 — message.status).
 *
 * O estado avança por posto ("rank") e NUNCA retrocede:
 *   queued(0) → sent(1) → delivered(2) → read(3);  failed = 9.
 * Status da Meta chega fora de ordem: um `delivered` atrasado não pode desfazer
 * um `read` que já chegou. Sempre comparar por rank, nunca pela ordem de chegada.
 */

export type MessageStatus = 'sending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

const RANKS: Record<string, number> = {
  sending: -1, // estado local, antes de a API aceitar
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 9
};

/** Normaliza qualquer texto de status vindo de Meta/Fluxo para um status conhecido (ou null). */
export function normalizeStatus(status?: string | null): MessageStatus | null {
  if (!status) return null;
  const s = String(status).trim().toLowerCase();
  if (s === 'accepted') return 'queued';
  if (s === 'deleted') return null;
  return s in RANKS ? (s as MessageStatus) : null;
}

/** Rank de um status. Se a API mandou o rank explícito, ele manda. Desconhecido = -1. */
export function statusRank(status?: string | null, explicitRank?: number | null): number {
  if (typeof explicitRank === 'number' && Number.isFinite(explicitRank)) return explicitRank;
  const normalized = normalizeStatus(status);
  return normalized ? RANKS[normalized] : -1;
}

/** Só aplica o status novo se o rank dele for MAIOR que o atual (nunca retrocede). */
export function shouldApplyStatus(
  current: { status?: string | null; rank?: number | null },
  incoming: { status?: string | null; rank?: number | null }
): boolean {
  const nextRank = statusRank(incoming.status, incoming.rank);
  if (nextRank < 0) return false;
  return nextRank > statusRank(current.status, current.rank);
}
