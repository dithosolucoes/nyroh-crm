import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import http from 'http';
import {
  effectiveSpeedPerSecond,
  maxDispatchPerSecond,
  dispatchRpm,
  planRpm,
  delayForIndex,
  estimateSeconds,
  FluxoRateLimitedError
} from '../src/lib/dispatchRate.js';

// ============================================================================
// REDIS CONNECTION & CLIENT FACTORY
// ============================================================================
const REDIS_URL = (
  process.env.REDIS_URL || 
  process.env.REDIS_PRIVATE_URL || 
  process.env.REDIS_PUBLIC_URL || 
  ''
).trim();

let redisClient: Redis | null = null;
let redisPubClient: Redis | null = null;
let redisSubClient: Redis | null = null;
let isRedisConnected = false;

export function getRedisClient(): Redis | null {
  if (!REDIS_URL) return null;
  if (!redisClient) {
    try {
      redisClient = new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy(times) {
          if (times > 5) {
            console.warn('⚠️ [Redis] Falha ao reconectar após 5 tentativas. Utilizando fallback em memória.');
            return null;
          }
          return Math.min(times * 1000, 3000);
        }
      });

      redisClient.on('connect', () => {
        isRedisConnected = true;
        console.log('✅ [Redis] Conectado com sucesso ao Redis da Railway!');
      });

      redisClient.on('error', (err) => {
        isRedisConnected = false;
        console.warn('⚠️ [Redis] Erro de conexão:', err.message);
      });
    } catch (e: any) {
      console.warn('⚠️ [Redis] Não foi possível inicializar cliente Redis:', e.message);
    }
  }
  return redisClient;
}

// Inicia tentativa de conexão se REDIS_URL estiver presente
if (REDIS_URL) {
  getRedisClient();
}

// ============================================================================
// SOCKET.IO REAL-TIME COM REDIS ADAPTER
// ============================================================================
let io: SocketIOServer | null = null;

/**
 * `authenticate` recebe o cabeçalho Cookie do handshake e devolve o usuário (ou null). Sem isso, qualquer pessoa
 * que abrisse um WebSocket receberia o texto de TODAS as mensagens e telefones dos leads.
 */
