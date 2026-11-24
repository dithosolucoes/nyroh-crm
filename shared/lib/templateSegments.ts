/**
 * Lê o corpo de um template da Meta: o que é TEXTO FIXO e o que é VARIÁVEL ({{1}}, {{2}}...).
 * Puro (sem rede e sem banco), para ser usado na tela e testado em scripts/test-units.ts.
 */

export type TemplateSegment = { kind: 'text'; text: string } | { kind: 'var'; index: number };

export function parseTemplateBody(body: string): TemplateSegment[] {
  const src = String(body || '');
  const out: TemplateSegment[] = [];
  const re = /\{\{(\d+)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) out.push({ kind: 'text', text: src.slice(last, m.index) });
    out.push({ kind: 'var', index: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) });
  return out;
}

/** Números das variáveis do corpo, em ordem crescente, sem repetição. */
export function templateVarIndexes(body: string): number[] {
  const set = new Set<number>();
  for (const seg of parseTemplateBody(body)) if (seg.kind === 'var') set.add(seg.index);
  return [...set].sort((a, b) => a - b);
}

/** Monta o texto final: troca cada {{n}} pelo valor; sem valor, mantém {{n}} e avisa. */
export function renderTemplateBody(body: string, values: Record<number, string>): { text: string; missing: number[] } {
  const missing: number[] = [];
  let text = '';
  for (const seg of parseTemplateBody(body)) {
    if (seg.kind === 'text') {
      text += seg.text;
    } else {
      const v = values[seg.index];
      if (v && String(v).trim()) {
        text += v;
      } else {
        missing.push(seg.index);
        text += `{{${seg.index}}}`;
      }
    }
  }
  return { text, missing: [...new Set(missing)].sort((a, b) => a - b) };
}
