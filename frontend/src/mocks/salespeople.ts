import type { Salesperson } from '@shared/types';

/** Vendedor falso do modo designer (USE_MOCK_API=true). */
export const VENDEDORES_FICTICIOS: Salesperson[] = [
  {
    id: 'mock-vendedor-1',
    name: 'Vendedor Fictício',
    color: '#1d4ed8',
    bgColor: '#dbeafe',
    active: true,
    isDefault: true,
    whatsappType: 'business',
  },
];
