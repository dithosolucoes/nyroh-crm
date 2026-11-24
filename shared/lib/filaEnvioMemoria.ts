/**
 * Esteira de disparo em MEMÓRIA (item 4.2 R1). É a fila de contingência usada quando o Redis não
 * está disponível (ou quando NYROH_FILA_ENVIO=memoria). Extraída de server/redisQueue.ts sem mudar
 * o comportamento: mesmo intervalo entre envios, mesma pausa e cancelamento por lote.
 */

export interface ItemDisparoMemoria {
  batchId?: string;
}

export interface OpcoesEsteiraMemoria<T extends ItemDisparoMemoria> {
  /** Velocidade já limitada ao teto do plano (msgs/s). */
  velocidade: number;
  /** Processa um envio (com nova tentativa, quando for o caso). */
  processar: (job: T & { speedPerSecond: number; jobIndex: number; totalJobs: number }) => Promise<void>;
  pausado: (batchId?: string) => boolean;
  cancelado: (batchId?: string) => boolean;
  /** Espera em ms. Padrão: setTimeout. Injetável nos testes. */
  esperar?: (ms: number) => Promise<void>;
}

const esperarPadrao = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Intervalo mínimo entre envios na esteira em memória: 1000/velocidade, com piso de 10 ms. */
export function intervaloEntreEnviosMemoria(velocidade: number): number {
  return Math.max(10, Math.floor(1000 / velocidade));
}

export async function executarLoteEmMemoria<T extends ItemDisparoMemoria>(
  jobs: T[],
  opts: OpcoesEsteiraMemoria<T>
): Promise<void> {
  const esperar = opts.esperar ?? esperarPadrao;
  const intervalo = intervaloEntreEnviosMemoria(opts.velocidade);
  for (let i = 0; i < jobs.length; i++) {
    const jobData = jobs[i];
    if (jobData.batchId && opts.cancelado(jobData.batchId)) {
      console.log(`🛑 [Queue Memory] Lote ${jobData.batchId} cancelado pelo usuário.`);
      break;
    }
    while (jobData.batchId && opts.pausado(jobData.batchId)) {
      await esperar(500);
      if (jobData.batchId && opts.cancelado(jobData.batchId)) break;
    }
    await opts.processar({ ...jobData, speedPerSecond: opts.velocidade, jobIndex: i, totalJobs: jobs.length });
    if (i < jobs.length - 1) await esperar(intervalo);
  }
}
