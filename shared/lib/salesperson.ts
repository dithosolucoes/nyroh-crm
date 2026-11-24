import { Salesperson } from '../types';

export function getSalespersonSlug(seller: { id: string; name: string; slug?: string }): string {
  if (seller.slug && seller.slug.trim()) {
    return seller.slug.trim().toLowerCase();
  }
  // If id starts with seller- e.g. seller-thomas, extract the suffix if clean, or sanitize the name
  const nameClean = seller.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return nameClean || seller.id.replace('seller-', '');
}

export function matchSalespersonFromRoute(
  routeIdentifier: string,
  salespeople: Salesperson[]
): Salesperson | undefined {
  if (!routeIdentifier || routeIdentifier === 'ALL' || routeIdentifier === 'all') {
    return undefined;
  }

  const cleanIdent = decodeURIComponent(routeIdentifier).toLowerCase().trim();

  // 1. Direct ID match
  const byId = salespeople.find((s) => s.id.toLowerCase() === cleanIdent);
  if (byId) return byId;

  // 2. Slug match
  const bySlug = salespeople.find((s) => getSalespersonSlug(s) === cleanIdent);
  if (bySlug) return bySlug;

  // 3. Name match
  const byName = salespeople.find(
    (s) =>
      s.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim() === cleanIdent
  );
  if (byName) return byName;

  // 4. Partial id match (e.g. "thomas" matching "seller-thomas")
  const byPartialId = salespeople.find((s) => s.id.replace('seller-', '').toLowerCase() === cleanIdent);
  if (byPartialId) return byPartialId;

  return undefined;
}

export function getSalespersonAppUrl(seller: Salesperson): string {
  const slug = getSalespersonSlug(seller);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/v/${slug}`;
}
