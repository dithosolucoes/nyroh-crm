/**
 * FASE 4 — resultado da ligação e troca de carteira.
 * Rodar: npx tsx scripts/test-fase4-carteira.ts
 */
import assert from 'node:assert/strict';
import { callResultToSave } from '../shared/lib/callResult';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e: any) { failed++; console.error(`  ❌ ${name}\n     ${e?.message || e}`); }
}

console.log('\nResultado da ligação');
test('sem resultado escolhido não grava nada (não existe "Atendeu" por padrão)', () =>
  assert.equal(callResultToSave([]), null));
test('só espaços também não grava', () => assert.equal(callResultToSave(['  ']), null));
test('um resultado escolhido é gravado', () => assert.equal(callResultToSave(['Atendeu']), 'Atendeu'));
test('vários resultados viram uma lista', () =>
  assert.equal(callResultToSave(['Atendeu', 'Pediu para retornar']), 'Atendeu, Pediu para retornar'));

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
