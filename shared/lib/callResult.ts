/**
 * Resultado da ligação (FASE 4). Sem resultado escolhido, não há ligação para registrar.
 * Antes o sistema gravava "Atendeu" por padrão.
 */
export function callResultToSave(selectedTags: string[]): string | null {
  const clean = selectedTags.map(t => t.trim()).filter(Boolean);
  return clean.length > 0 ? clean.join(', ') : null;
}
