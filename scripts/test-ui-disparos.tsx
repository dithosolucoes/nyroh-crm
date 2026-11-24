/**
 * Teste de fumaça da tela de disparos (item 5.2 a): renderiza a tela AdminCampaignDisparosView
 * no servidor (sem navegador) e confere se as etapas e abas principais aparecem.
 * Uso: npm run test:ui-disparos  (empacota com esbuild, pois a tela usa import.meta.env)
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminCampaignDisparosView } from '../frontend/src/components/AdminCampaignDisparosView';

let falhas = 0;
function checar(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ok  ${nome}`);
  else { falhas++; console.log(`  FALHA ${nome}${detalhe ? ' — ' + detalhe : ''}`); }
}

console.log('\nTela de disparos (renderização inicial)');
let html = '';
try {
  html = renderToStaticMarkup(
    React.createElement(AdminCampaignDisparosView, {
      salespeople: [],
      currentUser: { id: 'u1', name: 'Teste', role: 'admin' },
    })
  );
  checar('renderiza sem erro', html.length > 0);
} catch (e: any) {
  checar('renderiza sem erro', false, e?.message || String(e));
}
checar('mostra a etapa "Montar" e a aba Kanban de disparos', html.includes('Kanban de disparos'));
checar('mostra a aba Quarentena', html.includes('Quarentena'));
checar('mostra a aba Distribuição', html.includes('Distribuição'));
checar('mostra a etapa Subir / Safras', html.includes('Safras'));

console.log('');
if (falhas) { console.log(`${falhas} falha(s).`); process.exit(1); }
console.log('Todos os testes passaram.');
