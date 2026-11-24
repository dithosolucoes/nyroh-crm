/**
 * Interface comum da fila de envio de disparos (item 4.2 R1 b).
 * Dois adaptadores: "memoria" (esteira em memória, contingência) e "redis" (BullMQ, durável).
 * A escolha é feita por NYROH_FILA_ENVIO:
 *   - "auto" (padrão, igual ao comportamento atual): Redis quando a fila BullMQ existe; senão memória.
 *     Se o Redis falhar na hora de enfileirar, o próprio código cai para a memória (igual antes).
 *   - "redis": igual ao "auto" (explícito).
 *   - "memoria": sempre memória, mesmo com Redis configurado (útil para isolar problemas).
 */

export type ModoFilaEnvio = 'auto' | 'memoria' | 'redis';
export type AdaptadorFila = 'memoria' | 'redis';

export interface ResultadoEnfileiramento {
  enqueued: number;
  speed: number;
  estimatedSeconds: number;
  requestedSpeed?: number;
  cappedByPlan: boolean;
}

export interface FilaEnvio<T> {
  readonly adaptador: AdaptadorFila;
  enfileirarLote(jobs: T[], speedPerSecond?: number): Promise<ResultadoEnfileiramento>;
}

/** Lê o modo pedido. Valor desconhecido vira "auto", o padrão seguro. */
export function modoFilaEnvio(valor: string | undefined): ModoFilaEnvio {
  const v = (valor || '').trim().toLowerCase();
  return v === 'memoria' || v === 'redis' ? v : 'auto';
}

/** Decide qual adaptador usar. Sem fila Redis criada, usa a memória. */
export function escolherAdaptadorFila(modo: ModoFilaEnvio, redisDisponivel: boolean): AdaptadorFila {
  if (modo === 'memoria') return 'memoria';
  return redisDisponivel ? 'redis' : 'memoria';
}