export function initSocketServer(
  httpServer: http.Server,
  authenticate?: (cookieHeader: string, authHeader?: string) => Promise<any | null>
): SocketIOServer {
  const publicOrigin = (process.env.APP_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  io = new SocketIOServer(httpServer, {
    cors: {
      // Mesma origem não precisa de CORS; só libera a URL pública configurada (nunca '*')
      origin: publicOrigin || false,
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  if (authenticate) {
    io.use(async (socket, next) => {
      try {
        const user = await authenticate(String(socket.handshake.headers.cookie || ''), String(socket.handshake.headers.authorization || ''));
        if (!user) return next(new Error('unauthenticated'));
        (socket.data as any).user = user;
        return next();
      } catch {
        return next(new Error('unauthenticated'));
      }
    });
  }

  // Se o Redis estiver configurado, conectar o Redis Adapter para multi-instâncias
  if (REDIS_URL) {
    try {
      redisPubClient = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
      redisSubClient = redisPubClient.duplicate();
      io.adapter(createAdapter(redisPubClient, redisSubClient));
      console.log('✅ [Socket.io] Redis Adapter ativado para sincronização de WebSockets.');
    } catch (err: any) {
      console.warn('⚠️ [Socket.io] Falha ao configurar Redis Adapter:', err.message);
    }
  }

  io.on('connection', (socket) => {
    socket.on('join_lead', (leadId: string) => {
      socket.join(`lead_${leadId}`);
    });

    socket.on('leave_lead', (leadId: string) => {
      socket.leave(`lead_${leadId}`);
    });

    socket.on('join_dashboard', () => {
      socket.join('dashboard');
    });
  });

  return io;
}

/**
 * Ponte para o SSE.
 *
 * O navegador do Nyroh não usa socket.io — ele só escuta SSE. Progresso e conclusão de
 * disparo eram emitidos SÓ por socket, então a barra de progresso nunca se mexia de verdade:
 * a tela só mudava quando o poll de 3 segundos buscava os lotes. O servidor registra aqui a
 * função de SSE e os mesmos eventos passam a chegar na tela, com o nome que ela escuta.
 */
let sseBridge: ((type: string, data: any, opts?: any) => void) | null = null;
export function registerSseBridge(fn: (type: string, data: any, opts?: any) => void) {
  sseBridge = fn;
}

/** Eventos de disparo: nome do socket → nome que a tela escuta no SSE. */
const SSE_EVENT_ALIASES: Record<string, string> = {
  campaign_dispatch_progress: 'CAMPAIGN_BATCH_PROGRESS',
  campaign_dispatch_completed: 'DISPATCH_COMPLETED',
  campaign_speed_changed: 'CAMPAIGN_SPEED_CHANGED',
  campaign_import_progress: 'CAMPAIGN_IMPORT_PROGRESS',
  zip_import_completed: 'ZIP_IMPORT_COMPLETED'
};

export function broadcastSocketEvent(event: string, data: any) {
  const sseName = SSE_EVENT_ALIASES[event];
  if (sseName && sseBridge) {
    // Disparo é operação da empresa: vai para os administradores.
    try {
      sseBridge(sseName, data, { owner: null });
    } catch (err) {
      console.error(`Erro ao espelhar "${event}" no SSE:`, err);
    }
  }
  if (!io) return;
  try {
    io.emit(event, data);
  } catch (err) {
    console.error(`Erro ao emitir evento socket "${event}":`, err);
  }
}

export function broadcastToLead(leadId: string, event: string, data: any) {
  if (!io) return;
  try {
    io.to(`lead_${leadId}`).emit(event, data);
    io.emit(event, { ...data, leadId }); // Também notifica listeners gerais
  } catch (err) {
    console.error(`Erro ao emitir para lead "${leadId}":`, err);
  }
}

// ============================================================================
// BULLMQ QUEUES (FILAS ASSÍNCRONAS OTIMIZADAS PARA RAILWAY)
// ============================================================================
export interface WebhookJobData {
  rawPayload: any;
  headers?: any;
  receivedAt: number;
  source: 'meta' | 'fluxo';
}

export interface ZipImportJobData {
  tempFilePath: string;
  originalFileName: string;
  userId?: string;
  uploadedAt: number;
}

export interface CampaignDispatchJobData {
  campaignId: string;
  batchId?: string;
  leadId: string;
  phone: string;
  leadName?: string;
  templateName?: string;
  templateLanguage?: string;
  variables?: Record<string, string>;
  salespersonId?: string;
  salespersonName?: string;
  publicUrl?: string;
  messageText?: string;
  speedPerSecond?: number;
  jobIndex?: number;
  totalJobs?: number;
  dryRun?: boolean;
  /** Valores dos botões do modelo (índice zero-based → trecho de URL / cupom / token) — §A4 `buttons`. */
  buttonValues?: Record<string, string>;
  /** URL pública (HTTPS) da mídia do cabeçalho do modelo (imagem/vídeo/documento). */
  headerMediaUrl?: string;
  dispatchedAt: number;
}

/** Contexto de tentativa que o worker entrega ao processador (para saber se esta é a ÚLTIMA tentativa). */
export interface DispatchContext {
  attempt: number;
  maxAttempts: number;
}

export interface CampaignBatchProgress {
  batchId: string;
  total: number;
  enqueued: number;
  sent: number;
  failed: number;
  speedPerSecond: number;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  lastError?: string;
  recentLogs: Array<{
    id: string;
    leadId: string;
    phone: string;
    leadName?: string;
    status: 'sent' | 'failed';
    error?: string;
    timestamp: string;
  }>;
}

// In-Memory state for batch tracking and speed control
const batchProgressMap = new Map<string, CampaignBatchProgress>();
const pausedBatches = new Set<string>();
const cancelledBatches = new Set<string>();
// Velocidade do disparo em msgs/SEGUNDO, SEMPRE limitada ao que o plano da FluxoAPI aguenta.
// O limite da API é por MINUTO (Starter 60, Pro 300, Escala 1.200 — env FLUXO_PLAN_RPM); o antigo padrão de
// "30 msgs/s" = 1.800/min estourava qualquer plano abaixo de Escala (429 em massa).
let activeDispatchSpeed = maxDispatchPerSecond();

export function setCampaignSpeed(speed: number): number {
  const parsed = effectiveSpeedPerSecond(speed);
  activeDispatchSpeed = parsed;
  console.log(`⚡ [Speed Controller] Velocidade de disparo: ${activeDispatchSpeed.toFixed(2)} msgs/s (${Math.round(activeDispatchSpeed * 60)}/min; teto do plano p/ disparo: ${dispatchRpm()}/min de ${planRpm()}/min).`);
  broadcastSocketEvent('campaign_speed_updated', { speed: activeDispatchSpeed });
  return activeDispatchSpeed;
}

export function getCampaignSpeed(): number {
  return activeDispatchSpeed;
}

export function initBatchProgress(batchId: string, total: number, speedPerSecond?: number): CampaignBatchProgress {
  const speed = speedPerSecond && speedPerSecond > 0 ? speedPerSecond : activeDispatchSpeed;
  const progress: CampaignBatchProgress = {
    batchId,
    total,
    enqueued: total,
    sent: 0,
    failed: 0,
    speedPerSecond: speed,
    status: 'running',
    startedAt: new Date().toISOString(),
    recentLogs: []
  };
  batchProgressMap.set(batchId, progress);
  pausedBatches.delete(batchId);
  cancelledBatches.delete(batchId);
  broadcastSocketEvent('campaign_dispatch_progress', progress);
  return progress;
}

export function getBatchProgress(batchId: string): CampaignBatchProgress | null {
  return batchProgressMap.get(batchId) || null;
}

export function pauseBatchProgress(batchId: string): boolean {
  const prog = batchProgressMap.get(batchId);
  if (prog && prog.status === 'running') {
    prog.status = 'paused';
    pausedBatches.add(batchId);
    broadcastSocketEvent('campaign_dispatch_progress', prog);
    return true;
  }
  return false;
}

export function resumeBatchProgress(batchId: string): boolean {
  const prog = batchProgressMap.get(batchId);
  if (prog && prog.status === 'paused') {
    prog.status = 'running';
    pausedBatches.delete(batchId);
    broadcastSocketEvent('campaign_dispatch_progress', prog);
    return true;
  }
  return false;
}

export function cancelBatchProgress(batchId: string): boolean {
  const prog = batchProgressMap.get(batchId);
  if (prog && (prog.status === 'running' || prog.status === 'paused')) {
    prog.status = 'cancelled';
    prog.completedAt = new Date().toISOString();
    cancelledBatches.add(batchId);
    pausedBatches.delete(batchId);
    broadcastSocketEvent('campaign_dispatch_progress', prog);
    return true;
  }
  return false;
}

export function recordBatchJobResult(
  batchId: string,
  leadId: string,
  phone: string,
  leadName: string | undefined,
  success: boolean,
  error?: string
) {
  const prog = batchProgressMap.get(batchId);
  if (!prog) return;

  if (success) {
    prog.sent++;
  } else {
    prog.failed++;
    if (error) prog.lastError = error;
  }

  const logEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    leadId,
    phone,
    leadName,
    status: (success ? 'sent' : 'failed') as 'sent' | 'failed',
    error,
    timestamp: new Date().toISOString()
  };

  prog.recentLogs.unshift(logEntry);
  if (prog.recentLogs.length > 30) {
    prog.recentLogs.pop();
  }

  if (prog.sent + prog.failed >= prog.total && prog.status === 'running') {
    prog.status = 'completed';
    prog.completedAt = new Date().toISOString();
    broadcastSocketEvent('campaign_dispatch_completed', prog);
  }

  broadcastSocketEvent('campaign_dispatch_progress', prog);
}

export function isBatchPaused(batchId?: string): boolean {
  return batchId ? pausedBatches.has(batchId) : false;
}

export function isBatchCancelled(batchId?: string): boolean {
  return batchId ? cancelledBatches.has(batchId) : false;
}

// Tira da fila as mensagens desse lote que ainda não começaram a sair.
// Mensagens já em envio (active) não dá pra remover; a flag de cancelamento faz elas pararem.
export async function removeBatchWaitingJobs(batchId: string): Promise<number> {
  cancelledBatches.add(batchId);
  pausedBatches.delete(batchId);
  if (!campaignDispatchQueue) return 0;
  let removed = 0;
  try {
    const jobs = await campaignDispatchQueue.getJobs(['waiting', 'delayed']);
    for (const job of jobs) {
      if (job?.data?.batchId === batchId) {
        await job.remove();
        removed++;
      }
    }
  } catch (err: any) {
    console.error('[Retorno] Erro ao remover mensagens da fila:', err?.message || err);
  }
  return removed;
}

let webhookQueue: Queue<WebhookJobData> | null = null;
let zipImportQueue: Queue<ZipImportJobData> | null = null;
let campaignDispatchQueue: Queue<CampaignDispatchJobData> | null = null;

// Inicializa as filas do BullMQ caso haja conexão Redis
const client = getRedisClient();
if (client) {
  try {
    webhookQueue = new Queue<WebhookJobData>('incoming-webhook-queue', {
      connection: client,
      defaultJobOptions: {
        // 8 tentativas com backoff exponencial (2s,4s,8s… ≈ 4 min): cobre uma oscilação do Postgres sem perder a mensagem
        attempts: 8,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 2000
      }
    });

    zipImportQueue = new Queue<ZipImportJobData>('zip-import-queue', {
      connection: client,
      defaultJobOptions: {
        attempts: 2,
        removeOnComplete: 50,
        removeOnFail: 200
      }
    });

    campaignDispatchQueue = new Queue<CampaignDispatchJobData>('campaign-dispatch-queue', {
      connection: client,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 200,
        removeOnFail: 500
      }
    });

    console.log('✅ [BullMQ] Filas "incoming-webhook-queue", "zip-import-queue" e "campaign-dispatch-queue" registradas no Redis.');
  } catch (err: any) {
    console.warn('⚠️ [BullMQ] Erro ao registrar filas:', err.message);
  }
}

// ============================================================================
// ENQUEUE HELPERS (COM FALLBACK EM MEMÓRIA PARA ZERO DOWNTIME)
// ============================================================================
type WebhookProcessorFn = (data: WebhookJobData) => Promise<void>;
type ZipImportProcessorFn = (data: ZipImportJobData) => Promise<void>;
type CampaignDispatchProcessorFn = (data: CampaignDispatchJobData, ctx?: DispatchContext) => Promise<void>;

let externalWebhookProcessor: WebhookProcessorFn | null = null;
let externalZipProcessor: ZipImportProcessorFn | null = null;
let externalDispatchProcessor: CampaignDispatchProcessorFn | null = null;

export function registerWorkerProcessors(handlers: {
  processWebhook: WebhookProcessorFn;
  processZipImport: ZipImportProcessorFn;
  processCampaignDispatch: CampaignDispatchProcessorFn;
}) {
  externalWebhookProcessor = handlers.processWebhook;
  externalZipProcessor = handlers.processZipImport;
  externalDispatchProcessor = handlers.processCampaignDispatch;

  const redisConn = getRedisClient();
  if (redisConn) {
    // 1. Worker de Webhooks (Concorrência 10). Erro lançado pelo processador = nova tentativa (attempts/backoff da fila).
    const webhookWorker = new Worker<WebhookJobData>('incoming-webhook-queue', async (job: Job<WebhookJobData>) => {
      if (externalWebhookProcessor) {
        await externalWebhookProcessor(job.data);
      }
    }, {
      connection: redisConn,
      concurrency: 10
    });
    webhookWorker.on('failed', (job, err) => {
      const final = job && job.attemptsMade >= (job.opts.attempts || 1);
      console.error(`[BullMQ] Webhook job ${job?.id} falhou (tentativa ${job?.attemptsMade}/${job?.opts.attempts})${final ? ' — DEFINITIVO (ver fila de falhas)' : ', vai tentar de novo'}: ${err.message}`);
    });
    webhookWorker.on('error', (err) => console.warn('[BullMQ] Webhook worker:', err.message));

    // 2. Worker de Importação ZIP (Concorrência 2 para não saturar I/O e RAM)
    new Worker<ZipImportJobData>('zip-import-queue', async (job: Job<ZipImportJobData>) => {
      if (externalZipProcessor) {
        await externalZipProcessor(job.data);
      }
    }, {
      connection: redisConn,
      concurrency: 2
    });

    // 3. Worker de Disparos em Massa — respeita o limite do plano da FluxoAPI, que é POR MINUTO (§A10).
    const dispatchWorker: Worker<CampaignDispatchJobData> = new Worker<CampaignDispatchJobData>('campaign-dispatch-queue', async (job: Job<CampaignDispatchJobData>) => {
      if (job.data.batchId && isBatchCancelled(job.data.batchId)) {
        return;
      }
      while (job.data.batchId && isBatchPaused(job.data.batchId)) {
        await new Promise(r => setTimeout(r, 500));
        if (job.data.batchId && isBatchCancelled(job.data.batchId)) return;
      }

      if (externalDispatchProcessor) {
        try {
          await externalDispatchProcessor(job.data, { attempt: job.attemptsMade + 1, maxAttempts: job.opts.attempts || 1 });
        } catch (err: any) {
          // 429: a API mandou esperar (Retry-After). Pausa a FILA TODA pelo tempo pedido e devolve o job
          // sem gastar tentativa — nada de laço curto martelando a API.
          if (err instanceof FluxoRateLimitedError || err?.name === 'FluxoRateLimitedError') {
            const waitMs = Math.max(1000, (Number(err.retryAfterSec) || 1) * 1000);
            console.warn(`⏳ [Disparo] 429 da FluxoAPI — fila pausada por ${Math.ceil(waitMs / 1000)}s (Retry-After).`);
            await dispatchWorker.rateLimit(waitMs);
            throw Worker.RateLimitError();
          }
          throw err;
        }
      }
    }, {
      connection: redisConn,
      concurrency: 5,
      limiter: {
        max: dispatchRpm(), // mensagens por MINUTO (FLUXO_PLAN_RPM × folga p/ o atendimento manual)
        duration: 60000
      }
    });
    dispatchWorker.on('error', (err) => console.warn('[BullMQ] Dispatch worker:', err.message));

    console.log(`🚀 [BullMQ] Workers inicializados. Disparo limitado a ${dispatchRpm()} msgs/min (plano ${planRpm()}/min).`);
  }
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Roda o processador de webhook em memória com retry (o fallback sem Redis também não pode perder mensagem). */
async function runWebhookInMemoryWithRetry(data: WebhookJobData) {
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (externalWebhookProcessor) await externalWebhookProcessor(data);
      return;
    } catch (e: any) {
      if (attempt === maxAttempts) {
        console.error(`[Fila em memória] Webhook DESCARTADO após ${maxAttempts} tentativas: ${e?.message || e}`);
        return;
      }
      const wait = Math.min(2000 * 2 ** (attempt - 1), 60000);
      console.warn(`[Fila em memória] Webhook falhou (tentativa ${attempt}/${maxAttempts}), nova tentativa em ${wait / 1000}s: ${e?.message || e}`);
      await sleep(wait);
    }
  }
}

/** Roda um disparo em memória: 429 espera o Retry-After; erro transitório tenta de novo (até 3x). */
async function runDispatchInMemoryWithRetry(data: CampaignDispatchJobData) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (externalDispatchProcessor) await externalDispatchProcessor(data, { attempt, maxAttempts });
      return;
    } catch (e: any) {
      if (e instanceof FluxoRateLimitedError || e?.name === 'FluxoRateLimitedError') {
        const waitMs = Math.max(1000, (Number(e.retryAfterSec) || 1) * 1000);
        console.warn(`⏳ [Disparo/memória] 429 — aguardando ${Math.ceil(waitMs / 1000)}s (Retry-After).`);
        await sleep(waitMs);
        attempt--; // 429 não gasta tentativa
        continue;
      }
      if (attempt === maxAttempts) {
        console.error(`Erro no processamento do disparo ${data.phone}:`, e?.message || e);
        return;
      }
      await sleep(2000 * 2 ** (attempt - 1));
    }
  }
}

