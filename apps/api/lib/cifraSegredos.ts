import crypto from 'crypto';

/**
 * Cifra de segredos guardados no banco (chave/segredo da FluxoAPI, segredo do webhook, etc.).
 *
 * AES-256-GCM com IV aleatório por valor e tag de autenticação: qualquer alteração no texto
 * cifrado é detectada na leitura. A chave-mestra vem de NYROH_CHAVE_SEGREDOS (guardada no
 * Railway, nunca no banco nem no código).
 *
 * Falha FECHADA: sem a chave-mestra, nada é gravado nem lido. Antes, o segredo ia para o banco
 * em texto puro.
 */

const PREFIXO = 'enc:v1:';

function chaveMestra(): Buffer {
  const bruta = (process.env.NYROH_CHAVE_SEGREDOS || '').trim();
  if (!bruta) {
    throw new Error('NYROH_CHAVE_SEGREDOS não configurada: não dá para guardar segredos com segurança.');
  }
  return crypto.createHash('sha256').update(bruta).digest();
}

export function estaCifrado(valor: string): boolean {
  return String(valor || '').startsWith(PREFIXO);
}

export function cifrarSegredo(texto: string): string {
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv('aes-256-gcm', chaveMestra(), iv);
  const dados = Buffer.concat([cifra.update(String(texto), 'utf8'), cifra.final()]);
  const tag = cifra.getAuthTag();
  return PREFIXO + [iv.toString('base64'), tag.toString('base64'), dados.toString('base64')].join(':');
}

/**
 * Lê um segredo que veio do banco. Valor cifrado: decifra. Valor antigo em texto puro (gravado antes
 * desta mudança): aceita, mas avisa para regravar pelo painel. Valor cifrado que não abre (chave trocada,
 * texto alterado): devolve vazio e avisa, sem derrubar o servidor.
 */
export function lerSegredoDoBanco(chave: string, valor: string): string {
  if (!valor) return '';
  if (!estaCifrado(valor)) {
    console.warn(`[segredos] "${chave}" está em texto puro no banco. Regrave pelo painel para cifrar.`);
    return valor;
  }
  try {
    return decifrarSegredo(valor);
  } catch {
    console.error(`[segredos] "${chave}" não pôde ser decifrado (chave NYROH_CHAVE_SEGREDOS diferente ou valor alterado). Regrave pelo painel.`);
    return '';
  }
}

export function decifrarSegredo(valor: string): string {
  if (!estaCifrado(valor)) throw new Error('Valor não está no formato cifrado.');
  const [ivB64, tagB64, dadosB64] = valor.slice(PREFIXO.length).split(':');
  if (!ivB64 || !tagB64 || !dadosB64) throw new Error('Segredo cifrado com formato inválido.');
  const decifra = crypto.createDecipheriv('aes-256-gcm', chaveMestra(), Buffer.from(ivB64, 'base64'));
  decifra.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decifra.update(Buffer.from(dadosB64, 'base64')), decifra.final()]).toString('utf8');
}
