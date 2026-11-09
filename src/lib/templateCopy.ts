import { sanitizeTemplateVariable } from './leadIntent';

/** Contexto do lead para trocar os {campos} da copy. */
export interface LeadCopyContext {
  firstName: string;
  company: string;
  seller: string;
  url: string;
}

/** Troca {nome}, {empresa}, {vendedor} e {site_novo} pelos dados do lead. */
export function fillLeadTokens(copy: string, ctx: LeadCopyContext): string {
  return String(copy || '')
    .replace(/\{nome\}/gi, ctx.firstName)
    .replace(/\{empresa\}/gi, ctx.company)
    .replace(/\{vendedor\}/gi, ctx.seller)
    .replace(/\{site_novo\}/gi, ctx.url);
}

/**
 * Monta as variáveis do modelo para UM lead: uma por índice da copy ({{1}}, {{2}}...).
 * Só entram os índices que o usuário escreveu; vazio vai para `empty` (não enviar).
 */
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
