/**
 * FASE 0 — testes de COMPORTAMENTO ATUAL (caracterização).
 *
 * Registram o que o sistema faz HOJE nas regras que as próximas correções vão mexer.
 * Se uma correção mudar um destes resultados sem querer, o teste acusa.
 * Quando uma regra for corrigida de propósito, o caso muda aqui junto, com comentário.
 *
 * Rodar: npx tsx scripts/test-fase0-comportamento.ts
 */
import assert from 'node:assert/strict';
import { detectOptOut, sanitizeTemplateVariable } from '../shared/lib/leadIntent';
import { dispatchRpm, maxDispatchPerSecond } from '../shared/lib/dispatchRate';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e: any) {
    failed++;
    console.error(`  ❌ ${name}\n     ${e?.message || e}`);
  }
}

console.log('\nOpt-out: detecção do pedido de descadastro');
test('"não quero" é descadastro', () => assert.equal(detectOptOut('não quero mais', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse', 'sair']), true));
test('"nao quero" sem acento também é', () => assert.equal(detectOptOut('nao quero', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse', 'sair']), true));
test('"pare" como palavra inteira é descadastro', () => assert.equal(detectOptOut('pare de me mandar', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse', 'sair']), true));
test('"parece ótimo" NÃO é descadastro (palavra inteira)', () => assert.equal(detectOptOut('parece ótimo, quanto custa?', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse', 'sair']), false));
test('texto do botão "Parar Mensagens" é descadastro', () => assert.equal(detectOptOut('Parar Mensagens', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse', 'sair']), true));
test('"tenho interesse" NÃO é descadastro', () => assert.equal(detectOptOut('tenho interesse', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse', 'sair']), false));
test('texto vazio NÃO é descadastro', () => assert.equal(detectOptOut('   ', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse', 'sair']), false));

console.log('\nVariável de modelo: sem corte e sem quebra de linha');
test('URL longa passa inteira', () => {
  const url = 'https://exemplo.com.br/' + 'a'.repeat(200);
  assert.equal(sanitizeTemplateVariable(url), url);
});
test('quebra de linha vira espaço', () => assert.equal(sanitizeTemplateVariable('oi\nmundo'), 'oi mundo'));
test('espaços repetidos viram um', () => assert.equal(sanitizeTemplateVariable('oi    mundo'), 'oi mundo'));

console.log('\nRitmo do disparo');
test('teto em msgs/s é a taxa por minuto dividida por 60', () => {
  assert.equal(maxDispatchPerSecond(), dispatchRpm() / 60);
});
test('taxa por minuto é inteira e pelo menos 1', () => {
  const rpm = dispatchRpm();
  assert.ok(Number.isInteger(rpm) && rpm >= 1);
});

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
