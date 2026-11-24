/**
 * Verificação de arquitetura do refactor (somente leitura do código; não toca banco, fila ou produção).
 *
 * O que checa:
 *  - Regras de fronteira (sem baseline): front não importa server; shared não importa front nem server;
 *    o fecho de imports do front só usa shared/ puro e pacotes de interface; shared/ só tem o que o front usa.
 *  - Contagens que só podem cair (cliquet, em scripts/verificacao-baseline.json):
 *      `any` e `unknown` em shared/contracts, `as any` no front, linhas de server.ts.
 *  - tsc da raiz e do front (com --rapido pula).
 *  - Testes unitários (com --com-testes).
 *
 * Uso:
 *   node scripts/verificar-arquitetura.mjs                 # regras + cliquet + tsc
 *   node scripts/verificar-arquitetura.mjs --rapido        # só regras e cliquet
 *   node scripts/verificar-arquitetura.mjs --com-testes    # inclui npm test
 *   node scripts/verificar-arquitetura.mjs --atualizar-baseline  # só depois de melhorar de propósito
 * Sai com código 1 se alguma regra ou contagem piorou.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { execSync } from 'node:child_process';

const RAIZ = process.cwd();
const BASELINE = join(RAIZ, 'scripts', 'verificacao-baseline.json');
const args = new Set(process.argv.slice(2));

const falhas = [];
const avisos = [];
const oks = [];

function arquivos(dir, exts = ['.ts', '.tsx']) {
  const saida = [];
  if (!existsSync(dir)) return saida;
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome === 'dist' || nome.startsWith('.')) continue;
    const cam = join(dir, nome);
    if (statSync(cam).isDirectory()) saida.push(...arquivos(cam, exts));
    else if (exts.some((e) => nome.endsWith(e)) && !nome.endsWith('.d.ts')) saida.push(cam);
  }
  return saida;
}

const rel = (p) => relative(RAIZ, p).split(sep).join('/');

// ---------- 1. Fronteiras (sem baseline: violação é falha direta) ----------
const importacoes = (texto) => [...texto.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] || m[2] || m[3]);

const FRONT = arquivos(join(RAIZ, 'apps', 'web', 'src'));
const SHARED = arquivos(join(RAIZ, 'shared'));

const violFront = [];
for (const f of FRONT) {
  for (const imp of importacoes(readFileSync(f, 'utf8'))) {
    if (/(^|\/)server(\.ts|\.js|\.cjs)?$/.test(imp) || /(^|\/)server\//.test(imp)) violFront.push(`${rel(f)} -> ${imp}`);
  }
}
(violFront.length ? falhas : oks).push(
  violFront.length ? `front importa o servidor em ${violFront.length} lugar(es):\n      ${violFront.join('\n      ')}` : 'front não importa o servidor',
);

const violShared = [];
for (const f of SHARED) {
  for (const imp of importacoes(readFileSync(f, 'utf8'))) {
    if (/(^|\/)(frontend|apps\/web)\//.test(imp) || /(^|\/)server(\.ts|\.js)?$/.test(imp)) violShared.push(`${rel(f)} -> ${imp}`);
  }
}
(violShared.length ? falhas : oks).push(
  violShared.length ? `shared importa front ou servidor em ${violShared.length} lugar(es):\n      ${violShared.join('\n      ')}` : 'shared não importa front nem servidor',
);


// ---------- 1b. Fecho do front: o que o front importa, direta ou indiretamente ----------
// Regra nova (24/11/2026): o front só pode depender de shared/ puro e de pacotes de interface.
// Qualquer código de servidor dentro de shared/ quebra esta verificação.
const PACOTES_DO_FRONT = new Set(['react', 'react-dom', 'jspdf', 'jszip', 'lucide-react', 'qrcode', 'tailwindcss']);
const SHARED_DIR = join(RAIZ, 'shared');
const FRONT_DIR = join(RAIZ, 'apps', 'web', 'src');
const EXTS_RESOLUCAO = ['.ts', '.tsx', '.d.ts', '/index.ts', '/index.tsx'];
function resolverImport(de, imp) {
  let base;
  if (imp.startsWith('@shared/')) base = join(SHARED_DIR, imp.slice(8));
  else if (imp.startsWith('.')) base = join(dirname(de), imp);
  else return null;
  base = base.replace(/\.(js|jsx)$/, '');
  for (const c of [base, ...EXTS_RESOLUCAO.map((e) => base + e)]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}
const fecho = new Set();
const pilha = [...arquivos(FRONT_DIR)];
const violFecho = [];
while (pilha.length) {
  const f = pilha.pop();
  if (fecho.has(f)) continue;
  fecho.add(f);
  if (!f.startsWith(FRONT_DIR + sep) && !f.startsWith(SHARED_DIR + sep)) {
    violFecho.push(`${rel(f)} está fora de apps/web/src e shared/`);
    continue;
  }
  for (const imp of importacoes(readFileSync(f, 'utf8'))) {
    if (imp.startsWith('.') || imp.startsWith('@shared/')) {
      const alvo = resolverImport(f, imp);
      if (alvo) pilha.push(alvo);
      else violFecho.push(`${rel(f)} -> ${imp} (não resolve)`);
      continue;
    }
    const pacote = imp.startsWith('@') ? imp.split('/').slice(0, 2).join('/') : imp.split('/')[0];
    if (!PACOTES_DO_FRONT.has(pacote)) violFecho.push(`${rel(f)} -> pacote ${imp} (fora dos pacotes de interface)`);
  }
}
(violFecho.length ? falhas : oks).push(
  violFecho.length ? `fecho do front tem ${violFecho.length} problema(s):\n      ${violFecho.join('\n      ')}` : 'fecho do front só usa shared/ puro e pacotes de interface',
);
const sharedSobrando = arquivos(SHARED_DIR).filter((f) => !fecho.has(f)).map(rel);
(sharedSobrando.length ? falhas : oks).push(
  sharedSobrando.length
    ? `shared/ tem ${sharedSobrando.length} arquivo(s) que o front não usa (código de servidor; mover para apps/api/lib):\n      ${sharedSobrando.join('\n      ')}`
    : 'shared/ só guarda código que o front usa',
);

// ---------- 2. Contagens com cliquet ----------
const contar = (arqs, re) => arqs.reduce((n, f) => n + (readFileSync(f, 'utf8').match(re) || []).length, 0);
const contratos = arquivos(join(RAIZ, 'shared', 'contracts'));
const medidas = {
  any_em_contratos: contar(contratos, /\bany\b/g),
  unknown_em_contratos: contar(contratos, /\bunknown\b/g),
  as_any_no_front: contar(FRONT, /\bas any\b/g),
  linhas_server_ts: readFileSync(join(RAIZ, 'apps', 'api', 'server.ts'), 'utf8').split('\n').length,
};

const descricaoMedida = {
  any_em_contratos: 'any em shared/contracts (objetivo: 0)',
  unknown_em_contratos: 'unknown em shared/contracts (diminuir até só sobrar o que é de propósito)',
  as_any_no_front: 'as any em apps/web/src (diminuir)',
  linhas_server_ts: 'linhas de server.ts (diminuir a cada módulo extraído)',
};

if (args.has('--atualizar-baseline')) {
  writeFileSync(BASELINE, JSON.stringify(medidas, null, 2) + '\n');
  console.log(`Baseline gravada em ${rel(BASELINE)}:`, medidas);
  process.exit(0);
}

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
if (!base) {
  falhas.push('não existe scripts/verificacao-baseline.json (rode com --atualizar-baseline uma vez)');
} else {
  for (const k of Object.keys(medidas)) {
    const atual = medidas[k];
    const antes = base[k];
    if (atual > antes) falhas.push(`${descricaoMedida[k]}: subiu de ${antes} para ${atual}`);
    else if (atual < antes) avisos.push(`${descricaoMedida[k]}: caiu de ${antes} para ${atual} (rode --atualizar-baseline para travar o ganho)`);
    else oks.push(`${descricaoMedida[k]}: ${atual} (igual à baseline)`);
  }
}

// ---------- 3. tsc e testes ----------
function rodar(titulo, cmd) {
  try {
    execSync(cmd, { cwd: RAIZ, stdio: 'pipe', timeout: 170000 });
    oks.push(`${titulo} passou`);
  } catch (e) {
    const saida = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim().split('\n').slice(-8).join('\n      ');
    falhas.push(`${titulo} falhou:\n      ${saida}`);
  }
}
if (!args.has('--rapido')) {
  rodar('tsc (raiz)', 'npx tsc --noEmit');
  rodar('tsc (front)', 'npx tsc --noEmit -p apps/web');
}
if (args.has('--com-testes')) rodar('testes unitários', 'npm test');

// ---------- Resultado ----------
for (const m of oks) console.log(`  OK     ${m}`);
for (const m of avisos) console.log(`  --     ${m}`);
for (const m of falhas) console.log(`  FALHA  ${m}`);
console.log(`\n${falhas.length === 0 ? 'PASSOU' : 'FALHOU'}: ${oks.length} ok, ${avisos.length} aviso(s), ${falhas.length} falha(s)`);
process.exit(falhas.length === 0 ? 0 : 1);
