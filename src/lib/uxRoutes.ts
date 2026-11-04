/**
 * Rotas das experiências de UX: marcas, números, central de leads, seleções por ID e bloqueio.
 *
 * Segurança:
 *  - escrita de marca/número/seleção: só admin;
 *  - pedido de bloqueio: vendedor, só nos leads que são dele (dono checado pelo chamador);
 *  - decisão do bloqueio: só admin.
 *
 * Banco: as tabelas vêm de migrations/2026-11-ux-experiencias.sql. A criação só roda
 * com NYROH_APLICAR_MIGRACOES_UX=true. Sem isso, as rotas respondem 503 com a mensagem.
 */
import type { Express, Request, Response } from 'express';
import crypto from 'crypto';
import type pg from 'pg';

export const TAMANHOS_BLOCO = [20, 50, 100, 300, 500, 1000, 5000, 10000, 50000, 100000] as const;

export const MOTIVOS_BLOQUEIO: Record<string, string> = {
  sem_whatsapp: 'Sem WhatsApp / número inválido',
  pediu_remocao: 'Pediu para não ser contatado',
  numero_errado: 'Número errado ou de outra pessoa',
  ja_atendido: 'Já atendido por outra marca hoje',
  outro: 'Outro (descrever)',
};

interface UxDeps {
  getPool: () => pg.Pool | null;
  currentUser: (req: Request) => any;
  isAdmin: (user: any) => boolean;
  getLeadOwnerId: (leadId: string) => Promise<string | null | undefined>;
}

const SCHEMA_FLAG = 'NYROH_APLICAR_MIGRACOES_UX';

