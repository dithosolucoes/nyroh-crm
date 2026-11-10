/**
 * Escolha do número (instância da FluxoAPI) no disparo em massa.
 * Regra: a escolha do usuário na tela vale primeiro. Sem escolha, vale a marca da safra.
 * Sem marca, vale a instância global. Puro: não chama nada.
 */

const INSTANCIA_VALIDA = /^[A-Za-z0-9_.-]{1,120}$/;

/** Valida o número escolhido na tela. Vazio = sem escolha (padrão). Inválido = null (recusar). */
export function validarInstanciaEscolhida(v: unknown): string | null {
  if (v === undefined || v === null) return '';
  const s = String(v).trim();
  if (s === '') return '';
  return INSTANCIA_VALIDA.test(s) ? s : null;
}

export function escolherInstanciaDisparo(p: { escolhida?: string | null; daSafra: string; global: string }): string {
  return (p.escolhida || '').trim() || (p.daSafra || '').trim() || (p.global || '').trim();
}
