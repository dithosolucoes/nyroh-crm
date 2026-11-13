/**
 * Garante que o backup cobre o banco inteiro.
 *
 * Lê todas as tabelas criadas no código (server.ts, src/lib e migrations)
 * e exige que cada uma esteja em TABELAS_BACKUP ou em TABELAS_EXCLUIDAS (com motivo).
 * Assim, uma tabela nova não fica de fora do backup sem decisão explícita.
 *
 * Rodar: npm run test:backup
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TABELAS_BACKUP, TABELAS_EXCLUIDAS, colunaPermitida } from '../src/lib/backupRoutes';

const raiz = process.cwd();

function lerArquivos(): string[] {
  const alvos: string[] = [path.join(raiz, 'server.ts')];
  for (const pasta of ['src/lib', 'migrations']) {
    const dir = path.join(raiz, pasta);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (/\.(ts|sql)$/.test(f)) alvos.push(path.join(dir, f));
    }
  }
  return alvos.filter((f) => fs.existsSync(f));
}

/** Nomes de tabelas criadas no código: exige "CREATE TABLE [IF NOT EXISTS] nome (" */
function tabelasNoCodigo(): Set<string> {
  const achadas = new Set<string>();
  const re = /CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*)\s*\(/gi;
  for (const arquivo of lerArquivos()) {
    const texto = fs.readFileSync(arquivo, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto))) achadas.add(m[1].toLowerCase());
  }
  return achadas;
}

let falhas = 0;
function test(nome: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`  FALHA ${nome}\n       ${(e as Error).message}`);
  }
}

console.log('\nCobertura do backup');

test('toda tabela criada no código está no backup ou excluída com motivo', () => {
  const noBackup = new Set<string>(TABELAS_BACKUP as readonly string[]);
  const excluidas = new Set<string>(Object.keys(TABELAS_EXCLUIDAS));
  const faltando = [...tabelasNoCodigo()].filter((t) => !noBackup.has(t) && !excluidas.has(t));
  assert.deepEqual(
    faltando,
    [],
    `tabelas fora do backup sem decisão: ${faltando.join(', ')}. Adicione em TABELAS_BACKUP ou em TABELAS_EXCLUIDAS (com motivo).`
  );
});

test('nenhuma tabela aparece nas duas listas ao mesmo tempo', () => {
  const excluidas = Object.keys(TABELAS_EXCLUIDAS);
  const sobra = excluidas.filter((t) => (TABELAS_BACKUP as readonly string[]).includes(t));
  assert.deepEqual(sobra, []);
});

test('toda exclusão tem motivo escrito', () => {
  for (const [tabela, motivo] of Object.entries(TABELAS_EXCLUIDAS)) {
    assert.ok(motivo.trim().length > 10, `exclusão sem motivo claro: ${tabela}`);
  }
});

console.log('\nColunas sensíveis nunca saem no backup');

test('bloqueia colunas de senha, hash, token, segredo e chave', () => {
  for (const nome of ['password_hash', 'senha_password', 'access_token', 'client_secret', 'api_key', 'apikey', 'private_key', 'salt']) {
    assert.equal(colunaPermitida(nome), false, `deveria bloquear: ${nome}`);
  }
});

test('permite colunas comuns de negócio', () => {
  for (const nome of ['nome', 'telefone', 'status_geral', 'criado_em', 'lead_id', 'valor']) {
    assert.equal(colunaPermitida(nome), true, `deveria permitir: ${nome}`);
  }
});

console.log('');
if (falhas > 0) {
  console.log(`${falhas} teste(s) falharam.`);
  process.exit(1);
}
console.log('Todos os testes de backup passaram.');
