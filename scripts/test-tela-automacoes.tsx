/**
 * Teste de tela (E6): a tela de Automações renderiza no servidor, com as abas,
 * sem texto quebrado ("undefined", "NaN") e com o exemplo quando não há dados reais.
 * Roda com: npm run test:tela
 */
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import AdminAutomacoesView from '../src/components/AdminAutomacoesView';

const html = renderToStaticMarkup(<AdminAutomacoesView />);

const abas = ['Regras', 'Execuções', 'Fila agendada', 'Revisão', 'Configurações'];
for (const aba of abas) {
  assert.ok(html.includes(aba), `aba "${aba}" aparece na tela`);
}
assert.ok(!html.includes('undefined'), 'nenhum "undefined" escapou para a tela');
assert.ok(!html.includes('NaN'), 'nenhum "NaN" escapou para a tela');
assert.ok(html.length > 5000, 'a tela tem conteúdo');

console.log(`✅ tela de Automações renderiza (${html.length} caracteres, ${abas.length} abas)`);
