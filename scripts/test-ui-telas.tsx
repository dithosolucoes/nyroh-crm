/**
 * Teste de interface das telas principais (item 5.4): conversas, pipeline, disparos e leads.
 * Renderiza cada tela no servidor (sem navegador) com um lead de exemplo e confere o que aparece.
 * Uso: bash scripts/run-ui-telas.sh (empacota com esbuild, pois as telas usam import.meta.env)
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThomasWhatsAppDesktopView } from '../frontend/src/components/ThomasWhatsAppDesktopView';
import { KanbanBoard } from '../frontend/src/components/KanbanBoard';
import { AllLeadsTable } from '../frontend/src/components/AllLeadsTable';
import { AdminCampaignDisparosView } from '../frontend/src/components/AdminCampaignDisparosView';

let falhas = 0;
function checar(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ok  ${nome}`);
  else { falhas++; console.log(`  FALHA ${nome}${detalhe ? ' — ' + detalhe : ''}`); }
}
function renderizar(nome: string, el: React.ReactElement): string {
  try {
    const html = renderToStaticMarkup(el);
    checar(`${nome}: renderiza sem erro`, html.length > 0);
    return html;
  } catch (e: any) {
    checar(`${nome}: renderiza sem erro`, false, e?.message || String(e));
    return '';
  }
}

const lead: any = {
  id: 'l1', name: 'Maria Teste', phoneNumber: '5511999990000', columnStatus: 'Leads',
  createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z', niche: 'Teste',
  city: 'BH', notes: '', calls: [], unreadCount: 0, lastMessageText: 'oi',
  lastMessageSender: 'lead', lastMessageAt: '2026-11-01T10:00:00Z', variaveisJson: {}, marcas: [],
};
const noop = () => {};

console.log('\nConversas (ThomasWhatsAppDesktopView)');
const conversas = renderizar('Conversas', React.createElement(ThomasWhatsAppDesktopView, { leads: [lead], onShowToast: noop }));
checar('Conversas: mostra o lead na lista', conversas.includes('Maria Teste'));

console.log('\nPipeline (KanbanBoard)');
const pipeline = renderizar('Pipeline', React.createElement(KanbanBoard, {
  leads: [lead], onOpenDetails: noop, onMoveColumn: noop, onShowToast: noop,
}));
checar('Pipeline: mostra o lead no card', pipeline.includes('Maria Teste'));
checar('Pipeline: mostra a coluna Leads', pipeline.includes('Leads'));

console.log('\nDisparos (AdminCampaignDisparosView)');
const disparos = renderizar('Disparos', React.createElement(AdminCampaignDisparosView, {
  salespeople: [], currentUser: { id: 'u1', name: 'Teste', role: 'admin' } as any,
}));
checar('Disparos: mostra a aba Kanban de disparos', disparos.includes('Kanban de disparos'));

console.log('\nLeads (AllLeadsTable)');
const leads = renderizar('Leads', React.createElement(AllLeadsTable, {
  leads: [lead], onOpenDetails: noop, onUpdateColumn: noop, onDeleteLead: noop, onShowToast: noop,
}));
checar('Leads: mostra o lead na tabela', leads.includes('Maria Teste'));
checar('Leads: mostra o telefone', leads.includes('5511999990000') || leads.includes('+55'));

console.log('');
if (falhas) { console.log(`${falhas} falha(s).`); process.exit(1); }
console.log('Todos os testes passaram.');
