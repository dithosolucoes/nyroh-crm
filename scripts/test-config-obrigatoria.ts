/**
 * Testa a checagem de variáveis obrigatórias (S1).
 * Rodar: npm run test:config
 */
import assert from 'node:assert/strict';
import { variaveisFaltando, mensagemFaltando, VARIAVEIS_OBRIGATORIAS_PRODUCAO } from '../shared/lib/configObrigatoria';

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

console.log('\nVariáveis obrigatórias');

test('em produção, sem nada definido, lista todas as obrigatórias', () => {
  assert.deepEqual(variaveisFaltando({}, 'production'), [...VARIAVEIS_OBRIGATORIAS_PRODUCAO]);
});

test('em produção, com tudo definido, não falta nada', () => {
  const env = { DATABASE_URL: 'postgres://x', FLUXO_WEBHOOK_SECRET: 'abc' };
  assert.deepEqual(variaveisFaltando(env, 'production'), []);
});

test('variável vazia ou só com espaço conta como ausente', () => {
  const env = { DATABASE_URL: '   ', FLUXO_WEBHOOK_SECRET: '' };
  assert.deepEqual(variaveisFaltando(env, 'production'), ['DATABASE_URL', 'FLUXO_WEBHOOK_SECRET']);
});

test('em desenvolvimento não exige nada', () => {
  assert.deepEqual(variaveisFaltando({}, 'development'), []);
});

test('mensagem diz quais faltam e o que fazer', () => {
  const msg = mensagemFaltando(['DATABASE_URL']);
  assert.ok(msg.includes('DATABASE_URL'));
  assert.ok(msg.includes('variáveis do serviço'));
});

test('sem faltantes, não há mensagem', () => {
  assert.equal(mensagemFaltando([]), '');
});

console.log('');
if (falhas > 0) {
  console.log(`${falhas} teste(s) falharam.`);
  process.exit(1);
}
console.log('Todos os testes de configuração passaram.');
