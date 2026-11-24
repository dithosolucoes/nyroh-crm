/**
 * Visitas aos sites hospedados (plataforma do cliente avisa o CRM).
 *
 * Regra: o lead tem um campo `site_do_cliente` em variaveis_json. Quando a plataforma avisa
 * que alguém abriu esse site, o CRM atualiza o lead dono do site. Sem mudar o link do disparo.
 */
import { timingSafeEqual } from 'crypto';
import { flagLigada } from './flagLigada.js';

export const CHAVE_VARIAVEL_SITE = 'site_do_cliente';
export const CHAVE_VARIAVEL_VISITA = 'site_visita_ultima';
export const CHAVE_VARIAVEL_VISITAS = 'site_visitas';

/** Flag NYROH_LINK_DIRETO: quando ligada, o disparo manda o link original, sem o redirecionamento do CRM. Padrão desligada. */
export function linkDiretoLigado(env: Record<string, string | undefined>): boolean {
  return flagLigada(env.NYROH_LINK_DIRETO);
}

/** Converte o endereço do site para a forma guardada: https, host minúsculo, sem www, sem barra final, sem query. */
export function normalizarSite(entrada: unknown): string | null {
  if (typeof entrada !== 'string') return null;
  const texto = entrada.trim();
  if (!/^https?:\/\//i.test(texto)) return null;
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const caminho = url.pathname.replace(/\/+$/, '');
  return `${url.protocol.toLowerCase()}//${host}${caminho}`;
}

/** Compara a chave recebida com a configurada, em tempo constante. Sem chave configurada, nunca confere. */
export function chaveConfere(recebida: string | undefined, esperada: string | undefined): boolean {
  if (!esperada || !recebida) return false;
  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Devolve as variáveis do lead com a última visita e o total de visitas atualizados. */
export function atualizarVisitaNoLead(variaveis: Record<string, unknown>, agoraIso: string): Record<string, unknown> {
  const anterior = Number(variaveis[CHAVE_VARIAVEL_VISITAS]) || 0;
  return { ...variaveis, [CHAVE_VARIAVEL_VISITA]: agoraIso, [CHAVE_VARIAVEL_VISITAS]: anterior + 1 };
}
