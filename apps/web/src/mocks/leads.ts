import type { RespostaListaLeads } from '@shared/contracts/rotas';

/** Dados falsos do modo designer (USE_MOCK_API=true). Nomes marcados com "Fictício". */
export const LEADS_FICTICIOS: RespostaListaLeads = Array.from({ length: 6 }, (_, i) => ({
  id: `mock-lead-${i + 1}`,
  name: `Lead Fictício ${String(i + 1).padStart(2, '0')}`,
  phoneNumber: `551199990${String(i).padStart(4, '0')}`,
  columnStatus: i % 2 === 0 ? 'Leads' : 'Ligação 1',
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
  salespersonId: 'mock-vendedor-1',
  salespersonName: 'Vendedor Fictício',
  niche: 'Exemplo',
  hasWhatsAppReply: false,
  whatsappReplied: false,
  callCount: 0,
}));
