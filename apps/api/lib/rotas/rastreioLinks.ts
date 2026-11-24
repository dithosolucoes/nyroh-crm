import { randomBytes } from 'crypto';
import { linkDiretoLigado } from '../visitaSite.js';

/** Link de rastreio por lead: o CRM registra o clique e redireciona para o site do cliente. */
const TRACKING_BASE_URL = (process.env.PUBLIC_APP_URL || 'https://nyroh-crm-production-fedd.up.railway.app').replace(/\/$/, '');

export interface DependenciasRastreioLinks {
  readonly pgPool: any;
  readonly usePostgres: any;
}

let D: DependenciasRastreioLinks;

export function configurarRastreioLinks(deps: DependenciasRastreioLinks): void {
  D = deps;
}

export async function trackedLinkFor(leadId: string, targetUrl: string): Promise<string> {
  const destino = String(targetUrl || '').trim();
  // NYROH_LINK_DIRETO ligada: manda o link original do site, sem passar pelo CRM. Padrão desligada.
  if (linkDiretoLigado(process.env)) return destino;
  if (!destino || !/^https?:\/\//i.test(destino) || !D.usePostgres || !D.pgPool) return destino;
  try {
    const token = randomBytes(9).toString('base64url');
    await D.pgPool.query('INSERT INTO link_clicks (token, lead_id, target_url) VALUES ($1, $2, $3)', [token, leadId, destino]);
    return `${TRACKING_BASE_URL}/r/${token}`;
  } catch (err) {
    console.warn('[Rastreio] não consegui criar o link de rastreio; usando o link direto.', err);
    return destino;
  }
}
