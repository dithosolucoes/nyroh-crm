/**
 * Testes da visita de site (plataforma avisa o CRM) e da flag NYROH_LINK_DIRETO.
 * Rodar: npm run test:visita-site
 */
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  atualizarVisitaNoLead,
  chaveConfere,
  linkDiretoLigado,
  normalizarSite,
} from '../apps/api/lib/visitaSite';
import { configurarVisitasSite, registrarVisitasSite } from '../apps/api/lib/rotas/visitasSite';

let falhas = 0;
async function test(nome: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`  FALHA ${nome}\n       ${(e as Error).message}`);
  }
}

(async () => {
  console.log('\nVisita de site (regras puras)');
  await test('normaliza host: minúsculo, sem www, sem barra final', () => {
    assert.equal(normalizarSite('  HTTPS://www.Cliente.com.br/loja/ '), 'https://cliente.com.br/loja');
  });
  await test('recusa endereço sem http(s) ou inválido', () => {
    assert.equal(normalizarSite('cliente.com.br'), null);
    assert.equal(normalizarSite('ftp://x.com'), null);
    assert.equal(normalizarSite(42), null);
    assert.equal(normalizarSite(''), null);
  });
  await test('chave confere só quando igual e configurada', () => {
    assert.equal(chaveConfere('abc', 'abc'), true);
    assert.equal(chaveConfere('abd', 'abc'), false);
    assert.equal(chaveConfere('ab', 'abc'), false);
    assert.equal(chaveConfere(undefined, 'abc'), false);
    assert.equal(chaveConfere('abc', undefined), false);
  });
  await test('atualiza visita e conta, preservando o resto das variáveis', () => {
    const v = atualizarVisitaNoLead({ nome: 'x', site_visitas: 2 }, '2026-11-24T10:00:00.000Z');
    assert.deepEqual(v, { nome: 'x', site_visitas: 3, site_visita_ultima: '2026-11-24T10:00:00.000Z' });
  });
  await test('flag NYROH_LINK_DIRETO nasce desligada', () => {
    assert.equal(linkDiretoLigado({}), false);
    assert.equal(linkDiretoLigado({ NYROH_LINK_DIRETO: 'false' }), false);
    assert.equal(linkDiretoLigado({ NYROH_LINK_DIRETO: 'true' }), true);
  });

  console.log('\nRota POST /api/integracoes/visita-site (pool falso)');
  const leads: Array<{ id: string; variaveis_json: Record<string, any> }> = [
    { id: 'L1', variaveis_json: { site_do_cliente: 'https://cliente.com.br' } },
  ];
  const pool = {
    async query(sql: string, params: any[]) {
      if (sql.startsWith('SELECT')) {
        const achados = leads.filter((l) => l.variaveis_json.site_do_cliente === params[1]);
        return { rowCount: achados.length, rows: achados };
      }
      if (sql.startsWith('UPDATE')) {
        const l = leads.find((x) => x.id === params[0]);
        if (l) l.variaveis_json = params[1];
        return { rowCount: 1, rows: [] };
      }
      throw new Error('sql inesperado: ' + sql);
    },
  };
  let env: Record<string, string | undefined> = { NYROH_CHAVE_VISITA_SITE: 'segredo-123' };
  configurarVisitasSite({ get env() { return env; }, get pgPool() { return pool; }, get usePostgres() { return true; } });
  const app = express();
  app.use(express.json());
  registrarVisitasSite(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (chave: string | null, corpo: unknown) =>
    fetch(`${base}/api/integracoes/visita-site`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(chave !== null ? { 'x-chave-integracao': chave } : {}) },
      body: JSON.stringify(corpo),
    });

  try {
    await test('sem chave: 401', async () => {
      assert.equal((await post(null, { site: 'https://cliente.com.br' })).status, 401);
      assert.equal((await post('errada', { site: 'https://cliente.com.br' })).status, 401);
    });
    await test('sem chave configurada: 503', async () => {
      env = {};
      assert.equal((await post('qualquer', { site: 'https://cliente.com.br' })).status, 503);
      env = { NYROH_CHAVE_VISITA_SITE: 'segredo-123' };
    });
    await test('site inválido: 400', async () => {
      assert.equal((await post('segredo-123', { site: 'nao-e-link' })).status, 400);
    });
    await test('site sem lead: 404', async () => {
      assert.equal((await post('segredo-123', { site: 'https://outro.com' })).status, 404);
    });
    await test('site com lead: 200 e conta a visita', async () => {
      const r = await post('segredo-123', { site: 'https://www.cliente.com.br/' });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).leadId, 'L1');
      assert.equal(leads[0].variaveis_json.site_visitas, 1);
      await post('segredo-123', { site: 'https://cliente.com.br' });
      assert.equal(leads[0].variaveis_json.site_visitas, 2);
    });
  } finally {
    server.close();
  }

  console.log(falhas === 0 ? '\nTudo ok.' : `\n${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
})();
