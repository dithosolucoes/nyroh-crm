/**
 * Teste do item 2.2a: o esquema criado pelo runner (ESQUEMA_BASE + dados do boot) tem que ser
 * IGUAL ao do SQL original (scripts/fixtures/esquema-original.sql, o bloco que ficava no boot).
 * Compara colunas, índices, constraints e a linha do vendedor padrão. Banco de teste apenas.
 *   E2E_DATABASE_URL=postgres://... npx tsx scripts/test-esquema-base.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { aplicarMigracoes } from '../shared/lib/migracoes.js';
import { ESQUEMA_BASE } from '../shared/lib/esquemaBase.js';
import { VIEWS_COMPATIBILIDADE } from '../shared/lib/esquemaViews.js';
import { NOTAS_E_RESOLVIDA } from '../shared/lib/esquemaNotas.js';

const base = process.env.E2E_DATABASE_URL;
if (!base) {
  console.error('Defina E2E_DATABASE_URL (banco de teste).');
  process.exit(1);
}
const RAIZ = process.cwd();
const urlBanco = (db: string) => {
  const u = new URL(base);
  u.pathname = `/${db}`;
  return u.toString();
};

async function recriar(admin: pg.Client, nome: string): Promise<pg.Client> {
  await admin.query(`DROP DATABASE IF EXISTS ${nome}`);
  await admin.query(`CREATE DATABASE ${nome}`);
  const c = new pg.Client({ connectionString: urlBanco(nome) });
  await c.connect();
  return c;
}

async function assinatura(c: pg.Client): Promise<Record<string, string>> {
  const colunas = await c.query(`SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema='public' AND table_name <> 'schema_migrations' ORDER BY 1,2`);
  const indices = await c.query(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public'
    AND tablename <> 'schema_migrations' ORDER BY 1`);
  const restricoes = await c.query(`SELECT tc.table_name, tc.constraint_name, tc.constraint_type
    FROM information_schema.table_constraints tc WHERE tc.table_schema='public' AND tc.table_name <> 'schema_migrations'
    ORDER BY 1,2`);
  const tabelas = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'
    AND table_name <> 'schema_migrations' ORDER BY 1`);
  const views = await c.query(`SELECT table_name, view_definition FROM information_schema.views
    WHERE table_schema='public' ORDER BY 1`);
  const vendedor = await c.query(`SELECT id, name, active, slug, is_default, whatsapp_type
    FROM salespeople WHERE id='seller-thomas'`);
  return {
    tabelas: JSON.stringify(tabelas.rows),
    colunas: JSON.stringify(colunas.rows),
    indices: JSON.stringify(indices.rows),
    restricoes: JSON.stringify(restricoes.rows),
    views: JSON.stringify(views.rows),
    vendedor_padrao: JSON.stringify(vendedor.rows),
  };
}

async function main() {
  const original = readFileSync(join(RAIZ, 'scripts/fixtures/esquema-original.sql'), 'utf8');
  const dados = readFileSync(join(RAIZ, 'scripts/fixtures/esquema-dml.sql'), 'utf8');
  const views = readFileSync(join(RAIZ, 'scripts/fixtures/views-original.sql'), 'utf8');
  const notas = readFileSync(join(RAIZ, 'scripts/fixtures/notas-original.sql'), 'utf8');
  const admin = new pg.Client({ connectionString: urlBanco('postgres') });
  await admin.connect();

  const a = await recriar(admin, 'nyroh_esquema_original');
  await a.query(original);
  await a.query(views);
  await a.query(notas);
  const assA = await assinatura(a);
  await a.end();

  const b = await recriar(admin, 'nyroh_esquema_runner');
  await aplicarMigracoes(b, [ESQUEMA_BASE], async () => b);
  await b.query(dados);
  await aplicarMigracoes(b, [VIEWS_COMPATIBILIDADE], async () => b);
  await aplicarMigracoes(b, [NOTAS_E_RESOLVIDA], async () => b);
  const assB = await assinatura(b);
  // segunda subida: o runner não pode reaplicar nem falhar
  const again = await aplicarMigracoes(b, [ESQUEMA_BASE], async () => b);
  await b.end();
  await admin.end();

  let falhas = 0;
  for (const k of Object.keys(assA)) {
    if (assA[k] === assB[k]) console.log(`  OK     ${k} igual ao original`);
    else {
      falhas += 1;
      console.log(`  FALHA  ${k} diferente do original`);
      console.log(`    original: ${assA[k].slice(0, 400)}`);
      console.log(`    runner:   ${assB[k].slice(0, 400)}`);
    }
  }
  if (again.aplicadas.length === 0) console.log('  OK     segunda subida não reaplica a migração');
  else { falhas += 1; console.log('  FALHA  segunda subida reaplicou a migração'); }

  console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Erro no teste de esquema base:', e);
  process.exit(1);
});