// 1. Enfileirar Webhook (Fast-Receiver)
// O `add` tem timeout: com o Redis fora, os comandos do ioredis ficam na fila offline para sempre e o
// webhook ficaria pendurado (a FluxoAPI daria timeout). Passou de 3s, cai para a fila em memória (COM retry).
export async function enqueueIncomingWebhook(data: WebhookJobData): Promise<boolean> {
  if (webhookQueue) {
    try {
      await Promise.race([
        webhookQueue.add('meta-webhook-event', data),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout ao enfileirar no Redis (3s)')), 3000))
      ]);
      return true;
    } catch (err: any) {
      console.warn('⚠️ [Queue] Falha ao enfileirar no Redis, usando fallback em memória:', err.message);
    }
  }

  // Fallback assíncrono em memória (com retry; não trava o HTTP 200)
  setImmediate(() => {
    runWebhookInMemoryWithRetry(data).catch((e) => console.error('Erro no processador em memória de webhook:', e));
  });

  return false;
}

// 2. Enfileirar Importação ZIP
export async function enqueueZipImportJob(data: ZipImportJobData): Promise<boolean> {
  if (zipImportQueue) {
    try {
      await zipImportQueue.add('zip-batch-import', data);
      return true;
    } catch (err: any) {
      console.warn('⚠️ [Queue] Falha ao enfileirar ZIP no Redis:', err.message);
    }
  }

  // Fallback assíncrono em memória
  setImmediate(async () => {
    if (externalZipProcessor) {
      try {
        await externalZipProcessor(data);
      } catch (e) {
        console.error('Erro no processador em memória de ZIP:', e);
      }
    }
  });

  return false;
}

