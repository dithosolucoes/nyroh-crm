/**
 * Distribui uma quantidade TOTAL de disparos entre safras, proporcional ao que cada safra tem disponível.
 * Nunca passa do disponível de uma safra, e a soma nunca passa do disponível total.
 * Método do maior resto: a soma bate exatamente com o total pedido (ou com o disponível, se for menor).
 */

export interface LinhaDisparo {
  id: string;
  disponivel: number;
}

export function distribuirQuantidade(total: number, linhas: LinhaDisparo[]): Record<string, number> {
  const disp = linhas.map((l) => ({ id: l.id, d: Math.max(0, Math.floor(Number(l.disponivel) || 0)) }));
  const soma = disp.reduce((s, l) => s + l.d, 0);
  const alvo = Math.min(Math.max(0, Math.floor(Number(total) || 0)), soma);

  const partes = disp.map((l) => {
    const exato = soma === 0 ? 0 : (alvo * l.d) / soma;
    const q = Math.min(l.d, Math.floor(exato));
    return { id: l.id, d: l.d, q, resto: exato - Math.floor(exato) };
  });
  let faltam = alvo - partes.reduce((s, p) => s + p.q, 0);

  // Quem tem a maior fração do resto recebe primeiro, sem passar do disponível.
  const ordem = [...partes].sort((a, b) => b.resto - a.resto || b.d - a.d);
  while (faltam > 0) {
    let andou = false;
    for (const p of ordem) {
      if (faltam <= 0) break;
      if (p.q < p.d) { p.q++; faltam--; andou = true; }
    }
    if (!andou) break;
  }

  const out: Record<string, number> = {};
  for (const p of partes) out[p.id] = p.q;
  return out;
}
