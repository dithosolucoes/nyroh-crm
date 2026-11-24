/**
 * Teste de fumaça das telas de WhatsApp (item 5.3 a): renderiza AdminWhatsAppFluxoView
 * e ThomasWhatsAppDesktopView no servidor (sem navegador) e confere as partes principais.
 * Uso: bash scripts/run-ui-whatsapp.sh  (empacota com esbuild, pois as telas usam import.meta.env)
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminWhatsAppFluxoView } from '../apps/web/src/components/AdminWhatsAppFluxoView';
import { ThomasWhatsAppDesktopView } from '../apps/web/src/components/ThomasWhatsAppDesktopView';

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

console.log('\nFluxo WhatsApp (AdminWhatsAppFluxoView)');
const fluxo = renderizar('Fluxo', React.createElement(AdminWhatsAppFluxoView, {
  currentUser: { id: 'u1', name: 'Teste', role: 'admin' } as any,
  onShowToast: () => {},
}));
checar('Fluxo: aba Contas & Números', fluxo.includes('Contas &amp; Números') || fluxo.includes('Contas & Números'));
checar('Fluxo: aba Modelos', fluxo.includes('Modelos'));
checar('Fluxo: aba Diagnóstico', fluxo.includes('Diagnóstico (webhooks &amp; logs)') || fluxo.includes('Diagnóstico (webhooks & logs)'));

console.log('\nMesa do closer (ThomasWhatsAppDesktopView)');
const mesa = renderizar('Mesa', React.createElement(ThomasWhatsAppDesktopView, {
  leads: [] as any,
  onShowToast: () => {},
}));
checar('Mesa: mostra o nome do closer padrão', mesa.includes('Thomas'));

// Item 7.3: lead selecionado abre o dossiê (isDossierOpen começa aberto). O nome aparece na lista e no dossiê.
const lead: any = {
  id: 'l1', name: 'Maria Teste', phoneNumber: '5511999990000', columnStatus: 'Leads',
  createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z', niche: 'Teste',
  city: 'BH', notes: '', calls: [], unreadCount: 0, lastMessageText: 'oi',
  lastMessageSender: 'lead', lastMessageAt: '2026-11-01T10:00:00Z', variaveisJson: {}, marcas: [],
};
const mesaComLead = renderizar('Mesa com lead', React.createElement(ThomasWhatsAppDesktopView, {
  leads: [lead] as any, initialLeadId: 'l1', onShowToast: () => {},
} as any));
const vezesNome = mesaComLead.split('Maria Teste').length - 1;
checar('Mesa com lead: dossiê mostra o nome (lista e dossiê)', vezesNome >= 2, `apareceu ${vezesNome} vez(es)`);
checar('Mesa com lead: mostra o telefone no dossiê', mesaComLead.includes('5511999990000') || mesaComLead.includes('99999-0000') || mesaComLead.includes('+55'));
// Limite: os modais (Modelos e Respostas rápidas) só abrem com clique; isso exige teste de navegador, não de servidor.

console.log('');
if (falhas) { console.log(`${falhas} falha(s).`); process.exit(1); }
console.log('Todos os testes passaram.');
