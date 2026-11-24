/**
 * Agenda das esperas das automações. Puro: calcula QUANDO cada passo deve rodar.
 * Não executa nada e não envia nada.
 */

/** Quando um passo deve rodar, somando as horas de espera a partir do momento do evento. */
export function quandoExecutar(agora: Date, horasDesdeEvento: number): Date {
  const horas = Number.isFinite(horasDesdeEvento) && horasDesdeEvento > 0 ? horasDesdeEvento : 0;
  return new Date(agora.getTime() + Math.round(horas * 60 * 60 * 1000));
}

/** Passo vencido: já chegou a hora (ou passou) e ainda não foi executado. */
export function estaVencido(executarEm: Date, agora: Date): boolean {
  return executarEm.getTime() <= agora.getTime();
}

/** Normaliza texto para comparar palavras-chave: minúsculo, sem acento, espaços simples. */
export function normalizarTexto(t: string): string {
  return String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Verdadeiro se a mensagem do cliente contém a palavra-chave (sem diferença de maiúscula ou acento). */
export function contemPalavra(mensagem: string, palavra: string): boolean {
  const alvo = normalizarTexto(palavra);
  return alvo.length > 0 && normalizarTexto(mensagem).includes(alvo);
}
