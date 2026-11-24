/**
 * FASE 1 — pedido de descadastro nunca vira INTERESSADO (resposta manual).
 * Rodar: npx tsx scripts/test-fase1-optout.ts
 */
import assert from 'node:assert/strict';
import { resolveManualInterest } from '../shared/lib/leadIntent';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e: any) { failed++; console.error(`  ❌ ${name}\n     ${e?.message || e}`); }
}

console.log('\nResposta manual: opt-out nunca vira interesse');
test('"Parar Mensagens" marcado como interessado vira NÃO interessado', () =>
  assert.equal(resolveManualInterest('Parar Mensagens', true, ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse']), false));
test('"não quero mais" vira NÃO interessado', () =>
  assert.equal(resolveManualInterest('não quero mais', true, ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse']), false));
test('resposta comum continua interessada quando marcada', () =>
  assert.equal(resolveManualInterest('quanto custa?', true, ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse']), true));
test('resposta marcada como não interessada continua não interessada', () =>
  assert.equal(resolveManualInterest('quanto custa?', false, ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse']), false));

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
