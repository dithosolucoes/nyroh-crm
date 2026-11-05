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

/** Verdadeiro quando o schema de UX está liberado (flag ligada). Só então as consultas usam as colunas novas. */
export const uxSchemaOn = (): boolean => process.env[SCHEMA_FLAG] === 'true';

/** Aplica a migração de UX (idempotente). Chamado no boot só com a flag ligada. */
export async function applyUxMigration(pool: pg.Pool): Promise<void> {
  const { default: fs } = await import('fs');
  const path = await import('path');
  const sql = fs.readFileSync(path.resolve(process.cwd(), 'migrations', '2026-11-ux-experiencias.sql'), 'utf8');
  await pool.query(sql);
  console.log('[UX] migração de UX aplicada (flag NYROH_APLICAR_MIGRACOES_UX=true).');
}

/** Cria uma remessa para um upload e devolve o id. Sem o schema de UX, devolve null. */
export async function abrirRemessa(pool: pg.Pool | null, nome: string): Promise<string | null> {
  if (!pool || !uxSchemaOn()) return null;
  const id = `rem_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  await pool.query(`INSERT INTO remessas (id, name) VALUES ($1, $2)`, [id, nome.slice(0, 250)]);
  return id;
}

const FUSO = `'America/Sao_Paulo'`;
const digitos = (expr: string) => `regexp_replace(${expr}, '[^0-9]', '', 'g')`;

/**
 * Regra única antes de QUALQUER disparo, somando todas as marcas:
 *  1) lead bloqueado (aprovado pelo admin) nunca entra;
 *  2) telefone já abordado hoje (disparo de qualquer safra ou mensagem do vendedor) fica de fora.
 * Recebe um trecho de WHERE sobre `campaign_leads`. Só usar com o schema de UX ligado.
 */
export function regraForaDoDisparoSql(): string {
  const tel = digitos('campaign_leads.phone_number');
  return `
    AND NOT EXISTS (
      SELECT 1 FROM leads lb
      WHERE lb.blocked_at IS NOT NULL AND ${digitos('lb.phone_number')} = ${tel}
    )
    AND NOT EXISTS (
      SELECT 1 FROM campaign_leads cj
      WHERE cj.id <> campaign_leads.id AND cj.sent_at IS NOT NULL
        AND (cj.sent_at AT TIME ZONE ${FUSO})::date = (now() AT TIME ZONE ${FUSO})::date
        AND ${digitos('cj.phone_number')} = ${tel}
    )
    AND NOT EXISTS (
      SELECT 1 FROM lead_messages lm JOIN leads lx ON lx.id = lm.lead_id
      WHERE lm.sender = 'salesperson'
        AND (lm.timestamp AT TIME ZONE ${FUSO})::date = (now() AT TIME ZONE ${FUSO})::date
        AND ${digitos('lx.phone_number')} = ${tel}
    )`;
}

// ---------------------------------------------------------------------------
// Motor de regras de contato: monta o filtro do disparo a partir da tabela `regras_contato`.
// Bloqueio pelo admin continua fixo (não é regra configurável).
// ---------------------------------------------------------------------------

const cacheRegras: { at: number; sql: string | null } = { at: 0, sql: null };
export function invalidarCacheRegras(): void {
  cacheRegras.sql = null;
  cacheRegras.at = 0;
}

const escapaTexto = (s: string) => `'${String(s).replace(/'/g, "''")}'`;

/** Trecho SQL que diz se um registro com timestamp `col` cai na janela da regra. */
function janelaSql(col: string, janelaHoras: number | null): string {
  return janelaHoras == null
    ? `(${col} AT TIME ZONE ${FUSO})::date = (now() AT TIME ZONE ${FUSO})::date`
    : `${col} >= now() - interval '${janelaHoras} hours'`;
}

