/**
 * Variáveis obrigatórias por ambiente (S1).
 *
 * Esta função só DIZ o que está faltando. Não derruba o servidor sozinha:
 * ligar a checagem ao boot (recusar subir) é uma decisão separada, com aprovação,
 * porque muda o comportamento da produção.
 */

/** Variáveis que precisam existir e não podem estar vazias em produção. */
export const VARIAVEIS_OBRIGATORIAS_PRODUCAO = ['DATABASE_URL', 'FLUXO_WEBHOOK_SECRET'] as const;

export function variaveisFaltando(
  env: Record<string, string | undefined>,
  ambiente: 'production' | 'development' | string
): string[] {
  if (ambiente !== 'production') return [];
  return VARIAVEIS_OBRIGATORIAS_PRODUCAO.filter((nome) => !String(env[nome] ?? '').trim());
}

export function mensagemFaltando(faltando: string[]): string {
  if (faltando.length === 0) return '';
  return `Variáveis obrigatórias ausentes em produção: ${faltando.join(', ')}. Defina-as nas variáveis do serviço e suba de novo.`;
}
