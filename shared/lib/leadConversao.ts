import type { Lead, ColumnStatus } from '../types';
import type { LeadListado, ResumoLead } from '../contracts/rotas.js';

/** Colunas válidas do funil. Um valor fora desta lista não entra no kanban. */
const COLUNAS: readonly ColumnStatus[] = [
  'Leads', 'Ligação 1', 'Ligação 2', 'Ligação 3', 'Ligação 4', 'Interessado', 'Fechado', 'Recusado'
];

export function ehColumnStatus(valor: string): valor is ColumnStatus {
  return (COLUNAS as readonly string[]).includes(valor);
}

/** Campo que pode vir null do banco vira undefined no front (o tipo Lead usa opcional). */
const semNulo = <T,>(valor: T | null | undefined): T | undefined => (valor === null ? undefined : valor);

/**
 * Listagem de GET /api/leads (LeadListado) convertida para o tipo Lead do front.
 * Sem cast: cada campo obrigatório do Lead é preenchido de forma explícita.
 */
export function leadListadoParaLead(l: LeadListado): Lead {
  return {
    id: l.id,
    name: l.name,
    phoneNumber: l.phoneNumber ?? '',
    publicUrl: semNulo(l.publicUrl),
    website: semNulo(l.website),
    siteDoCliente: semNulo(l.siteDoCliente),
    // Status fora do funil cai em 'Leads' (o kanban só mostra as colunas conhecidas).
    columnStatus: ehColumnStatus(l.columnStatus) ? l.columnStatus : 'Leads',
    createdAt: l.createdAt ?? '',
    updatedAt: l.updatedAt ?? '',
    callCount: l.callCount,
    contatosHoje: l.contatosHoje,
    marcas: l.marcas?.map(m => ({ id: m.id, name: m.name, lastAt: semNulo(m.lastAt) })),
    lastCallAt: semNulo(l.lastCallAt),
    lastCallTag: semNulo(l.lastCallTag),
    nextFollowUpAt: semNulo(l.nextFollowUpAt),
    salespersonId: l.salespersonId,
    salespersonName: l.salespersonName,
    niche: semNulo(l.niche),
    categories: semNulo(l.categories),
    subStatus: semNulo(l.subStatus),
    lossReason: semNulo(l.lossReason),
    hasWhatsAppReply: l.hasWhatsAppReply,
    whatsappReplied: l.whatsappReplied,
    respondedAt: semNulo(l.respondedAt),
    lastWhatsAppMessage: semNulo(l.lastWhatsAppMessage),
  };
}

/**
 * Resumo de GET /api/leads/:id/summary (ResumoLead) convertido para Lead.
 * O resumo não traz datas de criação/atualização: entram vazias, como antes.
 */
export function resumoParaLead(r: ResumoLead): Lead {
  return {
    id: r.id,
    name: r.name,
    phoneNumber: r.phoneNumber,
    columnStatus: ehColumnStatus(r.columnStatus) ? r.columnStatus : 'Leads',
    createdAt: '',
    updatedAt: '',
    subStatus: semNulo(r.subStatus),
    niche: semNulo(r.niche),
    publicUrl: semNulo(r.publicUrl),
    salespersonId: semNulo(r.salespersonId),
    salespersonName: semNulo(r.salespersonName),
    lastMessageAt: semNulo(r.lastMessageAt),
    unreadCount: r.unreadCount,
    windowExpiresAt: semNulo(r.windowExpiresAt),
    whatsappReplied: r.whatsappReplied,
    lastWhatsAppMessage: semNulo(r.lastWhatsAppMessage),
    lastMessageText: semNulo(r.lastMessageText),
    lastMessageStatus: semNulo(r.lastMessageStatus),
  };
}