export async function regrasDeContatoSql(pool: pg.Pool): Promise<string> {
  if (cacheRegras.sql !== null && Date.now() - cacheRegras.at < 30_000) return cacheRegras.sql;

  const regras = await pool.query(
    `SELECT id, tipo, escopo, marca_id, max_contatos, janela_horas
       FROM regras_contato WHERE ativa = TRUE ORDER BY criada_em, id`
  );
  const tel = digitos('campaign_leads.phone_number');
  // Bloqueado pelo admin: sempre fora.
  let sql = `
    AND NOT EXISTS (
      SELECT 1 FROM leads lb
      WHERE lb.blocked_at IS NOT NULL AND ${digitos('lb.phone_number')} = ${tel}
    )`;

  for (const r of regras.rows) {
    const janela = r.janela_horas == null ? null : Math.max(1, Math.floor(Number(r.janela_horas)));
    const doMarca = r.escopo === 'marca' && r.marca_id;
    const joinMarca = (alias: string) =>
      doMarca ? `JOIN campaign_batches cb_${alias} ON cb_${alias}.id = ${alias}.batch_id AND cb_${alias}.brand_id = ${escapaTexto(r.marca_id)}` : '';

    if (r.tipo === 'limite_janela') {
      const max = Math.max(1, Math.floor(Number(r.max_contatos) || 1));
      const envios = `
        SELECT COUNT(*) FROM campaign_leads cj ${joinMarca('cj')}
         WHERE cj.id <> campaign_leads.id AND cj.sent_at IS NOT NULL
           AND ${janelaSql('cj.sent_at', janela)}
           AND ${digitos('cj.phone_number')} = ${tel}`;
      // Mensagens do vendedor contam só na regra global (somando marcas).
      const msgs = doMarca ? '0' : `(
        SELECT COUNT(*) FROM lead_messages lm JOIN leads lx ON lx.id = lm.lead_id
         WHERE lm.sender = 'salesperson' AND ${janelaSql('lm.timestamp', janela)}
           AND ${digitos('lx.phone_number')} = ${tel})`;
      sql += `
    AND ((${envios}) + ${msgs}) < ${max}`;
    } else if (r.tipo === 'trava_entre_marcas' && r.marca_id) {
      // Se o lead foi abordado pela marca de origem dentro da janela, nenhuma OUTRA marca pode abordá-lo.
      // A própria marca de origem continua livre (ela decide o próprio ritmo nas regras de limite).
      const origem = escapaTexto(r.marca_id);
      sql += `
    AND (
      (SELECT cbo.brand_id FROM campaign_batches cbo WHERE cbo.id = campaign_leads.batch_id) = ${origem}
      OR NOT EXISTS (
        SELECT 1 FROM campaign_leads ct JOIN campaign_batches cbt ON cbt.id = ct.batch_id AND cbt.brand_id = ${origem}
         WHERE ct.id <> campaign_leads.id AND ct.sent_at IS NOT NULL
           AND ${janelaSql('ct.sent_at', janela)}
           AND ${digitos('ct.phone_number')} = ${tel}
      )
    )`;
    } else if (r.tipo === 'apos_resposta') {
      sql += `
    AND NOT EXISTS (
      SELECT 1 FROM campaign_leads cl2 ${joinMarca('cl2')}
       WHERE cl2.id <> campaign_leads.id AND cl2.status NOT IN ('STAGING','DESCARTADO')
         AND (cl2.whatsapp_message_id IS NOT NULL OR cl2.status = 'INTERESSADO')
         ${janela == null ? '' : `AND cl2.sent_at >= now() - interval '${janela} hours'`}
         AND ${digitos('cl2.phone_number')} = ${tel}
    )`;
    }
  }

  cacheRegras.sql = sql;
  cacheRegras.at = Date.now();
  return sql;
}

