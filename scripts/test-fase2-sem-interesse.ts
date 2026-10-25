/**
 * FASE 2 — tag "Sem interesse" para quem pediu descadastro.
 * Rodar: npx tsx scripts/test-fase2-sem-interesse.ts
 */
import assert from 'node:assert/strict';
import { SEM_INTERESSE_TAG, detectOptOut } from '../src/lib/leadIntent';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e: any) { failed++; console.error(`  ❌ ${name}\n     ${e?.message || e}`); }
}

console.log('\nTag Sem interesse');
test('nome exato da tag é "Sem interesse"', () => assert.equal(SEM_INTERESSE_TAG.name, 'Sem interesse'));
test('id estável (não muda a cada deploy)', () => assert.equal(SEM_INTERESSE_TAG.id, 'tag-sem-interesse'));
test('pedido de descadastro é o gatilho da tag', () => assert.equal(detectOptOut('não quero mais'), true));
test('resposta comum NÃO recebe a tag', () => assert.equal(detectOptOut('quanto custa?'), false));

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