// 3. Enfileirar Disparo de Campanha
export async function enqueueCampaignDispatchJob(data: CampaignDispatchJobData): Promise<boolean> {
  if (campaignDispatchQueue) {
    try {
      await campaignDispatchQueue.add('campaign-message-send', data);
      return true;
    } catch (err: any) {
      console.warn('⚠️ [Queue] Falha ao enfileirar disparo no Redis:', err.message);
    }
  }

  // Fallback assíncrono em memória
  setImmediate(() => {
    runDispatchInMemoryWithRetry(data).catch((e) => console.error('Erro no processador em memória de campanha:', e));
  });

  return false;
}

// 4. Enfileirar Lote Completo de Disparos com Pacing de Velocidade Controlável
// A velocidade pedida é SEMPRE limitada ao teto do plano (FLUXO_PLAN_RPM, por MINUTO — §A10).
export async function enqueueCampaignDispatchBatch(
  jobs: CampaignDispatchJobData[],
  speedPerSecond?: number
): Promise<{ enqueued: number; speed: number; estimatedSeconds: number; requestedSpeed?: number; cappedByPlan: boolean }> {
  const requested = Number(speedPerSecond);
  const safeSpeed = effectiveSpeedPerSecond(Number.isFinite(requested) && requested > 0 ? requested : activeDispatchSpeed);
  const cappedByPlan = Number.isFinite(requested) && requested > safeSpeed + 1e-9;
  const estimatedSecs = estimateSeconds(jobs.length, safeSpeed);

  console.log(`🚀 [Queue] Enfileirando lote de ${jobs.length} disparos a ${safeSpeed.toFixed(2)} msgs/s (${Math.round(safeSpeed * 60)}/min${cappedByPlan ? `; pedido ${requested}/s foi reduzido ao teto do plano` : ''}). Duração estimada: ${estimatedSecs}s`);

  if (campaignDispatchQueue) {
    try {
      const bullJobs = jobs.map((jobData, idx) => ({
        name: 'campaign-message-send',
        data: {
          ...jobData,
          speedPerSecond: safeSpeed,
          jobIndex: idx,
          totalJobs: jobs.length
        },
        opts: {
          delay: delayForIndex(idx, safeSpeed) // pacing exato na velocidade efetiva
        }
      }));

      await campaignDispatchQueue.addBulk(bullJobs);
      return { enqueued: jobs.length, speed: safeSpeed, estimatedSeconds: estimatedSecs, requestedSpeed: Number.isFinite(requested) ? requested : undefined, cappedByPlan };
    } catch (err: any) {
      console.warn('⚠️ [Queue] Falha ao enfileirar lote no Redis, usando esteira em memória:', err.message);
    }
  }

  // Fallback assíncrono em memória com throttle exato
  setImmediate(async () => {
    const delayPerMsg = Math.max(10, Math.floor(1000 / safeSpeed));
    for (let i = 0; i < jobs.length; i++) {
      const jobData = jobs[i];
      if (jobData.batchId && isBatchCancelled(jobData.batchId)) {
        console.log(`🛑 [Queue Memory] Lote ${jobData.batchId} cancelado pelo usuário.`);
        break;
      }

      while (jobData.batchId && isBatchPaused(jobData.batchId)) {
        await new Promise(r => setTimeout(r, 500));
        if (jobData.batchId && isBatchCancelled(jobData.batchId)) break;
      }

      await runDispatchInMemoryWithRetry({
        ...jobData,
        speedPerSecond: safeSpeed,
        jobIndex: i,
        totalJobs: jobs.length
      });

      if (i < jobs.length - 1) {
        await new Promise(r => setTimeout(r, delayPerMsg));
      }
    }
  });

  return { enqueued: jobs.length, speed: safeSpeed, estimatedSeconds: estimatedSecs, requestedSpeed: Number.isFinite(requested) ? requested : undefined, cappedByPlan };
}
// Status do Redis e das filas
export async function getQueueSystemStatus() {
  const status = {
    redisConfigured: !!REDIS_URL,
    redisConnected: isRedisConnected,
    provider: isRedisConnected ? 'BullMQ + Redis (Railway)' : 'In-Memory Async Queue (Fallback)',
    queues: {
      webhook: { active: 0, waiting: 0 },
      zipImport: { active: 0, waiting: 0 },
      campaignDispatch: { active: 0, waiting: 0 }
    }
  };

  if (isRedisConnected) {
    try {
      if (webhookQueue) {
        const counts = await webhookQueue.getJobCounts('active', 'waiting');
        status.queues.webhook = { active: counts.active || 0, waiting: counts.waiting || 0 };
      }
      if (zipImportQueue) {
        const counts = await zipImportQueue.getJobCounts('active', 'waiting');
        status.queues.zipImport = { active: counts.active || 0, waiting: counts.waiting || 0 };
      }
      if (campaignDispatchQueue) {
        const counts = await campaignDispatchQueue.getJobCounts('active', 'waiting');
        status.queues.campaignDispatch = { active: counts.active || 0, waiting: counts.waiting || 0 };
      }
    } catch (e) {
      // Ignorar erro se redis oscilar
    }
  }

  return status;
}
