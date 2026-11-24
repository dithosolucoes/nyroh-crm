/**
 * Testes do cliente de API do front e da regra do modo mock.
 * Rodar: npm run test:front-api
 */
import assert from 'node:assert/strict';
import { apiFetch, isMockApiAllowed } from '../apps/web/src/api/client';
import { respostaMock } from '../apps/web/src/mocks';

let falhas = 0;
function test(nome: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  ok  ${nome}`))
    .catch((e) => {
      falhas++;
      console.log(`  FALHA ${nome}\n       ${(e as Error).message}`);
    });
}

(async () => {
  console.log('\nCliente de API (apiFetch)');
  await test('repassa path, init e resposta sem alterar nada', async () => {
    const chamadas: Array<{ path: string; init?: RequestInit }> = [];
    const respostaFake = new Response('ok', { status: 201 });
    const fakeFetch = async (path: string, init?: RequestInit) => {
      chamadas.push({ path, init });
      return respostaFake;
    };
    const init: RequestInit = { method: 'POST', body: '{"a":1}' };
    const r = await apiFetch('/api/leads', init, fakeFetch);
    assert.equal(r, respostaFake);
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].path, '/api/leads');
    assert.equal(chamadas[0].init, init);
  });

  console.log('\nRegra do modo mock (isMockApiAllowed)');
  await test('desligado por padrão (sem variável)', () => {
    assert.equal(isMockApiAllowed({}), false);
  });
  await test('ligado só com USE_MOCK_API=true em desenvolvimento', () => {
    assert.equal(isMockApiAllowed({ USE_MOCK_API: 'true', NODE_ENV: 'development' }), true);
  });
  await test('aceita TRUE e espaços, mas não aceita valores como "1" ou "sim"', () => {
    assert.equal(isMockApiAllowed({ USE_MOCK_API: ' TRUE ' }), true);
    assert.equal(isMockApiAllowed({ USE_MOCK_API: '1' }), false);
    assert.equal(isMockApiAllowed({ USE_MOCK_API: 'sim' }), false);
  });
  await test('NUNCA liga em produção (NODE_ENV=production), mesmo com a variável', () => {
    assert.equal(isMockApiAllowed({ USE_MOCK_API: 'true', NODE_ENV: 'production' }), false);
  });
  await test('NUNCA liga no Railway (RAILWAY_ENVIRONMENT), mesmo com a variável', () => {
    assert.equal(isMockApiAllowed({ USE_MOCK_API: 'true', RAILWAY_ENVIRONMENT: 'production' }), false);
  });

  console.log('\nDados falsos (respostaMock, item 5.5 a)');
  await test('GET /api/leads devolve a lista falsa em JSON', async () => {
    const r = respostaMock('/api/leads');
    assert.ok(r, 'deveria haver mock para /api/leads');
    const lista = await r.json();
    assert.equal(Array.isArray(lista), true);
    assert.equal(lista.length, 6);
    assert.match(lista[0].name, /Fictício/);
  });
  await test('GET com query (/api/salespeople?x=1) usa o mesmo mock', async () => {
    const r = respostaMock('/api/salespeople?x=1');
    assert.ok(r);
    const lista = await r.json();
    assert.equal(lista[0].name, 'Vendedor Fictício');
  });
  await test('métodos que não são GET NÃO são mockados (vão para a API real)', () => {
    assert.equal(respostaMock('/api/leads', { method: 'POST' }), null);
    assert.equal(respostaMock('/api/leads', { method: 'DELETE' }), null);
  });
  await test('rota sem mock devolve null', () => {
    assert.equal(respostaMock('/api/rota-que-nao-existe'), null);
  });

  console.log('');
  if (falhas > 0) {
    console.log(`${falhas} teste(s) falharam.`);
    process.exit(1);
  }
  console.log('Todos os testes passaram.');
})();
