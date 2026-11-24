/**
 * Backup COMPLETO do sistema para o administrador (download único em .zip).
 *
 * O .zip contém:
 *  - dados.json   : todas as tabelas do CRM, numa única transação (mesmo momento para todas);
 *  - midia/       : todos os arquivos de mídia (fotos, áudios, documentos), inclusive a entrada (inbox/);
 *  - LEIA-ME.txt  : manifesto com contagens, o que ficou de fora e por quê, e tabelas esperadas que não existem no banco.
 *
 * Regras de segurança:
 *  - Só admin. Cada download fica registrado na auditoria.
 *  - Colunas de senha, hash, token, segredo e chave nunca saem.
 *  - Valores de segredo em system_settings saem como OMITIDO (ex.: chave da FluxoAPI, token da Meta).
 *  - Sessões de login (auth_sessions) ficam de fora.
 *  - Só lê arquivos dentro da pasta de uploads; links simbólicos são ignorados.
 *
 * Não restaura nada: é só download. Restaurar é uma etapa separada e com confirmação.
 * O arquivo contém dados pessoais de clientes e segredos redigidos: não compartilhar.
 */
import type { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import type pg from 'pg';
import { getUploadsDir } from './mediaStorage';

interface BackupDeps {
  getPool: () => pg.Pool | null;
  currentUser: (req: Request) => any;
  isAdmin: (user: any) => boolean;
  logAudit: (action: string, details?: string, req?: Request) => Promise<void>;
}

/** Tabelas exportadas. */
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
  'remessas',
  'lead_tags',
  'lead_selections',
  'lead_block_requests',
  'leads_estado',
  'phone_numbers',
  'brands',
  'brand_numbers',
  'contato_marcas',
  'regras_contato',
  'automacoes_fila',
  'automacoes_config',
  'automacoes_auditoria',
  'system_settings',
] as const;

/**
 * Tabelas que ficam de fora DE PROPÓSITO, com o motivo.
 * Toda tabela criada no código precisa estar em TABELAS_BACKUP ou aqui.
 * O teste scripts/test-backup-cobertura.ts garante isso.
 */
export const TABELAS_EXCLUIDAS: Record<string, string> = {
  auth_sessions: 'tokens de sessão de login: restaurar não deve reabrir sessões antigas',
};

/** Colunas que nunca saem no backup, mesmo que a tabela as tenha. */
const COLUNA_PROIBIDA = /(password|hash|salt|token|secret|api_?key|private)/i;

export const colunaPermitida = (nome: string): boolean => !COLUNA_PROIBIDA.test(nome);

/** Chaves de system_settings cujo VALOR é segredo e não pode sair em texto puro. */
const CHAVE_SECRETA = /(key|secret|token|password|senha|verify)/i;
export const MARCA_OMITIDO = '[OMITIDO: segredo. Recadastrar nas variáveis do serviço]';

export const chaveEhSegredo = (chave: string): boolean => CHAVE_SECRETA.test(chave);

/** Redige o valor das chaves secretas. Outras linhas saem como estão. */
export function redigirSystemSettings(linhas: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return linhas.map((l) => {
    const chave = String(l.key ?? '');
    return chaveEhSegredo(chave) ? { ...l, value: MARCA_OMITIDO } : l;
  });
}

export interface ColetaBanco {
  tabelas: Record<string, unknown[]>;
  contagem: Record<string, number>;
  /** Tabelas esperadas pelo backup que não existem no banco. */
  ausentes: string[];
  /** Chaves de system_settings que tiveram o valor omitido. */
  segredosOmitidos: string[];
}

/** Lê todas as tabelas dentro de UMA transação só de leitura (mesmo instante para todas). */
export async function coletarBanco(pool: pg.Pool): Promise<ColetaBanco> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tabelas: Record<string, unknown[]> = {};
    const contagem: Record<string, number> = {};
    const ausentes: string[] = [];
    const segredosOmitidos: string[] = [];

    for (const tabela of TABELAS_BACKUP) {
      const existe = await client.query(`SELECT to_regclass($1) AS t`, [`public.${tabela}`]);
      if (!existe.rows[0]?.t) {
        ausentes.push(tabela);
        continue;
      }
      const colunas = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [tabela]
      );
      const permitidas = colunas.rows.map((c: any) => c.column_name as string).filter(colunaPermitida);
      if (permitidas.length === 0) continue;
      const lista = permitidas.map((c) => `"${c}"`).join(', ');
      const r = await client.query(`SELECT ${lista} FROM "${tabela}"`);

      let linhas = r.rows as Array<Record<string, unknown>>;
      if (tabela === 'system_settings') {
        linhas = redigirSystemSettings(linhas);
        for (const l of r.rows as Array<Record<string, unknown>>) {
          if (chaveEhSegredo(String(l.key ?? ''))) segredosOmitidos.push(String(l.key));
        }
      }
      tabelas[tabela] = linhas;
      contagem[tabela] = linhas.length;
    }

    await client.query('COMMIT');
    return { tabelas, contagem, ausentes, segredosOmitidos };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export interface ArquivoMidia {
  /** Caminho relativo à pasta de uploads, sempre com "/". */
  rel: string;
  abs: string;
  bytes: number;
}

