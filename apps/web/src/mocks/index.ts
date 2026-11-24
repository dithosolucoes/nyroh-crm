import { LEADS_FICTICIOS } from './leads';
import { VENDEDORES_FICTICIOS } from './salespeople';
import { RESPOSTAS_RAPIDAS_FICTICIAS } from './respostasRapidas';

/** Marcador que aparece no bundle só quando o modo mock está compilado (usado no teste do bundle). */
export const MARCADOR_DADOS_FALSOS = 'MARCADOR-DADOS-FALSOS-NYROH';

/**
 * Resposta falsa para uma rota GET conhecida. Devolve null quando não há mock
 * (a chamada segue para a API real).
 */
export function respostaMock(path: string, init?: RequestInit): Response | null {
  const metodo = (init?.method || 'GET').toUpperCase();
  if (metodo !== 'GET') return null;
  const corpo = corpoMock(path.split('?')[0]);
  if (corpo === undefined) return null;
  console.info(MARCADOR_DADOS_FALSOS, path);
  return new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function corpoMock(caminho: string): unknown {
  switch (caminho) {
    case '/api/leads':
      return LEADS_FICTICIOS;
    case '/api/salespeople':
      return VENDEDORES_FICTICIOS;
    case '/api/quick-replies':
      return RESPOSTAS_RAPIDAS_FICTICIAS;
    default:
      return undefined;
  }
}
