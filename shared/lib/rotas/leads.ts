/**
 * B3 (item 4.1 c): leads (listar, notas, resolver, resumo, status e edição) extraídos de server.ts.
 * Rotas: GET /api/leads, GET/POST /api/leads/:id/notes, POST /api/leads/:id/resolve,
 * GET /api/leads/:id/summary, PUT /api/leads/:id/status, PUT /api/leads/:id.
 * Dependências do servidor entram por configurarLeads (getters, valor atual).
 */
import type { Express } from 'express';

import { PIPELINE_COLUMNS, type ColumnStatus } from '../../types.js';
import { uxSchemaOn } from '../uxRoutes.js';
import { isUserAdmin } from '../serverAuth.js';
import type { RespostaAtualizacaoLead, RespostaListaLeads, RespostaListaNotas, RespostaNotaCriada, RespostaResolucao, RespostaResumoLead } from '../../contracts/rotas.js';
import { SQL_SELECT_LEAD_NOTES, SQL_INSERT_LEAD_NOTES, SQL_SELECT_LEADS, SQL_UPDATE_LEADS, SQL_UPDATE_LEADS_2, SQL_UPDATE_SITE_DO_CLIENTE, SQL_SELECT_SITE_EM_OUTRO_LEAD } from './repo/leads.js';
import { normalizarSite } from '../visitaSite.js';
export interface DependenciasLeads {
  readonly emitirEventoLead: (evento: any, leadId: string, contexto: any) => void;
  readonly memoryCallLogsMap: Map<string, any[]>;
  readonly memoryLeadsMap: Map<string, any>;
  readonly pgPool: any;
  readonly usePostgres: boolean;
}

let D: DependenciasLeads;

export function configurarLeads(deps: DependenciasLeads): void {
  D = deps;
}

