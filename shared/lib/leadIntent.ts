/**
 * Leitura da intenção do cliente a partir do texto da mensagem.
 *
 * Fica em arquivo próprio (e não dentro do server.ts) para poder ser testado sem subir o servidor.
 */

export function normalizeForMatch(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * O cliente pediu para parar de receber mensagens?
 *
 * Antes isto era `texto.includes('pare')`: "parece ótimo, quanto custa?" era lido como
 * descadastro e o lead quente saía do funil. Agora "pare" só conta quando é a palavra
 * inteira — e o mesmo vale para "remover" dentro de "removeram", etc.
 */
export function detectOptOut(text: string, palavras: string[] = []): boolean {
  const normalized = normalizeForMatch(text);
  if (!normalized.trim()) return false;
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  for (const p of palavras) {
    const alvo = normalizeForMatch(p).trim();
    if (!alvo) continue;
    // Frase (com espaço) casa dentro do texto; palavra casa só como palavra inteira.
    if (alvo.includes(' ') ? normalized.includes(alvo) : tokens.includes(alvo)) return true;
  }
  return false;
}

/**
 * Limpa o valor de uma variável de modelo SEM cortá-lo.
 *
 * Antes o disparo cortava em 100/160/120 caracteres e o link do site do cliente chegava
 * quebrado (a variável {{2}} costuma ser a URL). A Meta só recusa quebra de linha,
 * tabulação e espaços repetidos dentro da variável.
 */
export function sanitizeTemplateVariable(value: string): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Decide se a resposta manual deve virar INTERESSADO.
 *
 * Um pedido de descadastro NUNCA vira interesse, mesmo que quem registrou a resposta
 * tenha marcado "interessado" por padrão.
 */
export function resolveManualInterest(text: string, wantsInterest: boolean, palavras: string[] = []): boolean {
  if (detectOptOut(text, palavras)) return false;
  return wantsInterest;
}

/** Tag de resultado para quem pediu descadastro (FASE 2). */
export const SEM_INTERESSE_TAG = { id: 'tag-sem-interesse', name: 'Sem interesse', color: '#475569', bgColor: '#f1f5f9' };
