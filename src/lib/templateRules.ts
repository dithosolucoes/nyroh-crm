/**
 * Regras puras para criar e enviar modelos (templates) da Meta.
 * Sem rede e sem banco: tudo testável em scripts/test-units.ts.
 */

export const ALLOWED_TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY'] as const;

/** Categoria ausente = UTILITY (padrão do sistema). Outra categoria é recusada, nunca convertida em silêncio. */
export function validateTemplateCategory(category: unknown): { ok: boolean; value: 'MARKETING' | 'UTILITY'; error?: string } {
  if (category === undefined || category === null || category === '') {
    return { ok: true, value: 'UTILITY' };
  }
  const c = String(category).trim().toUpperCase();
  if ((ALLOWED_TEMPLATE_CATEGORIES as readonly string[]).includes(c)) {
    return { ok: true, value: c as 'MARKETING' | 'UTILITY' };
  }
  return {
    ok: false,
    value: 'UTILITY',
    error: `Categoria "${c}" não é suportada aqui. Use MARKETING ou UTILITY.`
  };
}

export interface MetaButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone_number?: string;
}

/**
 * Converte os botões do formulário para o formato da Meta.
 * - type URL -> botão de link (precisa de url; sem url é descartado).
 * - type PHONE_NUMBER -> botão de ligação (precisa de phone_number; sem ele é descartado).
 * - qualquer outro (texto ou type QUICK_REPLY) -> resposta rápida.
 */
export function buildMetaButtons(buttons: unknown): MetaButton[] {
  if (!Array.isArray(buttons)) return [];
  const out: MetaButton[] = [];
  for (const raw of buttons) {
    const b: any = typeof raw === 'string' ? { text: raw } : (raw || {});
    const text = String(b.text || b.label || '').trim();
    if (!text) continue;
    const type = String(b.type || '').toUpperCase();
    if (type === 'URL') {
      const url = String(b.url || '').trim();
      if (url) out.push({ type: 'URL', text, url });
      continue;
    }
    if (type === 'PHONE_NUMBER') {
      const phone = String(b.phone_number || b.phoneNumber || '').trim();
      if (phone) out.push({ type: 'PHONE_NUMBER', text, phone_number: phone });
      continue;
    }
    out.push({ type: 'QUICK_REPLY', text });
  }
  return out;
}

/**
 * Exemplos padrão para a Meta quando a variável não tem exemplo.
 * Neutros: sem nomes de pessoas, sem códigos ou links fictícios que pareçam reais.
 */
export function defaultExamples(category: 'MARKETING' | 'UTILITY', count: number): string[] {
  const pool = category === 'UTILITY'
    ? ['Cliente', 'Seu pedido foi confirmado com sucesso.', 'https://exemplo.com.br', 'Equipe de atendimento']
    : ['Cliente', 'Confira nossa proposta.', 'https://exemplo.com.br', 'Equipe comercial'];
  return Array.from({ length: Math.max(0, count) }, (_, i) => pool[i] ?? `Exemplo ${i + 1}`);
}

/** Quantas variáveis distintas {{n}} o corpo declara. */
export function countBodyVariables(bodyText: string): number {
  const found = new Set((String(bodyText || '').match(/\{\{\d+\}\}/g) || []).map(m => m.replace(/[{}]/g, '')));
  return found.size;
}

/**
 * Confere as variáveis antes do envio: toda {{n}} do corpo precisa de valor não vazio.
 * Evita mandar parâmetro vazio, que a Meta recusa com erro menos claro.
 */
export function validateTemplateVariables(bodyText: string, values: Record<string, string>): { ok: boolean; missing: string[] } {
  const needed = [...new Set((String(bodyText || '').match(/\{\{\d+\}\}/g) || []).map(m => m.replace(/[{}]/g, '')))];
  const missing = needed.filter(n => !String(values?.[n] ?? '').trim());
  return { ok: missing.length === 0, missing };
}
