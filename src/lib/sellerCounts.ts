/**
 * Contagem de leads da carteira (FASE 4 — métricas).
 *
 * Usa a MESMA função para o subtítulo e para os contadores da tela, para que nunca
 * mostrem números diferentes. Antes o subtítulo tinha "684+" escrito à mão.
 */
export function countSellerLeads<T extends { salespersonId?: string | null }>(
  leads: T[],
  salespersonId: string,
  isAll: boolean
): number {
  if (isAll) return leads.length;
  const wanted = (salespersonId || '').toLowerCase();
  return leads.filter(l => (l.salespersonId || '').toLowerCase() === wanted).length;
}
