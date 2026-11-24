import { sanitizeTemplateVariable } from './leadIntent';
import { resolveLeadTokens, type LeadTokenContext } from './leadTokens';

/** Contexto do lead para trocar os {campos} da copy (formato antigo, mantido para compatibilidade). */
export interface LeadCopyContext {
  firstName: string;
  company: string;
  seller: string;
  url: string;
}

/** Troca {nome}, {empresa}, {vendedor} e {site_novo} pelos dados do lead (formato antigo). */
export function fillLeadTokens(copy: string, ctx: LeadCopyContext): string {
  return String(copy || '')
    .replace(/\{nome\}/gi, ctx.firstName)
    .replace(/\{empresa\}/gi, ctx.company)
    .replace(/\{vendedor\}/gi, ctx.seller)
    .replace(/\{site_novo\}/gi, ctx.url);
}

/** Monta as variáveis do modelo (formato antigo): uma por índice da copy. */
export function buildTemplateVariables(
  copiesByIndex: Record<number, string>,
  ctx: LeadCopyContext
): { variables: Record<string, string>; empty: number[] } {
  const variables: Record<string, string> = {};
  const empty: number[] = [];
  const indexes = Object.keys(copiesByIndex).map(Number).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  for (const n of indexes) {
    const value = sanitizeTemplateVariable(fillLeadTokens(copiesByIndex[n], ctx));
    if (!value.trim()) empty.push(n);
    variables[String(n)] = value;
  }
  return { variables, empty };
}

/**
 * Monta as variáveis do modelo para UM lead, resolvendo QUALQUER {campo} (fixo ou do arquivo do lead).
 * Devolve tudo que falhou: campo desconhecido, campo sem dado e variável vazia. Quem chama bloqueia o lead.
 */
export function buildLeadVariables(
  copiesByIndex: Record<number, string>,
  ctx: LeadTokenContext
): { variables: Record<string, string>; empty: number[]; unknown: string[]; emptyFields: string[] } {
  const variables: Record<string, string> = {};
  const empty: number[] = [];
  const unknown = new Set<string>();
  const emptyFields = new Set<string>();
  const indexes = Object.keys(copiesByIndex).map(Number).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  for (const n of indexes) {
    const r = resolveLeadTokens(copiesByIndex[n], ctx);
    for (const u of r.unknown) unknown.add(u);
    for (const e of r.empty) emptyFields.add(e);
    const value = sanitizeTemplateVariable(r.text);
    if (!value.trim()) empty.push(n);
    variables[String(n)] = value;
  }
  return { variables, empty, unknown: [...unknown], emptyFields: [...emptyFields] };
}
