/**
 * QA de SEGURANÇA DE BOOT contra um PostgreSQL de verdade (precisa de E2E_ADMIN_DATABASE_URL, ex.:
 *   postgres://postgres:pw@127.0.0.1:54329/postgres ).
 *
 * Prova o que o código ANTIGO fazia de errado e o novo corrige:
 *   - a cada boot a senha de admin@nyroh.com voltava para "Thomas123456!" (trocar a senha não adiantava);
 *   - admin@demo.com / admin123 ("Administrador Fake") ficava ativo em produção;
 *   - qualquer usuário com "thomas"/"admin" no nome virava administrador.
 */
import pg from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNyrohServer } from './_proc';

const ADMIN_URL = process.env.E2E_ADMIN_DATABASE_URL;
if (!ADMIN_URL) {
  console.log('⏭️  E2E_ADMIN_DATABASE_URL não definida — teste de boot ignorado (precisa de um PostgreSQL).');
  process.exit(0);
}

const PORT = 3071;
const UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'nyroh-boot-'));
const BASE = `http://127.0.0.1:${PORT}`;
let passed = 0;
let failed = 0;
const ok = (c: any, n: string, d?: any) => {
  if (c) { passed++; console.log(`  ✅ ${n}`); }
  else { failed++; console.error(`  ❌ ${n}${d !== undefined ? `\n       → ${JSON.stringify(d).slice(0, 300)}` : ''}`); }
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const setCookie = (res.headers as any).getSetCookie?.() as string[] | undefined;
  const cookie = (setCookie || []).map(x => x.split(';')[0]).find(x => x.startsWith('crm_session=')) || '';
  return { status: res.status, cookie };
}

async function boot(dbName: string, extra: NodeJS.ProcessEnv = {}) {
  const url = ADMIN_URL!.replace(/\/[^/]*$/, `/${dbName}`);
  const srv = startNyrohServer({
    NODE_ENV: 'production', NYROH_PORT: String(PORT), DATABASE_URL: url, REDIS_URL: '',
    UPLOADS_DIR: UPLOADS, ...extra
  } as any);
  const up = await (async () => {
    for (let i = 0; i < 200; i++) {
      const h = await fetch(`${BASE}/api/health`).then(r => r.json()).catch(() => null);
      if (h?.database && h.database.starting === false) return h;
      await sleep(300);
    }
    return null;
  })();
  if (!up?.database?.connected) {
    console.error(srv.log.join('').split('\n').slice(-15).join('\n'));
    await srv.stop();
    throw new Error('servidor não conectou ao PostgreSQL');
  }
  return srv;
}

