/**
 * Flags de interface (FASE 5). Lidas do build do Vite: VITE_<NOME>=true liga.
 * Qualquer outro valor (ou ausência) deixa a funcionalidade DESLIGADA.
 */
export function isUiFlagOn(value: string | undefined | null): boolean {
  return value === 'true';
}
