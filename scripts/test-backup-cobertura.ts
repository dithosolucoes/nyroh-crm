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
import os from 'node:os';
import JSZip from 'jszip';
import {
  TABELAS_BACKUP,
  TABELAS_EXCLUIDAS,
  colunaPermitida,
  redigirSystemSettings,
  MARCA_OMITIDO,
  listarMidias,
  montarZip,
  montarManifesto,
  type ColetaBanco,
} from '../shared/lib/backupRoutes';

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

console.log('\nSegredos em system_settings');

test('valores de chaves secretas saem como OMITIDO', () => {
  const linhas = redigirSystemSettings([
    { key: 'fluxo_api_key', value: 'abc' },
    { key: 'fluxo_api_secret', value: 'xyz' },
    { key: 'meta_access_token', value: 'tok' },
    { key: 'meta_verify_token', value: 'ver' },
  ]);
  for (const l of linhas) assert.equal(l.value, MARCA_OMITIDO, `vazou o valor de ${l.key}`);
});

test('identificadores que não são segredo continuam aparecendo', () => {
  const linhas = redigirSystemSettings([
    { key: 'fluxo_instance_id', value: 'inst_123' },
    { key: 'meta_phone_number_id', value: '999' },
    { key: 'meta_waba_id', value: '777' },
  ]);
  assert.equal(linhas[0].value, 'inst_123');
  assert.equal(linhas[1].value, '999');
  assert.equal(linhas[2].value, '777');
});

console.log('\nMídias e pacote .zip');

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'nyroh-backup-teste-'));
fs.mkdirSync(path.join(pastaTemp, 'inbox'), { recursive: true });
fs.writeFileSync(path.join(pastaTemp, 'foto.jpg'), 'foto');
fs.writeFileSync(path.join(pastaTemp, 'inbox', 'audio.ogg'), 'som-de-teste');

test('lista arquivos de mídia com caminho relativo e tamanho', () => {
  const midias = listarMidias(pastaTemp);
  assert.deepEqual(midias.map((m) => m.rel), ['foto.jpg', 'inbox/audio.ogg']);
  assert.equal(midias[1].bytes, 'som-de-teste'.length);
});

test('pasta de mídia inexistente não quebra (lista vazia)', () => {
  assert.deepEqual(listarMidias(path.join(pastaTemp, 'nao-existe')), []);
});

const coletaFake: ColetaBanco = {
  tabelas: { leads: [{ id: 'L1', name: 'Ana' }] },
  contagem: { leads: 1 },
  ausentes: ['remessas'],
  segredosOmitidos: ['fluxo_api_key'],
};

async function testeAsync(nome: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`  FALHA ${nome}\n       ${(e as Error).message}`);
  }
}

await testeAsync('o .zip tem dados.json, LEIA-ME.txt e a mídia em midia/', async () => {
  const zip = montarZip({ geradoEm: '2026-11-13T00:00:00.000Z', coleta: coletaFake, midias: listarMidias(pastaTemp) });
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const lido = await JSZip.loadAsync(buffer);
  // JSZip cria entradas de pasta (ex.: "midia/"). Só os arquivos importam.
  const nomes = Object.values(lido.files).filter((f) => !f.dir).map((f) => f.name).sort();
  assert.deepEqual(nomes, ['LEIA-ME.txt', 'dados.json', 'midia/foto.jpg', 'midia/inbox/audio.ogg']);
  const dados = JSON.parse(await lido.file('dados.json')!.async('string'));
  assert.equal(dados.tabelas.leads[0].name, 'Ana');
  assert.equal(dados.contagem.leads, 1);
  assert.equal(await lido.file('midia/foto.jpg')!.async('string'), 'foto');
});

await testeAsync('o LEIA-ME diz o que ficou de fora e que não restaura', () => {
  const texto = montarManifesto({ geradoEm: 'agora', coleta: coletaFake, midias: [] });
  assert.ok(texto.includes('remessas'), 'deveria listar a tabela ausente');
  assert.ok(texto.includes('fluxo_api_key'), 'deveria listar o segredo omitido');
  assert.ok(texto.includes('NÃO restaura'), 'deveria avisar que não restaura');
  assert.ok(texto.includes('nenhuma mídia encontrada'), 'deveria alertar quando não há mídia');
});

fs.rmSync(pastaTemp, { recursive: true, force: true });

console.log('');
if (falhas > 0) {
  console.log(`${falhas} teste(s) falharam.`);
  process.exit(1);
}
console.log('Todos os testes de backup passaram.');
