import type { Express } from 'express';
import { atualizarVisitaNoLead, chaveConfere, CHAVE_VARIAVEL_SITE, normalizarSite } from '../visitaSite.js';

export interface DependenciasVisitasSite {
  readonly env: Record<string, string | undefined>;
  readonly pgPool: any;
  readonly usePostgres: any;
}

let D: DependenciasVisitasSite;

export function configurarVisitasSite(deps: DependenciasVisitasSite): void {
  D = deps;
}

/**
 * POST /api/integracoes/visita-site
 * Chamado pela plataforma de sites quando alguém abre um site hospedado.
 * Cabeçalho `x-chave-integracao` com a chave secreta (NYROH_CHAVE_VISITA_SITE). Corpo: { "site": "https://..." }.
 * Fica ANTES do guarda de sessão de /api, como o rastreio antigo, porque quem chama é outro sistema.
 */
export function registrarVisitasSite(app: Express): void {
  app.post('/api/integracoes/visita-site', async (req: any, res) => {
    const esperada = D.env.NYROH_CHAVE_VISITA_SITE;
    if (!esperada) return res.status(503).json({ error: 'Integração de visitas desligada (sem chave configurada).' });
    if (!chaveConfere(req.get('x-chave-integracao'), esperada)) return res.status(401).json({ error: 'Chave inválida.' });
    const site = normalizarSite(req.body?.site);
    if (!site) return res.status(400).json({ error: 'Informe o site completo, começando com http:// ou https://.' });
    if (!D.usePostgres || !D.pgPool) return res.status(503).json({ error: 'Banco indisponível.' });
    try {
      const r = await D.pgPool.query(
        'SELECT id, variaveis_json FROM leads WHERE variaveis_json->>$1 = $2 LIMIT 2',
        [CHAVE_VARIAVEL_SITE, site]
      );
      if (r.rowCount === 0) return res.status(404).json({ error: 'Nenhum lead com esse site.' });
      if (r.rowCount > 1) return res.status(409).json({ error: 'Mais de um lead com esse site. Corrija o cadastro.' });
      const lead = r.rows[0];
      const novas = atualizarVisitaNoLead(lead.variaveis_json || {}, new Date().toISOString());
      await D.pgPool.query('UPDATE leads SET variaveis_json = $2 WHERE id = $1', [lead.id, novas]);
      return res.json({ ok: true, leadId: lead.id });
    } catch (err) {
      console.error('Erro ao registrar visita de site:', err);
      return res.status(500).json({ error: 'Erro ao registrar a visita.' });
    }
  });
}
