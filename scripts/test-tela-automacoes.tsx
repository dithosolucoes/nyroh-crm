/**
 * Teste de tela (E6): a tela de Automações renderiza no servidor, com as abas,
 * sem texto quebrado ("undefined", "NaN") e, sem dados reais, vazia e sem nenhum mock.
 * Roda com: npm run test:tela
 */
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import AdminAutomacoesView from '../frontend/src/components/AdminAutomacoesView';

const html = renderToStaticMarkup(<AdminAutomacoesView />);

const abas = ['Regras', 'Execuções', 'Fila agendada', 'Revisão', 'Configurações'];
for (const aba of abas) {
  assert.ok(html.includes(aba), `aba "${aba}" aparece na tela`);
}
assert.ok(!html.includes('undefined'), 'nenhum "undefined" escapou para a tela');
assert.ok(!html.includes('NaN'), 'nenhum "NaN" escapou para a tela');
assert.ok(html.includes('Nenhuma automação salva ainda'), 'sem dados reais, mostra o estado vazio');
for (const mock of ['Clicou em Acessar Link', 'Pediu para parar', 'Roberto', 'Padaria Estrela', 'Lúcia', 'Oficina Norte', 'Clínica Vida']) {
  assert.ok(!html.includes(mock), `nenhum dado de exemplo aparece: ${mock}`);
}

console.log(`✅ tela de Automações renderiza vazia, sem mocks (${html.length} caracteres, ${abas.length} abas)`);