/** Instância da FluxoAPI do número vinculado à marca da safra. Cache de 60 s por safra. */
const cacheInstancia = new Map<string, { at: number; temMarca: boolean; instanceId: string }>();
export async function instanciaDaSafra(pool: pg.Pool | null, batchId: string): Promise<{ temMarca: boolean; instanceId: string }> {
  const vazio = { temMarca: false, instanceId: '' };
  if (!pool || !uxSchemaOn() || !batchId) return vazio;
  const hit = cacheInstancia.get(batchId);
  if (hit && Date.now() - hit.at < 60_000) return hit;
  const r = await pool.query(
    `SELECT cb.brand_id,
            (SELECT pn.fluxo_instance_id FROM brand_numbers bn
               JOIN phone_numbers pn ON pn.id = bn.phone_number_id
              WHERE bn.brand_id = cb.brand_id AND pn.fluxo_instance_id IS NOT NULL
              ORDER BY pn.label LIMIT 1) AS instance_id
       FROM campaign_batches cb WHERE cb.id = $1`,
    [batchId]
  );
  const row = r.rows[0];
  const out = { at: Date.now(), temMarca: !!row?.brand_id, instanceId: row?.instance_id || '' };
  cacheInstancia.set(batchId, out);
  return out;
}

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

  /** Edita nome e serviços da marca. Só os campos enviados mudam. */
  app.patch('/api/brands/:id', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const sets: string[] = [];
    const vals: unknown[] = [req.params.id];
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Nome da marca é obrigatório.' });
      vals.push(name); sets.push(`name = $${vals.length}`);
    }
    if (req.body?.services !== undefined) {
      vals.push(String(req.body.services || '')); sets.push(`services = $${vals.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada para alterar.' });
    const r = await pool.query(`UPDATE brands SET ${sets.join(', ')} WHERE id = $1 RETURNING id, name, services`, vals);
    if (!r.rowCount) return res.status(404).json({ error: 'Marca não encontrada.' });
    res.json(r.rows[0]);
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
  app.get('/api/phone-numbers', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return; // números e instâncias são só do admin
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

  /** Edita os dados de um número. Só os campos enviados mudam. */
  app.patch('/api/phone-numbers/:id', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const mapa: Record<string, string> = { label: 'label', phoneDisplay: 'phone_display', metaPhoneNumberId: 'meta_phone_number_id' };
    const sets: string[] = [];
    const vals: unknown[] = [req.params.id];
    for (const [campo, coluna] of Object.entries(mapa)) {
      if (req.body?.[campo] === undefined) continue;
      const v = String(req.body[campo] ?? '').trim();
      if (campo === 'label' && !v) return res.status(400).json({ error: 'Nome do número é obrigatório.' });
      vals.push(v || null); sets.push(`${coluna} = $${vals.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada para alterar.' });
    const r = await pool.query(`UPDATE phone_numbers SET ${sets.join(', ')} WHERE id = $1 RETURNING id, label, phone_display AS "phoneDisplay", meta_phone_number_id AS "metaPhoneNumberId"`, vals);
    if (!r.rowCount) return res.status(404).json({ error: 'Número não encontrado.' });
    res.json(r.rows[0]);
  }));

  /** Liga a safra (campanha) a uma marca. Só admin (rota /api/campaign/ já é restrita). */
  app.put('/api/campaign/batches/:id/brand', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const brandId = req.body?.brandId ? String(req.body.brandId) : null;
    await pool.query(`UPDATE campaign_batches SET brand_id = $1 WHERE id = $2`, [brandId, req.params.id]);
    res.json({ batchId: req.params.id, brandId });
  }));

  /** Histórico de pedidos de bloqueio de um lead (admin vê todos; vendedor só os seus). */
  app.get('/api/leads/:id/block-requests', withDb(async (pool, req, res) => {
    const user = deps.currentUser(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado.' });
    const owner = await deps.getLeadOwnerId(req.params.id);
    if (owner === undefined) return res.status(404).json({ error: 'Lead não encontrado.' });
    if (!deps.isAdmin(user) && owner !== user.salespersonId) return res.status(403).json({ error: 'Lead de outro vendedor.' });
    const r = await pool.query(
      `SELECT id, reason_code AS "reasonCode", reason_text AS "reasonText", status, decision_note AS "decisionNote",
              requested_at AS "requestedAt", decided_at AS "decidedAt"
       FROM lead_block_requests WHERE lead_id = $1 ORDER BY requested_at DESC LIMIT 50`, [req.params.id]);
    res.json(r.rows);
  }));

  // ---------- Central de leads ----------
  /** Remessas (uploads) com quantos leads cada uma tem e quantos já estão bloqueados. */
  // ---------------- Regras de contato (tela Configurações > Regras de contato) ----------------
  const TIPOS_REGRA = ['limite_janela', 'apos_resposta', 'trava_entre_marcas'];
  const ESCOPOS_REGRA = ['global', 'marca'];

  /** Valida e normaliza uma regra. `atual` é a regra existente (no PATCH), para completar campos. */
  const normalizaRegra = (body: any, atual?: any) => {
    const tipo = String(body?.tipo ?? atual?.tipo ?? '');
    const escopo = String(body?.escopo ?? atual?.escopo ?? 'global');
    const nome = String(body?.nome ?? atual?.nome ?? '').trim();
    const marcaId = body?.marcaId !== undefined ? (body.marcaId ? String(body.marcaId) : null) : (atual?.marca_id ?? null);
    const maxRaw = body?.maxContatos !== undefined ? body.maxContatos : atual?.max_contatos ?? 1;
    const janelaRaw = body?.janelaHoras !== undefined ? body.janelaHoras : atual?.janela_horas ?? null;
    const ativa = body?.ativa !== undefined ? Boolean(body.ativa) : atual?.ativa ?? true;

    if (!nome) return { erro: 'Dê um nome para a regra.' };
    if (!TIPOS_REGRA.includes(tipo)) return { erro: 'Tipo de regra inválido.' };
    if (!ESCOPOS_REGRA.includes(escopo)) return { erro: 'Escopo inválido.' };
    if (escopo === 'marca' && !marcaId) return { erro: 'Escolha a marca desta regra.' };
    if (tipo === 'trava_entre_marcas' && (escopo !== 'marca' || !marcaId)) {
      return { erro: 'Na trava entre marcas, escolha a marca que abordou o lead primeiro.' };
    }
    const max = Number(maxRaw);
    if (tipo === 'limite_janela' && (!Number.isInteger(max) || max < 1 || max > 50)) {
      return { erro: 'Quantidade de contatos deve ser um número entre 1 e 50.' };
    }
    let janela: number | null = null;
    if (janelaRaw !== null && janelaRaw !== '' && janelaRaw !== undefined) {
      janela = Number(janelaRaw);
      if (!Number.isInteger(janela) || janela < 1 || janela > 8760) return { erro: 'Janela deve ser de 1 a 8760 horas (ou vazia).' };
    }
    return { valor: { nome, tipo, escopo, marcaId: escopo === 'marca' ? marcaId : null, max: tipo === 'limite_janela' ? max : 1, janela, ativa } };
  };

  app.get('/api/regras-contato', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const r = await pool.query(
      `SELECT r.id, r.nome, r.tipo, r.escopo, r.marca_id AS "marcaId", b.name AS "marcaNome",
              r.max_contatos AS "maxContatos", r.janela_horas AS "janelaHoras", r.ativa
         FROM regras_contato r LEFT JOIN brands b ON b.id = r.marca_id
        ORDER BY r.criada_em, r.id`
    );
    res.json(r.rows);
  }));

  app.post('/api/regras-contato', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const n = normalizaRegra(req.body);
    if ('erro' in n) return res.status(400).json({ error: n.erro });
    const v = n.valor!;
    const id = newId('regra');
    await pool.query(
      `INSERT INTO regras_contato (id, nome, tipo, escopo, marca_id, max_contatos, janela_horas, ativa)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, v.nome, v.tipo, v.escopo, v.marcaId, v.max, v.janela, v.ativa]
    );
    invalidarCacheRegras();
    res.status(201).json({ id });
  }));

  app.patch('/api/regras-contato/:id', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const atual = await pool.query('SELECT * FROM regras_contato WHERE id = $1', [req.params.id]);
    if (!atual.rowCount) return res.status(404).json({ error: 'Regra não encontrada.' });
    const n = normalizaRegra(req.body, atual.rows[0]);
    if ('erro' in n) return res.status(400).json({ error: n.erro });
    const v = n.valor!;
    await pool.query(
      `UPDATE regras_contato SET nome = $2, tipo = $3, escopo = $4, marca_id = $5, max_contatos = $6, janela_horas = $7, ativa = $8
        WHERE id = $1`,
      [req.params.id, v.nome, v.tipo, v.escopo, v.marcaId, v.max, v.janela, v.ativa]
    );
    invalidarCacheRegras();
    res.json({ ok: true });
  }));

  app.delete('/api/regras-contato/:id', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    await pool.query('DELETE FROM regras_contato WHERE id = $1', [req.params.id]);
    invalidarCacheRegras();
    res.json({ ok: true });
  }));

  /** Prévia: quantos contatos em espera passariam hoje com as regras atuais. */
  app.post('/api/regras-contato/previa', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const filtro = await regrasDeContatoSql(pool);
    const total = await pool.query(`SELECT COUNT(*)::int AS n FROM campaign_leads WHERE status = 'STAGING' AND is_mobile = TRUE`);
    const passam = await pool.query(`SELECT COUNT(*)::int AS n FROM campaign_leads WHERE status = 'STAGING' AND is_mobile = TRUE ${filtro}`);
    res.json({ emEspera: total.rows[0].n, passariam: passam.rows[0].n, barrados: total.rows[0].n - passam.rows[0].n });
  }));

  app.get('/api/central/remessas', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return; // a Central de leads é só do admin
    const r = await pool.query(`
      SELECT r.id, r.name, r.created_at AS "createdAt",
             COUNT(l.id)::int AS "leadCount",
             COUNT(l.id) FILTER (WHERE l.blocked_at IS NOT NULL)::int AS "blockedCount",
             COUNT(l.id) FILTER (WHERE EXISTS (
               SELECT 1 FROM campaign_leads cl
               WHERE cl.sent_at IS NOT NULL
                 AND (cl.sent_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
                 AND ${digitos('cl.phone_number')} = ${digitos('l.phone_number')}
             ))::int AS "contatadosHoje"
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

  // ---------- Direcionar bloco ou remessa para uma marca ----------
  /**
   * Cria uma safra ligada à marca com os leads escolhidos. A central continua com os leads
   * (quem é direcionado vira cópia na safra; o lead original não some). Bloqueados não entram.
   * A regra de um contato por dia é aplicada de novo no disparo.
   */
  const direcionarParaMarca = async (pool: pg.Pool, req: Request, res: Response, origem: { sql: string; params: unknown[] }) => {
    if (!requireAdmin(req, res)) return;
    const brandId = String(req.body?.brandId || '');
    if (!brandId) return res.status(400).json({ error: 'Escolha a marca.' });
    const marca = await pool.query('SELECT id, name FROM brands WHERE id = $1', [brandId]);
    if (!marca.rowCount) return res.status(404).json({ error: 'Marca não encontrada.' });

    const batchId = newId('safra');
    const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const nome = String(req.body?.name || `${marca.rows[0].name} · ${hoje}`).trim().slice(0, 250);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO campaign_batches (id, name, brand_id, status) VALUES ($1, $2, $3, 'draft')`,
        [batchId, nome, brandId]
      );
      const ins = await client.query(
        `INSERT INTO campaign_leads (id, batch_id, name, phone_number, is_mobile, public_url, website, niche, status)
         SELECT 'cl_' || md5($1 || l.id), $1, l.name, l.phone_number,
                (x.d ~ '^[0-9]{2}9[0-9]{8}$' OR x.d ~ '^55[0-9]{2}9[0-9]{8}$'),
                l.public_url, l.website, l.niche, 'STAGING'
           FROM leads l
           CROSS JOIN LATERAL (SELECT ${digitos('l.phone_number')} AS d) x
          WHERE l.blocked_at IS NULL AND ${origem.sql}
            AND NOT EXISTS (
              SELECT 1 FROM campaign_leads cx JOIN campaign_batches cbx ON cbx.id = cx.batch_id
               WHERE cbx.brand_id = $${origem.params.length + 2} AND cx.sent_at IS NOT NULL
                 AND ${digitos('cx.phone_number')} = ${digitos('l.phone_number')}
            )
         ON CONFLICT (id) DO NOTHING`,
        [batchId, ...origem.params, brandId]
      );
      if (!ins.rowCount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Nenhum lead elegível: bloqueados ou já abordados por esta marca não entram.' });
      }
      await client.query(
        `UPDATE campaign_batches SET
           total_leads = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1),
           valid_mobiles = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1 AND is_mobile),
           landlines = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1 AND NOT is_mobile)
         WHERE id = $1`,
        [batchId]
      );
      await client.query('COMMIT');
      res.status(201).json({ batchId, name: nome, brandId, total: ins.rowCount });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  };

  /** Blocos salvos por ID (mais recentes primeiro). */
  app.get('/api/central/selections', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const r = await pool.query(
      `SELECT s.id, s.name, s.size, s.created_at AS "createdAt",
              (SELECT COUNT(DISTINCT l.id)::int
                 FROM jsonb_array_elements_text(s.lead_ids) AS x(lid)
                 JOIN leads l ON l.id = x.lid
                WHERE EXISTS (
                  SELECT 1 FROM campaign_leads cl
                   WHERE cl.sent_at >= (date_trunc('day', now() AT TIME ZONE ${FUSO}) AT TIME ZONE ${FUSO})
                     AND cl.sent_at < ((date_trunc('day', now() AT TIME ZONE ${FUSO}) + interval '1 day') AT TIME ZONE ${FUSO})
                     AND ${digitos('cl.phone_number')} = ${digitos('l.phone_number')}
                )) AS "contatadosHoje"
         FROM lead_selections s ORDER BY s.created_at DESC LIMIT 100`
    );
    res.json(r.rows);
  }));

  app.post('/api/central/selections/:id/direcionar', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const sel = await pool.query('SELECT lead_ids FROM lead_selections WHERE id = $1', [req.params.id]);
    if (!sel.rowCount) return res.status(404).json({ error: 'Bloco não encontrado.' });
    const raw = sel.rows[0].lead_ids;
    const ids: string[] = Array.isArray(raw) ? raw.map(String) : JSON.parse(String(raw || '[]'));
    await direcionarParaMarca(pool, req, res, { sql: 'l.id = ANY($2::text[])', params: [ids] });
  }));

  /**
   * Análise de um bloco ou remessa: para cada lead, quando foi abordado por cada marca.
   * Usado pela Central de leads para mostrar "abordou há 2 dias" antes de direcionar.
   */
  app.get('/api/central/analise', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const tipo = String(req.query.tipo || '');
    const id = String(req.query.id || '');
    let filtro: string;
    let params: unknown[];
    if (tipo === 'bloco') {
      const sel = await pool.query('SELECT lead_ids FROM lead_selections WHERE id = $1', [id]);
      if (!sel.rowCount) return res.status(404).json({ error: 'Bloco não encontrado.' });
      const raw = sel.rows[0].lead_ids;
      const ids: string[] = Array.isArray(raw) ? raw.map(String) : JSON.parse(String(raw || '[]'));
      filtro = 'l.id = ANY($1::text[])';
      params = [ids];
    } else if (tipo === 'remessa') {
      filtro = 'l.remessa_id = $1';
      params = [id];
    } else {
      return res.status(400).json({ error: 'Informe tipo (bloco ou remessa).' });
    }
    const r = await pool.query(`
      WITH base AS (
        SELECT l.id, l.name, l.phone_number, l.blocked_at
          FROM leads l WHERE ${filtro}
      ),
      hist AS (
        SELECT regexp_replace(cl.phone_number, '[^0-9]', '', 'g') AS tel,
               cb.brand_id, cb.name AS batch_name, MAX(cl.sent_at) AS ultimo_envio
          FROM campaign_leads cl
          LEFT JOIN campaign_batches cb ON cb.id = cl.batch_id
         WHERE cl.sent_at IS NOT NULL
         GROUP BY 1, 2, 3
      )
      SELECT b.id, b.name, b.phone_number AS phone, b.blocked_at AS "blockedAt",
             COALESCE(json_agg(json_build_object('brandId', h.brand_id, 'batchName', h.batch_name, 'sentAt', h.ultimo_envio)
                      ORDER BY h.ultimo_envio DESC) FILTER (WHERE h.tel IS NOT NULL), '[]') AS history
        FROM base b
        LEFT JOIN hist h ON h.tel = regexp_replace(b.phone_number, '[^0-9]', '', 'g')
       GROUP BY b.id, b.name, b.phone_number, b.blocked_at
       ORDER BY b.name
       LIMIT 5000`, params);
    res.json({ leads: r.rows, total: r.rowCount });
  }));

  app.post('/api/central/remessas/:id/direcionar', withDb(async (pool, req, res) => {
    if (!requireAdmin(req, res)) return;
    const r = await pool.query('SELECT id FROM remessas WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Remessa não encontrada.' });
    await direcionarParaMarca(pool, req, res, { sql: 'l.remessa_id = $2', params: [req.params.id] });
  }));
}
