/**
 * FASE 3 — divisão por quantidade (regra nova atrás de flag).
 * Rodar: npx tsx scripts/test-fase3-distribuicao.ts
 */
import assert from 'node:assert/strict';
import { distributionByCount } from '../src/lib/distribution';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e: any) { failed++; console.error(`  ❌ ${name}\n     ${e?.message || e}`); }
}

console.log('\nFlag de divisão por quantidade');
test('desligada por padrão (produção não muda)', () => {
  delete process.env.NYROH_DISTRIBUICAO_POR_QUANTIDADE;
  assert.equal(distributionByCount(), false);
});
test('ligada só com o valor "true" exato', () => {
  process.env.NYROH_DISTRIBUICAO_POR_QUANTIDADE = 'true';
  assert.equal(distributionByCount(), true);
  process.env.NYROH_DISTRIBUICAO_POR_QUANTIDADE = 'yes';
  assert.equal(distributionByCount(), false);
  delete process.env.NYROH_DISTRIBUICAO_POR_QUANTIDADE;
});

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