export function registerUxRoutes(app: Express, deps: UxDeps): void {
  let schemaReady = false;

  const ensureSchema = async (pool: pg.Pool): Promise<boolean> => {
    if (schemaReady) return true;
    const { default: fs } = await import('fs');
    const path = await import('path');
    const sqlPath = path.resolve(process.cwd(), 'migrations', '2026-11-ux-experiencias.sql');
    const apply = process.env[SCHEMA_FLAG] === 'true';
    try {
      const probe = await pool.query(`SELECT to_regclass('public.brands') AS t`);
      if (probe.rows[0]?.t) { schemaReady = true; return true; }
      if (!apply) return false;
      await pool.query(fs.readFileSync(sqlPath, 'utf8'));
      schemaReady = true;
      return true;
    } catch (e) {
      console.error('[UX] falha ao verificar/aplicar migração:', e);
      return false;
    }
  };

  /** Resolve o pool e garante o schema; responde 503 quando a migração ainda não foi aplicada. */
  const withDb = (handler: (pool: pg.Pool, req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      const pool = deps.getPool();
      if (!pool) return res.status(503).json({ error: 'Banco de dados indisponível (modo memória).' });
      if (!(await ensureSchema(pool))) {
        return res.status(503).json({
          error: 'Migração de UX pendente. Rode migrations/2026-11-ux-experiencias.sql ou ative NYROH_APLICAR_MIGRACOES_UX=true.',
        });
      }
      try {
        await handler(pool, req, res);
      } catch (e: any) {
        console.error('[UX] erro:', e);
        res.status(500).json({ error: 'Erro interno nesta tela.', detail: e?.message });
      }
    };

  const requireAdmin = (req: Request, res: Response): boolean => {
    const user = deps.currentUser(req);
    if (!user) { res.status(401).json({ error: 'Não autenticado.' }); return false; }
    if (!deps.isAdmin(user)) { res.status(403).json({ error: 'Apenas administradores.' }); return false; }
    return true;
  };

  const newId = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

  // ---------- Marcas ----------
  app.get('/api/brands', withDb(async (pool, _req, res) => {
    const r = await pool.query(`
      SELECT b.id, b.name, b.services, b.message_templates AS "messageTemplates",
             COALESCE(json_agg(bn.phone_number_id) FILTER (WHERE bn.phone_number_id IS NOT NULL), '[]') AS "numberIds"
      FROM brands b LEFT JOIN brand_numbers bn ON bn.brand_id = b.id
      GROUP BY b.id ORDER BY b.name`);
    res.json(r.rows);
  }));

  app.post('/api/brands', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nome da marca é obrigatório.' });
    const id = newId('brand');
    await pool.query(
      `INSERT INTO brands (id, name, services, message_templates) VALUES ($1, $2, $3, $4)`,
      [id, name, String(req.body?.services || ''), JSON.stringify(req.body?.messageTemplates || [])]
    );
    res.status(201).json({ id, name });
  }));

  /** Vínculo N:N: define exatamente quais números a marca usa. */
  app.put('/api/brands/:id/numbers', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const ids: string[] = Array.isArray(req.body?.phoneNumberIds) ? req.body.phoneNumberIds.map(String) : [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM brand_numbers WHERE brand_id = $1', [req.params.id]);
      for (const nid of ids) {
        await client.query('INSERT INTO brand_numbers (brand_id, phone_number_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, nid]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.json({ brandId: req.params.id, numberIds: ids });
  }));

  // ---------- Números ----------
  app.get('/api/phone-numbers', withDb(async (pool, _req, res) => {
    const r = await pool.query(`
      SELECT p.id, p.label, p.phone_display AS "phoneDisplay", p.meta_phone_number_id AS "metaPhoneNumberId",
             p.fluxo_instance_id AS "fluxoInstanceId",
             COALESCE(json_agg(bn.brand_id) FILTER (WHERE bn.brand_id IS NOT NULL), '[]') AS "brandIds"
      FROM phone_numbers p LEFT JOIN brand_numbers bn ON bn.phone_number_id = p.id
      GROUP BY p.id ORDER BY p.label`);
    res.json(r.rows);
  }));

  app.post('/api/phone-numbers', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const label = String(req.body?.label || '').trim();
    if (!label) return res.status(400).json({ error: 'Nome do número é obrigatório.' });
    const id = newId('num');
    await pool.query(
      `INSERT INTO phone_numbers (id, label, phone_display, meta_phone_number_id, fluxo_instance_id) VALUES ($1,$2,$3,$4,$5)`,
      [id, label, req.body?.phoneDisplay || null, req.body?.metaPhoneNumberId || null, req.body?.fluxoInstanceId || null]
    );
    res.status(201).json({ id, label });
  }));

  // ---------- Central de leads ----------
  /** Remessas (uploads) com quantos leads cada uma tem e quantos já estão bloqueados. */
  app.get('/api/central/remessas', withDb(async (pool, _req, res) => {
    const r = await pool.query(`
      SELECT r.id, r.name, r.created_at AS "createdAt",
             COUNT(l.id)::int AS "leadCount",
             COUNT(l.id) FILTER (WHERE l.blocked_at IS NOT NULL)::int AS "blockedCount"
      FROM remessas r LEFT JOIN leads l ON l.remessa_id = r.id
      GROUP BY r.id ORDER BY r.created_at DESC`);
    const semRemessa = await pool.query(`SELECT COUNT(*)::int AS n FROM leads WHERE remessa_id IS NULL`);
    res.json({ remessas: r.rows, semRemessa: semRemessa.rows[0].n, tamanhosBloco: TAMANHOS_BLOCO });
  }));

  app.post('/api/central/remessas', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nome da remessa é obrigatório.' });
    const id = newId('rem');
    await pool.query(`INSERT INTO remessas (id, name) VALUES ($1, $2)`, [id, name]);
    res.status(201).json({ id, name });
  }));

  /** Seleção por ID: cria um bloco com os IDs escolhidos (não copia os leads). */
  app.post('/api/central/selections', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const leadIds: string[] = Array.isArray(req.body?.leadIds) ? req.body.leadIds.map(String) : [];
    const size = Number(req.body?.size ?? leadIds.length);
    if (!(TAMANHOS_BLOCO as readonly number[]).includes(size) && size !== leadIds.length) {
      return res.status(400).json({ error: 'Tamanho de bloco inválido.' });
    }
    if (leadIds.length === 0) return res.status(400).json({ error: 'Selecione ao menos um lead.' });
    const id = newId('sel');
    const name = String(req.body?.name || `Bloco de ${leadIds.length}`).trim();
    await pool.query(
      `INSERT INTO lead_selections (id, name, size, lead_ids, created_by) VALUES ($1,$2,$3,$4,$5)`,
      [id, name, leadIds.length, JSON.stringify(leadIds), deps.currentUser(req)?.id || null]
    );
    res.status(201).json({ id, name, size: leadIds.length });
  }));

  // ---------- Bloqueio com motivo e aprovação ----------
  /** Vendedor sugere o bloqueio de um lead dele. Fica pendente até o admin decidir. */
  app.post('/api/leads/:id/block-requests', withDb(async (pool, req, res) => {
    const user = deps.currentUser(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado.' });
    const owner = await deps.getLeadOwnerId(req.params.id);
    if (owner === undefined) return res.status(404).json({ error: 'Lead não encontrado.' });
    if (!deps.isAdmin(user) && owner !== user.salespersonId) {
      return res.status(403).json({ error: 'Você só pode sugerir bloqueio nos seus leads.' });
    }
    const code = String(req.body?.reasonCode || '');
    if (!MOTIVOS_BLOQUEIO[code]) return res.status(400).json({ error: 'Escolha um motivo de bloqueio.' });
    const text = String(req.body?.reasonText || '').trim();
    if (code === 'outro' && !text) return res.status(400).json({ error: 'Descreva o motivo em "Outro".' });
    const id = newId('blk');
    await pool.query(
      `INSERT INTO lead_block_requests (id, lead_id, requested_by, reason_code, reason_text, status) VALUES ($1,$2,$3,$4,$5,'pendente')`,
      [id, req.params.id, user.id || null, code, text || null]
    );
    res.status(201).json({ id, status: 'pendente' });
  }));

  app.get('/api/block-requests', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const status = String(req.query.status || 'pendente');
    const r = await pool.query(
      `SELECT id, lead_id AS "leadId", requested_by AS "requestedBy", reason_code AS "reasonCode",
              reason_text AS "reasonText", status, decided_by AS "decidedBy", decision_note AS "decisionNote",
              requested_at AS "requestedAt", decided_at AS "decidedAt"
       FROM lead_block_requests WHERE status = $1 ORDER BY requested_at DESC LIMIT 200`, [status]);
    res.json(r.rows);
  }));

  /** Admin aprova ou recusa. Aprovado: lead sai da base principal e o motivo fica no histórico. */
  app.patch('/api/block-requests/:id', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const decision = req.body?.decision;
    if (decision !== 'aprovar' && decision !== 'recusar') return res.status(400).json({ error: 'Decisão inválida.' });
    const admin = deps.currentUser(req);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query(`SELECT lead_id, reason_code, reason_text, status FROM lead_block_requests WHERE id = $1 FOR UPDATE`, [req.params.id]);
      if (cur.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Pedido não encontrado.' }); }
      if (cur.rows[0].status !== 'pendente') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Este pedido já foi decidido.' }); }
      const newStatus = decision === 'aprovar' ? 'aprovado' : 'recusado';
      await client.query(
        `UPDATE lead_block_requests SET status = $1, decided_by = $2, decision_note = $3, decided_at = CURRENT_TIMESTAMP WHERE id = $4`,
        [newStatus, admin?.id || null, String(req.body?.note || '') || null, req.params.id]
      );
      if (newStatus === 'aprovado') {
        const motivo = MOTIVOS_BLOQUEIO[cur.rows[0].reason_code] || cur.rows[0].reason_code;
        const texto = cur.rows[0].reason_text ? `${motivo}: ${cur.rows[0].reason_text}` : motivo;
        await client.query(`UPDATE leads SET blocked_at = CURRENT_TIMESTAMP, blocked_reason = $1 WHERE id = $2`, [texto, cur.rows[0].lead_id]);
      }
      await client.query('COMMIT');
      res.json({ id: req.params.id, status: newStatus });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }));
}
