/**
 * Lê uma variável de ambiente booleana. Aceita "true", "TRUE", " True " etc.
 * Evita que um valor escrito em maiúscula na Railway deixe a flag desligada sem aviso.
 */
export const flagLigada = (valor: string | undefined | null): boolean =>
  String(valor ?? '').trim().toLowerCase() === 'true';