export function registrarLeads(app: Express): void {
  /** Notas internas da conversa: só a equipe vê, o cliente nunca recebe. */
  app.get('/api/leads/:id/notes', async (req: any, res) => {
    const { id } = req.params;
    if (!D.usePostgres || !D.pgPool) return res.json({ notes: [] } satisfies RespostaListaNotas);
    try {
      const r = await D.pgPool.query(
        SQL_SELECT_LEAD_NOTES,
        [id]
      );
      return res.json({ notes: r.rows } satisfies RespostaListaNotas);
    } catch {
      return res.json({ notes: [] } satisfies RespostaListaNotas);
    }
  });

  app.post('/api/leads/:id/notes', async (req: any, res) => {
    const { id } = req.params;
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Escreva a nota.' });
    if (!D.usePostgres || !D.pgPool) return res.status(503).json({ error: 'Sem banco de dados para guardar a nota.' });
    const noteId = `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      await D.pgPool.query(
        SQL_INSERT_LEAD_NOTES,
        [noteId, id, req.user?.id || null, req.user?.name || 'Equipe', text]
      );
      return res.json({ success: true, id: noteId } satisfies RespostaNotaCriada);
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao gravar a nota.' });
    }
  });

  /** Marca/desmarca a conversa como resolvida (some dos filtros de pendência). */
  app.post('/api/leads/:id/resolve', async (req: any, res) => {
    const { id } = req.params;
    const resolver = req.body?.resolved !== false;
    if (!D.usePostgres || !D.pgPool) return res.status(503).json({ error: 'Sem banco de dados.' });
    try {
      await D.pgPool.query(
        `UPDATE leads SET resolved_at = ${resolver ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE id = $1`,
        [id]
      );
      return res.json({ success: true, resolved: resolver } satisfies RespostaResolucao);
    } catch {
      return res.status(500).json({ error: 'Erro ao atualizar a conversa.' });
    }
  });

  /**
   * GET /api/leads/:id/summary — um lead só.
   * Permite ao front atualizar UMA conversa quando chega um evento, em vez de baixar a base toda.
   */
  app.get('/api/leads/:id/summary', async (req: any, res) => {
    const { id } = req.params;
    if (!D.usePostgres || !D.pgPool) {
      const lead = D.memoryLeadsMap.get(id);
      return lead ? res.json(lead satisfies RespostaResumoLead) : res.status(404).json({ error: 'Lead não encontrado.' });
    }
    try {
      const r = await D.pgPool.query(
        SQL_SELECT_LEADS,
        [id]
      );
      if (r.rowCount === 0) return res.status(404).json({ error: 'Lead não encontrado.' });
      return res.json(r.rows[0] satisfies RespostaResumoLead);
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao carregar o lead.' });
    }
  });

  app.get('/api/leads', async (req: any, res) => {
    let { salespersonId } = req.query;

    // Isolamento estrito de carteira. Negar por padrão: só ADMIN vê a base inteira.
    // Antes, quem não fosse exatamente role='salesperson' COM salespersonId (um papel
    // 'manager', ou um vendedor sem vínculo) caía no caminho de admin e via todos os leads.
    if (!isUserAdmin(req.user)) {
      const own = req.user?.salespersonId;
      if (!own) {
        return res.json([] satisfies RespostaListaLeads); // sem carteira vinculada, não há leads para mostrar
      }
      salespersonId = own;
    }

    try {
      if (D.usePostgres && D.pgPool) {
        let whereClause = '';
        const params: any[] = [];
        if (salespersonId && salespersonId !== 'ALL') {
          params.push(salespersonId);
          whereClause = ` WHERE l.salesperson_id = $1`;
        }
        if (uxSchemaOn()) {
          whereClause += (whereClause ? ' AND' : ' WHERE') + ' l.blocked_at IS NULL'; // bloqueados saem da base principal
        }

        const query = `
          WITH call_stats AS (
            SELECT 
              lead_id,
              COUNT(*)::int AS call_count,
              MAX(created_at) AS last_call_at
            FROM calls
            GROUP BY lead_id
          ),
          latest_calls AS (
            SELECT DISTINCT ON (lead_id)
              lead_id,
              tag AS last_call_tag
            FROM calls
            ORDER BY lead_id, created_at DESC
          )
          SELECT 
            l.id,
            l.name,
            l.phone_number AS "phoneNumber",
            l.public_url AS "publicUrl",
            l.website AS "website",
            l.variaveis_json->>'site_do_cliente' AS "siteDoCliente",
            COALESCE(l.column_status, 'Leads') AS "columnStatus",
            COALESCE(l.salesperson_id, 'seller-thomas') AS "salespersonId",
            COALESCE(l.salesperson_name, 'Thomas') AS "salespersonName",
            l.niche AS "niche",
            l.categories AS "categories",
            l.sub_status AS "subStatus",
            l.loss_reason AS "lossReason",
            l.next_follow_up_at AS "nextFollowUpAt",
            l.created_at AS "createdAt",
            l.updated_at AS "updatedAt",
            COALESCE(l.whatsapp_replied, FALSE) AS "hasWhatsAppReply",
            COALESCE(l.whatsapp_replied, FALSE) AS "whatsappReplied",
            l.responded_at AS "respondedAt",
            l.last_whatsapp_message AS "lastWhatsAppMessage",
            COALESCE(cs.call_count, 0)::int AS "callCount",
            cs.last_call_at AS "lastCallAt",
            lc.last_call_tag AS "lastCallTag",
            (SELECT COUNT(*)::int FROM campaign_leads cl
              WHERE cl.sent_at >= (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')
                AND cl.sent_at < ((date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 day') AT TIME ZONE 'America/Sao_Paulo')
                AND regexp_replace(cl.phone_number, '[^0-9]', '', 'g') = regexp_replace(l.phone_number, '[^0-9]', '', 'g')
            ) AS "contatosHoje",
            ${uxSchemaOn() ? `(SELECT COALESCE(json_agg(json_build_object('id', b.id, 'name', b.name, 'lastAt', ch.ultimo_contato) ORDER BY ch.ultimo_contato DESC), '[]'::json)
              FROM contato_marcas ch JOIN brands b ON b.id = ch.marca_id
              WHERE ch.telefone = regexp_replace(l.phone_number, '[^0-9]', '', 'g')
            )` : `'[]'::json`} AS "marcas"
          FROM leads l
          LEFT JOIN call_stats cs ON l.id = cs.lead_id
          LEFT JOIN latest_calls lc ON l.id = lc.lead_id
          ${whereClause}
          ORDER BY l.created_at DESC
        `;

        const result = await D.pgPool.query(query, params);
        return res.json(result.rows satisfies RespostaListaLeads);
      } else {
        let allLeads = Array.from(D.memoryLeadsMap.values());
        if (salespersonId && salespersonId !== 'ALL') {
          allLeads = allLeads.filter(l => (l.salespersonId || 'seller-thomas') === salespersonId);
        }

        const leadsList = allLeads.map(lead => {
          const calls = D.memoryCallLogsMap.get(lead.id) || [];
          const sortedCalls = [...calls].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          const lastCall = sortedCalls.length > 0 ? sortedCalls[0] : undefined;
          return {
            ...lead,
            salespersonId: lead.salespersonId || 'seller-thomas',
            salespersonName: lead.salespersonName || 'Thomas',
            hasWhatsAppReply: Boolean(lead.whatsappReplied || (lead as any).hasWhatsAppReply),
            whatsappReplied: Boolean(lead.whatsappReplied),
            respondedAt: lead.respondedAt,
            lastWhatsAppMessage: lead.lastWhatsAppMessage,
            callCount: calls.length,
            lastCallAt: lastCall?.createdAt,
            lastCallTag: lastCall?.tag
          };
        });
        return res.json(leadsList satisfies RespostaListaLeads);
      }
    } catch (error) {
      console.error('Error fetching leads:', error);
      res.status(500).json({ error: 'Erro ao buscar leads do banco de dados.' });
    }
  });

  // 3. Update lead column status & sub-stages
  app.put('/api/leads/:id/status', async (req, res) => {
    const { id } = req.params;
    const { columnStatus, subStatus, lossReason } = req.body;

    if (columnStatus && !PIPELINE_COLUMNS.includes(columnStatus as ColumnStatus)) {
      return res.status(400).json({ error: 'Status de coluna inválido.' });
    }

    try {
      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          SQL_UPDATE_LEADS,
          [columnStatus || null, subStatus || null, lossReason || null, id]
        );
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Lead não encontrado.' });
        }
        if (columnStatus) D.emitirEventoLead('funil_entrou', id, { funil: String(columnStatus) });
        return res.json({ success: true, lead: result.rows[0] } satisfies RespostaAtualizacaoLead);
      } else {
        const lead = D.memoryLeadsMap.get(id);
        if (!lead) {
          return res.status(404).json({ error: 'Lead não encontrado.' });
        }
        if (columnStatus) lead.columnStatus = columnStatus as ColumnStatus;
        if (subStatus !== undefined) lead.subStatus = subStatus;
        if (lossReason !== undefined) lead.lossReason = lossReason;
        lead.updatedAt = new Date().toISOString();
        D.memoryLeadsMap.set(id, lead);
        return res.json({ success: true, lead } satisfies RespostaAtualizacaoLead);
      }
    } catch (error) {
      console.error('Error updating lead status:', error);
      res.status(500).json({ error: 'Erro ao atualizar coluna do lead.' });
    }
  });

  // Update full lead properties (Name, Phone, PublicUrl, Website)
  app.put('/api/leads/:id', async (req, res) => {
    const { id } = req.params;
    const { name, phoneNumber, publicUrl, website } = req.body;
    // Site hospedado (rastreio de visitas). Só entra se vier no corpo; vazio remove.
    const temSite = Object.prototype.hasOwnProperty.call(req.body || {}, 'siteDoCliente');
    let siteNovo: string | null = null;
    if (temSite) {
      const bruto = String(req.body.siteDoCliente ?? '').trim();
      siteNovo = bruto === '' ? null : normalizarSite(bruto);
      if (bruto !== '' && !siteNovo) {
        return res.status(400).json({ error: 'Site inválido. Use o endereço completo, começando com https://.' });
      }
      if (!D.usePostgres || !D.pgPool) {
        return res.status(503).json({ error: 'Salvar o site do cliente precisa do banco.' });
      }
    }

    try {
      if (temSite && siteNovo) {
        const outro = await D.pgPool.query(SQL_SELECT_SITE_EM_OUTRO_LEAD, [siteNovo, id]);
        if (outro.rowCount) {
          return res.status(409).json({ error: 'Esse site já está em outro lead.' });
        }
      }
      if (temSite) {
        await D.pgPool.query(SQL_UPDATE_SITE_DO_CLIENTE, [id, siteNovo]);
      }
      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          SQL_UPDATE_LEADS_2,
          [name || null, phoneNumber || null, publicUrl || null, website || null, id]
        );
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Lead não encontrado.' });
        }
        return res.json({ success: true, lead: result.rows[0] } satisfies RespostaAtualizacaoLead);
      } else {
        const lead = D.memoryLeadsMap.get(id);
        if (!lead) {
          return res.status(404).json({ error: 'Lead não encontrado.' });
        }
        if (name) lead.name = name;
        if (phoneNumber) lead.phoneNumber = phoneNumber;
        if (publicUrl !== undefined) lead.publicUrl = publicUrl;
        if (website !== undefined) lead.website = website;
        lead.updatedAt = new Date().toISOString();
        D.memoryLeadsMap.set(id, lead);
        return res.json({ success: true, lead } satisfies RespostaAtualizacaoLead);
      }
    } catch (error: any) {
      console.error('Error updating lead:', error);
      res.status(500).json({ error: 'Erro ao atualizar dados do lead.' });
    }
  });

}
