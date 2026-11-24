/**
 * Tokens da copy de disparo: {campo} dentro do texto de uma variável do template da Meta.
 *
 * Regras:
 * - Campos fixos (nome, empresa, vendedor, site_novo, site_antigo, telefone, data, nicho) vêm do lead/vendedor.
 * - Qualquer OUTRO campo vem do arquivo importado do lead (extra), com a chave normalizada
 *   (sem acento, minúsculo, espaço e hífen viram "_"). Ex.: "Cidade" -> {cidade}.
 * - Fallbacks: lead sem nome vira "Cliente"; sem empresa vira "sua empresa"; sem link vira https://nyroh.app/preview.
 * - Troca de UMA passada: o valor inserido nunca é expandido de novo.
 * - Token desconhecido NÃO é trocado (volta em `unknown`); campo vazio volta em `empty`.
 *   Quem chama decide: no disparo, qualquer um dos dois bloqueia o lead.
 */

export const TOKEN_NAMES = ['nome', 'empresa', 'vendedor', 'site_novo', 'site_antigo', 'telefone', 'data', 'nicho'] as const;

export interface LeadTokenContext {
  leadName?: string | null;
  phoneNumber?: string | null;
  publicUrl?: string | null;
  website?: string | null;
  niche?: string | null;
  sellerName?: string | null;
  /** Dados extras do arquivo importado (chave -> valor) */
  extra?: Record<string, unknown> | null;
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

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Chave de campo normalizada: "Endereço da Loja" -> "endereco_da_loja". */
export function normalizeFieldKey(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s-]+/g, '_');
}

/** Valores de cada token fixo para um lead. Vazio = o lead não tem esse dado. */
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

/** Campos extras do lead com chave normalizada. Valores de objeto viram JSON. */
export function extraFieldValues(extra: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!extra || typeof extra !== 'object') return out;
  for (const [k, v] of Object.entries(extra)) {
    const nk = normalizeFieldKey(k);
    if (!nk || hasOwn(out, nk)) continue;
    out[nk] = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v).trim();
  }
  return out;
}

/** Nomes de campos disponíveis entre vários leads (para montar as tags da copy). */
export function listExtraFieldKeys(samples: Array<Record<string, unknown> | null | undefined>): string[] {
  const set = new Set<string>();
  for (const s of samples) {
    for (const k of Object.keys(extraFieldValues(s || null))) set.add(k);
  }
  return [...set].sort();
}

/** Substitui os {campos} do texto de uma só vez, sem expandir valores já inseridos. */
export function resolveLeadTokens(text: string, ctx: LeadTokenContext): ResolveResult {
  const values = buildTokenValues(ctx);
  const extra = extraFieldValues(ctx.extra);
  const unknown = new Set<string>();
  const empty = new Set<string>();
  const out = String(text || '').replace(/\{([a-zA-Z_][^{}\n]{0,59})\}/g, (match, rawKey: string) => {
    const key = normalizeFieldKey(rawKey);
    let value: string | undefined;
    if (hasOwn(values, key)) value = values[key];
    else if (hasOwn(extra, key)) value = extra[key];
    if (value === undefined) {
      unknown.add(key);
      return match;
    }
    if (!value) empty.add(key);
    return value;
  });
  return { text: out, unknown: [...unknown], empty: [...empty] };
}
