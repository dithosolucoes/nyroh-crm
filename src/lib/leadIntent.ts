/**
 * Leitura da intenção do cliente a partir do texto da mensagem.
 *
 * Fica em arquivo próprio (e não dentro do server.ts) para poder ser testado sem subir o servidor.
 */

/**
 * Pedidos de descadastro, casados por PALAVRA INTEIRA (frases, por frase inteira).
 * Acentos são ignorados na comparação ("não quero" casa com "nao quero").
 */
export const OPT_OUT_PHRASES = [
  'não tenho interesse',
  'não quero',
  'não enviar',
  'não me envie',
  'sai fora',
  'me tira da lista',
  'tira da lista',
  'tirar da lista'
];

export const OPT_OUT_WORDS = ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop'];

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
export function detectOptOut(text: string): boolean {
  const normalized = normalizeForMatch(text);
  if (!normalized.trim()) return false;

  for (const phrase of OPT_OUT_PHRASES) {
    if (normalized.includes(normalizeForMatch(phrase))) return true;
  }

  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some(t => OPT_OUT_WORDS.includes(t));
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
