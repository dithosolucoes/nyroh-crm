/**
 * Exportação do banco (backup manual) para o administrador.
 *
 * - Só admin. Cada download fica registrado na auditoria.
 * - Exporta as tabelas do CRM, sem colunas de senha, hash, token ou chave (ex.: password_hash, token).
 * - Não restaura nada: é só download. Restaurar é uma etapa separada e com confirmação.
 * - O arquivo contém dados pessoais de clientes: não compartilhar.
 */
import type { Express, Request, Response } from 'express';
import type pg from 'pg';

interface BackupDeps {
  getPool: () => pg.Pool | null;
  currentUser: (req: Request) => any;
  isAdmin: (user: any) => boolean;
  logAudit: (action: string, details?: string, req?: Request) => Promise<void>;
}

/** Tabelas exportadas. Fica de fora de propósito: auth_sessions (tokens) e system_settings (chaves). */
export const TABELAS_BACKUP = [
  'salespeople',
  'leads',
  'calls',
  'custom_tags',
  'users',
  'audit_logs',
  'lead_messages',
  'lead_notes',
  'quick_replies',
  'campaign_batches',
  'campaign_leads',
  'campaign_copy_templates',
  'zip_uploads',
  'link_clicks',
  'meta_templates',
  'meta_accounts',
  'meta_numbers',
  'lead_meta_routes',
  'automacoes_respostas',
] as const;

/** Colunas que nunca saem no backup, mesmo que a tabela as tenha. */
const COLUNA_PROIBIDA = /(password|hash|salt|token|secret|api_?key|private)/i;

export const colunaPermitida = (nome: string): boolean => !COLUNA_PROIBIDA.test(nome);

export function registerBackupRoutes(app: Express, deps: BackupDeps): void {
  app.get('/api/admin/backup/exportar', async (req: Request, res: Response) => {
    if (!deps.isAdmin(deps.currentUser(req))) {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    }
    const pool = deps.getPool();
    if (!pool) return res.status(503).json({ error: 'Banco de dados indisponível neste ambiente.' });

    try {
      const tabelas: Record<string, unknown[]> = {};
      const contagem: Record<string, number> = {};
      for (const tabela of TABELAS_BACKUP) {
        const existe = await pool.query(`SELECT to_regclass($1) AS t`, [`public.${tabela}`]);
        if (!existe.rows[0]?.t) continue;
        const colunas = await pool.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
          [tabela]
        );
        const permitidas = colunas.rows.map((c: any) => c.column_name as string).filter(colunaPermitida);
        if (permitidas.length === 0) continue;
        const lista = permitidas.map((c) => `"${c}"`).join(', ');
        const r = await pool.query(`SELECT ${lista} FROM "${tabela}"`);
        tabelas[tabela] = r.rows;
        contagem[tabela] = r.rows.length;
      }

      await deps.logAudit('Exportou backup do banco', `Tabelas: ${Object.keys(tabelas).length}`, req).catch(() => {});

      const nome = `nyroh-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(
        JSON.stringify(
          { gerado_em: new Date().toISOString(), contagem, tabelas },
          null,
          2
        )
      );
    } catch {
      res.status(500).json({ error: 'Erro ao gerar o backup.' });
    }
  });
}
