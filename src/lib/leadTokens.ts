/**
 * Tokens da copy de disparo: {campo} dentro do texto de uma variável do template da Meta.
 *
 * Regras:
 * - Os valores vêm do lead do disparo (campaign_leads) e do vendedor atribuído.
 * - Fallbacks iguais aos que já existiam: lead sem nome vira "Cliente"; sem empresa vira "sua empresa";
 *   sem link de prévia vira https://nyroh.app/preview.
 * - Troca de UMA passada: o valor inserido nunca é expandido de novo (um nome com "{vendedor}" sai literal).
 * - Token desconhecido não é trocado e é devolvido em `unknown`; campo vazio é devolvido em `empty`.
 *   Quem chama decide se bloqueia o envio.
 */

export const TOKEN_NAMES = ['nome', 'empresa', 'vendedor', 'site_novo', 'site_antigo', 'telefone', 'data', 'nicho'] as const;

export interface LeadTokenContext {
  leadName?: string | null;
  phoneNumber?: string | null;
  publicUrl?: string | null;
  website?: string | null;
  niche?: string | null;
  sellerName?: string | null;
  now?: Date;
}

export interface ResolveResult {
  text: string;
  unknown: string[];
  empty: string[];
}

const DEFAULT_PREVIEW_URL = 'https://nyroh.app/preview';

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Valores de cada token para um lead. Vazio = o lead não tem esse dado. */
export function buildTokenValues(ctx: LeadTokenContext): Record<string, string> {
  const leadName = String(ctx.leadName || '').trim();
  const firstName = leadName ? leadName.split(' ')[0] : 'Cliente';
  const company = leadName && leadName !== 'Cliente' ? leadName : 'sua empresa';
  return {
    nome: firstName || 'Cliente',
    empresa: company,
    vendedor: String(ctx.sellerName || '').trim(),
    site_novo: String(ctx.publicUrl || '').trim() || DEFAULT_PREVIEW_URL,
    site_antigo: String(ctx.website || '').trim(),
    telefone: String(ctx.phoneNumber || '').trim(),
    data: formatDate(ctx.now || new Date()),
    nicho: String(ctx.niche || '').trim(),
  };
}

/** Substitui os {tokens} do texto de uma só vez, sem expandir valores já inseridos. */
export function resolveLeadTokens(text: string, ctx: LeadTokenContext): ResolveResult {
  const values = buildTokenValues(ctx);
  const unknown = new Set<string>();
  const empty = new Set<string>();
  const out = String(text || '').replace(/\{([a-zA-Z_]+)\}/g, (match, rawKey: string) => {
    const key = rawKey.toLowerCase();
    if (!(key in values)) {
      unknown.add(rawKey.toLowerCase());
      return match;
    }
    const value = values[key];
    if (!value) empty.add(key);
    return value;
  });
  return { text: out, unknown: [...unknown], empty: [...empty] };
}