async function freshDb(name: string) {
  const c = new pg.Client({ connectionString: ADMIN_URL });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${name}`);
  await c.query(`CREATE DATABASE ${name}`);
  await c.end();
}

async function main() {
  // ------------------------------------------------------------------ base nova, SEM flags de demo
  console.log('\n🔐 Produção, instalação nova (sem SEED_DEMO_USERS, sem ADMIN_INITIAL_PASSWORD)');
  await freshDb('nyroh_boot1');
  let srv = await boot('nyroh_boot1');

  // Sem ADMIN_INITIAL_PASSWORD, produção NÃO cai mais na senha escrita no código:
  // o servidor sorteia uma senha forte e a imprime UMA vez no log do deploy.
  ok((await login('admin@nyroh.com', 'Thomas123456!')).status !== 200,
     'a senha escrita no código NÃO entra em produção (Thomas123456!)');

  const sorteada = (srv.log.join('').match(/Senha inicial SORTEADA[^]*?\n\s+(\S+)\n/) || [])[1] || '';
  ok(sorteada.length >= 16, 'o log do deploy mostra UMA vez a senha sorteada', sorteada ? `${sorteada.length} caracteres` : 'não encontrada');
  const a1 = await login('admin@nyroh.com', sorteada);
  ok(a1.status === 200, 'admin@nyroh.com entra com a senha sorteada (única conta de dono criada)');
  ok((await login('admin@demo.com', 'admin123')).status !== 200, 'admin@demo.com (admin123) NÃO existe/entra em produção');
  ok((await login('admin@crm.com', 'admin123')).status !== 200, 'admin@crm.com (admin123) NÃO entra em produção');
  ok((await login('lara@empresa.com', '123')).status !== 200, 'conta demo lara@empresa.com (123) NÃO é criada em produção');

  // senha previsível é recusada, curta é recusada, forte passa
  const chg = async (pw: string) => (await fetch(`${BASE}/api/auth/change-password`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: a1.cookie }, body: JSON.stringify({ newPassword: pw }) })).status;
  ok(await chg('abc') === 400, 'senha curta (3) é recusada');
  ok(await chg('admin123') === 400, 'senha conhecida "admin123" é recusada');
  ok(await chg('Thomas123456!'.toLowerCase()) === 400, 'a senha padrão antiga é recusada');
  ok(await chg('1234567') === 400, 'senha com 7 caracteres é recusada (mínimo é 8)');
  ok(await chg('Nova&Segura#2026') === 200, 'senha forte é aceita');
  // sessão antiga (outro aparelho) precisa cair; a atual continua
  const stillIn = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: a1.cookie } });
  ok(stillIn.status === 200, 'a sessão que trocou a senha continua válida');

  // ------------------------------------------------------------------ REBOOT: o ponto crítico
  console.log('\n🔁 Reinício do servidor (antes: a senha voltava para a conhecida)');
  await srv.stop();
  await sleep(500);
  srv = await boot('nyroh_boot1');
  ok((await login('admin@nyroh.com', 'Thomas123456!')).status !== 200, 'após reiniciar, a senha ANTIGA/conhecida NÃO volta a funcionar');
  ok((await login('admin@nyroh.com', 'Nova&Segura#2026')).status === 200, 'após reiniciar, a senha NOVA continua valendo');
  await srv.stop();
  await sleep(500);

  // ------------------------------------------------------------------ ADMIN_INITIAL_PASSWORD
  console.log('\n🔑 Instalação nova com ADMIN_INITIAL_PASSWORD');
  await freshDb('nyroh_boot2');
  srv = await boot('nyroh_boot2', { ADMIN_INITIAL_PASSWORD: 'Senha#Inicial#Forte9' });
  ok((await login('admin@nyroh.com', 'Senha#Inicial#Forte9')).status === 200, 'dono entra com a senha inicial definida no ambiente');
  ok((await login('admin@nyroh.com', 'Thomas123456!')).status !== 200, 'a senha antiga embutida no código NÃO funciona');
  ok((await login('thomas@nyroh.com', 'Senha#Inicial#Forte9')).status === 200, 'thomas@nyroh.com também usa a senha inicial do ambiente');
  ok((await login('thomas@nyroh.com', '123')).status !== 200, 'thomas@nyroh.com com "123" NÃO funciona');
  await srv.stop();
  await sleep(500);

  // ------------------------------------------------------------------ conta demo antiga existente é desativada
  console.log('\n🧹 Banco ANTIGO que já tinha admin@demo.com/admin123 ativo');
  await freshDb('nyroh_boot3');
  srv = await boot('nyroh_boot3', { SEED_DEMO_USERS: 'true', NODE_ENV: 'development' }); // simula o banco antigo: conta demo com a senha fraca de antes
  ok((await login('admin@demo.com', 'admin123')).status === 200, '(preparação) com SEED_DEMO_USERS=true a conta demo existe');
  await srv.stop();
  await sleep(500);
  srv = await boot('nyroh_boot3'); // agora em produção "normal"
  ok((await login('admin@demo.com', 'admin123')).status !== 200, 'ao subir em produção normal, a conta demo com a senha padrão é DESATIVADA');
  await srv.stop();

  // ------------------------------------------------------------------ promoção indevida a admin
  console.log('\n🛡️  Quem é administrador');
  const { isUserAdmin } = await import('../src/lib/serverAuth');
  ok(isUserAdmin({ id: 'u1', name: 'Thomas Silva', email: 'thomas.silva@loja.com', role: 'salesperson' }) === false, 'vendedor "Thomas Silva" NÃO vira admin');
  ok(isUserAdmin({ id: 'u2', name: 'Ana Admin', email: 'adminana@loja.com', role: 'salesperson' }) === false, 'vendedora "adminana@…" NÃO vira admin');
  ok(isUserAdmin({ id: 'user-thomas', name: 'Thomas', email: 'thomas@nyroh.com', role: 'salesperson' }) === true, 'o dono (thomas@nyroh.com) continua admin');
  ok(isUserAdmin({ id: 'x', name: 'Fulano', email: 'f@x.com', role: 'admin' }) === true, 'role=admin continua admin');

  console.log(`\n=====================================================\n📊 SEGURANÇA DE BOOT: ${passed} passaram, ${failed} falharam\n=====================================================`);
  fs.rmSync(UPLOADS, { recursive: true, force: true });
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error('💥', e); process.exit(2); });
