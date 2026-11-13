/**
 * Testa a recuperação de leads fixos (não reavalia telefone e não revive descadastrados).
 * Rodar: npm run test:recuperacao
 */
import assert from 'node:assert/strict';
import { recuperarFixosDescartados } from '../shared/lib/recuperacaoFixos';

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

console.log('\nRecuperação de leads descartados');

test('fixo marcado por engano volta para STAGING', () => {
  const l = { status: 'DESCARTADO', responsePreview: 'Telefone fixo', phoneNumber: '1133334444' };
  assert.equal(recuperarFixosDescartados([l]), 1);
  assert.equal(l.status, 'STAGING');
});

test('descadastrado (opt-out) com telefone de 11 dígitos NÃO volta', () => {
  const l = { status: 'DESCARTADO', responsePreview: 'Opt-out via WhatsApp', phoneNumber: '11999998888' };
  assert.equal(recuperarFixosDescartados([l]), 0);
  assert.equal(l.status, 'DESCARTADO');
});

test('lead descartado sem marca de fixo NÃO volta, mesmo com telefone válido', () => {
  const l = { status: 'DESCARTADO', responsePreview: undefined, phoneNumber: '11999998888' };
  assert.equal(recuperarFixosDescartados([l]), 0);
  assert.equal(l.status, 'DESCARTADO');
});

test('lead que já está em STAGING não é alterado', () => {
  const l = { status: 'STAGING', responsePreview: 'Telefone fixo' };
  assert.equal(recuperarFixosDescartados([l]), 0);
  assert.equal(l.status, 'STAGING');
});

console.log('');
if (falhas > 0) {
  console.log(`${falhas} teste(s) falharam.`);
  process.exit(1);
}
console.log('Todos os testes de recuperação passaram.');
