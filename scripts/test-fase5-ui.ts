/**
 * FASE 5 — flags de interface (botão "Simular Resposta" fora da produção).
 * Rodar: npx tsx scripts/test-fase5-ui.ts
 */
import assert from 'node:assert/strict';
import { isUiFlagOn } from '../shared/lib/uiFlags';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e: any) { failed++; console.error(`  ❌ ${name}\n     ${e?.message || e}`); }
}

console.log('\nFlag Simular Resposta');
test('ausente = desligada (produção sem botão)', () => assert.equal(isUiFlagOn(undefined), false));
test('vazia = desligada', () => assert.equal(isUiFlagOn(''), false));
test('"false" = desligada', () => assert.equal(isUiFlagOn('false'), false));
test('"true" exato = ligada', () => assert.equal(isUiFlagOn('true'), true));
test('"TRUE" em maiúsculas = desligada (evita ligar por engano)', () => assert.equal(isUiFlagOn('TRUE'), false));

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
