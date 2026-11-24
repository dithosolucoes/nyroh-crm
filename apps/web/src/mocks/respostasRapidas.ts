import type { RespostaListaRespostasRapidas } from '@shared/contracts/rotas';

/** Respostas rápidas falsas do modo designer (USE_MOCK_API=true). */
export const RESPOSTAS_RAPIDAS_FICTICIAS: RespostaListaRespostasRapidas = {
  success: true,
  quickReplies: [
    {
      id: 'mock-rr-1',
      shortcut: '/ola',
      title: 'Saudação fictícia',
      type: 'text',
      content: 'Olá, tudo bem? (texto fictício)',
      mediaUrl: null,
    },
  ],
};
