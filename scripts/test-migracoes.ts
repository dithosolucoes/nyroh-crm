/**
 * Teste do runner de migrações (item 2.1). Precisa de banco de teste (nunca o de produção).
 *   E2E_DATABASE_URL=postgres://... npx tsx scripts/test-migracoes.ts
 * Cria o banco de teste "nyroh_migracoes_teste" (recria do zero a cada rodada).
 */
import pg from 'pg';
import { aplicarMigracoes, validarMigracoes, type Migracao } from '../apps/api/lib/migracoes.js';

const base = process.env.E2E_DATABASE_URL;
if (!base) {
  console.error('Defina E2E_DATABASE_URL (banco de teste).');
  process.exit(1);
}

const NOME_BANCO = 'nyroh_migracoes_teste';
const urlBanco = (db: string) => {
  const u = new URL(base);
  u.pathname = `/${db}`;
  return u.toString();
};

let falhas = 0;
const ok = (msg: string) => console.log(`  OK     ${msg}`);
const falha = (msg: string) => {
  falhas += 1;
  console.log(`  FALHA  ${msg}`);
};
const checar = (cond: boolean, msg: string) => (cond ? ok(msg) : falha(msg));

const MIGRACOES: Migracao[] = [
  { versao: '0001_base', descricao: 'tabela de teste', sql: 'CREATE TABLE teste_base (id INT PRIMARY KEY)' },
  { versao: '0002_coluna', descricao: 'coluna nova', sql: 'ALTER TABLE teste_base ADD COLUMN nome TEXT' },
];

async function main() {
  const admin = new pg.Client({ connectionString: urlBanco('postgres') });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${NOME_BANCO}`);
  await admin.query(`CREATE DATABASE ${NOME_BANCO}`);
  await admin.end();

  const cliente = new pg.Client({ connectionString: urlBanco(NOME_BANCO) });
  await cliente.connect();
  const novaConexao = async () => cliente;

  console.log('\n== Validação de ordem e versões ==');
  let erroValidacao = '';
  try { validarMigracoes([MIGRACOES[1], MIGRACOES[0]]); } catch (e) { erroValidacao = (e as Error).message; }
  checar(erroValidacao.includes('fora de ordem'), 'recusa migrações fora de ordem');
  erroValidacao = '';
  try { validarMigracoes([MIGRACOES[0], { ...MIGRACOES[1], versao: '0001_base' }]); } catch (e) { erroValidacao = (e as Error).message; }
  checar(erroValidacao.includes('duplicada'), 'recusa versão duplicada');
  erroValidacao = '';
  try { validarMigracoes([{ ...MIGRACOES[0], versao: 'base' }]); } catch (e) { erroValidacao = (e as Error).message; }
  checar(erroValidacao.includes('inválida'), 'recusa versão fora do formato 0001_nome');

  console.log('\n== Banco vazio: aplica tudo ==');
  const primeira = await aplicarMigracoes(cliente, MIGRACOES, novaConexao);
  checar(primeira.aplicadas.join() === '0001_base,0002_coluna', 'aplica as duas migrações na ordem');
  checar(primeira.jaAplicadas.length === 0, 'nenhuma estava registrada antes');
  const colunas = await cliente.query("SELECT column_name FROM information_schema.columns WHERE table_name='teste_base'");
  checar(colunas.rows.some((r) => r.column_name === 'nome'), 'a coluna da migração 0002 existe');

  console.log('\n== Segunda execução: nada é reaplicado ==');
  const segunda = await aplicarMigracoes(cliente, MIGRACOES, novaConexao);
  checar(segunda.aplicadas.length === 0, 'nenhuma migração é aplicada de novo');
  checar(segunda.jaAplicadas.length === 2, 'as duas aparecem como já aplicadas');

  console.log('\n== Migração nova entra depois das antigas ==');
  const comNova = [...MIGRACOES, { versao: '0003_indice', descricao: 'índice', sql: 'CREATE INDEX teste_nome_idx ON teste_base (nome)' }];
  const terceira = await aplicarMigracoes(cliente, comNova, novaConexao);
  checar(terceira.aplicadas.join() === '0003_indice', 'só a migração nova é aplicada');

  console.log('\n== Migração que falha é desfeita e não é registrada ==');
  const comFalha = [...comNova, { versao: '0004_quebrada', descricao: 'quebra', sql: 'ALTER TABLE teste_base ADD COLUMN x TEXT; SELECT * FROM tabela_que_nao_existe' }];
  let erroFalha = '';
  try { await aplicarMigracoes(cliente, comFalha, novaConexao); } catch (e) { erroFalha = (e as Error).message; }
  checar(erroFalha.includes('0004_quebrada') && erroFalha.includes('desfeita'), 'o erro diz qual migração falhou e que foi desfeita');
  const colunaX = await cliente.query("SELECT 1 FROM information_schema.columns WHERE table_name='teste_base' AND column_name='x'");
  checar(colunaX.rowCount === 0, 'o ALTER da migração quebrada foi desfeito (coluna x não existe)');
  const registro = await cliente.query("SELECT 1 FROM schema_migrations WHERE versao='0004_quebrada'");
  checar(registro.rowCount === 0, 'a migração quebrada não foi registrada');

  await cliente.end();
  console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Erro no teste de migrações:', e);
  process.exit(1);
});
