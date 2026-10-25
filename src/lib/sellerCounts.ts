/**
 * Contagem de leads da carteira (FASE 3 — métricas).
 *
 * Uma regra só de dono: lead sem vendedor pertence ao Thomas (mesmo padrão do servidor).
 * Usada pelo subtítulo, pelos contadores e pelo desempenho de cada vendedor, para que
 * a soma das carteiras feche com o total.
 */
export const DEFAULT_OWNER_ID = 'seller-thomas';

export function ownerOf(lead: { salespersonId?: string | null }): string {
  return (lead.salespersonId || DEFAULT_OWNER_ID).toLowerCase();
}

export function countSellerLeads<T extends { salespersonId?: string | null }>(
  leads: T[],
  salespersonId: string,
  isAll: boolean
): number {
  if (isAll) return leads.length;
  const wanted = (salespersonId || '').toLowerCase();
  return leads.filter(l => ownerOf(l) === wanted).length;
}
