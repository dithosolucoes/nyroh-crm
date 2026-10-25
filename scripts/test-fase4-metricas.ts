/**
 * FASE 4 — contagem única de leads da carteira (subtítulo e contadores iguais).
 * Rodar: npx tsx scripts/test-fase4-metricas.ts
 */
import assert from 'node:assert/strict';
import { countSellerLeads } from '../src/lib/sellerCounts';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e: any) { failed++; console.error(`  ❌ ${name}\n     ${e?.message || e}`); }
}

const leads = [
  { salespersonId: 'seller-thomas' },
  { salespersonId: 'seller-thomas' },
  { salespersonId: 'seller-ana' },
  { salespersonId: null },
];

console.log('\nContagem de leads');
test('visão ALL conta a base inteira', () => assert.equal(countSellerLeads(leads, 'ALL', true), 4));
test('vendedor conta a própria carteira (lead sem dono entra na do Thomas)', () => assert.equal(countSellerLeads(leads, 'seller-thomas', false), 3));
test('comparação ignora maiúsculas', () => assert.equal(countSellerLeads(leads, 'SELLER-ANA', false), 1));
test('lead sem dono conta para o Thomas, não para ninguém mais', () => assert.equal(countSellerLeads(leads, 'seller-ana', false), 1));
test('soma das carteiras individuais fecha com o total', () => {
  const sum = countSellerLeads(leads, 'seller-thomas', false) + countSellerLeads(leads, 'seller-ana', false);
  assert.equal(sum, countSellerLeads(leads, 'ALL', true));
});

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
