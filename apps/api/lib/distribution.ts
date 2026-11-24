/**
 * Regra de divisão de leads entre vendedores (FASE 3 da correção de carteira).
 *
 * Regra nova (atrás de NYROH_DISTRIBUICAO_POR_QUANTIDADE=true):
 * - divide por QUANTIDADE, igual para todos, sem olhar interesse;
 * - o lead fica com quem recebeu, mesmo que vire interessado ou descadastre;
 * - interessados NÃO voltam para o admin por padrão.
 *
 * Com a flag desligada, vale a regra antiga (pesos 50/50 por tipo de lead).
 */
export function distributionByCount(): boolean {
  return process.env.NYROH_DISTRIBUICAO_POR_QUANTIDADE === 'true';
}
