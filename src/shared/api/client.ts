/**
 * Cliente único de chamadas à API do front.
 *
 * Etapa 1 (sem mudança de comportamento): apiFetch apenas repassa para fetch.
 * As telas ainda usam fetch direto; a migração acontece arquivo por arquivo, com revisão.
 *
 * O modo mock (dados falsos para o designer) só liga com USE_MOCK_API=true
 * e NUNCA em produção. Ver isMockApiAllowed abaixo.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function apiFetch(path: string, init?: RequestInit, fetchImpl: FetchLike = fetch): Promise<Response> {
  return fetchImpl(path, init);
}

export type MockPolicyEnv = {
  USE_MOCK_API?: string;
  NODE_ENV?: string;
  RAILWAY_ENVIRONMENT?: string;
};

/**
 * Regra de segurança do mock:
 * - só liga com USE_MOCK_API=true explícito (sem isso, nunca liga);
 * - se for produção (NODE_ENV=production ou ambiente Railway), recusa sempre.
 */
export function isMockApiAllowed(env: MockPolicyEnv): boolean {
  const flag = String(env.USE_MOCK_API || '').trim().toLowerCase() === 'true';
  if (!flag) return false;
  const isProduction = env.NODE_ENV === 'production' || Boolean(env.RAILWAY_ENVIRONMENT);
  return !isProduction;
}