/** Lista todos os arquivos da pasta de mídia. Ignora links simbólicos e qualquer caminho fora da raiz. */
export function listarMidias(raiz: string): ArquivoMidia[] {
  const saida: ArquivoMidia[] = [];
  if (!fs.existsSync(raiz)) return saida;
  const base = path.resolve(raiz);
  const percorrer = (dir: string) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entrada.name);
      if (entrada.isSymbolicLink()) continue;
      if (entrada.isDirectory()) {
        percorrer(abs);
        continue;
      }
      if (!entrada.isFile()) continue;
      const rel = path.relative(base, abs);
      if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
      saida.push({ rel: rel.split(path.sep).join('/'), abs, bytes: fs.statSync(abs).size });
    }
  };
  percorrer(base);
  return saida.sort((a, b) => a.rel.localeCompare(b.rel));
}

const formatarBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

/** Texto do LEIA-ME.txt: o que entrou, o que ficou de fora e por quê. */
export function montarManifesto(args: {
  geradoEm: string;
  coleta: ColetaBanco;
  midias: ArquivoMidia[];
}): string {
  const { geradoEm, coleta, midias } = args;
  const bytesMidia = midias.reduce((s, m) => s + m.bytes, 0);
  const linhas: string[] = [];
  linhas.push('BACKUP COMPLETO DO NYROH CRM');
  linhas.push(`Gerado em: ${geradoEm}`);
  linhas.push('');
  linhas.push('CONTEÚDO');
  linhas.push(`- dados.json: ${Object.keys(coleta.tabelas).length} tabelas, lidas num mesmo instante.`);
  linhas.push(`- midia/: ${midias.length} arquivo(s), ${formatarBytes(bytesMidia)}.`);
  if (midias.length === 0) {
    linhas.push('  ATENÇÃO: nenhuma mídia encontrada. Se fotos ou áudios existiam, verifique o volume da Railway.');
  }
  linhas.push('');
  linhas.push('CONTAGEM POR TABELA');
  for (const t of Object.keys(coleta.contagem).sort()) linhas.push(`- ${t}: ${coleta.contagem[t]}`);
  linhas.push('');
  linhas.push('FORA DO BACKUP DE PROPÓSITO');
  for (const [t, motivo] of Object.entries(TABELAS_EXCLUIDAS)) linhas.push(`- ${t}: ${motivo}`);
  linhas.push('- Colunas de senha, hash, token, segredo e chave, em qualquer tabela.');
  linhas.push('');
  linhas.push('SEGREDOS OMITIDOS (valor trocado por OMITIDO em system_settings)');
  if (coleta.segredosOmitidos.length === 0) linhas.push('- nenhum');
  for (const k of coleta.segredosOmitidos) linhas.push(`- ${k}`);
  linhas.push('');
  linhas.push('ESPERADAS MAS AUSENTES NO BANCO (não criadas em produção)');
  if (coleta.ausentes.length === 0) linhas.push('- nenhuma');
  for (const t of coleta.ausentes) linhas.push(`- ${t}`);
  linhas.push('');
  linhas.push('AVISO');
  linhas.push('Este arquivo contém dados pessoais de clientes. Guarde com cuidado e não compartilhe.');
  linhas.push('Este pacote é só para guardar. Ele NÃO restaura nada: restaurar é uma etapa separada.');
  return linhas.join('\n') + '\n';
}

/** Monta o .zip (dados, mídia e manifesto). Os arquivos de mídia entram como stream, sem carregar tudo na memória. */
export function montarZip(args: {
  geradoEm: string;
  coleta: ColetaBanco;
  midias: ArquivoMidia[];
}): JSZip {
  const zip = new JSZip();
  zip.file(
    'dados.json',
    JSON.stringify({ gerado_em: args.geradoEm, contagem: args.coleta.contagem, tabelas: args.coleta.tabelas }, null, 2)
  );
  for (const m of args.midias) {
    zip.file(`midia/${m.rel}`, fs.createReadStream(m.abs));
  }
  zip.file('LEIA-ME.txt', montarManifesto(args));
  return zip;
}

export function registerBackupRoutes(app: Express, deps: BackupDeps): void {
  app.get('/api/admin/backup/exportar', async (req: Request, res: Response) => {
    if (!deps.isAdmin(deps.currentUser(req))) {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    }
    const pool = deps.getPool();
    if (!pool) return res.status(503).json({ error: 'Banco de dados indisponível neste ambiente.' });

    try {
      const geradoEm = new Date().toISOString();
      const coleta = await coletarBanco(pool);
      const midias = listarMidias(getUploadsDir());
      const zip = montarZip({ geradoEm, coleta, midias });

      await deps.logAudit(
        'Exportou backup completo',
        `Tabelas: ${Object.keys(coleta.tabelas).length}; mídias: ${midias.length}`,
        req
      ).catch(() => {});

      const nome = `nyroh-backup-${geradoEm.replace(/[:.]/g, '-')}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
      res.setHeader('Cache-Control', 'no-store');
      const stream = zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE' });
      stream.on('error', () => {
        if (!res.headersSent) res.status(500).json({ error: 'Erro ao gerar o backup.' });
        else res.destroy();
      });
      stream.pipe(res);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'Erro ao gerar o backup.' });
    }
  });
}
