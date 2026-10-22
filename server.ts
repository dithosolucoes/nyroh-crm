// Carrega o .env local ANTES de qualquer módulo ler process.env (na Railway as variáveis já vêm do ambiente)
import 'dotenv/config';
import express from 'express';
import http from 'http';
import crypto from 'crypto';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import JSZip from 'jszip';
import pg from 'pg';
import { Lead, CallLog, ColumnStatus, PIPELINE_COLUMNS, CustomTag, Salesperson, DistributeLeadsParams, User, AuditLog, QuickReply } from './src/types.js';
import { getLeadNiche } from './src/lib/niche.js';
import { hashPassword, verifyPassword, generateSessionToken, DEFAULT_USERS, StoredUser, isUserAdmin } from './src/lib/serverAuth.js';
import { performWebsiteAudit } from './src/lib/auditEngine.js';
import { executeFluxoRequest, downloadFluxoMediaBinary, prepareOutboundMedia, fluxoInstancePath, hasFfmpeg } from './src/lib/fluxoClient.js';
import type { FluxoApiResult } from './src/lib/fluxoClient.js';
import { verifyFluxoWebhook } from './src/lib/webhookAuth.js';
import { detectOptOut, sanitizeTemplateVariable } from './src/lib/leadIntent.js';
import { arePhonesEquivalent, normalizeE164Phone, phoneDigitVariants, formatAndValidateE164Phone } from './src/lib/phone.js';
import { getUploadsDir, getInboxDir, INBOX_SUBDIR, isUploadsDirDurable, publicBaseUrl, saveMediaBuffer, extensionFor } from './src/lib/mediaStorage.js';
import { statusRank, shouldApplyStatus, normalizeStatus } from './src/lib/fluxoStatus.js';
import { describeFluxoError } from './src/lib/fluxoErrors.js';
import { buildTemplatePayload, type CatalogTemplate, type TemplateValues } from './src/lib/fluxoTemplate.js';
import { WINDOW_MS, windowExpiryFromInbound, latestExpiry, isWindowOpen } from './src/lib/windowUtil.js';
import { effectiveSpeedPerSecond, maxDispatchPerSecond, dispatchRpm, planRpm, FluxoRateLimitedError } from './src/lib/dispatchRate.js';
import {
  initSocketServer,
  enqueueIncomingWebhook,
  enqueueZipImportJob,
  enqueueCampaignDispatchJob,
  enqueueCampaignDispatchBatch,
  initBatchProgress,
  getBatchProgress,
  pauseBatchProgress,
  resumeBatchProgress,
  cancelBatchProgress,
  setCampaignSpeed,
  getCampaignSpeed,
  recordBatchJobResult,
  registerWorkerProcessors,
  getQueueSystemStatus,
  broadcastSocketEvent,
  broadcastToLead,
  registerSseBridge
} from './server/redisQueue.js';

const app = express();
const PORT = Number(process.env.NYROH_PORT) || (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID
  ? (Number(process.env.PORT) || 3000)
  : 3000);

// Pasta de mídia (UPLOADS_DIR > volume da Railway > ./uploads). Ver src/lib/mediaStorage.ts
const UPLOADS_DIR = getUploadsDir();

// Enable HTTP gzip/brotli compression for fast network payloads
app.use(compression() as any);

app.use(cookieParser());
app.use(express.json({
  limit: '50mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Mídia de SAÍDA: pública por necessidade — a Meta baixa o arquivo por esta URL no envio.
// Nomes aleatórios (UUID). As pastas tmp-zips (ZIPs de leads) e inbox (mídia recebida
// dos clientes) NUNCA são expostas aqui.
app.use('/uploads/tmp-zips', (_req, res) => res.status(404).end());
app.use(`/uploads/${INBOX_SUBDIR}`, (_req, res) => res.status(404).end());
app.use('/uploads', express.static(UPLOADS_DIR, {
  index: false,
  dotfiles: 'deny',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}));

// Mídia de ENTRADA (foto, áudio, documento que o cliente mandou): só para quem está logado.
// Antes caía no /uploads público e abria para qualquer pessoa com o link.
app.get(`/media/${INBOX_SUBDIR}/:file`, async (req: any, res) => {
  const user = req.user || (await resolveSessionUser(
    req.cookies?.crm_session || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  ));
  if (!user) {
    return res.status(401).json({ error: 'Faça login para abrir este arquivo.' });
  }
  const name = path.basename(String(req.params.file || ''));
  if (!name || name.startsWith('.')) return res.status(404).end();
  const filePath = path.join(getInboxDir(), name);
  if (!filePath.startsWith(getInboxDir())) return res.status(404).end();
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.sendFile(filePath);
});

// Health check endpoints for Railway / Render / Cloud Run
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/api/health', (req, res) => {
  // /health (acima) continua respondendo na hora para o healthcheck da Railway; aqui o estado do banco, para monitoramento
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), database: { connected: usePostgres, starting: isDatabaseStarting() } });
});

// Multer memory storage for small uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Garantir que a pasta temporária de descompactação de ZIP existe
const TMP_ZIPS_DIR = path.join(UPLOADS_DIR, 'tmp-zips');
if (!fs.existsSync(TMP_ZIPS_DIR)) {
  fs.mkdirSync(TMP_ZIPS_DIR, { recursive: true });
}

// Multer disk storage para stream-based processing sem estourar memória RAM na Railway
const diskUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TMP_ZIPS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.zip';
      cb(null, `zip_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`);
    }
  }),
  limits: { fileSize: 1500 * 1024 * 1024 } // 1.5 GB limit (suporta arquivos ZIP pesados com segurança)
});

// ============================================================================
// TRACKING DE IMPORTAÇÃO DE LEADS & SAFRAS (ESTADO AO VIVO + POLLING + SOCKETS)
// ============================================================================
export interface CampaignImportProgress {
  jobId: string;
  batchId?: string;
  batchName?: string;
  fileName?: string;
  fileSizeBytes?: number;
  stage: 'uploading' | 'extracting' | 'parsing' | 'validating' | 'saving_db' | 'completed' | 'error';
  percent: number;
  statusText: string;
  processedFiles: number;
  totalFiles: number;
  totalLeadsFound: number;
  savedLeads: number;
  validMobiles: number;
  landlines: number;
  withNyrohUrl: number;
  withWebsite: number;
  currentBatchIndex?: number;
  totalBatches?: number;
  error?: string;
  logs: Array<{ timestamp: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }>;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}

const campaignImportProgressMap = new Map<string, CampaignImportProgress>();

export function updateCampaignImportProgress(
  jobId: string,
  updates: Partial<CampaignImportProgress>,
  newLog?: { text: string; type?: 'info' | 'success' | 'warn' | 'error' }
) {
  let existing = campaignImportProgressMap.get(jobId);
  if (!existing) {
    existing = {
      jobId,
      stage: 'extracting',
      percent: 0,
      statusText: 'Iniciando processamento...',
      processedFiles: 0,
      totalFiles: 0,
      totalLeadsFound: 0,
      savedLeads: 0,
      validMobiles: 0,
      landlines: 0,
      withNyrohUrl: 0,
      withWebsite: 0,
      logs: [],
      startedAt: Date.now(),
      updatedAt: Date.now()
    };
    campaignImportProgressMap.set(jobId, existing);
  }

  if (newLog) {
    const timeStr = new Date().toLocaleTimeString('pt-BR');
    existing.logs.push({
      timestamp: timeStr,
      text: newLog.text,
      type: newLog.type || 'info'
    });
    if (existing.logs.length > 50) existing.logs.shift();
  }

  Object.assign(existing, updates, { updatedAt: Date.now() });

  // Broadcast via Socket.io
  broadcastSocketEvent('campaign_import_progress', existing);
  return existing;
}

// Default seed tags
const DEFAULT_CUSTOM_TAGS: CustomTag[] = [
  { id: 'tag-atendeu', name: 'Atendeu', color: '#15803d', bgColor: '#dcfce7' },
  { id: 'tag-nao-atendeu', name: 'Não Atendeu', color: '#b91c1c', bgColor: '#fee2e2' },
  { id: 'tag-caixa-postal', name: 'Caixa Postal', color: '#b45309', bgColor: '#fef3c7' },
  { id: 'tag-secretaria', name: 'Secretária barrou', color: '#c2410c', bgColor: '#ffedd5' },
  { id: 'tag-whatsapp', name: 'WhatsApp enviado', color: '#4338ca', bgColor: '#e0e7ff' },
  { id: 'tag-retornar', name: 'Pediu para retornar', color: '#7e22ce', bgColor: '#f3e8ff' },
  { id: 'tag-ligar-14h', name: 'Ligar após 14h', color: '#0369a1', bgColor: '#e0f2fe' },
  { id: 'tag-ocupado', name: 'Ocupado', color: '#be123c', bgColor: '#ffe4e6' },
];

// Default Salesperson: Thomas (Vendedor Principal)
const DEFAULT_SALESPERSON: Salesperson = {
  id: 'seller-thomas',
  name: 'Thomas',
  email: 'thomas@empresa.com',
  phone: '',
  color: '#0284c7',
  bgColor: '#e0f2fe',
  isDefault: true,
  pctInteressados: 50,
  pctNaoInteressados: 50,
  limiteLeadsDiario: 50,
  leadsRecebidosHoje: 0,
  createdAt: new Date().toISOString()
};

// Default Quick Replies (Atalhos com '/')
const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  {
    id: 'qr_1',
    shortcut: 'ola',
    title: 'Apresentação Inicial',
    type: 'text',
    content: 'Olá! Tudo bem? Me chamo Thomas da Nyroh, como posso te ajudar hoje?'
  },
  {
    id: 'qr_2',
    shortcut: 'site',
    title: 'Demonstração de Site Novo',
    type: 'text',
    content: 'Preparamos uma versão prévia moderna e responsiva do novo site da sua empresa. Você pode ver aqui: {{site}}'
  },
  {
    id: 'qr_3',
    shortcut: 'proposta',
    title: 'Envio de Proposta Comercial',
    type: 'text',
    content: 'Segue o resumo da nossa proposta para destacar a sua empresa no Google e captar clientes todos os dias pelo WhatsApp.'
  },
  {
    id: 'qr_4',
    shortcut: 'reuniao',
    title: 'Agendamento de Demonstração',
    type: 'text',
    content: 'Você teria 10 minutos livres hoje à tarde para eu te mostrar como ficou o site em tempo real?'
  }
];

const memoryQuickRepliesMap = new Map<string, QuickReply>(
  DEFAULT_QUICK_REPLIES.map(qr => [qr.id, qr])
);

// Helper: gera login (@nyroh.com) e uma senha inicial ALEAT\u00d3RIA para o vendedor.
//
// Antes a senha era `<primeironome>123` \u2014 previs\u00edvel por qualquer pessoa que soubesse o
// nome do vendedor, e escrita no c\u00f3digo-fonte. Agora cada vendedor nasce com uma senha
// sorteada, mostrada UMA vez a quem o cadastrou, para repassar ao vendedor.
// `legacyPredictablePassword` existe s\u00f3 para o diagn\u00f3stico que avisa quem ainda usa a antiga.
export function generateInitialPassword(): string {
  return crypto.randomBytes(9).toString('base64url');
}

export function getSalespersonCredentials(name: string, customEmail?: string) {
  const firstName = name
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '') || 'vendedor';

  const defaultEmail = `${firstName}@nyroh.com`;
  const finalEmail = (customEmail && customEmail.trim() ? customEmail.trim() : defaultEmail).toLowerCase();
  return {
    firstName,
    email: finalEmail,
    defaultPassword: generateInitialPassword(),
    legacyPredictablePassword: `${firstName}123`
  };
}

// Database Connection setup
let pgPool: pg.Pool | null = null;
let usePostgres = false;

// Prontidão do banco (T80). Enquanto há DATABASE_URL configurada e a 1ª tentativa de conexão não
// terminou, os webhooks e envios respondem 503 — assim a FluxoAPI REENTREGA o evento depois
// (política 0s/30s/2min/10min/1h/6h/24h) em vez de a mensagem ficar só na memória e se perder.
let dbBootDone = false;
let dbReconnectTimer: NodeJS.Timeout | null = null;

function getDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_PRIVATE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    process.env.DATABASE_PUBLIC_URL ||
    ''
  ).trim();
}

function isDatabaseStarting(): boolean {
  return Boolean(getDatabaseUrl()) && !dbBootDone;
}

/**
 * Middleware: recusa com 503 enquanto o banco ainda está subindo e, em produção,
 * recusa também quando NÃO há banco.
 *
 * Antes: se o Postgres falhasse, o servidor seguia em memória e aceitava trabalho
 * (leads, mensagens, disparos) que sumia no primeiro restart, sem ninguém saber.
 * Perder em silêncio é pior do que recusar.
 */
function requireDatabaseReady(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (isDatabaseStarting()) {
    res.setHeader('Retry-After', '5');
    return res.status(503).json({
      error: { code: 'database_starting', message: 'O banco de dados ainda está iniciando. Tente novamente em instantes.' }
    });
  }
  if (!usePostgres && IS_PRODUCTION) {
    res.setHeader('Retry-After', '30');
    return res.status(503).json({
      error: {
        code: 'database_unavailable',
        message: 'Sem banco de dados. O servidor recusa gravar para não perder dados no restart.'
      }
    });
  }
  return next();
}

// Default in-memory database store
const memoryLeadsMap = new Map<string, Lead>();
const memoryCallLogsMap = new Map<string, CallLog[]>();
const memoryTagsMap = new Map<string, CustomTag>(
  DEFAULT_CUSTOM_TAGS.map(t => [t.id, t])
);
const memorySalespeopleMap = new Map<string, Salesperson>([
  [DEFAULT_SALESPERSON.id, DEFAULT_SALESPERSON]
]);
const memoryUsersMap = new Map<string, StoredUser>(
  DEFAULT_USERS.map(u => [u.id, { ...u }])
);
const memorySessionsMap = new Map<string, { userId: string; expiresAt: number }>();

// FluxoAPI in-memory store
interface StoredMetaTemplate {
  id: string;
  name: string;
  category: 'MARKETING' | 'UTILITY';
  language: string;
  status: 'DRAFT' | 'APPROVED' | 'PENDING' | 'REJECTED';
  components: any[];
  usageCount: number;
  qualityScore: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  rejectedReason?: string;
  createdAt: string;
  submittedToMeta: boolean;
}

interface FluxoWebhookEvent {
  id: string;
  receivedAt: string;
  type: string;
  summary: string;
  payload: any;
}

const memoryFluxoConfig = {
  apiKey: (process.env.FLUXO_KEY || '').trim(),
  apiSecret: (process.env.FLUXO_SECRET || '').trim(),
  instanceId: (process.env.FLUXO_INSTANCE_ID || '').trim()
};

const memoryMetaConfig = {
  accessToken: process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || '',
  wabaId: process.env.META_WABA_ID || process.env.WHATSAPP_WABA_ID || '',
  phoneNumberId: process.env.META_PHONE_NUMBER_ID || '',
  verifyToken: process.env.META_VERIFY_TOKEN || 'crm_webhook_meta_token'
};

const lastFluxoWebhookEvents: FluxoWebhookEvent[] = [];

// Clean initial store - no mock templates, loaded purely from PostgreSQL or Meta instance
const memoryTemplates: StoredMetaTemplate[] = [];

// Campaign / Disparos in-memory stores
export interface StoredCampaignBatch {
  id: string;
  name: string;
  totalLeads: number;
  validMobiles: number;
  landlines: number;
  withNyrohUrl: number;
  withWebsite: number;
  status: 'draft' | 'dispatched' | 'quarantine' | 'completed';
  templateName: string;
  quarantineHours: number;
  quarantineStartedAt?: string;
  quarantineEndsAt?: string;
  allowedClosers: string[];
  hotLeadsRetainedByAdmin: boolean;
  dispatchedCount: number;
  hotCount: number;
  coldCount: number;
  optOutCount: number;
  createdAt: string;
}

export interface StoredCampaignLead {
  id: string;
  batchId: string;
  name: string;
  phoneNumber: string;
  isMobile: boolean;
  publicUrl?: string;
  website?: string;
  niche?: string;
  status: 'STAGING' | 'DISPARADO' | 'QUARENTENA' | 'INTERESSADO' | 'FRIO' | 'DESCARTADO' | 'FALHA';
  quarantineExpiresAt?: string;
  sentAt?: string;
  respondedAt?: string;
  responsePreview?: string;
  assignedSalespersonId?: string;
  assignedSalespersonName?: string;
  createdAt: string;
}

const memoryCampaignBatchesMap = new Map<string, StoredCampaignBatch>();
const memoryCampaignLeadsMap = new Map<string, StoredCampaignLead>();

export interface StoredCampaignCopyTemplate {
  id: string;
  name: string;
  description?: string;
  category?: 'prospeccao' | 'followup' | 'reativacao' | 'personalizado';
  var1: string;
  var2: string;
  var3: string;
  createdAt: string;
  updatedAt?: string;
  isDefault?: boolean;
}

const memoryCampaignCopyTemplatesMap = new Map<string, StoredCampaignCopyTemplate>([
  [
    'tpl_prospeccao_proativo',
    {
      id: 'tpl_prospeccao_proativo',
      name: 'Abordagem Proativa do Site sem Pedir (Padrão Oficial Meta)',
      description: 'Quebra de padrão provocativa com link Nyroh e solicitação de feedback, 100% dentro dos limites da Meta.',
      category: 'prospeccao',
      var1: '{nome}! Bom diaaa! Ótima semana 😄 Falo com o responsável pela {empresa}?',
      var2: 'Eu sou {vendedor} e queria te fazer uma pergunta: você ficaria chateado se eu tivesse criado um site para a {empresa} sem pedir? 😂',
      var3: 'Desenvolvi uma prévia exclusiva para vocês: 🔗 {site_novo}',
      createdAt: new Date().toISOString(),
      isDefault: true
    }
  ],
  [
    'tpl_redesign_moderno',
    {
      id: 'tpl_redesign_moderno',
      name: 'Redesign Moderno & Velocidade no Celular',
      description: 'Foco em clientes que precisam de versão rápida para celular e botão WhatsApp direto.',
      category: 'prospeccao',
      var1: '{nome}! Tudo bem por aí? Falo com a liderança da {empresa}?',
      var2: 'Aqui é o {vendedor}. Redesenhei uma versão nova do site de vocês para carregar instantâneo no celular!',
      var3: 'Dá uma olhada no comparativo direto: 🔗 {site_novo}',
      createdAt: new Date().toISOString()
    }
  ],
  [
    'tpl_reativacao_curta',
    {
      id: 'tpl_reativacao_curta',
      name: 'Abordagem Direta & Curta (Objetiva)',
      description: 'Mensagem ultra-rápida e direta ao ponto para alta taxa de resposta.',
      category: 'prospeccao',
      var1: '{nome}, tudo bem? Aqui é o {vendedor}, falo com o dono da {empresa}?',
      var2: 'Desenvolvi uma prévia exclusiva para a {empresa} com foco em atrair mais clientes no WhatsApp.',
      var3: 'Acesse a prévia aqui: 🔗 {site_novo}',
      createdAt: new Date().toISOString()
    }
  ]
]);


// Lead Chat Messages store (real-time chat with leads)
export interface LeadChatMessage {
  id: string;
  leadId: string;
  sender: 'lead' | 'salesperson' | 'system';
  senderName?: string;
  text: string;
  templateName?: string;
  timestamp: string;
  status?: 'sending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  /** Posto do status (queued 0 → sent 1 → delivered 2 → read 3; failed 9). Só cresce. */
  statusRank?: number;
  /** ID da mensagem na FluxoAPI (msg_…); casa com o `message_id` dos webhooks. */
  remoteMessageId?: string;
  conversationId?: string;
  /** true quando o dono respondeu pelo app do celular (coexistência). */
  sentFromPhone?: boolean;
  error?: any;
  isAudio?: boolean;
  audioUrl?: string;
  audioDuration?: number;
  mediaType?: 'audio' | 'image' | 'document' | 'video';
  mediaUrl?: string;
  mediaName?: string;
}

/**
 * Cache de mensagens em memória.
 *
 * Ele existe para o modo SEM banco e como atalho de leitura. O problema: recebia TODA mensagem
 * de TODA conversa e nunca era limpo, mesmo com PostgreSQL ligado — num disparo grande a memória
 * subia até o processo morrer (OOM) e derrubar o CRM inteiro.
 *
 * Agora tem teto: no máximo MAX_CACHED_CONVERSATIONS conversas e MAX_CACHED_MESSAGES mensagens
 * por conversa. Quando passa do teto, a conversa menos usada sai (o banco continua tendo tudo).
 */
const MAX_CACHED_CONVERSATIONS = 500;
const MAX_CACHED_MESSAGES_PER_LEAD = 300;

class LeadMessageCache {
  private store = new Map<string, LeadChatMessage[]>();

  get(leadId: string): LeadChatMessage[] | undefined {
    const v = this.store.get(leadId);
    if (v) {
      // Reinsere para marcar como "usada agora" (o Map mantém ordem de inserção).
      this.store.delete(leadId);
      this.store.set(leadId, v);
    }
    return v;
  }

  has(leadId: string): boolean {
    return this.store.has(leadId);
  }

  set(leadId: string, messages: LeadChatMessage[]): void {
    const capped = messages.length > MAX_CACHED_MESSAGES_PER_LEAD
      ? messages.slice(-MAX_CACHED_MESSAGES_PER_LEAD)
      : messages;
    this.store.delete(leadId);
    this.store.set(leadId, capped);
    while (this.store.size > MAX_CACHED_CONVERSATIONS) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  delete(leadId: string): boolean {
    return this.store.delete(leadId);
  }

  entries(): IterableIterator<[string, LeadChatMessage[]]> {
    return this.store.entries();
  }

  get size(): number {
    return this.store.size;
  }
}

const memoryLeadMessagesMap = new LeadMessageCache();

// Realtime Server-Sent Events (SSE) Client Pool
/**
 * Clientes SSE, cada um com a identidade de quem abriu a conexão.
 *
 * Antes era só um Set de respostas e TODO evento ia para TODO navegador conectado: cada
 * vendedor recebia, em tempo real, as mensagens de todos os leads de todos os colegas —
 * com direito a toast e som. Agora o evento só sai para o admin e para o dono do lead.
 */
interface SseClient {
  res: express.Response;
  salespersonId?: string | null;
  isAdmin: boolean;
}
const sseClients = new Set<SseClient>();

// Buffer circular de eventos SSE com ID crescente: quando o navegador reconecta ele manda o
// cabeçalho Last-Event-ID e o servidor reenvia o que ele perdeu (sem isso, queda de conexão = evento perdido).
let sseEventSeq = 0;
const SSE_BUFFER_MAX = 1000;
const sseEventBuffer: Array<{ id: number; payload: string; owner?: string | null }> = [];

/**
 * `owner` = vendedor dono do assunto do evento.
 *   - undefined  → evento da operação (status da instância, equipe, disparo): admin apenas.
 *   - null       → evento sem dono definido (lead sem carteira): admin apenas.
 *   - '<id>'     → vai para o admin e para esse vendedor.
 * `broadcastAll: true` → evento sem dado de lead que todos podem ver.
 */
export function broadcastSSE(type: string, data: any, opts: { owner?: string | null; broadcastAll?: boolean } = {}) {
  const id = ++sseEventSeq;
  const payload = `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  const owner = opts.broadcastAll ? undefined : opts.owner ?? null;
  sseEventBuffer.push({ id, payload, owner: opts.broadcastAll ? 'ALL' : owner });
  if (sseEventBuffer.length > SSE_BUFFER_MAX) sseEventBuffer.shift();
  for (const client of sseClients) {
    if (!sseClientMaySee(client, opts)) continue;
    try {
      client.res.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// A fila (BullMQ) emite progresso de disparo por socket; a tela escuta por SSE.
// Esta ponte faz os dois conversarem — sem ela a barra de progresso nunca se mexia.
registerSseBridge((type, data, opts) => broadcastSSE(type, data, opts || { owner: null }));

function sseClientMaySee(client: SseClient, opts: { owner?: string | null; broadcastAll?: boolean }): boolean {
  if (opts.broadcastAll) return true;
  if (client.isAdmin) return true;
  if (!opts.owner) return false;
  return String(client.salespersonId || '') === String(opts.owner);
}

/**
 * Evento ligado a um lead: descobre o dono e entrega só para ele (e para o admin).
 * Usado em mensagem recebida/enviada, mudança de status e atualização do lead.
 */
async function broadcastLeadSSE(type: string, data: any, leadId?: string | null) {
  // Nunca rejeita: um aviso em tempo real que falha não pode derrubar o processamento
  // da mensagem (nem o servidor, já que parte das chamadas é disparada sem await).
  try {
    if (!leadId) {
      broadcastSSE(type, data, { owner: null });
      return;
    }
    const owner = await getLeadOwnerId(leadId).catch(() => undefined);
    broadcastSSE(type, data, { owner: owner ?? null });
  } catch (err: any) {
    console.warn('[SSE] Falha ao transmitir evento', type, err?.message || err);
  }
}

const memoryAuditLogs: AuditLog[] = [
  {
    id: 'log-init-1',
    userName: 'Sistema',
    userRole: 'system',
    action: 'INICIALIZAÇÃO_SISTEMA',
    details: 'CRM e motor de segurança inicializados com sucesso.',
    ip: '127.0.0.1',
    createdAt: new Date().toISOString()
  }
];

async function initDatabase(retries = 5, delayMs = 3000) {
  const dbUrl = getDatabaseUrl();

  if (!dbUrl) {
    console.log('ℹ️ Nenhuma variável de banco PostgreSQL encontrada (DATABASE_URL, POSTGRES_URL, etc.). Executando em modo in-memory.');
    usePostgres = false;
    dbBootDone = true;
    return;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    // Try SSL configs: first with rejectUnauthorized: false, then ssl: false if internal
    const sslConfigs = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')
      ? [false]
      : [{ rejectUnauthorized: false }, false];

    for (const sslConfig of sslConfigs) {
      let pool: pg.Pool | null = null;
      try {
        console.log(`[Database] Tentando conexão ao PostgreSQL (${attempt}/${retries}, ssl: ${JSON.stringify(sslConfig)})...`);

        pool = new pg.Pool({
          connectionString: dbUrl,
          ssl: sslConfig,
          connectionTimeoutMillis: 8000,
          // Dimensionado para os workers (webhook 10 + disparo 15) + requisições HTTP sem esgotar o pool
          max: Number(process.env.PG_POOL_MAX) || 20,
          idleTimeoutMillis: 30000,
          keepAlive: true
        });

        pool.on('error', (err) => {
          console.error('Erro no cliente PostgreSQL idle:', err);
        });

        const client = await pool.connect();

        // Auto-create tables if they don't exist & run migrations
        await client.query(`
          CREATE TABLE IF NOT EXISTS salespeople (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255),
            phone VARCHAR(100),
            color VARCHAR(100) NOT NULL DEFAULT '#0284c7',
            bg_color VARCHAR(100) NOT NULL DEFAULT '#e0f2fe',
            is_default BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS leads (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            phone_number VARCHAR(100) NOT NULL,
            public_url TEXT,
            column_status VARCHAR(100) NOT NULL DEFAULT 'Leads',
            salesperson_id VARCHAR(255) DEFAULT 'seller-thomas',
            salesperson_name VARCHAR(255) DEFAULT 'Thomas',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS calls (
            id VARCHAR(255) PRIMARY KEY,
            lead_id VARCHAR(255) NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
            tag VARCHAR(100) NOT NULL,
            comment TEXT,
            duration_seconds INT DEFAULT 0,
            follow_up_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          ALTER TABLE calls ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;
          ALTER TABLE calls ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS salesperson_id VARCHAR(255) DEFAULT 'seller-thomas';
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS salesperson_name VARCHAR(255) DEFAULT 'Thomas';
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS niche VARCHAR(255);
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS categories TEXT;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS sub_status VARCHAR(255);
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS loss_reason VARCHAR(255);
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS website TEXT;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS can_generate_audit_pdf BOOLEAN DEFAULT TRUE;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS whatsapp_type VARCHAR(50) DEFAULT 'business';

          CREATE TABLE IF NOT EXISTS custom_tags (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) UNIQUE NOT NULL,
            color VARCHAR(100) NOT NULL,
            bg_color VARCHAR(100) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          -- Seed default primary salesperson (Thomas)
          INSERT INTO salespeople (id, name, email, color, bg_color, is_default)
          VALUES ('seller-thomas', 'Thomas', 'thomas@empresa.com', '#0284c7', '#e0f2fe', TRUE)
          ON CONFLICT (id) DO NOTHING;

          -- Backfill any leads without a salesperson
          UPDATE leads 
          SET salesperson_id = 'seller-thomas', salesperson_name = 'Thomas'
          WHERE salesperson_id IS NULL OR salesperson_id = '';

          -- Performance Indexes for Railway PostgreSQL
          CREATE INDEX IF NOT EXISTS idx_leads_salesperson_id ON leads(salesperson_id);
          CREATE INDEX IF NOT EXISTS idx_leads_column_status ON leads(column_status);
          CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up ON leads(next_follow_up_at);
          CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON calls(lead_id);
          CREATE INDEX IF NOT EXISTS idx_calls_lead_created ON calls(lead_id, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_number);

          -- Security, Users, Roles and Audit Logs
          CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            password_salt VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'salesperson',
            salesperson_id VARCHAR(255),
            active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS audit_logs (
            id VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(255),
            user_name VARCHAR(255),
            user_role VARCHAR(50),
            action VARCHAR(255) NOT NULL,
            details TEXT,
            ip VARCHAR(100),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS auth_sessions (
            token VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
          CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
          CREATE INDEX IF NOT EXISTS idx_leads_salesperson ON leads(salesperson_id);
          CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(column_status);
          CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_calls_lead ON calls(lead_id);
          CREATE INDEX IF NOT EXISTS idx_calls_created ON calls(created_at DESC);

          CREATE TABLE IF NOT EXISTS system_settings (
            key VARCHAR(255) PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS meta_templates (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) UNIQUE NOT NULL,
            category VARCHAR(50) NOT NULL,
            language VARCHAR(50) NOT NULL DEFAULT 'pt_BR',
            status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
            components JSONB NOT NULL,
            usage_count INT NOT NULL DEFAULT 0,
            quality_score VARCHAR(50) NOT NULL DEFAULT 'GREEN',
            rejected_reason TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          ALTER TABLE meta_templates ADD COLUMN IF NOT EXISTS usage_count INT NOT NULL DEFAULT 0;
          ALTER TABLE meta_templates ADD COLUMN IF NOT EXISTS quality_score VARCHAR(50) NOT NULL DEFAULT 'GREEN';
          ALTER TABLE meta_templates ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

          CREATE TABLE IF NOT EXISTS campaign_batches (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            total_leads INT DEFAULT 0,
            valid_mobiles INT DEFAULT 0,
            landlines INT DEFAULT 0,
            with_nyroh_url INT DEFAULT 0,
            with_website INT DEFAULT 0,
            status VARCHAR(50) DEFAULT 'draft',
            template_name VARCHAR(255) DEFAULT 'notificacao_pedido_atendimento',
            quarantine_hours INT DEFAULT 4,
            quarantine_started_at TIMESTAMP WITH TIME ZONE,
            quarantine_ends_at TIMESTAMP WITH TIME ZONE,
            allowed_closers JSONB DEFAULT '["seller-thomas"]'::jsonb,
            hot_retained_by_admin BOOLEAN DEFAULT TRUE,
            dispatched_count INT DEFAULT 0,
            hot_count INT DEFAULT 0,
            cold_count INT DEFAULT 0,
            opt_out_count INT DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS selected_copy_id VARCHAR(255);
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS copy_var1 TEXT;
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS copy_var2 TEXT;
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS copy_var3 TEXT;

          CREATE TABLE IF NOT EXISTS campaign_copy_templates (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            category VARCHAR(50) DEFAULT 'prospeccao',
            var1 TEXT NOT NULL,
            var2 TEXT NOT NULL,
            var3 TEXT NOT NULL,
            is_default BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          -- Inserir templates padrão na tabela se ainda não existirem
          INSERT INTO campaign_copy_templates (id, name, description, category, var1, var2, var3, is_default)
          VALUES 
            (
              'tpl_prospeccao_proativo',
              'Abordagem Proativa do Site sem Pedir (Padrão Oficial Meta)',
              'Quebra de padrão provocativa com link Nyroh e solicitação de feedback, 100% dentro dos limites da Meta.',
              'prospeccao',
              '{nome}! Bom diaaa! Ótima semana 😄 Falo com o responsável pela {empresa}?',
              'Eu sou {vendedor} e queria te fazer uma pergunta: você ficaria chateado se eu tivesse criado um site para a {empresa} sem pedir? 😂',
              'Desenvolvi uma prévia exclusiva para vocês: 🔗 {site_novo}',
              TRUE
            ),
            (
              'tpl_redesign_moderno',
              'Redesign Moderno & Velocidade no Celular',
              'Foco em clientes que precisam de versão rápida para celular e botão WhatsApp direto.',
              'prospeccao',
              '{nome}! Tudo bem por aí? Falo com a liderança da {empresa}?',
              'Aqui é o {vendedor}. Redesenhei uma versão nova do site de vocês para carregar instantâneo no celular!',
              'Dá uma olhada no comparativo direto: 🔗 {site_novo}',
              FALSE
            ),
            (
              'tpl_reativacao_curta',
              'Abordagem Direta & Curta (Objetiva)',
              'Mensagem ultra-rápida e direta ao ponto para alta taxa de resposta.',
              'prospeccao',
              '{nome}, tudo bem? Aqui é o {vendedor}, falo com o dono da {empresa}?',
              'Desenvolvi uma prévia exclusiva para a {empresa} com foco em atrair mais clientes no WhatsApp.',
              'Acesse a prévia aqui: 🔗 {site_novo}',
              FALSE
            )
          ON CONFLICT (id) DO NOTHING;

          CREATE TABLE IF NOT EXISTS campaign_leads (
            id VARCHAR(255) PRIMARY KEY,
            batch_id VARCHAR(255) REFERENCES campaign_batches(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            phone_number VARCHAR(100) NOT NULL,
            is_mobile BOOLEAN DEFAULT TRUE,
            public_url TEXT,
            website TEXT,
            niche VARCHAR(255),
            status VARCHAR(50) DEFAULT 'STAGING',
            quarantine_expires_at TIMESTAMP WITH TIME ZONE,
            sent_at TIMESTAMP WITH TIME ZONE,
            responded_at TIMESTAMP WITH TIME ZONE,
            response_preview TEXT,
            assigned_salesperson_id VARCHAR(255),
            assigned_salesperson_name VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS is_mobile BOOLEAN DEFAULT TRUE;
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS public_url TEXT;
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS website TEXT;
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS niche VARCHAR(255);
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS quarantine_expires_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS response_preview TEXT;
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS assigned_salesperson_id VARCHAR(255);
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS assigned_salesperson_name VARCHAR(255);
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS whatsapp_message_id VARCHAR(255);
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS notes TEXT;

          CREATE TABLE IF NOT EXISTS lead_messages (
            id VARCHAR(255) PRIMARY KEY,
            lead_id VARCHAR(255) NOT NULL,
            sender VARCHAR(50) NOT NULL,
            sender_name VARCHAR(255),
            text TEXT NOT NULL,
            template_name VARCHAR(255),
            status VARCHAR(50) DEFAULT 'delivered',
            is_audio BOOLEAN DEFAULT FALSE,
            audio_url TEXT,
            audio_duration INT,
            media_type VARCHAR(50),
            media_url TEXT,
            media_name VARCHAR(255),
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          -- Desfazer restrição NOT NULL em phone_number se existir
          DO $$ 
          BEGIN 
            BEGIN
              ALTER TABLE lead_messages ALTER COLUMN phone_number DROP NOT NULL;
            EXCEPTION 
              WHEN undefined_column THEN NULL;
            END;
          END $$;

          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS phone_number VARCHAR(100);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS whatsapp_message_id VARCHAR(255);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS conversation_id VARCHAR(255);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS instance_id VARCHAR(255);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS error_message TEXT;
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS lead_id VARCHAR(255);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS sender VARCHAR(50) DEFAULT 'lead';
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS sender_name VARCHAR(255);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS text TEXT DEFAULT '';
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS template_name VARCHAR(255);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'delivered';
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS is_audio BOOLEAN DEFAULT FALSE;
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS audio_url TEXT;
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS audio_duration INT;
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(50);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS media_url TEXT;
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS media_name VARCHAR(255);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
          -- Posto do status (queued 0 → sent 1 → delivered 2 → read 3; failed 9): o status só avança, nunca retrocede
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS status_rank INT DEFAULT -1;
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS error_code VARCHAR(100);
          CREATE INDEX IF NOT EXISTS idx_lead_messages_wamid ON lead_messages (whatsapp_message_id);
          CREATE INDEX IF NOT EXISTS idx_lead_messages_lead_ts ON lead_messages (lead_id, timestamp);

          ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone_clean VARCHAR(50);
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_replied BOOLEAN DEFAULT FALSE;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_whatsapp_message TEXT;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS unread_count INT DEFAULT 0;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS variaveis_json JSONB DEFAULT '{}'::jsonb;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS ultima_interacao_cliente TIMESTAMP WITH TIME ZONE;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS window_expires_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_call_tag VARCHAR(100);
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_count INT DEFAULT 0;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;

          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS pct_interessados NUMERIC(5,2) DEFAULT 50.00;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS pct_nao_interessados NUMERIC(5,2) DEFAULT 50.00;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS limite_leads_diario INT DEFAULT 30;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS leads_recebidos_hoje INT DEFAULT 0;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS ativo_roleta BOOLEAN DEFAULT TRUE;

          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS salesperson_id VARCHAR(255);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS sent_from_phone BOOLEAN DEFAULT FALSE;
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS reply_to_wamid VARCHAR(255);

          CREATE TABLE IF NOT EXISTS quick_replies (
            id VARCHAR(255) PRIMARY KEY,
            salesperson_id VARCHAR(255),
            shortcut VARCHAR(50) NOT NULL,
            title VARCHAR(255) NOT NULL,
            type VARCHAR(50) DEFAULT 'text',
            content TEXT NOT NULL,
            media_url TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          -- Atualiza phone_clean retroativamente nos leads existentes
          UPDATE leads 
          SET phone_clean = regexp_replace(phone_number, '\D', '', 'g')
          WHERE (phone_clean IS NULL OR phone_clean = '') AND phone_number IS NOT NULL;

          CREATE INDEX IF NOT EXISTS idx_campaign_leads_batch ON campaign_leads(batch_id);
          CREATE INDEX IF NOT EXISTS idx_campaign_leads_status ON campaign_leads(status);
          CREATE INDEX IF NOT EXISTS idx_lead_messages_lead_id ON lead_messages(lead_id);
          CREATE INDEX IF NOT EXISTS idx_lead_messages_phone ON lead_messages(phone_number);
          CREATE INDEX IF NOT EXISTS idx_lead_messages_timestamp ON lead_messages(timestamp ASC);
          CREATE INDEX IF NOT EXISTS idx_lead_messages_wamid ON lead_messages(whatsapp_message_id);
          CREATE INDEX IF NOT EXISTS idx_leads_phone_clean ON leads(phone_clean);
          CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_replied ON leads(whatsapp_replied);
          CREATE INDEX IF NOT EXISTS idx_quick_replies_shortcut ON quick_replies(shortcut);
        `);

        // Create compatibility views safely in a separate guarded block
        try {
          await client.query(`
            CREATE OR REPLACE VIEW vendedores AS 
              SELECT id, name AS nome, email, pct_interessados, pct_nao_interessados, 
                     limite_leads_diario, leads_recebidos_hoje, 
                     COALESCE(ativo, true) AS ativo, 
                     created_at AS criado_em 
              FROM salespeople;

            CREATE OR REPLACE VIEW respostas_rapidas AS
              SELECT id, salesperson_id AS vendedor_id, shortcut AS atalho, type AS tipo, content AS conteudo, created_at AS criado_em
              FROM quick_replies;

            CREATE OR REPLACE VIEW mensagens AS
              SELECT id, lead_id, salesperson_id AS vendedor_id, 
                     CASE WHEN sender = 'lead' THEN 'entrada' ELSE 'saida' END AS direcao,
                     CASE WHEN is_audio THEN 'audio' WHEN media_type IS NOT NULL THEN media_type ELSE 'texto' END AS tipo,
                     text AS conteudo, whatsapp_message_id AS mensagem_id_meta, created_at AS criado_em
              FROM lead_messages;
          `);
        } catch (viewErr: any) {
          console.warn('[PostgreSQL Views] Aviso ao criar views relacionais de compatibilidade:', viewErr?.message);
        }

        // Notas internas da conversa (só a equipe vê; o cliente nunca) e marcação de "resolvida".
        try {
          await client.query(`
            CREATE TABLE IF NOT EXISTS lead_notes (
              id VARCHAR(255) PRIMARY KEY,
              lead_id VARCHAR(255) NOT NULL,
              author_id VARCHAR(255),
              author_name VARCHAR(255),
              text TEXT NOT NULL,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes (lead_id, created_at DESC);
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;
            -- Busca no histórico de mensagens
            CREATE INDEX IF NOT EXISTS idx_lead_messages_text ON lead_messages USING gin (to_tsvector('portuguese', coalesce(text, '')));
          `);
        } catch (notesErr: any) {
          console.warn('[PostgreSQL] Aviso ao preparar notas/busca:', notesErr?.message);
        }

        // ------------------------------------------------------------------------------
        // CAIXA DE ENTRADA: "última mensagem" e "não lidas" mantidos pelo próprio banco.
        //
        // As colunas last_message_at e unread_count existiam mas NINGUÉM as preenchia: por isso
        // a lista não tinha como ordenar por quem falou por último nem mostrar contador.
        // Um gatilho resolve de uma vez e pega todos os caminhos de gravação (webhook, envio
        // pelo CRM, espelho do celular, disparo), inclusive os que vierem depois.
        // ------------------------------------------------------------------------------
        try {
          await client.query(`
            CREATE OR REPLACE FUNCTION nyroh_touch_lead_on_message() RETURNS trigger AS $BODY$
            BEGIN
              UPDATE leads
                 SET last_message_at = GREATEST(COALESCE(last_message_at, NEW.timestamp), NEW.timestamp),
                     unread_count = CASE
                       WHEN NEW.sender = 'lead' THEN COALESCE(unread_count, 0) + 1
                       ELSE COALESCE(unread_count, 0)
                     END
               WHERE id = NEW.lead_id;
              RETURN NEW;
            END;
            $BODY$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS trg_lead_messages_touch ON lead_messages;
            CREATE TRIGGER trg_lead_messages_touch
              AFTER INSERT ON lead_messages
              FOR EACH ROW EXECUTE FUNCTION nyroh_touch_lead_on_message();

            CREATE INDEX IF NOT EXISTS idx_leads_last_message_at ON leads (last_message_at DESC NULLS LAST);
            CREATE INDEX IF NOT EXISTS idx_leads_owner_last_message ON leads (salesperson_id, last_message_at DESC NULLS LAST);
          `);

          // Preenche o histórico que já existia (uma vez; depois o gatilho cuida).
          await client.query(`
            UPDATE leads l
               SET last_message_at = m.max_ts
              FROM (SELECT lead_id, MAX(timestamp) AS max_ts FROM lead_messages GROUP BY lead_id) m
             WHERE m.lead_id = l.id
               AND (l.last_message_at IS NULL OR l.last_message_at < m.max_ts)
          `);
        } catch (inboxErr: any) {
          console.warn('[PostgreSQL] Aviso ao preparar a caixa de entrada:', inboxErr?.message);
        }

        // Índice único no id da mensagem na Meta: impede a MESMA mensagem entrar duas vezes
        // (reentrega do webhook, dois processos lendo a fila). Antes o índice era comum.
        try {
          const dups = await client.query(`
            SELECT whatsapp_message_id, COUNT(*)::int AS n
              FROM lead_messages
             WHERE whatsapp_message_id IS NOT NULL AND whatsapp_message_id <> ''
             GROUP BY whatsapp_message_id HAVING COUNT(*) > 1
          `);
          if (dups.rowCount) {
            // Mantém a linha mais antiga de cada id duplicado.
            await client.query(`
              DELETE FROM lead_messages a
               USING lead_messages b
               WHERE a.whatsapp_message_id = b.whatsapp_message_id
                 AND a.whatsapp_message_id IS NOT NULL AND a.whatsapp_message_id <> ''
                 AND (a.timestamp > b.timestamp OR (a.timestamp = b.timestamp AND a.id > b.id))
            `);
            console.log(`[PostgreSQL] ${dups.rowCount} id(s) de mensagem duplicados foram limpos.`);
          }
          await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_messages_wamid
              ON lead_messages (whatsapp_message_id)
              WHERE whatsapp_message_id IS NOT NULL AND whatsapp_message_id <> ''
          `);
        } catch (uniqErr: any) {
          console.warn('[PostgreSQL] Aviso ao criar índice único do id da mensagem:', uniqErr?.message);
        }

        // Respostas rápidas padrão: gravadas no banco UMA vez, na instalação nova.
        // Assim o que aparece na tela é o que existe de verdade (dá para editar e apagar).
        try {
          const qrCount = await client.query(`SELECT COUNT(*)::int AS count FROM quick_replies`);
          if (qrCount.rows[0].count === 0) {
            for (const qr of DEFAULT_QUICK_REPLIES) {
              await client.query(
                `INSERT INTO quick_replies (id, salesperson_id, shortcut, title, type, content, media_url, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                 ON CONFLICT (id) DO NOTHING`,
                [qr.id, (qr as any).salespersonId || null, qr.shortcut, qr.title, qr.type || 'text', qr.content, (qr as any).mediaUrl || null]
              );
            }
            console.log(`[PostgreSQL] ${DEFAULT_QUICK_REPLIES.length} respostas rápidas padrão gravadas no banco.`);
          }
        } catch (qrErr: any) {
          console.warn('[PostgreSQL] Aviso ao gravar respostas rápidas padrão:', qrErr?.message);
        }

        // Configurações salvas pela tela (system_settings).
        //
        // A VARIÁVEL DE AMBIENTE SEMPRE VENCE. Antes era o contrário: uma chave salva pela tela
        // um dia sobrescrevia a variável no boot, então trocar a chave na Railway não adiantava —
        // a chave velha (inclusive uma já vazada) voltava a valer em todo restart.
        try {
          const settingsRows = await client.query(`SELECT key, value FROM system_settings WHERE key LIKE 'fluxo_%' OR key LIKE 'meta_%'`);
          const envHas = (name: string) => Boolean((process.env[name] || '').trim());
          const ignored: string[] = [];
          const applyIfNoEnv = (envName: string, settingKey: string, value: string, apply: (v: string) => void) => {
            if (!value) return;
            if (envHas(envName)) {
              ignored.push(settingKey);
              return;
            }
            apply(value);
          };
          for (const row of settingsRows.rows) {
            if (row.key === 'fluxo_api_key') applyIfNoEnv('FLUXO_KEY', row.key, row.value, v => (memoryFluxoConfig.apiKey = v));
            if (row.key === 'fluxo_api_secret') applyIfNoEnv('FLUXO_SECRET', row.key, row.value, v => (memoryFluxoConfig.apiSecret = v));
            if (row.key === 'fluxo_instance_id') applyIfNoEnv('FLUXO_INSTANCE_ID', row.key, row.value, v => (memoryFluxoConfig.instanceId = v));
            if (row.key === 'meta_access_token') applyIfNoEnv('META_ACCESS_TOKEN', row.key, row.value, v => (memoryMetaConfig.accessToken = v));
            if (row.key === 'meta_waba_id') applyIfNoEnv('META_WABA_ID', row.key, row.value, v => (memoryMetaConfig.wabaId = v));
            if (row.key === 'meta_phone_number_id') applyIfNoEnv('META_PHONE_NUMBER_ID', row.key, row.value, v => (memoryMetaConfig.phoneNumberId = v));
            if (row.key === 'meta_verify_token') applyIfNoEnv('META_VERIFY_TOKEN', row.key, row.value, v => (memoryMetaConfig.verifyToken = v));
          }
          if (ignored.length) {
            console.log(`[Config] Variáveis de ambiente têm prioridade; ignorado do banco: ${ignored.join(', ')}.`);
          }
          console.log('[PostgreSQL] Configurações de sistema da Meta e Fluxo carregadas do banco com sucesso.');
        } catch (settingsErr) {
          console.warn('[PostgreSQL] Não foi possível carregar system_settings:', settingsErr);
        }

        // ------------------------------------------------------------------------------------------------
        // CONTAS INICIAIS (segurança)
        // Antes: a CADA boot o servidor reescrevia a senha de admin@nyroh.com para "Thomas123456!" e a de
        // admin@demo.com para "admin123" — trocar a senha pela interface não adiantava, ela voltava no próximo deploy.
        // Agora: as contas só são CRIADAS quando não existem; a senha nunca é redefinida em um boot.
        //  - ADMIN_INITIAL_PASSWORD (env): senha inicial dos admins numa instalação nova (recomendado).
        //  - Em produção as contas de DEMONSTRAÇÃO (admin@demo.com, admin@crm.com, lara/pollyanna) NÃO são criadas,
        //    a não ser que SEED_DEMO_USERS=true.
        // ------------------------------------------------------------------------------------------------
        const isProdEnv = IS_PRODUCTION;
        const seedDemoUsers = !isProdEnv || process.env.SEED_DEMO_USERS === 'true';
        const DEMO_USER_IDS = new Set(['user-admin-demo', 'user-admin', 'user-lara', 'user-polly']);
        const OWNER_USER_IDS = new Set(['user-admin-nyroh', 'user-thomas']);

        // Senha inicial dos donos.
        // Em produção NUNCA cai na senha escrita no código ('Thomas123456!', '123'): sem
        // ADMIN_INITIAL_PASSWORD, sorteia uma senha forte e imprime UMA vez no log do deploy.
        // Antes, uma instalação nova em produção subia com thomas@nyroh.com / 123.
        let initialAdminPassword = (process.env.ADMIN_INITIAL_PASSWORD || '').trim();
        if (isProdEnv && !initialAdminPassword) {
          initialAdminPassword = crypto.randomBytes(18).toString('base64url');
          console.warn(
            '\n' +
            '*********************************************************************\n' +
            '  ADMIN_INITIAL_PASSWORD não definido em produção.\n' +
            '  Senha inicial SORTEADA para as contas de administrador:\n' +
            `      ${initialAdminPassword}\n` +
            '  Anote agora: ela não será mostrada de novo. Depois de entrar,\n' +
            '  troque a senha e defina ADMIN_INITIAL_PASSWORD nas variáveis.\n' +
            '*********************************************************************\n'
          );
        }
        if (isProdEnv && initialAdminPassword.length < MIN_PASSWORD_LENGTH) {
          throw new Error(`ADMIN_INITIAL_PASSWORD precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
        }

        const userCountRes = await client.query(`SELECT COUNT(*)::int AS count FROM users`);
        if (userCountRes.rows[0].count === 0) {
          for (const u of DEFAULT_USERS) {
            if (!seedDemoUsers && DEMO_USER_IDS.has(u.id)) continue;
            let hash = u.passwordHash;
            let salt = u.passwordSalt;
            // Em produção, toda conta criada aqui recebe a senha inicial real — nunca a do código.
            if (initialAdminPassword && (OWNER_USER_IDS.has(u.id) || isProdEnv)) {
              const c = hashPassword(initialAdminPassword);
              hash = c.hash;
              salt = c.salt;
            }
            await client.query(
              `INSERT INTO users (id, name, email, password_hash, password_salt, role, salesperson_id, active, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (email) DO NOTHING`,
              [u.id, u.name, u.email, hash, salt, u.role, u.salespersonId || null, u.active, u.createdAt]
            );
          }
        }

        // Garante que o Super Admin da operação EXISTE (cria se faltar; nunca redefine a senha de quem já existe)
        const ownerCreds = initialAdminPassword
          ? hashPassword(initialAdminPassword)
          : hashPassword('Thomas123456!', 'crm_salt_admin_nyroh');
        await client.query(
          `INSERT INTO users (id, name, email, password_hash, password_salt, role, salesperson_id, active, created_at)
           VALUES ('user-admin-nyroh', 'Super Admin', 'admin@nyroh.com', $1, $2, 'admin', NULL, TRUE, CURRENT_TIMESTAMP)
           ON CONFLICT (email) DO UPDATE SET role = 'admin', active = TRUE`,
          [ownerCreds.hash, ownerCreds.salt]
        );

        const demoAdminCreds = hashPassword('admin123', 'crm_salt_demo_admin');
        if (seedDemoUsers) {
          await client.query(
            `INSERT INTO users (id, name, email, password_hash, password_salt, role, salesperson_id, active, created_at)
             VALUES ('user-admin-demo', 'Admin Demo', 'admin@demo.com', $1, $2, 'admin', NULL, TRUE, CURRENT_TIMESTAMP)
             ON CONFLICT (email) DO NOTHING`,
            [demoAdminCreds.hash, demoAdminCreds.salt]
          );
        } else {
          // Produção: a conta "Administrador Fake (Demo)" com senha admin123 NÃO pode ficar ativa.
          // Só é desativada se ainda estiver com a senha padrão (se alguém trocou a senha, é uma conta de verdade).
          const off = await client.query(
            `UPDATE users SET active = FALSE WHERE LOWER(email) = 'admin@demo.com' AND password_hash = $1 AND active = TRUE`,
            [demoAdminCreds.hash]
          );
          if (off.rowCount) console.warn('🔒 [Segurança] Conta demo admin@demo.com (senha padrão admin123) foi DESATIVADA em produção.');
        }
        // Garantir cirurgicamente que Thomas e Administradores tenham perfil 'admin' no banco
        // Critérios EXATOS (antes: qualquer e-mail/nome contendo "admin" ou "thomas" virava administrador a cada boot)
        await client.query(`
          UPDATE users 
          SET role = 'admin', active = TRUE 
          WHERE salesperson_id = 'seller-thomas' 
             OR id IN ('user-thomas', 'user-admin-nyroh')
             OR LOWER(email) IN ('admin@nyroh.com', 'thomas@nyroh.com')
        `);

        // Seed default tags if table is empty
        const tagCountRes = await client.query(`SELECT COUNT(*)::int AS count FROM custom_tags`);
        if (tagCountRes.rows[0].count === 0) {
          for (const t of DEFAULT_CUSTOM_TAGS) {
            await client.query(
              `INSERT INTO custom_tags (id, name, color, bg_color) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING`,
              [t.id, t.name, t.color, t.bgColor]
            );
          }
        }

        client.release();
        pgPool = pool;
        usePostgres = true;
        dbBootDone = true;
        if (dbReconnectTimer) {
          clearTimeout(dbReconnectTimer);
          dbReconnectTimer = null;
        }
        console.log('✅ PostgreSQL conectado com sucesso e tabelas verificadas.');
        await syncSalespeopleUsers();
        await flushMemoryMessagesToPostgres();
        return;
      } catch (err: any) {
        console.warn(`⚠️ Tentativa de conexão ao PostgreSQL falhou com SSL ${JSON.stringify(sslConfig)}:`, err.message);
        // Não vazar conexões: descarta o pool da tentativa que falhou
        if (pool) pool.end().catch(() => {});
      }
    }

    if (attempt < retries) {
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }

  console.error('❌ Todas as tentativas de conexão ao PostgreSQL falharam. Operando em modo in-memory (DADOS SE PERDEM NO RESTART) e tentando reconectar a cada 30s.');
  usePostgres = false;
  dbBootDone = true;
  await syncSalespeopleUsers();

  // Reconexão contínua em background: assim que o banco voltar, o sistema volta a persistir.
  if (!dbReconnectTimer) {
    dbReconnectTimer = setTimeout(function retry() {
      dbReconnectTimer = null;
      initDatabase(2, 2000).catch((e) => console.error('[Database] Reconexão falhou:', e?.message || e));
      if (!usePostgres && !dbReconnectTimer) dbReconnectTimer = setTimeout(retry, 30000);
    }, 30000);
  }
}

/**
 * Ao voltar o Postgres depois de um período em modo memória, grava no banco as mensagens e os leads
 * criados por WhatsApp durante a queda (ON CONFLICT DO NOTHING: reexecutar é seguro).
 */
async function flushMemoryMessagesToPostgres() {
  if (!usePostgres || !pgPool) return;
  let flushed = 0;
  try {
    for (const lead of memoryLeadsMap.values()) {
      if (!String(lead.id).startsWith('lead_wa_')) continue;
      await pgPool.query(
        `INSERT INTO leads (id, name, phone_number, column_status, sub_status, salesperson_id, salesperson_name, last_call_tag, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO NOTHING`,
        [lead.id, lead.name, lead.phoneNumber, lead.columnStatus || 'Interessado', lead.subStatus || '🔥 Respondeu no WhatsApp', lead.salespersonId || 'seller-thomas', lead.salespersonName || 'Thomas', lead.lastCallTag || null]
      );
    }
    for (const [leadId, msgs] of memoryLeadMessagesMap.entries()) {
      for (const m of msgs) {
        const r = await pgPool.query(
          `INSERT INTO lead_messages (id, lead_id, sender, sender_name, text, template_name, status, status_rank, is_audio, audio_url, audio_duration, media_type, media_url, media_name, whatsapp_message_id, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (id) DO NOTHING`,
          [m.id, leadId, m.sender, m.senderName || null, m.text || '', m.templateName || null, m.status || 'delivered', m.statusRank ?? statusRank(m.status), Boolean(m.isAudio), m.audioUrl || null, m.audioDuration || null, m.mediaType || null, m.mediaUrl || null, m.mediaName || null, m.remoteMessageId || null, m.timestamp]
        );
        flushed += r.rowCount || 0;
      }
    }
    if (flushed > 0) console.log(`✅ [Database] ${flushed} mensagem(ns) que estavam só em memória foram gravadas no PostgreSQL.`);
  } catch (e: any) {
    console.warn('[Database] Falha ao gravar mensagens em memória no PostgreSQL:', e?.message || e);
  }
}

// Sincroniza e garante contas de login para todos os vendedores existentes
async function syncSalespeopleUsers() {
  try {
    if (usePostgres && pgPool) {
      const sellersRes = await pgPool.query(`SELECT id, name, email, slug FROM salespeople`);
      for (const seller of sellersRes.rows) {
        if (seller.id === 'seller-thomas') continue;
        const creds = getSalespersonCredentials(seller.name, seller.email);
        const checkUser = await pgPool.query(
          `SELECT id FROM users WHERE salesperson_id = $1 OR LOWER(email) = $2`,
          [seller.id, creds.email]
        );
        if (checkUser.rowCount === 0) {
          const pass = hashPassword(creds.defaultPassword);
          const userId = `user-${seller.id}`;
          await pgPool.query(
            `INSERT INTO users (id, name, email, password_hash, password_salt, role, salesperson_id, active, created_at)
             VALUES ($1, $2, $3, $4, $5, 'salesperson', $6, TRUE, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO NOTHING`,
            [userId, seller.name, creds.email, pass.hash, pass.salt, seller.id]
          );
          if (!seller.email) {
            await pgPool.query(`UPDATE salespeople SET email = $1 WHERE id = $2`, [creds.email, seller.id]);
          }
        }
      }
    } else {
      for (const seller of memorySalespeopleMap.values()) {
        if (seller.id === 'seller-thomas') continue;
        const creds = getSalespersonCredentials(seller.name, seller.email);
        let exists = false;
        for (const u of memoryUsersMap.values()) {
          if (u.salespersonId === seller.id || u.email.toLowerCase() === creds.email) {
            exists = true;
            break;
          }
        }
        if (!exists) {
          const pass = hashPassword(creds.defaultPassword);
          const userId = `user-${seller.id}`;
          memoryUsersMap.set(userId, {
            id: userId,
            name: seller.name,
            email: creds.email,
            passwordHash: pass.hash,
            passwordSalt: pass.salt,
            role: 'salesperson',
            salespersonId: seller.id,
            active: true,
            createdAt: new Date().toISOString()
          });
          if (!seller.email) {
            seller.email = creds.email;
          }
        }
      }
    }
    console.log('✅ Sincronização de credenciais de vendedores (@nyroh.com / senha padrão) concluída.');
  } catch (err) {
    console.error('Erro ao sincronizar credenciais de vendedores:', err);
  }
}

// HEALTHCHECK ROUTE (Fast response for Railway & Docker health checks)
app.get(['/health', '/api/health', '/healthz', '/ping'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    database: usePostgres ? 'postgresql' : 'in-memory',
    timestamp: new Date().toISOString()
  });
});

// Helper: Grava registro de auditoria no PostgreSQL ou na memória
async function logAudit(action: string, details?: string, req?: express.Request) {
  const ip = req ? (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '127.0.0.1') : '127.0.0.1';
  const anyReq = req as any;
  const user = anyReq?.user;
  const logId = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const timestamp = new Date().toISOString();

  const auditEntry: AuditLog = {
    id: logId,
    userId: user?.id,
    userName: user?.name || 'Anônimo / Visitante',
    userRole: user?.role || 'guest',
    action,
    details: details || '',
    ip,
    createdAt: timestamp
  };

  if (usePostgres && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO audit_logs (id, user_id, user_name, user_role, action, details, ip, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [logId, auditEntry.userId || null, auditEntry.userName, auditEntry.userRole, action, details || '', ip]
      );
    } catch (e) {
      console.error('Erro ao gravar log de auditoria no Postgres:', e);
    }
  } else {
    memoryAuditLogs.unshift(auditEntry);
    if (memoryAuditLogs.length > 500) memoryAuditLogs.pop();
  }
}

/**
 * Sessões são guardadas como HASH do token, nunca em texto puro.
 * Antes, quem lesse a tabela `auth_sessions` (um backup, um dump, um SELECT) entrava como
 * qualquer usuário logado. Agora o banco guarda só a impressão digital do token.
 */
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 dias (antes: 30)

function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Resolve o usuário de uma sessão (cookie `crm_session` ou Bearer). Usado pelo middleware HTTP e pelo socket.io.
 */
async function resolveSessionUser(token?: string | null): Promise<any | null> {
  if (!token) return null;
  try {
    if (usePostgres && pgPool) {
      const sessionRes = await pgPool.query(
        `SELECT s.user_id, s.expires_at, u.id, u.name, u.email, u.role, u.salesperson_id AS "salespersonId", u.active
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = $1 AND s.expires_at > CURRENT_TIMESTAMP AND u.active = TRUE`,
        [hashSessionToken(token)]
      );
      if (sessionRes.rows.length > 0) {
        const u = sessionRes.rows[0];
        if (isUserAdmin(u)) u.role = 'admin';
        return u;
      }
      return null;
    }
    const session = memorySessionsMap.get(hashSessionToken(token));
    if (session && session.expiresAt > Date.now()) {
      const user = memoryUsersMap.get(session.userId);
      if (user && user.active) {
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: isUserAdmin(user) ? 'admin' : user.role,
          salespersonId: user.salespersonId,
          active: user.active
        };
      }
    }
    return null;
  } catch (err) {
    console.error('Erro na autenticação de sessão:', err);
    return null;
  }
}

// Atrás do proxy da Railway: necessário para o IP real (limite de tentativas de login, auditoria)
app.set('trust proxy', 1);

// Middleware de autenticação por Cookie HttpOnly ou Header Bearer
app.use(async (req: any, res, next) => {
  const token = req.cookies?.crm_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  req.user = await resolveSessionUser(token);
  next();
});

// ============================================================================
// GUARD GLOBAL DA API
// Antes, só 3 das ~100 rotas /api exigiam login: qualquer pessoa com a URL conseguia mandar WhatsApp pelo
// número da empresa, disparar campanha, baixar todos os leads em CSV ou apagar dados.
// Agora TODA rota /api exige sessão, exceto as públicas abaixo (login, saúde e webhooks — estes têm assinatura própria).
// ============================================================================
const PUBLIC_API_PATHS = new Set<string>([
  '/api/auth/login',
  '/api/auth/me', // responde 401 por conta própria
  '/api/health',
  '/api/v1/webhook',
  '/api/webhooks/fluxo',
  '/api/webhooks/meta',
  '/api/webhook/whatsapp'
]);

// Áreas SÓ de administrador (operação da empresa, não do vendedor)
const ADMIN_ONLY_PREFIXES = [
  '/api/admin/',
  '/api/campaign/',
  '/api/export/',
  '/api/seed-samples',
  '/api/webhooks/simulate-incoming',
  '/api/leads/distribute',
  '/api/leads/batch-assign',
  '/api/leads/batch-update',
  '/api/leads/recover-',
  '/api/salespeople/distribute-roulette',
  '/api/salespeople/reset-daily-leads',
  '/api/salespeople/batch'
];

/**
 * Gestão da equipe: SÓ admin.
 *
 * Antes qualquer vendedor logado podia criar vendedor, editar/desativar qualquer um
 * (inclusive o dono), mudar os pesos da roleta e — o pior — redefinir a senha de
 * `seller-thomas`, que é admin por `isUserAdmin`, e entrar como administrador.
 * GET continua liberado: o vendedor precisa da lista para ver a equipe.
 */
const ADMIN_ONLY_RULES: Array<{ methods: string[]; test: (p: string) => boolean }> = [
  { methods: ['POST', 'PUT', 'PATCH', 'DELETE'], test: p => /^\/api\/salespeople(\/|$)/.test(p) },
  { methods: ['POST', 'PUT', 'PATCH', 'DELETE'], test: p => /^\/api\/users(\/|$)/.test(p) },
  { methods: ['POST', 'PUT', 'PATCH', 'DELETE'], test: p => /^\/api\/roulette(\/|$)/.test(p) },
  { methods: ['POST', 'PUT', 'PATCH', 'DELETE'], test: p => /^\/api\/custom-tags(\/|$)/.test(p) },
  { methods: ['POST', 'PUT', 'PATCH', 'DELETE'], test: p => /^\/api\/system-settings(\/|$)/.test(p) },
  { methods: ['DELETE'], test: p => /^\/api\/leads\/bulk-delete/.test(p) }
];

function isAdminOnlyRequest(method: string, fullPath: string): boolean {
  if (ADMIN_ONLY_PREFIXES.some(p => fullPath.startsWith(p))) return true;
  return ADMIN_ONLY_RULES.some(r => r.methods.includes(method) && r.test(fullPath));
}

/** Tamanho mínimo de senha em todo o sistema (antes: 4 caracteres, ou nenhum mínimo). */
const MIN_PASSWORD_LENGTH = 8;


/**
 * Dono do lead: admin vê tudo; vendedor só o que é dele.
 *
 * Antes NENHUMA rota de lead conferia o dono — qualquer vendedor logado abria a conversa,
 * editava, registrava ligação, mandava WhatsApp e APAGAVA lead de qualquer colega, só
 * trocando o id na URL.
 */
async function getLeadOwnerId(leadId: string): Promise<string | null | undefined> {
  try {
    if (usePostgres && pgPool) {
      const r = await pgPool.query('SELECT salesperson_id FROM leads WHERE id = $1', [leadId]);
      if (r.rowCount === 0) return undefined; // lead não existe
      return r.rows[0].salesperson_id || null;
    }
    const lead = memoryLeadsMap.get(leadId);
    if (!lead) return undefined;
    return (lead as any).salespersonId || null;
  } catch {
    return undefined;
  }
}

/**
 * Middleware para rotas /api/leads/:id*. Responde 403 quando o lead é de outro vendedor.
 * Deixa passar quando o lead não existe, para a própria rota responder 404 como antes.
 */
async function assertLeadAccess(req: any, res: express.Response, next: express.NextFunction) {
  if (isUserAdmin(req.user)) return next();
  const leadId = req.params.id || req.params.leadId;
  if (!leadId) return next();

  const own = req.user?.salespersonId;
  if (!own) {
    return res.status(403).json({ error: 'Sua conta não tem carteira de leads vinculada.', code: 'no_portfolio' });
  }
  const owner = await getLeadOwnerId(leadId);
  if (owner === undefined) return next(); // a rota decide o 404
  if (owner && String(owner) === String(own)) return next();
  return res.status(403).json({ error: 'Este lead é de outro vendedor.', code: 'forbidden_lead' });
}

/** Papéis aceitos. Antes `role` aceitava qualquer texto vindo do navegador. */
const VALID_ROLES = new Set(['admin', 'salesperson', 'manager']);

/** O vendedor com este id corresponde a uma conta de ADMINISTRADOR? */
async function isAdminSalesperson(salespersonId: string): Promise<boolean> {
  const id = String(salespersonId || '').toLowerCase().trim();
  if (!id) return false;
  // `seller-thomas` é admin por definição em isUserAdmin()
  if (id === 'seller-thomas') return true;
  try {
    if (usePostgres && pgPool) {
      const r = await pgPool.query('SELECT id, email, role, salesperson_id FROM users WHERE salesperson_id = $1', [salespersonId]);
      return r.rows.some((u: any) => isUserAdmin({ id: u.id, email: u.email, role: u.role, salespersonId: u.salesperson_id }));
    }
    for (const u of memoryUsersMap.values()) {
      if (String((u as any).salespersonId || '') === salespersonId && isUserAdmin(u)) return true;
    }
  } catch {
    // Na dúvida, protege: trata como admin e recusa a troca por esta rota.
    return true;
  }
  return false;
}

// Produção = Railway ou NODE_ENV=production. Usado para desligar tudo que é de teste.
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);

// Uma promessa sem tratamento derruba o processo inteiro no Node 20+. Num CRM em
// atendimento isso significa todo mundo deslogado e disparo interrompido por causa de
// uma falha isolada. Registramos e seguimos; o erro fica no log para ser corrigido.
process.on('unhandledRejection', (reason: any) => {
  console.error('[Erro não tratado — promessa]', reason?.stack || reason?.message || reason);
});
process.on('uncaughtException', (err: any) => {
  console.error('[Erro não tratado — exceção]', err?.stack || err?.message || err);
  // Erro de inicialização (porta ocupada, permissão): o processo NÃO pode seguir fingindo
  // que subiu — sai com erro para o orquestrador reiniciar ou avisar.
  if (err?.code === 'EADDRINUSE' || err?.code === 'EACCES') {
    process.exit(1);
  }
});

// Rotas de simulação (resposta falsa de lead, dados de exemplo, evento falso da FluxoAPI).
// Existem só para depuração local: em produção NÃO existem, e o front esconde os botões.
const SIMULATORS_ENABLED = !IS_PRODUCTION && process.env.ENABLE_SIMULATORS !== 'false';

const SIMULATOR_PATHS = [
  '/api/seed-samples',
  '/api/webhooks/simulate-incoming',
  '/api/admin/fluxo/events/simulate',
  '/simulate-reply'
];

// Em produção, nenhuma gravação passa sem banco (vale para todo /api, não só webhooks).
app.use('/api', (req: any, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.path === '/auth/login' || req.path === '/auth/logout') return next();
  return requireDatabaseReady(req, res, next);
});

app.use('/api', (req: any, res, next) => {
  if (SIMULATORS_ENABLED) return next();
  const fullPath = `/api${req.path}`;
  const isSimulator = SIMULATOR_PATHS.some(p => (p.startsWith('/api') ? fullPath.startsWith(p) : fullPath.endsWith(p)));
  if (!isSimulator) return next();
  return res.status(404).json({ error: 'Rota de simulação desativada em produção.', code: 'simulators_disabled' });
});

// Só para depuração local; NUNCA vale em produção/Railway
const API_AUTH_DISABLED_FOR_DEV =
  process.env.NYROH_DISABLE_API_AUTH === 'true' && !IS_PRODUCTION;

app.use('/api', (req: any, res, next) => {
  const fullPath = `/api${req.path}`.replace(/\/+$/, '') || '/api';
  if (PUBLIC_API_PATHS.has(fullPath)) return next();
  if (API_AUTH_DISABLED_FOR_DEV) return next();

  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado. Faça login para continuar.', code: 'unauthenticated' });
  }
  if (isAdminOnlyRequest(req.method, fullPath) && !isUserAdmin(req.user)) {
    return res.status(403).json({ error: 'Acesso restrito ao Administrador.', code: 'forbidden' });
  }
  return next();
});

// Vale para TODAS as rotas /api/leads/<id>/... e /api/leads/<id>
app.use('/api/leads/:id', (req: any, res, next) => {
  // Rotas de operação em massa não têm um lead único (já são só-admin pelo guard global)
  const first = String(req.params.id || '');
  if (['batch', 'batch-assign', 'batch-update', 'bulk-delete', 'distribute'].includes(first)) return next();
  return assertLeadAccess(req, res, next);
});


// Limite de tentativas de login (força bruta): 10 falhas por IP+e-mail a cada 15 min
const loginFailures = new Map<string, { count: number; firstAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
function loginKey(req: any, email: string): string {
  return `${req.ip || 'ip'}|${String(email || '').trim().toLowerCase()}`;
}
function isLoginBlocked(key: string): boolean {
  const rec = loginFailures.get(key);
  if (!rec) return false;
  if (Date.now() - rec.firstAt > LOGIN_WINDOW_MS) {
    loginFailures.delete(key);
    return false;
  }
  return rec.count >= LOGIN_MAX_FAILURES;
}
function registerLoginFailure(key: string) {
  const rec = loginFailures.get(key);
  if (!rec || Date.now() - rec.firstAt > LOGIN_WINDOW_MS) loginFailures.set(key, { count: 1, firstAt: Date.now() });
  else rec.count++;
  if (loginFailures.size > 5000) {
    for (const [k, v] of loginFailures.entries()) if (Date.now() - v.firstAt > LOGIN_WINDOW_MS) loginFailures.delete(k);
  }
}
// AUTH ENDPOINTS

// 1. Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const rawPass = String(password);

  const throttleKey = loginKey(req, cleanEmail);
  if (isLoginBlocked(throttleKey)) {
    res.setHeader('Retry-After', String(Math.ceil(LOGIN_WINDOW_MS / 1000)));
    return res.status(429).json({ error: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.' });
  }

  try {
    let foundUser: any = null;

    if (usePostgres && pgPool) {
      const uRes = await pgPool.query(
        `SELECT id, name, email, password_hash AS "passwordHash", password_salt AS "passwordSalt", role, salesperson_id AS "salespersonId", active
         FROM users
         WHERE LOWER(email) = $1`,
        [cleanEmail]
      );
      if (uRes.rows.length > 0) {
        foundUser = uRes.rows[0];
      }
    } else {
      for (const u of memoryUsersMap.values()) {
        if (u.email.toLowerCase() === cleanEmail) {
          foundUser = u;
          break;
        }
      }
    }

    if (!foundUser) {
      registerLoginFailure(throttleKey);
      await logAudit('LOGIN_FALHOU', `Tentativa com e-mail inexistente: ${cleanEmail}`, req);
      return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });
    }

    if (!foundUser.active) {
      await logAudit('LOGIN_BLOQUEADO', `Usuário inativo tentou login: ${cleanEmail}`, req);
      return res.status(403).json({ error: 'Sua conta de acesso foi desativada pelo administrador.' });
    }

    const isValid = verifyPassword(rawPass, foundUser.passwordHash, foundUser.passwordSalt);
    if (!isValid) {
      registerLoginFailure(throttleKey);
      await logAudit('LOGIN_SENHA_INCORRETA', `Senha incorreta para ${cleanEmail}`, req);
      return res.status(401).json({ error: 'Credenciais inválidas. Senha incorreta.' });
    }

    loginFailures.delete(throttleKey);

    // Cria token seguro de 64 caracteres. O banco guarda só o hash dele.
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    if (usePostgres && pgPool) {
      await pgPool.query(
        `INSERT INTO auth_sessions (token, user_id, expires_at)
         VALUES ($1, $2, $3)`,
        [hashSessionToken(token), foundUser.id, expiresAt]
      );
    } else {
      memorySessionsMap.set(hashSessionToken(token), { userId: foundUser.id, expiresAt: expiresAt.getTime() });
    }

    // Cookie seguro HttpOnly. sameSite 'strict': o cookie não viaja em requisição
    // vinda de outro site (CSRF).
    res.cookie('crm_session', token, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: 'strict',
      maxAge: SESSION_TTL_MS,
      path: '/'
    });

    const effectiveRole = isUserAdmin(foundUser) ? 'admin' : foundUser.role;
    const publicUserData: User = {
      id: foundUser.id,
      name: foundUser.name,
      email: foundUser.email,
      role: effectiveRole,
      salespersonId: foundUser.salespersonId,
      active: foundUser.active,
      createdAt: foundUser.createdAt || new Date().toISOString()
    };

    (req as any).user = publicUserData;
    await logAudit('LOGIN_SUCESSO', `Usuário ${foundUser.name} (${foundUser.role}) logou com sucesso.`, req);

    return res.json({
      user: publicUserData,
      token
    });
  } catch (err: any) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno ao realizar autenticação.' });
  }
});

// 2. Logout
app.post('/api/auth/logout', async (req, res) => {
  const token = req.cookies?.crm_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) {
    if (usePostgres && pgPool) {
      await pgPool.query(`DELETE FROM auth_sessions WHERE token = $1`, [hashSessionToken(token)]).catch(() => {});
    } else {
      memorySessionsMap.delete(hashSessionToken(token));
    }
  }

  await logAudit('LOGOUT', 'Usuário encerrou sessão.', req);
  res.clearCookie('crm_session', { path: '/' });
  return res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
});

// 3. Me (Current User)
app.get('/api/auth/me', (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  return res.json({ user: req.user });
});

// 3.1 Alterar a própria senha (qualquer usuário autenticado)
app.post('/api/auth/change-password', async (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Você precisa estar autenticado para alterar sua senha.' });
  }

  const { newPassword } = req.body;
  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 8) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' });
  }

  const cleanPass = newPassword.trim();
  // Recusa as senhas que estão publicadas no código-fonte / são geradas por padrão
  const KNOWN_WEAK = new Set(['admin123', 'thomas123456!', '12345678', 'password', 'senha123', 'senha1234', 'nyroh123', 'nyroh1234']);
  const firstNameGuess = getSalespersonCredentials(req.user.name || '', req.user.email).legacyPredictablePassword;
  if (KNOWN_WEAK.has(cleanPass.toLowerCase()) || cleanPass === firstNameGuess) {
    return res.status(400).json({ error: 'Essa senha é previsível. Escolha outra (misture letras e números).' });
  }
  const creds = hashPassword(cleanPass);
  const userId = req.user.id;
  const currentToken = req.cookies?.crm_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');

  try {
    if (usePostgres && pgPool) {
      await pgPool.query(
        `UPDATE users SET password_hash = $1, password_salt = $2 WHERE id = $3`,
        [creds.hash, creds.salt, userId]
      );
      // Quem já estava logado com a senha antiga (outro aparelho, alguém que descobriu a senha) perde o acesso
      await pgPool.query(`DELETE FROM auth_sessions WHERE user_id = $1 AND token <> $2`, [userId, currentToken ? hashSessionToken(currentToken) : '']);
    } else {
      const currentHashed = currentToken ? hashSessionToken(currentToken) : '';
      for (const [tok, s] of memorySessionsMap.entries()) {
        if (s.userId === userId && tok !== currentHashed) memorySessionsMap.delete(tok);
      }
      const u = memoryUsersMap.get(userId);
      if (u) {
        u.passwordHash = creds.hash;
        u.passwordSalt = creds.salt;
      }
    }

    await logAudit('SENHA_ALTERADA', `Usuário ${req.user.name} (${req.user.email}) alterou sua própria senha.`, req);
    return res.json({ success: true, message: 'Sua senha foi alterada com sucesso!' });
  } catch (error: any) {
    console.error('Erro ao alterar senha:', error);
    return res.status(500).json({ error: 'Erro ao processar alteração de senha.' });
  }
});

// 3.2 Sincronizar credenciais de todos os vendedores manualmente
app.post('/api/admin/sync-credentials', async (req: any, res) => {
  if (!req.user || !isUserAdmin(req.user)) {
    return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
  }
  try {
    await syncSalespeopleUsers();
    await logAudit('SINCRONIZAR_CREDENCIAIS', 'Admin executou sincronização geral de contas de login de vendedores.', req);
    return res.json({ success: true, message: 'Contas e acessos de todos os vendedores foram sincronizados com sucesso!' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Erro ao sincronizar credenciais.' });
  }
});

// ADMIN ENDPOINTS

// 4. Listar Todos os Usuários
app.get('/api/admin/users', async (req: any, res) => {
  if (!req.user || !isUserAdmin(req.user)) {
    return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
  }

  try {
    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `SELECT id, name, email, role, salesperson_id AS "salespersonId", active, created_at AS "createdAt"
         FROM users
         ORDER BY created_at ASC`
      );
      return res.json(result.rows);
    } else {
      const list = Array.from(memoryUsersMap.values()).map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        salespersonId: u.salespersonId,
        active: u.active,
        createdAt: u.createdAt
      }));
      return res.json(list);
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar lista de usuários.' });
  }
});

// 5. Criar Novo Usuário
app.post('/api/admin/users', async (req: any, res) => {
  if (!req.user || !isUserAdmin(req.user)) {
    return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
  }

  const { name, email, password, role, salespersonId } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const userRole = role === 'admin' || role === 'manager' ? role : 'salesperson';
  const creds = hashPassword(String(password));
  const newId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  try {
    if (usePostgres && pgPool) {
      const existing = await pgPool.query(`SELECT id FROM users WHERE LOWER(email) = $1`, [cleanEmail]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
      }

      await pgPool.query(
        `INSERT INTO users (id, name, email, password_hash, password_salt, role, salesperson_id, active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP)`,
        [newId, String(name).trim(), cleanEmail, creds.hash, creds.salt, userRole, salespersonId || null]
      );
    } else {
      for (const u of memoryUsersMap.values()) {
        if (u.email.toLowerCase() === cleanEmail) {
          return res.status(400).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
        }
      }
      memoryUsersMap.set(newId, {
        id: newId,
        name: String(name).trim(),
        email: cleanEmail,
        passwordHash: creds.hash,
        passwordSalt: creds.salt,
        role: userRole,
        salespersonId: salespersonId || undefined,
        active: true,
        createdAt: now
      });
    }

    await logAudit('USUARIO_CRIADO', `Admin criou usuário ${name} (${cleanEmail}) como ${userRole}`, req);

    return res.status(201).json({
      id: newId,
      name: String(name).trim(),
      email: cleanEmail,
      role: userRole,
      salespersonId,
      active: true,
      createdAt: now
    });
  } catch (err: any) {
    console.error('Erro ao criar usuário:', err);
    res.status(500).json({ error: 'Erro ao cadastrar novo usuário.' });
  }
});

// 6. Atualizar Usuário (Ativar/Desativar ou Resetar Senha)
app.patch('/api/admin/users/:id', async (req: any, res) => {
  if (!req.user || !isUserAdmin(req.user)) {
    return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
  }

  const { id } = req.params;
  const { name, role, salespersonId, active, newPassword } = req.body;

  // `role` aceitava QUALQUER texto vindo do navegador (inclusive um papel inventado que
  // caía nas regras de admin). Agora só os papéis da lista valem.
  if (role !== undefined && !VALID_ROLES.has(String(role).toLowerCase().trim())) {
    return res.status(400).json({
      error: `Papel inválido. Use um destes: ${Array.from(VALID_ROLES).join(', ')}.`,
      code: 'invalid_role'
    });
  }
  // Senha nova sem mínimo nenhum: agora segue a regra do sistema.
  if (newPassword !== undefined && String(newPassword).trim().length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
  }
  // Um admin não pode se rebaixar sozinho e deixar a operação sem dono.
  if (role !== undefined && String(id) === String(req.user.id) && String(role).toLowerCase().trim() !== 'admin') {
    return res.status(400).json({ error: 'Você não pode remover o seu próprio acesso de administrador.' });
  }

  try {
    if (usePostgres && pgPool) {
      if (typeof active === 'boolean') {
        await pgPool.query(`UPDATE users SET active = $1 WHERE id = $2`, [active, id]);
      }
      if (name) {
        await pgPool.query(`UPDATE users SET name = $1 WHERE id = $2`, [String(name).trim(), id]);
      }
      if (role) {
        await pgPool.query(`UPDATE users SET role = $1 WHERE id = $2`, [role, id]);
      }
      if (salespersonId !== undefined) {
        await pgPool.query(`UPDATE users SET salesperson_id = $1 WHERE id = $2`, [salespersonId || null, id]);
      }
      if (newPassword) {
        const creds = hashPassword(String(newPassword));
        await pgPool.query(`UPDATE users SET password_hash = $1, password_salt = $2 WHERE id = $3`, [creds.hash, creds.salt, id]);
      }
    } else {
      const u = memoryUsersMap.get(id);
      if (u) {
        if (typeof active === 'boolean') u.active = active;
        if (name) u.name = String(name).trim();
        if (role) u.role = role;
        if (salespersonId !== undefined) u.salespersonId = salespersonId || undefined;
        if (newPassword) {
          const creds = hashPassword(String(newPassword));
          u.passwordHash = creds.hash;
          u.passwordSalt = creds.salt;
        }
      }
    }

    await logAudit('USUARIO_ATUALIZADO', `Admin alterou dados/permissão do usuário ID ${id}`, req);
    return res.json({ success: true, message: 'Usuário atualizado com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao atualizar dados do usuário.' });
  }
});

// 6.1 Excluir Usuário de Acesso
app.delete('/api/admin/users/:id', async (req: any, res) => {
  if (!req.user || !isUserAdmin(req.user)) {
    return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
  }
  const { id } = req.params;

  if (id === req.user.id) {
    return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário logado.' });
  }

  try {
    if (usePostgres && pgPool) {
      const uRes = await pgPool.query('SELECT name, email, role FROM users WHERE id = $1', [id]);
      if (uRes.rowCount === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }
      await pgPool.query(`DELETE FROM users WHERE id = $1`, [id]);
      await logAudit('USUARIO_EXCLUIDO', `Admin excluiu o usuário ${uRes.rows[0].name} (${uRes.rows[0].email})`, req);
    } else {
      const u = memoryUsersMap.get(id);
      if (!u) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }
      memoryUsersMap.delete(id);
      await logAudit('USUARIO_EXCLUIDO', `Admin excluiu o usuário ${u.name} (${u.email})`, req);
    }

    return res.json({ success: true, message: 'Usuário excluído com sucesso.' });
  } catch (err: any) {
    console.error('Erro ao excluir usuário:', err);
    return res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
});

// 7. Audit Logs
app.get('/api/admin/audit-logs', async (req: any, res) => {
  if (!req.user || !isUserAdmin(req.user)) {
    return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
  }

  try {
    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `SELECT id, user_id AS "userId", user_name AS "userName", user_role AS "userRole", action, details, ip, created_at AS "createdAt"
         FROM audit_logs
         ORDER BY created_at DESC
         LIMIT 100`
      );
      return res.json(result.rows);
    } else {
      return res.json(memoryAuditLogs.slice(0, 100));
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar logs de auditoria.' });
  }
});

// Endpoint para executar migração de schema sob demanda no Postgres
app.post('/api/admin/db/migrate', async (req: any, res) => {
  const isAdmin = isUserAdmin(req.user); // antes: liberava anônimo fora de produção
  if (!isAdmin) {
    return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
  }

  if (!usePostgres || !pgPool) {
    return res.json({ success: true, message: 'Postgres não configurado (modo em memória).' });
  }

  try {
    await pgPool.query(`
      ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS whatsapp_message_id VARCHAR(255);
      ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_call_tag VARCHAR(100);
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_count INT DEFAULT 0;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS public_url TEXT;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS niche VARCHAR(255);
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS website TEXT;
    `);
    console.log('✅ [Postgres Migration] Colunas sincronizadas com sucesso via /api/admin/db/migrate');
    return res.json({ success: true, message: 'Migração de colunas concluída com sucesso no PostgreSQL.' });
  } catch (err: any) {
    console.error('❌ [Postgres Migration Error]:', err.message);
    return res.status(500).json({ error: `Erro na migração: ${err.message}` });
  }
});

// --------------------------------------------------------------------------
// 7.1 WHATSAPP CLOUD API OFICIAL (FLUXOAPI) - ENDPOINTS
// --------------------------------------------------------------------------

// GET config
app.get('/api/admin/fluxo/config', (req: any, res) => {
  const isAdmin = isUserAdmin(req.user); // antes: liberava anônimo fora de produção
  if (!isAdmin) {
    return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
  }

  const effectiveKey = memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '';
  const effectiveSecret = memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '';
  const effectiveInstanceId = memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '';

  const effectiveMetaToken = memoryMetaConfig.accessToken || process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || '';
  const effectiveMetaWabaId = memoryMetaConfig.wabaId || process.env.META_WABA_ID || process.env.WHATSAPP_WABA_ID || '';
  const effectiveMetaPhoneId = memoryMetaConfig.phoneNumberId || process.env.META_PHONE_NUMBER_ID || '';
  const effectiveMetaVerify = memoryMetaConfig.verifyToken || process.env.META_VERIFY_TOKEN || 'crm_webhook_meta_token';

  // NUNCA devolver segredo inteiro ao navegador: só "está configurado" + 4 últimos dígitos.
  // Antes isto devolvia `fullApiKey` e `fullMetaAccessToken` completos — qualquer pessoa
  // com acesso à tela (ou à aba de rede do navegador) saía com a chave da operação.
  const maskSecret = (v: string) => (v ? (v.length > 4 ? `••••${v.slice(-4)}` : '••••') : '');

  return res.json({
    apiKey: maskSecret(effectiveKey),
    hasApiKey: Boolean(effectiveKey),
    hasSecret: Boolean(effectiveSecret),
    instanceId: effectiveInstanceId,
    isConfigured: Boolean(effectiveKey && effectiveSecret),
    source: (process.env.FLUXO_KEY && process.env.FLUXO_SECRET) ? 'env' : (memoryFluxoConfig.apiKey ? 'custom' : 'none'),
    // Credenciais diretas da Meta Cloud API
    metaAccessToken: maskSecret(effectiveMetaToken),
    hasMetaToken: Boolean(effectiveMetaToken),
    metaWabaId: effectiveMetaWabaId,
    metaPhoneNumberId: effectiveMetaPhoneId,
    metaVerifyToken: effectiveMetaVerify,
    isMetaConfigured: Boolean(effectiveMetaToken && effectiveMetaWabaId)
  });
});

// POST config
app.post('/api/admin/fluxo/config', async (req: any, res) => {
  const isAdmin = isUserAdmin(req.user); // antes: liberava anônimo fora de produção
  if (!isAdmin) {
    return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
  }

  const {
    apiKey,
    apiSecret,
    instanceId,
    metaAccessToken,
    metaWabaId,
    metaPhoneNumberId,
    metaVerifyToken
  } = req.body;

  if (apiKey !== undefined) memoryFluxoConfig.apiKey = String(apiKey).trim();
  if (apiSecret !== undefined && String(apiSecret).trim()) memoryFluxoConfig.apiSecret = String(apiSecret).trim();
  if (instanceId !== undefined) memoryFluxoConfig.instanceId = String(instanceId).trim();

  if (metaAccessToken !== undefined && String(metaAccessToken).trim()) memoryMetaConfig.accessToken = String(metaAccessToken).trim();
  if (metaWabaId !== undefined) memoryMetaConfig.wabaId = String(metaWabaId).trim();
  if (metaPhoneNumberId !== undefined) memoryMetaConfig.phoneNumberId = String(metaPhoneNumberId).trim();
  if (metaVerifyToken !== undefined && String(metaVerifyToken).trim()) memoryMetaConfig.verifyToken = String(metaVerifyToken).trim();

  // Persist to PostgreSQL system_settings if connected
  if (usePostgres && pgPool) {
    try {
      if (apiKey !== undefined && String(apiKey).trim()) {
        await pgPool.query(
          `INSERT INTO system_settings (key, value, updated_at) VALUES ('fluxo_api_key', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
          [String(apiKey).trim()]
        );
      }
      if (apiSecret !== undefined && String(apiSecret).trim()) {
        await pgPool.query(
          `INSERT INTO system_settings (key, value, updated_at) VALUES ('fluxo_api_secret', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
          [String(apiSecret).trim()]
        );
      }
      if (instanceId !== undefined && String(instanceId).trim()) {
        await pgPool.query(
          `INSERT INTO system_settings (key, value, updated_at) VALUES ('fluxo_instance_id', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
          [String(instanceId).trim()]
        );
      }

      if (metaAccessToken !== undefined && String(metaAccessToken).trim()) {
        await pgPool.query(
          `INSERT INTO system_settings (key, value, updated_at) VALUES ('meta_access_token', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
          [String(metaAccessToken).trim()]
        );
      }
      if (metaWabaId !== undefined && String(metaWabaId).trim()) {
        await pgPool.query(
          `INSERT INTO system_settings (key, value, updated_at) VALUES ('meta_waba_id', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
          [String(metaWabaId).trim()]
        );
      }
      if (metaPhoneNumberId !== undefined && String(metaPhoneNumberId).trim()) {
        await pgPool.query(
          `INSERT INTO system_settings (key, value, updated_at) VALUES ('meta_phone_number_id', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
          [String(metaPhoneNumberId).trim()]
        );
      }
      if (metaVerifyToken !== undefined && String(metaVerifyToken).trim()) {
        await pgPool.query(
          `INSERT INTO system_settings (key, value, updated_at) VALUES ('meta_verify_token', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
          [String(metaVerifyToken).trim()]
        );
      }

      console.log('[PostgreSQL] Credenciais da Meta e FluxoAPI salvas com sucesso em system_settings.');
    } catch (dbErr) {
      console.error('[PostgreSQL] Erro ao gravar system_settings:', dbErr);
    }
  }

  await logAudit(
    'CONFIGURAR_FLUXO_WHATSAPP',
    `Admin configurou credenciais da Meta/FluxoAPI`,
    req
  );

  return res.json({
    success: true,
    message: 'Credenciais salvas com sucesso!',
    isConfigured: Boolean(memoryFluxoConfig.apiKey && memoryFluxoConfig.apiSecret),
    isMetaConfigured: Boolean(memoryMetaConfig.accessToken && memoryMetaConfig.wabaId)
  });
});

// POST test-connection
app.post('/api/admin/fluxo/test-connection', async (req: any, res) => {
  const isAdmin = isUserAdmin(req.user); // antes: liberava anônimo fora de produção
  if (!isAdmin) {
    return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
  }

  const apiKey = (req.body.apiKey || memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
  const apiSecret = (req.body.apiSecret || memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();

  if (!apiKey || !apiSecret) {
    return res.status(400).json({
      success: false,
      message: 'Chave Pública (FLUXO_KEY) e Chave Secreta (FLUXO_SECRET) são obrigatórias para autenticação HMAC-SHA256.',
      hint: 'Insira as credenciais geradas no painel da FluxoAPI ou configure as variáveis de ambiente.'
    });
  }

  try {
    const result = await executeFluxoRequest({
      method: 'GET',
      path: '/v1/instances',
      apiKey,
      apiSecret
    });

    if (result.success) {
      const rawInstances = Array.isArray(result.data)
        ? result.data
        : (result.data?.instances || result.data?.data || []);

      const instances = Array.isArray(rawInstances) ? rawInstances : [];

      if (!memoryFluxoConfig.instanceId && instances.length > 0 && instances[0]?.id) {
        memoryFluxoConfig.instanceId = instances[0].id;
      }

      await logAudit(
        'TESTE_CONEXAO_FLUXO_SUCESSO',
        `Conexão com FluxoAPI testada com sucesso (${instances.length} instâncias encontradas, latência: ${result.latencyMs}ms)`,
        req
      );

      return res.json({
        success: true,
        latencyMs: result.latencyMs,
        instances,
        message: `Conexão autenticada via HMAC-SHA256 com sucesso! Encontrada(s) ${instances.length} instância(s).`
      });
    } else {
      await logAudit(
        'TESTE_CONEXAO_FLUXO_FALHA',
        `Falha ao testar FluxoAPI: ${result.error?.message || result.status}`,
        req
      );

      return res.status(result.status || 400).json({
        success: false,
        status: result.status,
        latencyMs: result.latencyMs,
        error: result.error,
        raw: result.raw,
        message: result.error?.message || 'Falha ao autenticar com a FluxoAPI.'
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'internal_error',
        message: err.message || 'Erro inesperado ao testar conexão com a FluxoAPI.'
      }
    });
  }
});

// POST send-test-message
app.post('/api/admin/fluxo/send-test-message', async (req: any, res) => {
  const isAdmin = isUserAdmin(req.user); // antes: liberava anônimo fora de produção
  if (!isAdmin) {
    return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
  }

  const { to, text, instanceId: requestedInstanceId } = req.body;
  if (!to || !text) {
    return res.status(400).json({ error: 'Destinatário (to) e mensagem de texto (text) são obrigatórios.' });
  }

  const apiKey = (memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
  const apiSecret = (memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();

  if (!apiKey || !apiSecret) {
    return res.status(400).json({
      error: 'Credenciais da FluxoAPI não configuradas.',
      hint: 'Configure a Chave Pública e Secreta antes de realizar o envio.'
    });
  }

  let cleanDigits = String(to).replace(/\D/g, '');
  if (cleanDigits.length === 10 || cleanDigits.length === 11) {
    cleanDigits = `55${cleanDigits}`;
  }
  const formattedE164 = `+${cleanDigits}`;

  const instanceId = requestedInstanceId || memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '';

  try {
    const payload = {
      to: formattedE164,
      type: 'text',
      text: {
        body: String(text)
      }
    };

    const targetPath = fluxoInstancePath('/messages', instanceId);

    const result = await executeFluxoRequest({
      method: 'POST',
      path: targetPath,
      body: payload,
      apiKey,
      apiSecret
    });

    if (result.success) {
      await logAudit(
        'WHATSAPP_DISPARO_TESTE',
        `Disparou WhatsApp de teste para ${formattedE164} (instância: ${instanceId || 'padrão'})`,
        req
      );

      return res.json({
        success: true,
        to: formattedE164,
        instanceId,
        latencyMs: result.latencyMs,
        result: result.data || result.raw,
        message: 'Mensagem de teste enviada com sucesso para a fila oficial da Meta!'
      });
    } else {
      return res.status(result.status || 400).json({
        success: false,
        status: result.status,
        latencyMs: result.latencyMs,
        error: result.error,
        raw: result.raw,
        message: result.error?.message || 'Erro retornado pela FluxoAPI ao disparar mensagem.'
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      error: `Erro ao enviar mensagem: ${err.message}`
    });
  }
});

// WEBHOOK FLUXOAPI & EVENT STORAGE
// List Instances — dados REAIS da FluxoAPI (GET /v1/instances). Nunca inventa uma "linha conectada".
app.get('/api/admin/fluxo/instances', async (req: any, res) => {
  const apiKey = (memoryFluxoConfig.apiKey || '').trim();
  const apiSecret = (memoryFluxoConfig.apiSecret || '').trim();

  if (!apiKey || !apiSecret) {
    return res.json({
      success: false,
      configured: false,
      instances: [],
      error: describeFluxoError({ code: 'missing_credentials' })
    });
  }

  try {
    const result = await executeFluxoRequest({
      method: 'GET',
      path: '/v1/instances',
      apiKey,
      apiSecret
    });

    if (!result.success) {
      return res.json({
        success: false,
        configured: true,
        instances: [],
        error: describeFluxoError(result.error, result.status)
      });
    }

    const raw = Array.isArray(result.data) ? result.data : (result.data?.instances || result.data?.data || []);
    const list: any[] = Array.isArray(raw) ? raw : [];

    // Uma credencial presa a 1 instância: adota automaticamente se ainda não há FLUXO_INSTANCE_ID
    if (!memoryFluxoConfig.instanceId && list.length === 1 && list[0]?.id) {
      memoryFluxoConfig.instanceId = String(list[0].id);
      console.log(`ℹ️ [FluxoAPI] FLUXO_INSTANCE_ID não definido: usando a única instância encontrada (${memoryFluxoConfig.instanceId}).`);
    }

    return res.json({
      success: true,
      configured: true,
      selectedInstanceId: memoryFluxoConfig.instanceId || null,
      instances: list.map((i: any) => ({
        id: i.id,
        name: i.name || i.id,
        phone: i.phone || null,
        status: i.status || 'unknown',
        mode: i.mode || 'unknown',
        coexistence: i.mode === 'coexistence',
        quality: String(i.quality || 'unknown').toUpperCase(),
        messagingLimit24h: i.messaging_limit_24h ?? null,
        throughputMps: i.throughput_mps ?? null,
        conversations24h: i.conversations_24h ?? null,
        messages24h: i.messages_24h ?? null
      }))
    });
  } catch (err: any) {
    return res.json({
      success: false,
      configured: true,
      instances: [],
      error: describeFluxoError({ code: 'network_error', message: err?.message })
    });
  }
});
// GET /api/runtime-config
// O que o front precisa saber sobre ESTE servidor, sem adivinhar nem chumbar no código:
// se as rotas de simulação existem, e qual é o número REAL da instância conectada.
const instanceInfoCache: { phone?: string; status?: string; fetchedAt: number } = { fetchedAt: 0 };
const INSTANCE_CACHE_MS = 60_000;

async function getInstanceInfo(): Promise<{ phone?: string; status?: string }> {
  const now = Date.now();
  if (now - instanceInfoCache.fetchedAt < INSTANCE_CACHE_MS) {
    return { phone: instanceInfoCache.phone, status: instanceInfoCache.status };
  }
  const apiKey = (memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
  const apiSecret = (memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();
  const instanceId = (memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '').trim();
  if (!apiKey || !apiSecret || !instanceId) {
    instanceInfoCache.fetchedAt = now;
    instanceInfoCache.phone = undefined;
    instanceInfoCache.status = 'unconfigured';
    return { phone: undefined, status: 'unconfigured' };
  }
  try {
    const result = await executeFluxoRequest({ method: 'GET', path: `/v1/instances/${instanceId}`, apiKey, apiSecret });
    const inst: any = result.success ? result.data : null;
    instanceInfoCache.fetchedAt = now;
    instanceInfoCache.phone = inst?.phone_number || inst?.phone || inst?.display_phone_number || undefined;
    instanceInfoCache.status = inst?.status || 'unknown';
  } catch {
    instanceInfoCache.fetchedAt = now;
    instanceInfoCache.status = 'unknown';
  }
  return { phone: instanceInfoCache.phone, status: instanceInfoCache.status };
}

app.get('/api/runtime-config', async (_req: any, res) => {
  const info = await getInstanceInfo();
  res.json({
    simulatorsEnabled: SIMULATORS_ENABLED,
    isProduction: IS_PRODUCTION,
    instancePhone: info.phone || null,
    instanceStatus: info.status || 'unknown',
    whatsappConnected: info.status === 'connected'
  });
});

// GET /api/admin/fluxo/instance-mode (T30: Diagnóstico do modo da instância para verificar se Coexistence está ativo)
app.get('/api/admin/fluxo/instance-mode', async (req: any, res) => {
  const apiKey = (memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
  const apiSecret = (memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();
  const instanceId = (memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '').trim();

  if (!apiKey || !apiSecret || !instanceId) {
    return res.status(400).json({
      configured: false,
      error: 'Credenciais da FluxoAPI ou FLUXO_INSTANCE_ID não configurados.',
      mode: 'unknown',
      status: 'unconfigured'
    });
  }

  try {
    const result = await executeFluxoRequest({
      method: 'GET',
      path: `/v1/instances/${instanceId}`,
      apiKey,
      apiSecret
    });

    if (result.success && result.data) {
      const inst = result.data;
      const mode = inst.mode || 'unknown';
      const status = inst.status || 'unknown';
      const isCoexistenceReady = mode === 'coexistence' && status === 'connected';

      return res.json({
        configured: true,
        instanceId,
        mode,
        status,
        quality: inst.quality || 'unknown',
        throughputMps: inst.throughput_mps || 80,
        messagingLimit24h: inst.messaging_limit_24h || 250,
        isCoexistenceReady,
        coexistenceNotice: isCoexistenceReady
          ? 'Coexistência ativa: mensagens enviadas pelo aplicativo WhatsApp Business do celular serão espelhadas no CRM.'
          : mode !== 'coexistence'
          ? 'Atenção: A instância está em modo api_only. Para ver mensagens enviadas pelo celular no CRM, ative o modo Coexistence no painel da FluxoAPI.'
          : 'Instância em modo coexistence, porém status ainda não está conectado.',
        raw: inst
      });
    }

    return res.status(result.status || 500).json({
      configured: true,
      error: result.error?.message || 'Falha ao consultar instância na FluxoAPI.',
      raw: result.raw
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Create or Connect Instance
app.post('/api/admin/fluxo/instances', async (req: any, res) => {
  const { name, phone } = req.body;
  const apiKey = (memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
  const apiSecret = (memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();

  try {
    const result = await executeFluxoRequest({
      method: 'POST',
      path: '/v1/instances',
      body: { name: name || 'NOVA_INSTANCIA', phone: phone || undefined },
      apiKey,
      apiSecret
    });

    await logAudit(
      'CRIAR_INSTANCIA_FLUXO',
      `Tentativa de criar instância ${name || 'NOVA'}`,
      req
    );

    return res.json({
      success: result.success,
      data: result.data || result.raw,
      message: result.success ? 'Instância criada com sucesso na FluxoAPI!' : (result.error?.message || 'Falha ao criar instância.')
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao criar instância: ${err.message}` });
  }
});

// Helper para consultar templates diretamente na Meta Graph API Oficial
async function fetchMetaGraphTemplates(accessToken: string, wabaId: string): Promise<{ success: boolean; templates?: any[]; error?: string }> {
  const token = (accessToken || '').trim();
  const id = (wabaId || '').trim();
  if (!token || !id) {
    return { success: false, error: 'Token de Acesso da Meta ou WABA ID não informados.' };
  }

  try {
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(id)}/message_templates?fields=name,status,category,language,components,quality_score,id,rejected_reason&limit=250`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `Erro HTTP ${res.status} ao consultar Meta Graph API`;
      return { success: false, error: msg };
    }

    const templates = Array.isArray(data.data) ? data.data : [];
    return { success: true, templates };
  } catch (err: any) {
    return { success: false, error: err.message || 'Falha de rede ao conectar à Meta Graph API' };
  }
}

function normalizeMetaGraphTemplate(t: any) {
  const components = Array.isArray(t.components) ? t.components : [];
  const headerComp = components.find((c: any) => c.type === 'HEADER');
  const bodyComp = components.find((c: any) => c.type === 'BODY');
  const footerComp = components.find((c: any) => c.type === 'FOOTER');
  const buttonsComp = components.find((c: any) => c.type === 'BUTTONS');

  const rawStatus = String(t.status || 'PENDING').toUpperCase();
  let qScore = 'GREEN';
  if (t.quality_score && typeof t.quality_score === 'object') {
    qScore = t.quality_score.score || 'GREEN';
  } else if (typeof t.quality_score === 'string') {
    qScore = t.quality_score;
  }

  return {
    id: String(t.id || `meta_${t.name}`),
    name: t.name,
    category: (t.category || 'UTILITY').toUpperCase(),
    language: t.language || 'pt_BR',
    status: rawStatus, // 'APPROVED', 'PENDING', 'REJECTED', 'PAUSED'
    components: components,
    headerText: headerComp?.text || '',
    bodyText: bodyComp?.text || '',
    footerText: footerComp?.text || '',
    buttons: buttonsComp?.buttons || [],
    usageCount: Number(t.usage_count || t.usageCount) || 0,
    qualityScore: qScore,
    rejectedReason: rawStatus === 'REJECTED' ? (t.rejected_reason || t.blockedReason || 'Rejeitado pelas políticas da Meta') : null,
    createdAt: t.created_at || t.createdAt || new Date().toISOString(),
    submittedToMeta: true,
    sendable: rawStatus === 'APPROVED'
  };
}

// List Templates
app.get('/api/admin/fluxo/templates', async (req: any, res) => {
  const apiKey = (memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
  const apiSecret = (memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();
  const instanceId = memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '';

  const metaToken = (memoryMetaConfig.accessToken || process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || '').trim();
  const metaWabaId = (memoryMetaConfig.wabaId || process.env.META_WABA_ID || process.env.WHATSAPP_WABA_ID || '').trim();

  const map = new Map<string, any>();
  let remoteError: string | null = null;
  let remoteMetaCount = 0;
  let remoteFluxoCount = 0;

  // 1. Carrega todos os templates salvos localmente em PostgreSQL (incluindo DRAFT, PENDING, APPROVED)
  if (usePostgres && pgPool) {
    try {
      const dbRes = await pgPool.query(
        `SELECT id, name, category, language, status, components, usage_count, quality_score, rejected_reason, created_at 
         FROM meta_templates 
         ORDER BY created_at DESC`
      );
      for (const r of dbRes.rows) {
        const comps = typeof r.components === 'string' ? JSON.parse(r.components) : (r.components || []);
        map.set(r.name.toLowerCase(), {
          id: r.id,
          name: r.name,
          category: r.category,
          language: r.language,
          status: r.status,
          components: comps,
          headerText: comps.find((c: any) => c.type === 'HEADER')?.text || '',
          bodyText: comps.find((c: any) => c.type === 'BODY')?.text || '',
          footerText: comps.find((c: any) => c.type === 'FOOTER')?.text || '',
          buttons: comps.find((c: any) => c.type === 'BUTTONS')?.buttons || [],
          usageCount: Number(r.usage_count) || 0,
          qualityScore: r.quality_score || 'GREEN',
          rejectedReason: r.rejected_reason || null,
          createdAt: r.created_at,
          submittedToMeta: r.status !== 'DRAFT',
          sendable: r.status === 'APPROVED'
        });
      }
    } catch (err) {
      console.warn('[PostgreSQL] Erro ao carregar meta_templates:', err);
    }
  }

  // Rascunhos em memória
  memoryTemplates.forEach(t => {
    if (t.status === 'DRAFT' && !map.has(t.name.toLowerCase())) {
      map.set(t.name.toLowerCase(), t);
    }
  });

  // 2. Consulta direta à Meta Graph API Oficial se credenciais estiverem configuradas
  if (metaToken && metaWabaId) {
    try {
      const metaRes = await fetchMetaGraphTemplates(metaToken, metaWabaId);
      if (metaRes.success && metaRes.templates) {
        remoteMetaCount = metaRes.templates.length;
        for (const rawTpl of metaRes.templates) {
          const normalized = normalizeMetaGraphTemplate(rawTpl);
          map.set(normalized.name.toLowerCase(), normalized);

          // Salva/sincroniza no PostgreSQL para persistência definitiva
          if (usePostgres && pgPool) {
            try {
              await pgPool.query(
                `INSERT INTO meta_templates (id, name, category, language, status, components, usage_count, quality_score, rejected_reason, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
                 ON CONFLICT (name) DO UPDATE SET
                   status = EXCLUDED.status,
                   category = EXCLUDED.category,
                   language = EXCLUDED.language,
                   components = EXCLUDED.components,
                   quality_score = EXCLUDED.quality_score,
                   rejected_reason = EXCLUDED.rejected_reason`,
                [
                  normalized.id,
                  normalized.name,
                  normalized.category,
                  normalized.language,
                  normalized.status,
                  JSON.stringify(normalized.components),
                  normalized.usageCount,
                  normalized.qualityScore,
                  normalized.rejectedReason
                ]
              );
            } catch (upsertErr) {
              console.warn(`[PostgreSQL] Falha ao sincronizar template "${normalized.name}":`, upsertErr);
            }
          }
        }
      } else if (metaRes.error) {
        remoteError = metaRes.error;
      }
    } catch (metaErr: any) {
      remoteError = metaErr.message;
    }
  }

  // 3. Consulta à FluxoAPI se configurada
  if (apiKey && apiSecret) {
    try {
      const path = instanceId ? `/v1/instances/${instanceId}/templates` : '/v1/templates';
      const result = await executeFluxoRequest({
        method: 'GET',
        path,
        apiKey,
        apiSecret
      });
      if (result.success && result.data) {
        const fluxoTpls = Array.isArray(result.data) ? result.data : (result.data?.data || result.data?.templates || []);
        remoteFluxoCount = fluxoTpls.length;
        fluxoTpls.forEach((t: any) => {
          if (t && t.name) {
            const reconstructedComponents: any[] = [];
            if (t.headerText) reconstructedComponents.push({ type: 'HEADER', format: 'TEXT', text: t.headerText });
            if (t.bodyText) reconstructedComponents.push({ type: 'BODY', text: t.bodyText });
            if (t.footerText) reconstructedComponents.push({ type: 'FOOTER', text: t.footerText });
            if (t.buttons && Array.isArray(t.buttons) && t.buttons.length > 0) {
              reconstructedComponents.push({ type: 'BUTTONS', buttons: t.buttons });
            }

            const rawStatus = (t.status || 'PENDING').toUpperCase();
            let qScore = 'GREEN';
            if (t.quality_score && typeof t.quality_score === 'object') {
              qScore = t.quality_score.score || 'GREEN';
            } else if (typeof t.quality_score === 'string') {
              qScore = t.quality_score;
            }

            const isRejected = rawStatus === 'REJECTED';
            const rejectedReason = isRejected ? (t.blockedReason || 'Rejeitado pelas políticas da Meta') : null;

            map.set(t.name.toLowerCase(), {
              id: t.id || `tpl_${t.name}`,
              name: t.name,
              category: (t.category || 'UTILITY').toUpperCase(),
              language: t.language || 'pt_BR',
              status: rawStatus,
              components: reconstructedComponents,
              headerText: t.headerText || '',
              bodyText: t.bodyText || '',
              footerText: t.footerText || '',
              buttons: t.buttons || [],
              usageCount: 0,
              qualityScore: qScore,
              rejectedReason,
              createdAt: new Date().toISOString(),
              submittedToMeta: true,
              sendable: rawStatus === 'APPROVED',
              blockedReason: t.blockedReason || null,
              fields: t.fields || []
            });
          }
        });
      }
    } catch (err: any) {
      if (!remoteError) remoteError = err.message;
    }
  }

  return res.json({
    success: true,
    templates: Array.from(map.values()),
    remoteMetaCount,
    remoteFluxoCount,
    remoteCount: remoteMetaCount + remoteFluxoCount,
    remoteError,
    metaConnected: Boolean(metaToken && metaWabaId)
  });
});

// Sincronização explícita em tempo real com a Meta
app.post('/api/admin/fluxo/templates/sync-meta', async (req: any, res) => {
  const metaToken = (memoryMetaConfig.accessToken || process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || '').trim();
  const metaWabaId = (memoryMetaConfig.wabaId || process.env.META_WABA_ID || process.env.WHATSAPP_WABA_ID || '').trim();

  if (!metaToken || !metaWabaId) {
    return res.status(400).json({
      success: false,
      error: 'Token de Acesso da Meta ou WABA ID não configurados. Configure na aba Conexão.'
    });
  }

  try {
    const metaRes = await fetchMetaGraphTemplates(metaToken, metaWabaId);
    if (!metaRes.success || !metaRes.templates) {
      return res.status(502).json({
        success: false,
        error: metaRes.error || 'Falha ao consultar Meta Graph API.'
      });
    }

    const syncedList: any[] = [];
    for (const rawTpl of metaRes.templates) {
      const normalized = normalizeMetaGraphTemplate(rawTpl);
      syncedList.push(normalized);

      if (usePostgres && pgPool) {
        try {
          await pgPool.query(
            `INSERT INTO meta_templates (id, name, category, language, status, components, usage_count, quality_score, rejected_reason, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
             ON CONFLICT (name) DO UPDATE SET
               status = EXCLUDED.status,
               category = EXCLUDED.category,
               language = EXCLUDED.language,
               components = EXCLUDED.components,
               quality_score = EXCLUDED.quality_score,
               rejected_reason = EXCLUDED.rejected_reason`,
            [
              normalized.id,
              normalized.name,
              normalized.category,
              normalized.language,
              normalized.status,
              JSON.stringify(normalized.components),
              normalized.usageCount,
              normalized.qualityScore,
              normalized.rejectedReason
            ]
          );
        } catch (dbErr) {
          console.warn('[PostgreSQL] Erro ao sincronizar template:', dbErr);
        }
      }
    }

    await logAudit(
      'SINCRONIZAR_TEMPLATES_META',
      `Admin sincronizou ${syncedList.length} templates diretamente da Meta Graph API`,
      req
    );

    return res.json({
      success: true,
      count: syncedList.length,
      templates: syncedList,
      message: `${syncedList.length} modelos sincronizados diretamente da Meta com sucesso!`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Create & Submit Template to Meta (or save as Draft)
app.post('/api/admin/fluxo/templates', async (req: any, res) => {
  const { name, category, language, components, isDraft, status: initialStatus, examples, bodyText: explicitBodyText, footerText: explicitFooterText, buttons: explicitButtons } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Nome do template é obrigatório.' });
  }

  const normalizedName = String(name).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const targetCategory = category === 'MARKETING' ? 'MARKETING' : 'UTILITY';
  const targetLanguage = language || 'pt_BR';
  const isSavingAsDraft = Boolean(isDraft || initialStatus === 'DRAFT');

  // Extract body text
  let bodyText = explicitBodyText || '';
  let footerText: string | undefined = explicitFooterText ? String(explicitFooterText).trim() : undefined;
  let buttonsList: any[] = Array.isArray(explicitButtons) ? explicitButtons : [];

  if (Array.isArray(components)) {
    const bComp = components.find((c: any) => c.type === 'BODY');
    if (bComp?.text && !bodyText) {
      bodyText = bComp.text;
    }
    const fComp = components.find((c: any) => c.type === 'FOOTER');
    if (fComp?.text && !footerText) {
      footerText = String(fComp.text).trim();
    }
    const btnComp = components.find((c: any) => c.type === 'BUTTONS');
    if (btnComp && Array.isArray(btnComp.buttons) && buttonsList.length === 0) {
      buttonsList = btnComp.buttons;
    }
  }

  if (!bodyText.trim()) {
    return res.status(400).json({ error: 'O corpo do template (BODY) é obrigatório.' });
  }

  // Detect variables {{1}}, {{2}}, etc.
  const varMatches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
  const uniqueVars = Array.from(new Set(varMatches.map(m => m.replace(/[{}]/g, '')))).sort((a, b) => Number(a) - Number(b));

  let resolvedExamples: string[] = [];
  if (Array.isArray(examples) && examples.length > 0) {
    resolvedExamples = examples.map(e => String(e).trim()).filter(Boolean);
  }

  // If there are variables but examples are missing or incomplete, auto-populate realistic examples required by Meta
  if (uniqueVars.length > 0 && resolvedExamples.length < uniqueVars.length) {
    const defaultExamples = targetCategory === 'UTILITY' ? [
      'Caio',
      'Seu pedido foi confirmado com sucesso e em breve estará no seu destino.',
      'O link para rastreio da viagem já está disponível para acesso, conforme solicitado.',
      'Código de rastreio #883921',
      'Central de Atendimento ao Cliente'
    ] : [
      'Marcelo',
      'Confira a proposta comercial exclusiva preparada para a sua empresa',
      'https://nyroh.com.br/demo',
      'Segunda-feira às 15:00',
      'Equipe Comercial'
    ];
    resolvedExamples = uniqueVars.map((_, i) => resolvedExamples[i] || defaultExamples[i] || `Exemplo ${i + 1}`);
  }

  // Format buttons as QUICK_REPLY
  const formattedButtons = buttonsList.map((b: any) => {
    const textVal = typeof b === 'string' ? b : (b.text || b.label || String(b));
    return {
      type: 'QUICK_REPLY',
      text: String(textVal).trim()
    };
  }).filter(b => b.text.length > 0);

  // Build real FluxoAPI / Meta Payload
  const fluxoPayload: any = {
    name: normalizedName,
    category: targetCategory,
    language: targetLanguage,
    body: {
      text: bodyText.trim()
    }
  };

  if (resolvedExamples.length > 0) {
    fluxoPayload.body.examples = resolvedExamples;
  }
  if (footerText) {
    fluxoPayload.footer = footerText;
  }
  if (formattedButtons.length > 0) {
    fluxoPayload.buttons = formattedButtons;
  }

  const apiKey = (memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
  const apiSecret = (memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();
  const instanceId = memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '';

  let remoteResult: any = null;

  if (!isSavingAsDraft) {
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Credenciais da FluxoAPI (Key e Secret) não configuradas.' });
    }

    const targetPath = instanceId ? `/v1/instances/${instanceId}/templates` : '/v1/templates';
    remoteResult = await executeFluxoRequest({
      method: 'POST',
      path: targetPath,
      body: fluxoPayload,
      apiKey,
      apiSecret
    });

    if (!remoteResult.success) {
      console.error('[Meta/FluxoAPI Error]', remoteResult);
      const errMsg = remoteResult.error?.message || (typeof remoteResult.error === 'string' ? remoteResult.error : null) || 'A Meta rejeitou a criação do template.';
      return res.status(remoteResult.status || 422).json({
        success: false,
        error: `Erro Meta/FluxoAPI (${remoteResult.status || 422}): ${errMsg}`,
        details: remoteResult.data || remoteResult.raw || remoteResult.error
      });
    }
  }

  const metaReturnedStatus = remoteResult?.data?.status ? String(remoteResult.data.status).toUpperCase() : (isSavingAsDraft ? 'DRAFT' : 'PENDING');
  const metaTemplateId = remoteResult?.data?.id || `tpl_${Date.now()}`;

  const reconstructedComponents: any[] = [{ type: 'BODY', text: bodyText.trim() }];
  if (footerText) reconstructedComponents.push({ type: 'FOOTER', text: footerText });
  if (formattedButtons.length > 0) reconstructedComponents.push({ type: 'BUTTONS', buttons: formattedButtons });

  const newTemplate: StoredMetaTemplate = {
    id: metaTemplateId,
    name: normalizedName,
    category: targetCategory,
    language: targetLanguage,
    status: metaReturnedStatus as any,
    components: reconstructedComponents,
    usageCount: 0,
    qualityScore: 'UNKNOWN',
    createdAt: new Date().toISOString(),
    submittedToMeta: !isSavingAsDraft
  };

  // Add to local list or replace if exists
  const existingIndex = memoryTemplates.findIndex(t => t.name === normalizedName);
  if (existingIndex >= 0) {
    memoryTemplates[existingIndex] = newTemplate;
  } else {
    memoryTemplates.unshift(newTemplate);
  }

  // Persist template into PostgreSQL meta_templates
  if (usePostgres && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO meta_templates (id, name, category, language, status, components, usage_count, quality_score, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
         ON CONFLICT (name) DO UPDATE SET
           category = EXCLUDED.category,
           language = EXCLUDED.language,
           status = EXCLUDED.status,
           components = EXCLUDED.components,
           quality_score = EXCLUDED.quality_score`,
        [
          newTemplate.id,
          newTemplate.name,
          newTemplate.category,
          newTemplate.language,
          newTemplate.status,
          JSON.stringify(newTemplate.components),
          newTemplate.usageCount,
          newTemplate.qualityScore
        ]
      );
      console.log(`[PostgreSQL] Template ${newTemplate.name} salvo com sucesso no banco de dados (status: ${metaReturnedStatus}).`);
    } catch (tplDbErr) {
      console.error('[PostgreSQL] Erro ao salvar template no banco:', tplDbErr);
    }
  }

  await logAudit(
    isSavingAsDraft ? 'CRIAR_RASCUNHO_TEMPLATE' : 'SUBMETER_TEMPLATE_META',
    `Template ${normalizedName} ${isSavingAsDraft ? 'salvo como rascunho' : 'submetido para aprovação da Meta'} (${targetCategory})`,
    req
  );

  return res.json({
    success: true,
    template: newTemplate,
    remoteResult: remoteResult?.data,
    message: isSavingAsDraft
      ? 'Template salvo como Rascunho com sucesso!'
      : `Template enviado com sucesso para a Meta! Status atual: ${metaReturnedStatus} (ID Meta: ${metaTemplateId})`
  });
});

// Update Template Status / Quality Score
app.patch('/api/admin/fluxo/templates/:name/status', async (req: any, res) => {
  const { name } = req.params;
  const { status, qualityScore, rejectedReason } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status é obrigatório.' });
  }

  const targetStatus = String(status).toUpperCase();

  // Update in memory
  const tpl = memoryTemplates.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (tpl) {
    tpl.status = targetStatus as any;
    if (qualityScore) tpl.qualityScore = qualityScore;
    if (rejectedReason !== undefined) tpl.rejectedReason = rejectedReason;
  }

  // Update in PostgreSQL
  if (usePostgres && pgPool) {
    try {
      await pgPool.query(
        `UPDATE meta_templates SET 
           status = $1, 
           quality_score = COALESCE($2, quality_score), 
           rejected_reason = COALESCE($3, rejected_reason) 
         WHERE LOWER(name) = LOWER($4)`,
        [targetStatus, qualityScore || null, rejectedReason || null, name]
      );
    } catch (err) {
      console.warn('[PostgreSQL] Erro ao atualizar status do template:', err);
    }
  }

  await logAudit('ALTERAR_STATUS_TEMPLATE', `Status do template ${name} alterado para ${targetStatus}`, req);

  return res.json({
    success: true,
    message: `Status do template ${name} atualizado para ${targetStatus} com sucesso!`
  });
});

// Delete Template
app.delete('/api/admin/fluxo/templates/:name', async (req: any, res) => {
  const { name } = req.params;

  // Remove from memory
  const idx = memoryTemplates.findIndex(t => t.name.toLowerCase() === name.toLowerCase() || t.id === name);
  if (idx >= 0) {
    memoryTemplates.splice(idx, 1);
  }

  // Remove from PostgreSQL
  if (usePostgres && pgPool) {
    try {
      await pgPool.query(`DELETE FROM meta_templates WHERE LOWER(name) = LOWER($1) OR id = $1`, [name]);
    } catch (err) {
      console.warn('[PostgreSQL] Erro ao deletar template do banco:', err);
    }
  }

  await logAudit('EXCLUIR_TEMPLATE_META', `Template ${name} excluído do sistema`, req);

  return res.json({
    success: true,
    message: `Template ${name} excluído com sucesso.`
  });
});

// Send Template Test Message
app.post('/api/admin/fluxo/send-template-test', async (req: any, res) => {
  const { to, templateName, language, parameters, requestedInstanceId } = req.body;

  if (!to || !templateName) {
    return res.status(400).json({ error: 'Número de destino e nome do template são obrigatórios.' });
  }

  let cleanDigits = String(to).replace(/\D/g, '');
  if (cleanDigits.length === 10 || cleanDigits.length === 11) {
    cleanDigits = `55${cleanDigits}`;
  }
  const formattedE164 = `+${cleanDigits}`;

  const apiKey = (memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
  const apiSecret = (memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();
  const instanceId = requestedInstanceId || memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '';

  // Preparar mapeamento de variáveis para o template da Meta / FluxoAPI
  let variablesObj: Record<string, string> = {};
  if (req.body.variables && typeof req.body.variables === 'object') {
    variablesObj = { ...req.body.variables };
  } else if (Array.isArray(parameters)) {
    parameters.forEach((val: any, idx: number) => {
      variablesObj[String(idx + 1)] = String(val ?? '');
    });
  }

  const cleanVariablesObj: Record<string, string> = {};
  for (const [k, v] of Object.entries(variablesObj)) {
    cleanVariablesObj[k] = String(v ?? '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  try {
    // Monta o corpo pela definição REAL do modelo (catálogo) — ver sendTemplateViaFluxo
    const result = await sendTemplateViaFluxo({
      to: formattedE164,
      name: String(templateName).trim(),
      language: typeof language === 'string' ? language : 'pt_BR',
      variables: cleanVariablesObj,
      creds: { instanceId, apiKey, apiSecret }
    });

    if (result.success) {
      // Increment usage count for template
      if (usePostgres && pgPool) {
        try {
          await pgPool.query(
            `UPDATE meta_templates SET usage_count = COALESCE(usage_count, 0) + 1 WHERE LOWER(name) = LOWER($1)`,
            [templateName]
          );
        } catch (uErr) {
          console.warn('[PostgreSQL] Erro ao atualizar usage_count do template:', uErr);
        }
      }
      const memTpl = memoryTemplates.find(t => t.name.toLowerCase() === String(templateName).toLowerCase());
      if (memTpl) {
        memTpl.usageCount = (memTpl.usageCount || 0) + 1;
      }

      await logAudit(
        'DISPARO_TEMPLATE_TESTE',
        `Disparou template ${templateName} para ${formattedE164}`,
        req
      );

      return res.json({
        success: true,
        to: formattedE164,
        templateName,
        latencyMs: result.latencyMs,
        result: result.data || result.raw,
        message: 'Template enviado com sucesso para a fila oficial da Meta!'
      });
    } else {
      return res.status(result.status || 400).json({
        success: false,
        status: result.status,
        latencyMs: result.latencyMs,
        error: result.error,
        raw: result.raw,
        message: result.error?.message || 'Erro ao enviar template pela FluxoAPI.'
      });
    }
  } catch (err: any) {
    return res.status(500).json({ error: `Erro no envio do template: ${err.message}` });
  }
});

// POST /api/campaign/test-dispatch - Ambiente de Teste de Disparo Individual vinculado ao Vendedor/Thomas
app.post('/api/campaign/test-dispatch', async (req: any, res) => {
  const {
    phoneNumber,
    leadName = 'Lead Teste WhatsApp',
    salespersonId = 'seller-thomas',
    metaTemplateName,
    templateName,
    copyTemplateId,
    dispatchMode = 'official_meta_template', // Por padrão usa o template oficial aprovado na Meta
    messageText,
    variables,
    var1,
    var2,
    var3,
    parameters = [],
    publicUrl = 'https://nyroh.app/preview-empresa-teste',
    website = '',
    niche = 'Geral / Teste',
    customNotes = 'Disparado via Ambiente de Teste de Disparos'
  } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ error: 'Número de telefone é obrigatório.' });
  }

  // Nome oficial do template aprovado na Meta (ex: 'dns_escassez_np4' ou 'notificacao_pedido_atendimento')
  const effectiveMetaTemplate = String(metaTemplateName || templateName || 'dns_escassez_np4').trim();

  // Limpar telefone e formatar rigorosamente em E.164 (+55...)
  let cleanDigits = String(phoneNumber).replace(/\D/g, '');
  if (cleanDigits.length === 10 || cleanDigits.length === 11) {
    cleanDigits = `55${cleanDigits}`;
  }
  const formattedE164 = `+${cleanDigits}`;

  // Resolver nome do vendedor
  let resolvedSellerName = 'Thomas';
  if (usePostgres && pgPool) {
    try {
      const spRes = await pgPool.query('SELECT name FROM salespeople WHERE id = $1', [salespersonId]);
      if (spRes.rows.length > 0) resolvedSellerName = spRes.rows[0].name;
    } catch {
      resolvedSellerName = 'Thomas';
    }
  } else {
    const sp = memorySalespeopleMap.get(salespersonId);
    if (sp) resolvedSellerName = sp.name;
  }

  // Verificar se o lead já existe previamente no CRM para reutilizar o mesmo ID e unificar o chat
  const existingLeadMatch = await findLeadByPhoneNumber(cleanDigits);
  const leadId = existingLeadMatch?.id || `lead-test-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const effectiveLeadName = (existingLeadMatch?.name && existingLeadMatch.name !== 'Cliente' && !existingLeadMatch.name.startsWith('Lead ('))
    ? existingLeadMatch.name
    : leadName;
  const now = new Date().toISOString();

  // Resolver as 3 variáveis da copy para encaixar no template oficial da Meta
  let resolvedVariables: Record<string, string> = {};
  if (variables && typeof variables === 'object') {
    resolvedVariables = {
      '1': String(variables['1'] || variables.var1 || '').trim(),
      '2': String(variables['2'] || variables.var2 || '').trim(),
      '3': String(variables['3'] || variables.var3 || '').trim()
    };
  } else if (var1 || var2 || var3) {
    resolvedVariables = {
      '1': String(var1 || '').trim(),
      '2': String(var2 || '').trim(),
      '3': String(var3 || '').trim()
    };
  } else if (Array.isArray(parameters) && parameters.length > 0) {
    resolvedVariables = {
      '1': String(parameters[0] || '').trim(),
      '2': String(parameters[1] || '').trim(),
      '3': String(parameters[2] || '').trim()
    };
  }

  // Montar texto de fallback se as variáveis vierem vazias
  const firstName = leadName.trim() ? leadName.trim().split(' ')[0] : 'Cliente';
  if (!resolvedVariables['1']) {
    resolvedVariables['1'] = `${firstName}! Bom diaaa! Ótima semana 😄 Falo com o responsável?`;
  }
  if (!resolvedVariables['2']) {
    resolvedVariables['2'] = `Eu sou ${resolvedSellerName} e queria te fazer uma pergunta: você ficaria chateado se eu tivesse criado um site para a sua empresa sem você me pedir? 😂 Eu sou bem proativo e preferi criar algo primeiro para te mostrar.`;
  }
  if (!resolvedVariables['3']) {
    resolvedVariables['3'] = `Realmente desenvolvi uma prévia exclusiva: 🔗 ${publicUrl || 'https://nyroh.app/preview'}\n\nConsegue me dar um feedback sincero do que achou?`;
  }

  // Montar texto completo da mensagem para o histórico do chat
  const renderedFullText = messageText || (
    effectiveMetaTemplate === 'dns_escassez_np4'
      ? `Ei,\n\n${resolvedVariables['1']}\n\n${resolvedVariables['2']}\n\n${resolvedVariables['3']}\n\n*Clique no link abaixo para saber mais*`
      : `Ei, ${resolvedVariables['1']}\n\n${resolvedVariables['2']}\n\n${resolvedVariables['3']}\n\nClique no botão abaixo para acessar:`
  );

  // 1. Inserir ou atualizar Lead no CRM (PostgreSQL ou memória)
  let createdLead: any = null;
  if (usePostgres && pgPool) {
    try {
      const insRes = await pgPool.query(
        `INSERT INTO leads (
          id, name, phone_number, public_url, website, niche, column_status, sub_status,
          salesperson_id, salesperson_name, last_call_tag, call_count, notes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          sub_status = EXCLUDED.sub_status,
          last_call_tag = EXCLUDED.last_call_tag,
          call_count = leads.call_count + 1,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, name, phone_number AS "phoneNumber", public_url AS "publicUrl", website, niche, column_status AS "columnStatus", sub_status AS "subStatus", salesperson_id AS "salespersonId", salesperson_name AS "salespersonName", last_call_tag AS "lastCallTag", call_count AS "callCount", notes, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          leadId,
          effectiveLeadName,
          formattedE164,
          publicUrl,
          website || null,
          niche,
          'Leads',
          'Disparo WhatsApp Realizado (Aguardando Resposta)',
          salespersonId,
          resolvedSellerName,
          '🔥 Disparo WhatsApp Feito',
          1,
          customNotes,
          now,
          now
        ]
      );
      if (insRes.rows.length > 0) {
        createdLead = insRes.rows[0];
      }
    } catch (err: any) {
      console.warn('[Test Dispatch] Inserção PostgreSQL com fallback:', err.message);
    }
  }

  if (!createdLead) {
    const existing = memoryLeadsMap.get(leadId);
    createdLead = {
      id: leadId,
      name: effectiveLeadName,
      phoneNumber: formattedE164,
      publicUrl: publicUrl || existing?.publicUrl,
      website: website || existing?.website,
      niche: niche || existing?.niche,
      columnStatus: existing?.columnStatus || 'Leads',
      subStatus: 'Disparo WhatsApp Realizado (Aguardando Resposta)',
      salespersonId,
      salespersonName: resolvedSellerName,
      lastCallTag: '🔥 Disparo WhatsApp Feito',
      callCount: (existing?.callCount || 0) + 1,
      notes: customNotes || existing?.notes,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    memoryLeadsMap.set(leadId, createdLead);
  }

  // 2. Criar a mensagem enviada de chat (LeadChatMessage) no histórico oficial do Thomas
  const outgoingMessage: LeadChatMessage = {
    id: `msg_test_${Date.now()}`,
    leadId,
    sender: 'salesperson',
    senderName: resolvedSellerName,
    text: renderedFullText,
    templateName: effectiveMetaTemplate,
    status: 'delivered',
    timestamp: now
  };

  const currentMsgs = memoryLeadMessagesMap.get(leadId) || [];
  currentMsgs.push(outgoingMessage);
  memoryLeadMessagesMap.set(leadId, currentMsgs);

  if (usePostgres && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO lead_messages (id, lead_id, phone_number, sender, sender_name, text, template_name, status, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'delivered', CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO NOTHING`,
        [outgoingMessage.id, leadId, (createdLead?.phoneNumber || formattedE164 || '').replace(/\D/g, '') || null, outgoingMessage.sender, outgoingMessage.senderName, outgoingMessage.text, outgoingMessage.templateName || null]
      );
    } catch (testMsgErr: any) {
      console.warn('[PostgreSQL] Erro ao persistir mensagem de teste em lead_messages:', testMsgErr.message);
    }
  }

  // 3. Tentar disparar pela FluxoAPI / Meta Cloud API
  let dispatchResult: any = { mode: 'pending', success: false };
  const apiKey = (memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
  const apiSecret = (memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();
  const instanceId = memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '';

  if (apiKey && apiSecret) {
    try {
      if (dispatchMode === 'direct_text') {
        // Modo de envio direto de texto puro
        const targetPath = fluxoInstancePath('/messages', instanceId);
        const fRes = await executeFluxoRequest({
          method: 'POST',
          path: targetPath,
          body: {
            to: formattedE164,
            type: 'text',
            text: { body: renderedFullText }
          },
          apiKey,
          apiSecret
        });
        dispatchResult = {
          mode: 'direct_text',
          targetPhone: formattedE164,
          ...fRes
        };
      } else {
        // Modo Padrão Oficial: Disparo via Template Homologado na Meta (/messages/template)
        // Sanitizar variáveis para a Meta
        const sanitizedVariables: Record<string, string> = {};
        for (const [k, v] of Object.entries(resolvedVariables)) {
          sanitizedVariables[k] = String(v || '')
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/ {2,}/g, ' ')
            .trim();
        }

        // Corpo montado pela definição real do modelo (catálogo) — sem o antigo "fallback" de formato inválido
        const fRes = await sendTemplateViaFluxo({
          to: formattedE164,
          name: String(effectiveMetaTemplate),
          language: 'pt_BR',
          variables: sanitizedVariables,
          creds: { instanceId, apiKey, apiSecret }
        });
        const returnedMessageId = fRes.data?.id || (fRes.data as any)?.message_id;

        dispatchResult = {
          mode: 'official_meta_template',
          templateName: effectiveMetaTemplate,
          targetPhone: formattedE164,
          messageId: returnedMessageId,
          variablesSent: sanitizedVariables,
          ...fRes
        };
      }
    } catch (fErr: any) {
      console.warn('[Test Dispatch] Fluxo API request error:', fErr.message);
      dispatchResult = { mode: 'network_error', success: false, error: fErr.message };
    }
  } else {
    dispatchResult = {
      mode: 'credentials_missing',
      success: false,
      error: 'Credenciais FLUXO_KEY e FLUXO_SECRET não estão configuradas no servidor.'
    };
  }

  // 4. Transmitir SSE em tempo real para o Kanban e WhatsApp
  broadcastSSE('NEW_LEAD', {
    lead: createdLead,
    message: outgoingMessage
  });
  broadcastSSE('NEW_MESSAGE', {
    leadId,
    leadName,
    message: outgoingMessage
  });

  await logAudit('TESTE_DISPARO_INDIVIDUAL', `Disparo de teste realizado para ${formattedE164} atribuído a ${resolvedSellerName}`, req);

  return res.json({
    success: true,
    message: 'Disparo de teste executado com sucesso!',
    lead: createdLead,
    outgoingMessage,
    dispatchResult
  });
});

// Helper de tradução e diagnóstico de erros oficiais da Meta
function translateMetaErrorCode(code: number | string | undefined, originalMsg?: string) {
  const c = String(code || '');
  if (c === '131042') {
    return {
      title: 'Problema de Pagamento / Faturamento da Meta',
      description: 'A sua conta do WhatsApp Business na Meta (WABA) vinculada a esta instância não possui forma de pagamento ativa cadastrada no Meta Business Suite para cobrir o custo de templates oficiais da Meta.',
      action: 'Adicione um cartão de crédito no Gerenciador de Negócios da Meta (business.facebook.com > Faturamento ou Contas do WhatsApp > Configurações de Pagamento).',
      link: 'https://business.facebook.com/billing_hub'
    };
  }
  if (c === '132018') {
    return {
      title: 'Parâmetros do Template Inválidos',
      description: 'A Meta rejeitou porque os parâmetros do template continham quebras de linha (\n) ou múltiplos espaços. O sistema agora sanitiza automaticamente antes do envio.',
      action: 'O sistema corrigiu e sanitizou as variáveis para os próximos envios.'
    };
  }
  if (c === '131026') {
    return {
      title: 'Mensagem Não Entregável',
      description: 'O número de destino não pôde receber a mensagem. Pode não possuir WhatsApp ativo ou estar temporariamente fora de área.',
      action: 'Confirme se o número do WhatsApp de teste está correto e ativo.'
    };
  }
  if (c === '131047' || c.toLowerCase().includes('window_closed')) {
    return {
      title: 'Janela de Conversa de 24h Fechada',
      description: 'O contato não enviou mensagem nas últimas 24 horas. Para iniciar contato, use um Template Homologado na Meta.',
      action: 'Envie via Template Homologado da Meta.'
    };
  }
  return {
    title: `Erro da Meta (${c || 'desconhecido'})`,
    description: originalMsg || 'A Meta não concluiu a entrega da mensagem.',
    action: 'Verifique as configurações da conta no Meta Business Suite ou envie diretamente pelo WhatsApp Web.'
  };
}


// Endpoint de Verificação em Tempo Real do Status de Entrega da Meta
app.get('/api/campaign/test-dispatch/status/:messageId', async (req: any, res) => {
  const { messageId } = req.params;
  if (!messageId) {
    return res.status(400).json({ error: 'messageId é obrigatório' });
  }

  // 1. Procurar localmente nos eventos de webhook
  let foundEvt = lastFluxoWebhookEvents.find(
    e => e.payload?.data?.message_id === messageId || e.payload?.data?.id === messageId
  );

  if (foundEvt && foundEvt.payload?.data) {
    const data = foundEvt.payload.data;
    const status = data.status; // 'failed', 'delivered', 'sent', 'read'
    const errObj = data.error;

    return res.json({
      success: true,
      messageId,
      deliveryStatus: status || 'unknown',
      error: errObj,
      translation: errObj ? translateMetaErrorCode(errObj.code, errObj.message) : null,
      eventTimestamp: data.at || foundEvt.receivedAt
    });
  }

  return res.json({
    success: true,
    messageId,
    deliveryStatus: 'queued',
    message: 'Mensagem ainda na fila de processamento da Meta (aguardando confirmação).'
  });
});

// GET Webhook Events
app.get('/api/admin/fluxo/events', (req: any, res) => {
  return res.json({
    success: true,
    total: lastFluxoWebhookEvents.length,
    events: lastFluxoWebhookEvents
  });
});

// DELETE Webhook Events (Clear logs)
app.delete('/api/admin/fluxo/events', (req: any, res) => {
  lastFluxoWebhookEvents.length = 0;
  return res.json({ success: true, message: 'Logs de eventos limpos com sucesso.' });
});

// Simulate Webhook Event
app.post('/api/admin/fluxo/events/simulate', (req: any, res) => {
  const { type, status, recipientPhone } = req.body;
  const simulatedEvent: FluxoWebhookEvent = {
    id: `evt_sim_${Date.now()}`,
    receivedAt: new Date().toLocaleTimeString('pt-BR'),
    type: type || 'status_update',
    summary: `Simulação de ${status || 'delivered'} para ${recipientPhone || '+55 11 98821-6073'}`,
    payload: {
      status: status || 'delivered',
      recipient_id: recipientPhone || '+5511988216073',
      timestamp: String(Math.floor(Date.now() / 1000)),
      simulated: true
    }
  };

  lastFluxoWebhookEvents.unshift(simulatedEvent);
  if (lastFluxoWebhookEvents.length > 50) lastFluxoWebhookEvents.pop();

  return res.json({ success: true, event: simulatedEvent });
});

// ESPELHAMENTO OPCIONAL de webhooks de outro ambiente (ex.: produção → seu computador). DESLIGADO por padrão.
//
// Antes isto ligava SOZINHO em qualquer servidor fora da Railway: a cada 3s buscava, SEM login, os últimos eventos da
// produção (telefones e textos de CLIENTES REAIS) em https://nyroh-crm-production.up.railway.app e os reinjetava no
// ambiente local — enchendo bancos de teste/desenvolvimento com dados de clientes e processando mensagens de verdade
// (roleta, mudança de coluna) fora de produção. O endpoint da produção também era público; agora exige login.
//
// Para usar de propósito, defina:
//   MIRROR_EVENTS_URL=https://sua-producao/api/admin/fluxo/events
//   MIRROR_EVENTS_TOKEN=<token de sessão de um administrador>   (vem em `token` na resposta de POST /api/auth/login)
const seenMirroredEventIds = new Set<string>();
const MIRROR_EVENTS_URL = (process.env.MIRROR_EVENTS_URL || '').trim();
const MIRROR_EVENTS_TOKEN = (process.env.MIRROR_EVENTS_TOKEN || '').trim();
if (MIRROR_EVENTS_URL && MIRROR_EVENTS_TOKEN && !process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_SERVICE_ID) {
  console.warn(`⚠️ [Espelho] Espelhando eventos de ${MIRROR_EVENTS_URL} neste servidor (dados de clientes reais passarão por aqui).`);
  setInterval(async () => {
    try {
      const rwRes = await fetch(MIRROR_EVENTS_URL, {
        headers: { Authorization: `Bearer ${MIRROR_EVENTS_TOKEN}` },
        signal: AbortSignal.timeout(2500)
      });
      if (!rwRes.ok) return;
      const rwJson: any = await rwRes.json();
      if (!Array.isArray(rwJson.events)) return;
      // do mais antigo ao mais recente
      const newEvents = rwJson.events.filter((e: any) => e.id && !seenMirroredEventIds.has(e.id)).reverse();
      for (const ev of newEvents) {
        seenMirroredEventIds.add(ev.id);
        if (seenMirroredEventIds.size > 200) {
          const first = seenMirroredEventIds.values().next().value;
          if (first) seenMirroredEventIds.delete(first);
        }
        if (ev.payload) {
          await enqueueIncomingWebhook({ rawPayload: ev.payload, headers: {}, receivedAt: Date.now(), source: 'fluxo' }).catch(() => {});
        }
      }
    } catch {
      // Ignorar timeouts normais de polling de rede
    }
  }, 3000);
}
// GET /api/whatsapp/fluxo-templates — catálogo REAL de modelos aprovados da conta (FluxoAPI §A5).
// O chat usa esta lista: só aparecem modelos que existem e estão APPROVED na sua Meta (antes eram 4 nomes fixos no código).
let fluxoCatalogCache: { at: number; data: any[] } | null = null;
app.get('/api/whatsapp/fluxo-templates', async (req: any, res) => {
  const apiKey = (memoryFluxoConfig.apiKey || '').trim();
  const apiSecret = (memoryFluxoConfig.apiSecret || '').trim();
  const instanceId = (memoryFluxoConfig.instanceId || '').trim();
  if (!apiKey || !apiSecret || !instanceId) {
    return res.json({ success: false, templates: [], error: describeFluxoError({ code: !apiKey || !apiSecret ? 'missing_credentials' : 'instance_required' }) });
  }
  const fresh = req.query.refresh === '1';
  if (!fresh && fluxoCatalogCache && Date.now() - fluxoCatalogCache.at < 5 * 60 * 1000) {
    return res.json({ success: true, cached: true, templates: fluxoCatalogCache.data });
  }
  const r = await executeFluxoRequest<any>({
    method: 'GET',
    path: fluxoInstancePath(`/templates?status=APPROVED${fresh ? '&refresh=true' : ''}`, instanceId),
    apiKey,
    apiSecret
  });
  if (!r.success) {
    return res.json({ success: false, templates: fluxoCatalogCache?.data || [], error: describeFluxoError(r.error, r.status) });
  }
  const list: any[] = Array.isArray(r.data) ? r.data : Array.isArray((r.raw as any)?.data) ? (r.raw as any).data : [];
  const data = list
    .filter(t => String(t.status || 'APPROVED').toUpperCase() === 'APPROVED')
    .map(t => {
      const fields: any[] = Array.isArray(t.fields) ? t.fields : [];
      return {
        name: t.name,
        language: t.language || 'pt_BR',
        category: t.category || '',
        bodyText: t.bodyText || '',
        headerText: t.headerText || '',
        footerText: t.footerText || '',
        parameterFormat: t.parameterFormat || 'POSITIONAL',
        sendable: t.sendable !== false,
        blockedReason: t.blockedReason || null,
        bodyVariables: fields.filter(f => f.slot === 'body').length,
        // Campos que o chat não preenche sozinho (botão de URL variável, mídia de cabeçalho, carrossel…)
        extraRequired: fields
          .filter(f => f.slot !== 'body' && f.required !== false)
          .map(f => `${f.slot}${f.buttonIndex !== undefined ? `[${f.buttonIndex}]` : ''}`)
      };
    });
  fluxoCatalogCache = { at: Date.now(), data };
  return res.json({ success: true, templates: data });
});
// GET /api/whatsapp/approved-templates (Para uso pelos vendedores no modal de WhatsApp)
app.get('/api/whatsapp/approved-templates', async (req: any, res) => {
  try {
    const approvedList: any[] = [];

    if (usePostgres && pgPool) {
      const dbRes = await pgPool.query(
        `SELECT id, name, category, language, status, components, usage_count, quality_score, created_at
         FROM meta_templates
         WHERE status = 'APPROVED'
         ORDER BY usage_count DESC, created_at DESC`
      );
      for (const r of dbRes.rows) {
        const comps = typeof r.components === 'string' ? JSON.parse(r.components) : (r.components || []);
        const bodyComp = comps.find((c: any) => c.type === 'BODY');
        const headerComp = comps.find((c: any) => c.type === 'HEADER');
        const footerComp = comps.find((c: any) => c.type === 'FOOTER');
        approvedList.push({
          id: r.id,
          name: r.name,
          category: r.category,
          language: r.language,
          bodyText: bodyComp?.text || '',
          headerText: headerComp?.text || '',
          footerText: footerComp?.text || '',
          usageCount: Number(r.usage_count) || 0
        });
      }
    }

    // Fallback para templates em memória aprovados
    for (const memTpl of memoryTemplates) {
      if (memTpl.status === 'APPROVED' && !approvedList.some(a => a.name.toLowerCase() === memTpl.name.toLowerCase())) {
        const bodyComp = memTpl.components?.find((c: any) => c.type === 'BODY');
        const headerComp = memTpl.components?.find((c: any) => c.type === 'HEADER');
        const footerComp = memTpl.components?.find((c: any) => c.type === 'FOOTER');
        approvedList.push({
          id: memTpl.id,
          name: memTpl.name,
          category: memTpl.category,
          language: memTpl.language,
          bodyText: bodyComp?.text || '',
          headerText: headerComp?.text || '',
          footerText: footerComp?.text || '',
          usageCount: Number(memTpl.usageCount) || 0
        });
      }
    }

    return res.json({ success: true, templates: approvedList });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, templates: [] });
  }
});

// ============================================================================
// HELPER: LOCALIZAR LEAD POR TELEFONE (CRM LEADS & SAFFRAS DE DISPARO)
// ============================================================================
async function findLeadByPhoneNumber(rawPhone: string): Promise<{
  id: string;
  name: string;
  phone: string;
  isCampaign: boolean;
  leadObject: any;
} | null> {
  if (!rawPhone) return null;
  const cleanIncoming = String(rawPhone).replace(/\D/g, '');
  if (!cleanIncoming || cleanIncoming.length < 8) return null;

  // 1. Verificar em memória de leads operacionais do CRM
  for (const [id, lead] of memoryLeadsMap.entries()) {
    const lPhone = lead.phoneNumber || '';
    if (!lPhone) continue;
    if (arePhonesEquivalent(lPhone, cleanIncoming)) {
      return {
        id: lead.id,
        name: lead.name,
        phone: lead.phoneNumber,
        isCampaign: false,
        leadObject: lead
      };
    }
  }

  // 2. Verificar em memória de campanhas / safras em staging
  for (const [id, cLead] of memoryCampaignLeadsMap.entries()) {
    const cPhone = (cLead as any).phoneNumber || (cLead as any).phone || '';
    if (!cPhone) continue;
    if (arePhonesEquivalent(cPhone, cleanIncoming)) {
      return {
        id: cLead.id,
        name: cLead.name,
        phone: cPhone,
        isCampaign: true,
        leadObject: cLead
      };
    }
  }

  // 3. Verificar no PostgreSQL caso ativo (busca exata com E.164 ou DDD+número, nunca sufixo de 8 dígitos)
  if (usePostgres && pgPool) {
    try {
      // Busca EXATA em todas as variações do mesmo número (com/sem 55, com/sem 9º dígito) — nunca por sufixo
      const variants = phoneDigitVariants(cleanIncoming);

      const dbLeadRes = await pgPool.query(
        `SELECT id, name, phone_number, column_status FROM leads
         WHERE regexp_replace(phone_number, '\\D', '', 'g') = ANY($1::text[])
         LIMIT 1`,
        [variants]
      );
      if (dbLeadRes.rows.length > 0) {
        const row = dbLeadRes.rows[0];
        return {
          id: row.id,
          name: row.name,
          phone: row.phone_number,
          isCampaign: false,
          leadObject: row
        };
      }

      const dbCampRes = await pgPool.query(
        `SELECT id, name, phone_number, status, website, public_url, niche FROM campaign_leads
         WHERE regexp_replace(phone_number, '\\D', '', 'g') = ANY($1::text[])
         LIMIT 1`,
        [variants]
      );
      if (dbCampRes.rows.length > 0) {
        const row = dbCampRes.rows[0];
        return {
          id: row.id,
          name: row.name,
          phone: row.phone_number,
          isCampaign: true,
          leadObject: row
        };
      }
    } catch (pgErr) {
      console.warn('[Webhook Lookup] Erro na busca no PostgreSQL:', pgErr);
    }
  }

  return null;
}

// ============================================================================
// HELPER: PROCESSAR MENSAGEM RECEBIDA VIA WEBHOOK (META & FLUXO)
// ============================================================================
/** Erro transitório: o job deve ser REPROCESSADO (BullMQ attempts / retry em memória). */
class TransientProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientProcessingError';
  }
}

/** Baixa a mídia recebida (download_path) e guarda cópia própria — a Meta apaga em 30 dias (§A6). */
async function fetchAndStoreInboundMedia(
  downloadPath: string,
  opts: { mime?: string | null; filename?: string | null; fallbackExt: string }
): Promise<{ relativeUrl: string; mime?: string } | null> {
  const key = (memoryFluxoConfig.apiKey || '').trim();
  const secret = (memoryFluxoConfig.apiSecret || '').trim();
  if (!key || !secret) return null;

  const dl = await downloadFluxoMediaBinary(downloadPath, key, secret);
  if (!dl.success || !dl.buffer) {
    // 404 (sem arquivo) e 410 (expirou na Meta) são definitivos; o resto vale tentar de novo.
    const permanent = dl.status === 404 || dl.status === 410 || dl.status === 401 || dl.status === 403;
    if (!permanent) {
      throw new TransientProcessingError(`Falha transitória ao baixar mídia (${dl.error || 'sem detalhe'})`);
    }
    console.warn('[Fluxo Media Download] Mídia indisponível (definitivo):', dl.error);
    return null;
  }
  const saved = await saveMediaBuffer(dl.buffer, {
    mime: opts.mime || dl.contentType,
    filename: opts.filename,
    fallbackExt: opts.fallbackExt,
    // Mídia que o CLIENTE mandou: fica atrás de login, não no /uploads público.
    scope: 'inbound'
  });
  return { relativeUrl: saved.relativeUrl, mime: dl.contentType };
}

async function processIncomingWhatsAppMessage(params: {
  phone: string;
  text: string;
  senderName?: string;
  messageId?: string;
  timestamp?: string;
  /** Instante do evento (ISO) — vale como início da janela de 24h. */
  eventTimestamp?: string;
  conversationId?: string;
  isAudio?: boolean;
  audioUrl?: string;
  audioDuration?: number;
  mediaType?: 'audio' | 'image' | 'document' | 'video';
  mediaUrl?: string;
  mediaName?: string;
  /** Caminho assinado para baixar a mídia (data.media.download_path). */
  mediaDownloadPath?: string;
  mediaMime?: string | null;
}) {
  const {
    phone,
    text,
    senderName,
    messageId,
    eventTimestamp,
    conversationId,
    isAudio,
    audioUrl,
    audioDuration,
    mediaType,
    mediaUrl,
    mediaName,
    mediaDownloadPath,
    mediaMime
  } = params;

  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!cleanPhone && !text && !audioUrl && !mediaUrl && !mediaDownloadPath) return null;

  const effectiveText = (text && text.trim()) ? text.trim() : (
    isAudio ? '🎤 Mensagem de áudio recebida' : (mediaName ? `[Arquivo: ${mediaName}]` : 'Mensagem recebida')
  );

  console.log(`[WhatsApp Webhook] Mensagem recebida de ${cleanPhone}: "${effectiveText.substring(0, 60)}" (media: ${mediaType || 'none'})`);

  // Instante real da mensagem e fim da janela de 24h (reabre a cada mensagem do cliente — §"A janela de 24 horas")
  const messageIso = (() => {
    const ms = eventTimestamp ? new Date(eventTimestamp).getTime() : NaN;
    return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();
  })();
  const windowExpiresIso = windowExpiryFromInbound(messageIso)!;

  // Localiza o lead correspondente
  const matched = await findLeadByPhoneNumber(cleanPhone);
  let targetId = matched?.id;
  let targetName = matched?.name || senderName || `Lead (${cleanPhone})`;

  // Se o lead não existe no CRM nem em campanhas, cadastrar imediatamente
  if (!matched) {
    targetId = `lead_wa_${cleanPhone}`;
    const formattedPhone = normalizeE164Phone(cleanPhone);
    const newLead: any = {
      id: targetId,
      name: senderName || `Lead (${cleanPhone})`,
      phoneNumber: formattedPhone,
      columnStatus: 'Interessado',
      subStatus: '🔥 Respondeu no WhatsApp',
      salespersonId: 'seller-thomas',
      salespersonName: 'Thomas',
      salespersonColor: '#0284c7',
      salespersonBgColor: '#e0f2fe',
      lastCallTag: 'Interesse Confirmado',
      whatsappReplied: true,
      ultimaInteracaoCliente: messageIso,
      windowExpiresAt: windowExpiresIso,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    memoryLeadsMap.set(targetId, newLead);

    if (usePostgres && pgPool) {
      try {
        // Lead novo JÁ nasce com a janela de 24h aberta (sem isso o vendedor não conseguia responder com texto livre)
        await pgPool.query(
          `INSERT INTO leads (id, name, phone_number, column_status, sub_status, salesperson_id, salesperson_name, last_call_tag, whatsapp_replied, responded_at, last_whatsapp_message, ultima_interacao_cliente, window_expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, 'Interessado', '🔥 Respondeu no WhatsApp', 'seller-thomas', 'Thomas', 'Interesse Confirmado', TRUE, $4::timestamptz, $5, $4::timestamptz, $6::timestamptz, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET column_status = 'Interessado', sub_status = '🔥 Respondeu no WhatsApp', whatsapp_replied = TRUE, ultima_interacao_cliente = $4::timestamptz, window_expires_at = GREATEST(COALESCE(leads.window_expires_at, $6::timestamptz), $6::timestamptz), updated_at = CURRENT_TIMESTAMP`,
          [newLead.id, newLead.name, newLead.phoneNumber, messageIso, effectiveText, windowExpiresIso]
        );
      } catch (insertLeadErr: any) {
        throw new TransientProcessingError(`Erro ao criar lead a partir de mensagem WhatsApp: ${insertLeadErr.message}`);
      }
    }
  }

  const incomingId = messageId || `msg_in_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  // DEDUP (a entrega é at-least-once — §A9): se esta mensagem já foi gravada, não repete nada
  // (nem histórico, nem notificação, nem roleta).
  const existingInMemory = (memoryLeadMessagesMap.get(targetId!) || []).some(m => m.id === incomingId);
  if (existingInMemory && !(usePostgres && pgPool)) {
    return { targetId, targetName, message: null, isPositiveInterest: false, isOptOut: false, duplicate: true };
  }
  if (usePostgres && pgPool) {
    const dup = await pgPool.query(
      `SELECT 1 FROM lead_messages WHERE id = $1 OR whatsapp_message_id = $1 LIMIT 1`,
      [incomingId]
    );
    if (dup.rows.length > 0) {
      return { targetId, targetName, message: null, isPositiveInterest: false, isOptOut: false, duplicate: true };
    }
  }

  // Mídia recebida: baixa AGORA e guarda cópia própria. O navegador não abre a URL da FluxoAPI (exige HMAC).
  let storedMediaUrl = mediaUrl;
  let storedAudioUrl = audioUrl;
  if (mediaDownloadPath) {
    const stored = await fetchAndStoreInboundMedia(mediaDownloadPath, {
      mime: mediaMime,
      filename: mediaName,
      fallbackExt: mediaType === 'audio' ? 'ogg' : mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : 'bin'
    });
    if (stored) {
      storedMediaUrl = stored.relativeUrl;
      if (mediaType === 'audio') storedAudioUrl = stored.relativeUrl;
    } else {
      storedMediaUrl = undefined;
      storedAudioUrl = undefined;
    }
  }

  // Cria o objeto da mensagem com remetente 'lead'
  const incomingMessage: LeadChatMessage = {
    id: incomingId,
    leadId: targetId!,
    sender: 'lead',
    senderName: targetName,
    text: effectiveText,
    isAudio: Boolean(isAudio || mediaType === 'audio'),
    audioUrl: storedAudioUrl || (mediaType === 'audio' ? storedMediaUrl : undefined),
    audioDuration: audioDuration || 8,
    mediaType: mediaType || undefined,
    mediaUrl: storedMediaUrl || undefined,
    mediaName: mediaName || undefined,
    conversationId: conversationId || undefined,
    remoteMessageId: messageId || undefined,
    status: 'read',
    statusRank: statusRank('read'),
    timestamp: messageIso
  };

  // PERSISTE PRIMEIRO no banco (se falhar, lança → o job é reprocessado, a mensagem não se perde);
  // só depois entra no cache em memória.
  if (usePostgres && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO lead_messages (id, lead_id, phone_number, whatsapp_message_id, conversation_id, sender, sender_name, text, is_audio, audio_url, audio_duration, media_type, media_url, media_name, status, status_rank, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'read', $15, $16::timestamptz)
         ON CONFLICT (id) DO NOTHING`,
        [
          incomingMessage.id,
          targetId,
          cleanPhone || null,
          messageId || incomingMessage.id,
          conversationId || null,
          incomingMessage.sender,
          incomingMessage.senderName,
          incomingMessage.text,
          incomingMessage.isAudio,
          incomingMessage.audioUrl || null,
          incomingMessage.audioDuration || null,
          incomingMessage.mediaType || null,
          incomingMessage.mediaUrl || null,
          incomingMessage.mediaName || null,
          statusRank('read'),
          messageIso
        ]
      );
    } catch (msgDbErr: any) {
      throw new TransientProcessingError(`Erro ao persistir mensagem recebida: ${msgDbErr.message}`);
    }
  }

  // Salva no histórico em memória (cache) — sem duplicar
  const currentList = memoryLeadMessagesMap.get(targetId!) || [];
  if (!currentList.some(m => m.id === incomingMessage.id)) currentList.push(incomingMessage);
  memoryLeadMessagesMap.set(targetId!, currentList);

  // Detecção de descadastro por PALAVRA INTEIRA.
  //
  // Antes era `texto.includes('pare')`, então "parece ótimo, quanto custa?" era lido como
  // pedido de descadastro e o lead quente saía do funil. Agora "pare" só conta quando é a
  // palavra "pare" de verdade ("remover" não dispara dentro de "removeram", etc.).
  const isOptOut = detectOptOut(effectiveText);

  // Qualquer resposta do lead (exceto opt-out explícito) é engajamento e demonstra interesse ativo
  const isPositiveInterest = !isOptOut;

  // Atualizar estágio do lead caso encontrado
  if (matched) {
    if (matched.isCampaign) {
      const cLead = memoryCampaignLeadsMap.get(matched.id) || matched.leadObject;
      if (cLead) {
        cLead.windowExpiresAt = windowExpiresIso;
        if (isPositiveInterest) {
          cLead.status = 'INTERESSADO';
          cLead.respondedAt = new Date().toISOString();
          cLead.responsePreview = effectiveText;
        } else if (isOptOut) {
          cLead.status = 'DESCARTADO';
          cLead.responsePreview = 'Opt-out via WhatsApp';
        }
      }
      if (usePostgres && pgPool) {
        try {
          const newStatus = isPositiveInterest ? 'INTERESSADO' : isOptOut ? 'DESCARTADO' : null;
          if (newStatus) {
            await pgPool.query(
              `UPDATE campaign_leads SET status = $1, response_preview = $2, responded_at = CURRENT_TIMESTAMP WHERE id = $3`,
              [newStatus, effectiveText, matched.id]
            );
          }

          // Garantir que o lead de campanha também apareça no CRM e no chat do Thomas
          const checkLeadRes = await pgPool.query(
            `SELECT id FROM leads WHERE id = $1 OR regexp_replace(phone_number, '\\D', '', 'g') = ANY($2::text[])`,
            [matched.id, phoneDigitVariants(cleanPhone)]
          );
          if (checkLeadRes.rows.length === 0) {
            await pgPool.query(
              `INSERT INTO leads (id, name, phone_number, website, public_url, niche, column_status, sub_status, whatsapp_replied, responded_at, last_whatsapp_message, ultima_interacao_cliente, window_expires_at, salesperson_id, salesperson_name, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $12::timestamptz, $9, $12::timestamptz, $13::timestamptz, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
               ON CONFLICT (id) DO NOTHING`,
              [
                matched.id,
                targetName,
                normalizeE164Phone(cleanPhone),
                cLead?.website || '',
                cLead?.publicUrl || cLead?.public_url || '',
                cLead?.niche || 'Campanha',
                isPositiveInterest ? 'Interessado' : 'Leads',
                isPositiveInterest ? '🔥 Respondeu no WhatsApp' : 'Mensagem Recebida',
                effectiveText,
                'seller-thomas',
                'Thomas',
                messageIso,
                windowExpiresIso
              ]
            );
          } else {
            await pgPool.query(
              `UPDATE leads SET
                 -- Nunca rebaixa quem já foi fechado ou recusou: um "obrigado!" de um cliente
                 -- Fechado voltava a conversa para "Interessado" e sujava o funil.
                 column_status = CASE
                   WHEN column_status IN ('Fechado', 'Recusado') THEN column_status
                   WHEN $1 = TRUE THEN 'Interessado'
                   ELSE column_status END,
                 sub_status = CASE
                   WHEN column_status IN ('Fechado', 'Recusado') THEN '💬 Nova mensagem'
                   WHEN $1 = TRUE THEN '🔥 Respondeu no WhatsApp'
                   ELSE 'Mensagem Recebida' END,
                 whatsapp_replied = TRUE,
                 responded_at = $4::timestamptz,
                 last_whatsapp_message = $2,
                 ultima_interacao_cliente = $4::timestamptz,
                 window_expires_at = GREATEST(COALESCE(window_expires_at, $5::timestamptz), $5::timestamptz),
                 updated_at = CURRENT_TIMESTAMP
               WHERE id = $3`,
              [isPositiveInterest, effectiveText, checkLeadRes.rows[0].id, messageIso, windowExpiresIso]
            );
          }
        } catch (dbErr) {
          console.warn('[PostgreSQL] Erro ao atualizar status de campaign_lead via webhook:', dbErr);
        }
      }
    } else {
      const crmLead = memoryLeadsMap.get(matched.id) || matched.leadObject;
      if (crmLead) {
        crmLead.whatsappReplied = true;
        crmLead.respondedAt = new Date().toISOString();
        crmLead.lastWhatsAppMessage = effectiveText;
        crmLead.ultimaInteracaoCliente = messageIso;
        // A janela nunca encolhe (uma reentrega antiga não pode fechar uma janela já reaberta)
        crmLead.windowExpiresAt = latestExpiry((crmLead as any).windowExpiresAt, windowExpiresIso);
        // Mesma regra do banco: Fechado/Recusado não voltam para Interessado.
        if (crmLead.columnStatus === 'Fechado' || crmLead.columnStatus === 'Recusado') {
          crmLead.subStatus = '💬 Nova mensagem';
        } else if (isPositiveInterest) {
          crmLead.columnStatus = 'Interessado';
          crmLead.subStatus = '🔥 Respondeu no WhatsApp';
          crmLead.lastCallTag = 'Interesse Confirmado';
        }
      }
      if (usePostgres && pgPool) {
        try {
          await pgPool.query(
            `UPDATE leads SET
               -- Nunca rebaixa quem já foi fechado ou recusou (ver comentário acima).
               column_status = CASE
                 WHEN column_status IN ('Fechado', 'Recusado') THEN column_status
                 WHEN $1 = TRUE THEN 'Interessado'
                 ELSE column_status END,
               sub_status = CASE
                 WHEN column_status IN ('Fechado', 'Recusado') THEN '💬 Nova mensagem'
                 WHEN $1 = TRUE THEN '🔥 Respondeu no WhatsApp'
                 ELSE 'Mensagem Recebida' END,
               whatsapp_replied = TRUE,
               responded_at = $4::timestamptz,
               last_whatsapp_message = $2,
               ultima_interacao_cliente = $4::timestamptz,
               window_expires_at = GREATEST(COALESCE(window_expires_at, $5::timestamptz), $5::timestamptz),
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [isPositiveInterest, effectiveText, matched.id, messageIso, windowExpiresIso]
          );
        } catch (dbErr) {
          console.warn('[PostgreSQL] Erro ao atualizar lead de CRM via webhook:', dbErr);
        }
      }
    }
  }

  // Roleta Automática: se o lead demonstrou interesse, distribui atomicamente na equipe
  if (isPositiveInterest && targetId) {
    try {
      await assignLeadViaRoulette(targetId, 'interessado');
    } catch (rouletteErr) {
      console.warn('[Roleta Automática] Falha ao distribuir lead quente:', rouletteErr);
    }
  }

  // Notificar todos os desktops e painéis conectados via SSE & WebSockets em tempo real
  await broadcastLeadSSE('NEW_MESSAGE', {
    leadId: targetId,
    leadName: targetName,
    phone: cleanPhone,
    message: incomingMessage,
    isReply: true
  }, targetId);

  // Socket.io Real-Time Event Dispatch via Redis Adapter
  broadcastSocketEvent('NEW_MESSAGE', {
    leadId: targetId,
    leadName: targetName,
    phone: cleanPhone,
    message: incomingMessage,
    isReply: true
  });
  if (targetId) {
    broadcastToLead(targetId, 'new_message', incomingMessage);
  }

  await broadcastLeadSSE('LEAD_UPDATED', {
    leadId: targetId,
    leadName: targetName,
    phone: cleanPhone,
    isInterested: isPositiveInterest,
    whatsappReplied: true,
    lastWhatsAppMessage: effectiveText,
    windowExpiresAt: windowExpiresIso,
    columnStatus: isPositiveInterest ? 'Interessado' : undefined,
    subStatus: isPositiveInterest ? '🔥 Respondeu no WhatsApp' : 'Mensagem Recebida'
  }, targetId);

  broadcastSocketEvent('LEAD_UPDATED', {
    leadId: targetId,
    leadName: targetName,
    phone: cleanPhone,
    isInterested: isPositiveInterest,
    whatsappReplied: true,
    lastWhatsAppMessage: effectiveText,
    windowExpiresAt: windowExpiresIso,
    columnStatus: isPositiveInterest ? 'Interessado' : undefined,
    subStatus: isPositiveInterest ? '🔥 Respondeu no WhatsApp' : 'Mensagem Recebida'
  });

  if (isPositiveInterest) {
    await broadcastLeadSSE('LEAD_HOT_REPLY', {
      leadId: targetId,
      leadName: targetName,
      phone: cleanPhone,
      message: effectiveText
    }, targetId);
  }

  return {
    targetId,
    targetName,
    message: incomingMessage,
    isPositiveInterest,
    isOptOut
  };
}

// ============================================================================
// HELPER: PROCESSAR MENSAGEM ENVIADA PELO CELULAR (COEXISTÊNCIA FLUXOAPI — message.sent_from_phone)
// ============================================================================
// Só existe em instâncias com mode:"coexistence" (§A2/§A9). É gravada como SAÍDA do vendedor:
//  - `to` é o número do cliente (não há `from`);
//  - NÃO reabre a janela de 24h (só o cliente reabre);
//  - entrega/leitura chegam depois em message.status, casadas pelo message_id.
async function processOutboundPhoneMessage(params: {
  phone: string;
  text: string;
  messageId?: string;
  conversationId?: string;
  eventTimestamp?: string;
  mediaType?: 'audio' | 'image' | 'document' | 'video';
  mediaName?: string;
  mediaMime?: string | null;
  mediaDownloadPath?: string;
}) {
  const { phone, text, messageId, conversationId, eventTimestamp, mediaType, mediaName, mediaMime, mediaDownloadPath } = params;
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!cleanPhone && !text) return null;

  const matched = await findLeadByPhoneNumber(cleanPhone);
  const targetId = matched?.id || `lead_wa_${cleanPhone}`;
  const targetName = matched?.name || `Lead (${cleanPhone})`;
  const outId = messageId || `msg_out_phone_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const messageIso = (() => {
    const ms = eventTimestamp ? new Date(eventTimestamp).getTime() : NaN;
    return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();
  })();

  // Lead inexistente: cria um lead simples (sem janela e sem marcar "interessado": foi o dono quem começou a conversa)
  if (!matched) {
    const formattedPhone = normalizeE164Phone(cleanPhone);
    memoryLeadsMap.set(targetId, {
      id: targetId,
      name: `Lead (${cleanPhone})`,
      phoneNumber: formattedPhone,
      columnStatus: 'Leads',
      subStatus: '📱 Conversa iniciada pelo celular',
      salespersonId: 'seller-thomas',
      salespersonName: 'Thomas',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as any);
    if (usePostgres && pgPool) {
      try {
        await pgPool.query(
          `INSERT INTO leads (id, name, phone_number, column_status, sub_status, salesperson_id, salesperson_name, created_at, updated_at)
           VALUES ($1, $2, $3, 'Leads', '📱 Conversa iniciada pelo celular', 'seller-thomas', 'Thomas', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO NOTHING`,
          [targetId, `Lead (${cleanPhone})`, formattedPhone]
        );
      } catch (err: any) {
        throw new TransientProcessingError(`Erro ao criar lead de conversa iniciada pelo celular: ${err.message}`);
      }
    }
  }

  // DEDUP (entrega at-least-once)
  if (usePostgres && pgPool) {
    const dup = await pgPool.query(`SELECT 1 FROM lead_messages WHERE id = $1 OR whatsapp_message_id = $1 LIMIT 1`, [outId]);
    if (dup.rows.length > 0) return null;
  } else if ((memoryLeadMessagesMap.get(targetId) || []).some(m => m.id === outId)) {
    return null;
  }

  // Mídia enviada pelo celular: baixa e guarda cópia própria (§A6)
  let storedMediaUrl: string | undefined;
  if (mediaDownloadPath) {
    const stored = await fetchAndStoreInboundMedia(mediaDownloadPath, {
      mime: mediaMime,
      filename: mediaName,
      fallbackExt: mediaType === 'audio' ? 'ogg' : mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : 'bin'
    });
    storedMediaUrl = stored?.relativeUrl;
  }

  const bodyText = (text || '').trim() || (mediaType ? `[${mediaType === 'audio' ? 'Áudio' : mediaType === 'image' ? 'Imagem' : mediaType === 'video' ? 'Vídeo' : 'Arquivo'} enviado pelo celular]` : 'Mensagem enviada pelo celular');

  const outboundMessage: LeadChatMessage = {
    id: outId,
    leadId: targetId,
    sender: 'salesperson',
    senderName: 'Vendedor (WhatsApp Celular)',
    text: bodyText,
    isAudio: mediaType === 'audio',
    audioUrl: mediaType === 'audio' ? storedMediaUrl : undefined,
    mediaType: mediaType || undefined,
    mediaUrl: storedMediaUrl,
    mediaName: mediaName || undefined,
    conversationId: conversationId || undefined,
    remoteMessageId: messageId || undefined,
    sentFromPhone: true,
    // Saiu do aparelho do dono; entrega/leitura chegam depois por message.status
    status: 'sent',
    statusRank: statusRank('sent'),
    timestamp: messageIso
  };

  if (usePostgres && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO lead_messages (id, lead_id, phone_number, whatsapp_message_id, conversation_id, sender, sender_name, text, is_audio, audio_url, media_type, media_url, media_name, status, status_rank, sent_from_phone, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'sent', $14, TRUE, $15::timestamptz)
         ON CONFLICT (id) DO NOTHING`,
        [outboundMessage.id, targetId, cleanPhone || null, messageId || outboundMessage.id, conversationId || null, outboundMessage.sender, outboundMessage.senderName, outboundMessage.text, outboundMessage.isAudio || false, outboundMessage.audioUrl || null, outboundMessage.mediaType || null, outboundMessage.mediaUrl || null, outboundMessage.mediaName || null, statusRank('sent'), messageIso]
      );
    } catch (err: any) {
      throw new TransientProcessingError(`Erro ao persistir mensagem enviada pelo celular: ${err.message}`);
    }
  }

  const currentList = memoryLeadMessagesMap.get(targetId) || [];
  currentList.push(outboundMessage);
  memoryLeadMessagesMap.set(targetId, currentList);

  await broadcastLeadSSE('NEW_MESSAGE', {
    leadId: targetId,
    leadName: targetName,
    phone: cleanPhone,
    message: outboundMessage
  }, targetId);
  broadcastSocketEvent('NEW_MESSAGE', { leadId: targetId, leadName: targetName, phone: cleanPhone, message: outboundMessage });
  // Um humano assumiu a conversa pelo celular (útil para pausar qualquer automação/robô)
  await broadcastLeadSSE('HUMAN_TAKEOVER', { leadId: targetId, phone: cleanPhone, at: messageIso, via: 'phone' }, targetId);

  // Se um status chegou antes desta mensagem existir, aplica agora
  await applyPendingStatus(outId);

  return outboundMessage;
}

// ============================================================================
// STATUS DE MENSAGEM: o estado só AVANÇA por rank (queued 0 → sent 1 → delivered 2 → read 3; failed 9)
// ============================================================================
interface MessageStatusEvent {
  /** `message_id` do webhook (msg_…) ou wamid; casa com o id local OU com o id remoto gravado. */
  messageId: string;
  status: string;
  rank?: number | null;
  error?: any;
  at?: string;
}

// Eventos de status que chegaram ANTES de o id remoto ser gravado (corrida entre o 202 do envio e o webhook `sent`).
const pendingStatusEvents = new Map<string, MessageStatusEvent & { ts: number }>();
const PENDING_STATUS_TTL_MS = 10 * 60 * 1000;

function rememberPendingStatus(ev: MessageStatusEvent) {
  const now = Date.now();
  if (pendingStatusEvents.size > 2000) {
    for (const [k, v] of pendingStatusEvents.entries()) {
      if (now - v.ts > PENDING_STATUS_TTL_MS) pendingStatusEvents.delete(k);
    }
  }
  const prev = pendingStatusEvents.get(ev.messageId);
  // guarda o de MAIOR rank
  if (!prev || statusRank(ev.status, ev.rank) > statusRank(prev.status, prev.rank)) {
    pendingStatusEvents.set(ev.messageId, { ...ev, ts: now });
  }
}

/** Aplica um status guardado, se houver, assim que o id remoto da mensagem passa a existir. */
async function applyPendingStatus(messageId: string) {
  const pending = pendingStatusEvents.get(messageId);
  if (!pending) return;
  pendingStatusEvents.delete(messageId);
  await applyMessageStatus(pending);
}

/** Texto curto do erro para guardar no banco / mostrar na UI. */
function serializeStatusError(error: any): { code?: string; message?: string } | null {
  if (!error) return null;
  if (typeof error === 'string') return { message: error };
  return { code: error.code ? String(error.code) : undefined, message: error.message ? String(error.message) : undefined };
}

async function applyMessageStatus(ev: MessageStatusEvent): Promise<{ matched: boolean; applied: boolean; leadId?: string; localId?: string }> {
  const normalized = normalizeStatus(ev.status);
  const id = String(ev.messageId || '').trim();
  if (!id || !normalized) return { matched: false, applied: false };
  const rank = statusRank(normalized, ev.rank);
  const err = serializeStatusError(ev.error);

  let matched = false;
  let applied = false;
  let leadId: string | undefined;
  let localId: string | undefined;

  // 1) Banco (fonte de verdade): UPDATE condicional — só se o rank novo for MAIOR que o gravado
  if (usePostgres && pgPool) {
    try {
      const upd = await pgPool.query(
        `UPDATE lead_messages
            SET status = $2,
                status_rank = $3,
                error_message = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE error_message END,
                error_code = CASE WHEN $5::text IS NOT NULL THEN $5 ELSE error_code END
          WHERE (whatsapp_message_id = $1 OR id = $1)
            AND COALESCE(status_rank, -1) < $3
        RETURNING id, lead_id`,
        [id, normalized, rank, err?.message || (err ? JSON.stringify(err) : null), err?.code || null]
      );
      if (upd.rows.length > 0) {
        matched = true;
        applied = true;
        leadId = upd.rows[0].lead_id;
        localId = upd.rows[0].id;
      } else {
        const exists = await pgPool.query(`SELECT id, lead_id FROM lead_messages WHERE whatsapp_message_id = $1 OR id = $1 LIMIT 1`, [id]);
        if (exists.rows.length > 0) {
          matched = true;
          leadId = exists.rows[0].lead_id;
          localId = exists.rows[0].id;
        }
      }
    } catch (dbErr: any) {
      throw new TransientProcessingError(`Erro ao atualizar status de mensagem: ${dbErr.message}`);
    }
  }

  // 2) Cache em memória (também é a fonte de verdade quando não há banco)
  const lists: Array<[string, LeadChatMessage[]]> = leadId && memoryLeadMessagesMap.has(leadId)
    ? [[leadId, memoryLeadMessagesMap.get(leadId)!]]
    : Array.from(memoryLeadMessagesMap.entries());
  for (const [lId, msgs] of lists) {
    const msg = msgs.find(m => m.remoteMessageId === id || m.id === id);
    if (!msg) continue;
    matched = true;
    leadId = leadId || lId;
    localId = localId || msg.id;
    if (shouldApplyStatus({ status: msg.status, rank: msg.statusRank }, { status: normalized, rank })) {
      msg.status = normalized as any;
      msg.statusRank = rank;
      if (err) msg.error = err;
      applied = true;
    }
    break;
  }

  // 3) Nada casou: guarda para quando o id remoto for gravado. NUNCA aplica "na última mensagem".
  if (!matched) {
    rememberPendingStatus({ ...ev, status: normalized });
    return { matched: false, applied: false };
  }

  if (applied && leadId) {
    const payload = {
      leadId,
      messageId: localId,
      remoteMessageId: id,
      status: normalized,
      rank,
      error: err || undefined
    };
    await broadcastLeadSSE('MESSAGE_STATUS_UPDATE', payload, leadId);
    broadcastSocketEvent('message_status_update', payload);
    broadcastToLead(leadId, 'message_status_update', payload);

    // Mensagem de campanha que a Meta recusou DEPOIS de a API aceitar (ex.: número sem WhatsApp, 131026)
    if (normalized === 'failed' && usePostgres && pgPool) {
      pgPool.query(
        `UPDATE campaign_leads SET status = 'FALHA', notes = COALESCE(notes, '') || ' [Falha na entrega: ' || $2 || ']'
          WHERE whatsapp_message_id = $1 AND status = 'QUARENTENA'`,
        [id, err?.message || err?.code || 'recusada pela Meta']
      ).catch(() => {});
    }
  }

  return { matched, applied, leadId, localId };
}

/** Compatibilidade com os formatos legados (Meta `statuses[]` e payload direto). Sem id de mensagem, NADA é alterado. */
async function processDeliveryStatusUpdate(params: {
  phone?: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  messageId?: string;
  remoteId?: string;
  rank?: number | null;
  error?: any;
}) {
  const id = params.remoteId || params.messageId;
  if (!id) {
    // Sem id não há como saber QUAL mensagem mudou. A versão antiga aplicava na "última da conversa" — isso errava os tiques.
    console.warn('[Status] Evento de status sem message_id ignorado (não é seguro adivinhar a mensagem).');
    return;
  }
  await applyMessageStatus({ messageId: id, status: params.status, rank: params.rank, error: params.error });
}


// GET WEBHOOK META (Verificação oficial do Webhook com hub.challenge)
app.get(['/api/v1/webhook', '/api/webhooks/fluxo', '/api/webhooks/meta', '/api/webhook/whatsapp', '/webhook'], (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = (memoryMetaConfig.verifyToken || process.env.META_VERIFY_TOKEN || 'crm_webhook_meta_token').trim();

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[Meta Webhook Verified Successfully]: hub.challenge aceito pela Meta.');
    return res.status(200).send(challenge);
  }

  // Fallback permissivo para verificação inicial
  if (challenge && (!token || token === expectedToken || token === 'crm_webhook_meta_token')) {
    console.log('[Meta Webhook Verified (Fallback)]: hub.challenge aceito.');
    return res.status(200).send(challenge);
  }

  console.warn('[Meta Webhook Verification Failed]: verify_token inválido', { mode, token, expectedToken });
  return res.status(403).send('Forbidden: Token de verificação inválido.');
});

// Deduplicação de eventos por X-Fluxo-Event-Id (§A9: a entrega é at-least-once).
// `seen` = já ENFILEIRADO com sucesso; `inFlight` = sendo enfileirado agora (cobre duas entregas simultâneas).
// O id só vira "visto" depois do enfileiramento OK: se falhar, a reentrega da Fluxo ainda é aceita.
const processedWebhookEventIds = new Map<string, number>();
const inFlightWebhookEventIds = new Set<string>();

function isEventDuplicate(eventId: string): boolean {
  if (!eventId) return false;
  const now = Date.now();
  if (processedWebhookEventIds.size > 5000) {
    for (const [id, ts] of processedWebhookEventIds.entries()) {
      if (now - ts > 3600000) processedWebhookEventIds.delete(id);
    }
  }
  return processedWebhookEventIds.has(eventId) || inFlightWebhookEventIds.has(eventId);
}

// Saúde do número, atualizada pelos webhooks instance.status_changed / instance.access_expiring
const instanceHealth: {
  quality?: string;
  messagingLimit24h?: number;
  field?: string;
  accessDaysLeft?: number;
  updatedAt?: string;
} = {};

/** Tipo de mídia de uma mensagem Fluxo (§A9) a partir de `data.type` e `data.media`. */
function classifyFluxoMedia(kind: string, media: any): 'audio' | 'image' | 'document' | 'video' | undefined {
  const mime = String(media?.mime_type || '').toLowerCase();
  if (kind === 'audio' || media?.voice || mime.startsWith('audio/')) return 'audio';
  if (kind === 'image' || kind === 'sticker' || mime.startsWith('image/')) return 'image';
  if (kind === 'video' || mime.startsWith('video/')) return 'video';
  if (kind === 'document' || (media && (media.filename || media.download_path || mime))) return 'document';
  return undefined;
}

// POST WEBHOOK META & FLUXO (Recebimento e conexão de eventos oficiais em tempo real - Fast Receiver Pattern via BullMQ / Redis)
// Ordem: (1) banco pronto? → (2) assinatura → (3) dedup → (4) enfileira → (5) responde 2xx.
// Só responde 2xx DEPOIS de enfileirar: um evento aceito nunca se perde; se o Redis/DB falhar a Fluxo reentrega.
app.post(['/api/v1/webhook', '/api/webhooks/fluxo', '/api/webhooks/meta', '/api/webhook/whatsapp', '/webhook'], requireDatabaseReady, async (req, res) => {
  const event = req.body || {};
  const rawBody = (req as any).rawBody || JSON.stringify(event);

  // Assinatura HMAC (§A9): HMAC-SHA256(whsec_…, `${timestamp}\n${corpo bruto}`)
  const authCheck = verifyFluxoWebhook(rawBody, req.headers as any);
  if (!authCheck.isValid) {
    console.warn('[Webhook Auth Failed]:', authCheck.reason);
    return res.status(401).json({ error: 'Unauthorized: Assinatura do webhook inválida.', hint: authCheck.reason });
  }

  const eventId = String(
    req.headers['x-fluxo-event-id'] ||
    req.headers['x-event-id'] ||
    event.id ||
    `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  );

  if (isEventDuplicate(eventId)) {
    return res.status(200).json({
      status: 'already_processed',
      event_id: eventId,
      accepted_at: new Date().toISOString()
    });
  }

  inFlightWebhookEventIds.add(eventId);
  try {
    await enqueueIncomingWebhook({
      rawPayload: event,
      headers: req.headers,
      receivedAt: Date.now(),
      source: (req.originalUrl && req.originalUrl.includes('fluxo')) ? 'fluxo' : 'meta'
    });
    processedWebhookEventIds.set(eventId, Date.now());
  } catch (err: any) {
    console.error('[Fast-Receiver Enqueue Error]:', err?.message || err);
    // 5xx → a FluxoAPI reentrega (0s, 30s, 2min, 10min, 1h, 6h, 24h)
    return res.status(503).json({ error: 'enqueue_failed', event_id: eventId });
  } finally {
    inFlightWebhookEventIds.delete(eventId);
  }

  return res.status(200).json({
    status: 'received',
    received: true,
    event_id: eventId,
    accepted_at: new Date().toISOString()
  });
});

async function processWebhookEventAsync(event: any) {
  // Log sem dado pessoal: antes gravava o payload inteiro (telefone e texto do cliente)
  // no log do servidor, onde fica guardado e visível para quem tem acesso ao painel.
  // Fora de produção o payload completo ajuda a depurar, então segue aparecendo lá.
  if (IS_PRODUCTION) {
    console.log('[Webhook] evento recebido:', JSON.stringify({
      type: event?.type || event?.event || 'desconhecido',
      id: event?.id || event?.data?.message_id || null,
      at: event?.created_at || null
    }));
  } else {
    console.log('[Webhook Event Received - Background Worker]:', JSON.stringify(event));
  }

  try {
    let eventType = event.type || event.event || 'meta_event';
    let summary = `Evento oficial recebido (${eventType})`;

    // ========================================================================
    // 1. Processamento de Webhooks no Padrão Oficial Meta Cloud API
    // ========================================================================
    if (event.entry && Array.isArray(event.entry)) {
      for (const entryItem of event.entry) {
        if (entryItem.changes && Array.isArray(entryItem.changes)) {
          for (const change of entryItem.changes) {
            const field = change.field;
            const val = change.value || {};

            // 1.1 Atualização de status de template da Meta (APPROVED / REJECTED)
            if (field === 'message_template_status_update') {
              eventType = 'template_status_update';
              const tplName = val.message_template_name || val.element_name;
              const newStatus = String(val.event || val.status || 'APPROVED').toUpperCase();
              const reason = val.reason || val.rejection_reason || null;
              summary = `Meta atualizou template "${tplName}" para ${newStatus}${reason ? ` (Motivo: ${reason})` : ''}`;

              console.log(`[Meta Template Status Update]: ${tplName} -> ${newStatus}`);

              const memTpl = memoryTemplates.find(t => t.name.toLowerCase() === String(tplName).toLowerCase());
              if (memTpl) {
                memTpl.status = newStatus as any;
                if (reason) memTpl.rejectedReason = reason;
              }

              if (usePostgres && pgPool && tplName) {
                try {
                  await pgPool.query(
                    `UPDATE meta_templates SET 
                       status = $1, 
                       rejected_reason = COALESCE($2, rejected_reason),
                       updated_at = CURRENT_TIMESTAMP
                     WHERE LOWER(name) = LOWER($3)`,
                    [newStatus, reason, tplName]
                  );
                } catch (pgErr) {
                  console.warn('[PostgreSQL] Erro ao atualizar status de template via webhook:', pgErr);
                }
              }

              broadcastSSE('TEMPLATE_STATUS_UPDATE', {
                templateName: tplName,
                status: newStatus,
                reason
              }, { broadcastAll: true });
            }

            // 1.2 Mensagens e Status de Entrega da Meta
            else if (field === 'messages') {
              // Status de entrega (sent, delivered, read, failed)
              if (val.statuses && Array.isArray(val.statuses)) {
                for (const s of val.statuses) {
                  eventType = 'status_update';
                  summary = `Status mensagem: ${s.status} (${s.recipient_id || ''})`;
                  await processDeliveryStatusUpdate({
                    phone: s.recipient_id,
                    status: s.status as any,
                    messageId: s.id,
                    error: Array.isArray(s.errors) ? s.errors[0] : undefined
                  });
                }
              }

              // Mensagem recebida do cliente
              if (val.messages && Array.isArray(val.messages)) {
                for (const m of val.messages) {
                  eventType = 'message_received';
                  let textBody = m.text?.body || '';
                  const senderName = val.contacts?.[0]?.profile?.name;
                  let isAudio = false;
                  let audioUrl: string | undefined = undefined;
                  let mediaType: 'audio' | 'image' | 'document' | undefined = undefined;
                  let mediaUrl: string | undefined = undefined;
                  let mediaName: string | undefined = undefined;

                  // Formato Meta direto (legado): o arquivo só é baixável com o token da Meta, que este modo não usa.
                  // Em produção use a FluxoAPI (message.received), que entrega o download_path assinado e baixa a mídia.
                  if (m.type === 'audio' || m.audio) {
                    isAudio = true;
                    mediaType = 'audio';
                    if (!textBody) textBody = '🎤 Mensagem de áudio recebida';
                  } else if (m.type === 'document' || m.document) {
                    mediaType = 'document';
                    mediaName = m.document?.filename || 'documento.pdf';
                    if (!textBody) textBody = m.document?.caption || `[Arquivo: ${mediaName}]`;
                  } else if (m.type === 'image' || m.image) {
                    mediaType = 'image';
                    mediaName = 'imagem.jpg';
                    if (!textBody) textBody = m.image?.caption || '[Imagem recebida]';
                  } else if (!textBody) {
                    textBody = m.type ? `[Anexo: ${m.type}]` : 'Mensagem recebida';
                  }

                  const processed = await processIncomingWhatsAppMessage({
                    phone: m.from,
                    text: textBody,
                    senderName,
                    messageId: m.id,
                    timestamp: m.timestamp,
                    isAudio,
                    audioUrl,
                    mediaType,
                    mediaUrl,
                    mediaName
                  });

                  summary = `Mensagem de ${m.from} (${processed?.targetName || 'Lead'}): "${textBody.substring(0, 35)}"`;
                }
              }
            }
          }
        }
      }
    }

    // ========================================================================
    // 2. Formato Oficial FluxoAPI (type: 'message.received') — §A9
    //    Reabre a janela de 24h. Mídia: baixar JÁ pelo data.media.download_path (§A6).
    // ========================================================================
    else if ((event.type === 'message.received' || event.event === 'message.received') && event.data) {
      const msgData = event.data;
      const media = msgData.media || null;
      const kind = String(msgData.type || 'text');
      const messageId = msgData.message_id || msgData.id;
      const mediaType = classifyFluxoMedia(kind, media);

      if (msgData.sent_from_phone === true) {
        // Defesa: se algum dia o eco do celular vier como "received", NUNCA tratar como mensagem do cliente
        eventType = 'message_sent_from_phone';
        const toPhone = String(msgData.to || msgData.from || '').replace(/\D/g, '');
        await processOutboundPhoneMessage({
          phone: toPhone,
          text: String(msgData.text || media?.caption || ''),
          messageId,
          conversationId: msgData.conversation_id,
          eventTimestamp: event.created_at,
          mediaType,
          mediaName: media?.filename || undefined,
          mediaMime: media?.mime_type,
          mediaDownloadPath: media?.download_path || undefined
        });
        summary = `Vendedor respondeu pelo celular para ${toPhone}`;
      } else {
        eventType = 'message_received';
        const phone = String(msgData.from || '').replace('@s.whatsapp.net', '');
        const senderName = msgData.pushName || msgData.contact_name || msgData.name || undefined;
        const caption = String(msgData.text || media?.caption || '').trim();
        let textBody = caption;

        if (kind === 'interactive' || kind === 'button') {
          const btnTitle = msgData.reply?.title || msgData.text || 'Opção selecionada';
          textBody = `🔘 ${btnTitle}`;
        } else if (kind === 'reaction') {
          textBody = `Reagiu com ${caption || '👍'}`;
        } else if (kind === 'location') {
          textBody = `📍 Localização compartilhada${caption ? `: ${caption}` : ''}`;
        } else if (kind === 'contacts') {
          textBody = '👤 Contato compartilhado';
        } else if (kind === 'sticker' && !textBody) {
          textBody = '[Figurinha]';
        } else if (mediaType === 'video' && !textBody) {
          textBody = '[Vídeo recebido]';
        } else if (mediaType === 'image' && !textBody) {
          textBody = '[Imagem recebida]';
        }

        const mediaName = media?.filename
          || (mediaType === 'image' ? 'imagem.jpg' : mediaType === 'video' ? 'video.mp4' : mediaType === 'document' ? 'documento.pdf' : undefined);

        const processed = await processIncomingWhatsAppMessage({
          phone,
          text: textBody,
          senderName,
          messageId,
          eventTimestamp: event.created_at,
          conversationId: msgData.conversation_id,
          isAudio: mediaType === 'audio',
          mediaType,
          mediaName,
          mediaMime: media?.mime_type,
          mediaDownloadPath: media?.download_path || undefined,
          // mídia enviada por link público (sem download_path): usa o próprio link
          mediaUrl: !media?.download_path && media?.link ? media.link : undefined,
          audioUrl: mediaType === 'audio' && !media?.download_path && media?.link ? media.link : undefined
        });

        summary = `FluxoAPI Mensagem de ${phone} (${processed?.targetName || 'Lead'}): "${(textBody || '[mídia]').substring(0, 35)}"${processed?.duplicate ? ' [duplicada ignorada]' : ''}`;
      }
    }

    // ========================================================================
    // 2.1 Coexistência FluxoAPI: Mensagem enviada pelo celular do vendedor (message.sent_from_phone)
    //     Só chega em instância com mode:"coexistence". NÃO reabre a janela de 24h.
    // ========================================================================
    else if ((event.type === 'message.sent_from_phone' || event.event === 'message.sent_from_phone') && event.data) {
      const msgData = event.data;
      const media = msgData.media || null;
      eventType = 'message_sent_from_phone';
      const phone = String(msgData.to || '').replace(/\D/g, '');
      const textBody = String(msgData.text || media?.caption || '').trim();
      const messageId = msgData.message_id || msgData.id;

      await processOutboundPhoneMessage({
        phone,
        text: textBody,
        messageId,
        conversationId: msgData.conversation_id,
        eventTimestamp: event.created_at,
        mediaType: classifyFluxoMedia(String(msgData.type || 'text'), media),
        mediaName: media?.filename || undefined,
        mediaMime: media?.mime_type,
        mediaDownloadPath: media?.download_path || undefined
      });

      summary = `Vendedor respondeu pelo celular para ${phone}: "${(textBody || '[mídia]').substring(0, 35)}"`;
    }

    // ========================================================================
    // 2.2 Processamento de Webhooks no Padrão Evolution API / Legado
    // ========================================================================
    else if (event.event === 'messages.upsert' && event.data) {
      const msgData = event.data;
      const isFromMe = !!msgData.key?.fromMe;
      if (!isFromMe) {
        eventType = 'message_received';
        const remoteJid = String(msgData.key?.remoteJid || '');
        const phone = remoteJid.replace('@s.whatsapp.net', '');
        let textBody = 
          msgData.message?.conversation ||
          msgData.message?.extendedTextMessage?.text ||
          msgData.message?.imageMessage?.caption ||
          msgData.message?.documentMessage?.caption ||
          '';
        const senderName = msgData.pushName;
        const messageId = msgData.key?.id;

        let isAudio = false;
        let audioUrl: string | undefined = undefined;
        let mediaType: 'audio' | 'image' | 'document' | undefined = undefined;
        let mediaUrl: string | undefined = undefined;
        let mediaName: string | undefined = undefined;

        if (msgData.message?.audioMessage) {
          isAudio = true;
          mediaType = 'audio';
          if (!textBody) textBody = '🎤 Mensagem de áudio recebida';
          if (msgData.message?.audioMessage?.url) {
            mediaUrl = msgData.message.audioMessage.url;
            audioUrl = mediaUrl;
          }
        } else if (msgData.message?.documentMessage) {
          mediaType = 'document';
          mediaName = msgData.message.documentMessage.fileName || 'documento.pdf';
          if (!textBody) textBody = `[Arquivo: ${mediaName}]`;
          if (msgData.message?.documentMessage?.url) {
            mediaUrl = msgData.message.documentMessage.url;
          }
        } else if (msgData.message?.imageMessage) {
          mediaType = 'image';
          if (!textBody) textBody = '[Imagem recebida]';
          if (msgData.message?.imageMessage?.url) {
            mediaUrl = msgData.message.imageMessage.url;
          }
        } else if (!textBody) {
          textBody = 'Mensagem de WhatsApp recebida';
        }

        const processed = await processIncomingWhatsAppMessage({
          phone,
          text: textBody,
          senderName,
          messageId,
          isAudio,
          audioUrl,
          mediaType,
          mediaUrl,
          mediaName
        });

        summary = `FluxoAPI Mensagem de ${phone} (${processed?.targetName || 'Lead'}): "${textBody.substring(0, 35)}"`;
      }
    }

    // ========================================================================
    // 3. Formato Oficial FluxoAPI (type: 'message.status') — §A9
    //    O estado só AVANÇA por rank; id desconhecido NÃO altera nenhuma mensagem.
    // ========================================================================
    else if ((event.type === 'message.status' || event.event === 'message.status') && event.data) {
      const statusData = event.data;
      const statusVal = statusData.status || 'unknown';
      const msgId = statusData.message_id || statusData.id;
      const errorObj = statusData.error;

      eventType = 'message.status';
      summary = `Status oficial Meta: ${statusVal} (msg: ${msgId || 'desconhecida'})${
        errorObj ? ` - Erro ${errorObj.code || ''}: ${errorObj.message || ''}` : ''
      }`;

      if (msgId) {
        const r = await applyMessageStatus({
          messageId: msgId,
          status: statusVal,
          rank: typeof statusData.rank === 'number' ? statusData.rank : undefined,
          error: errorObj,
          at: statusData.at
        });
        if (!r.matched) summary += ' [aguardando a mensagem ser gravada]';
        else if (!r.applied) summary += ' [ignorado: rank menor ou igual ao atual]';
      }
    }

    // ========================================================================
    // 3.1 Saúde do número (qualidade/limite) e vencimento de acesso — avisos antes de virar punição
    // ========================================================================
    else if (event.type === 'instance.status_changed' && event.data) {
      eventType = 'instance.status_changed';
      const d = event.data;
      instanceHealth.quality = d.quality ?? instanceHealth.quality;
      instanceHealth.messagingLimit24h = d.messaging_limit_24h ?? instanceHealth.messagingLimit24h;
      instanceHealth.field = d.field ?? instanceHealth.field;
      instanceHealth.updatedAt = new Date().toISOString();
      summary = `Número: qualidade ${d.quality || '—'}, limite 24h ${d.messaging_limit_24h ?? '—'}`;
      broadcastSSE('INSTANCE_STATUS', { ...instanceHealth }, { broadcastAll: true });
      if (d.quality === 'red' || d.quality === 'yellow') {
        console.warn(`⚠️ [FluxoAPI] Qualidade do número caiu para ${String(d.quality).toUpperCase()} — a Meta reduz o limite diário e pode desativar o número. Reduza os disparos.`);
      }
    }
    else if (event.type === 'instance.access_expiring' && event.data) {
      eventType = 'instance.access_expiring';
      instanceHealth.accessDaysLeft = event.data.days_left;
      instanceHealth.updatedAt = new Date().toISOString();
      summary = `Acesso do número vence em ${event.data.days_left} dia(s) — reconecte pelo painel da FluxoAPI`;
      broadcastSSE('INSTANCE_ACCESS_EXPIRING', { ...instanceHealth }, { broadcastAll: true });
      console.warn(`⚠️ [FluxoAPI] ${summary}`);
    }

    // ========================================================================
    // 4. Formato Direto de Mensagem / Status
    // ========================================================================
    else if (event.messages && Array.isArray(event.messages) && event.messages[0]) {
      const m = event.messages[0];
      eventType = 'message_received';
      const textBody = m.text?.body || m.body || m.text || 'Mensagem recebida';
      const processed = await processIncomingWhatsAppMessage({
        phone: m.from || m.phone,
        text: textBody,
        senderName: m.senderName || m.name,
        messageId: m.id
      });
      summary = `Mensagem de ${m.from || m.phone}: "${textBody.substring(0, 30)}"`;
    } 
    else if (event.statuses && Array.isArray(event.statuses) && event.statuses[0]) {
      const s = event.statuses[0];
      eventType = 'status_update';
      summary = `Status: ${s.status} (${s.recipient_id || ''})`;
      await processDeliveryStatusUpdate({
        phone: s.recipient_id || s.phone,
        status: s.status as any,
        messageId: s.id
      });
    }

    // Adiciona evento na lista de auditoria de webhooks
    lastFluxoWebhookEvents.unshift({
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      receivedAt: new Date().toLocaleTimeString('pt-BR'),
      type: eventType,
      summary,
      payload: event
    });

    if (lastFluxoWebhookEvents.length > 60) {
      lastFluxoWebhookEvents.pop();
    }
  } catch (err: any) {
    // Falha TRANSITÓRIA (banco fora, rede, download momentâneo): RELANÇA para o BullMQ reprocessar
    // (attempts: 3 + backoff) ou para o retry em memória. Antes o erro era engolido e a mensagem se perdia calada.
    const msg = String(err?.message || err);
    const transient =
      err instanceof TransientProcessingError ||
      /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|Connection terminated|terminating connection|too many clients|timeout exceeded/i.test(msg);
    if (transient) {
      console.error(`[Webhook Worker] Falha TRANSITÓRIA (será reprocessado): ${msg}`);
      throw err;
    }
    // Erro permanente (payload que nunca vai funcionar): registra e descarta, senão ficaria em laço.
    console.error('[Webhook Worker] Erro PERMANENTE ao processar evento (descartado):', err);
    lastFluxoWebhookEvents.unshift({
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      receivedAt: new Date().toLocaleTimeString('pt-BR'),
      type: 'processing_error',
      summary: `Erro ao processar: ${msg.substring(0, 160)}`,
      payload: event
    });
    if (lastFluxoWebhookEvents.length > 60) lastFluxoWebhookEvents.pop();
  }
}

// Endpoint dedicado para teste de recebimento de webhook
app.post('/api/webhooks/simulate-incoming', async (req: any, res) => {
  const { phone, text, senderName, leadId } = req.body;
  const targetPhone = phone || '+55 11 98821-6073';
  const targetText = text || 'Olá! Recebi sua mensagem sobre o novo site. Achei excelente! Como funciona para contratar?';

  const result = await processIncomingWhatsAppMessage({
    phone: targetPhone,
    text: targetText,
    senderName: senderName || 'Cliente em Potencial (Lead Teste)',
    messageId: `msg_test_${Date.now()}`
  });

  lastFluxoWebhookEvents.unshift({
    id: `evt_sim_${Date.now()}`,
    receivedAt: new Date().toLocaleTimeString('pt-BR'),
    type: 'message_received',
    summary: `[Simulação Webhook] Mensagem de ${targetPhone}: "${targetText.substring(0, 35)}..."`,
    payload: { phone: targetPhone, text: targetText, senderName, result }
  });

  return res.json({
    success: true,
    message: 'Mensagem simulada via webhook processada com sucesso!',
    data: result
  });
});

// 8. Salesperson Inspection Stats & Recent Calls
app.get('/api/admin/salesperson/:id/stats', async (req: any, res) => {
  const { id } = req.params;
  try {
    if (usePostgres && pgPool) {
      let query = `
        SELECT 
          c.id,
          c.lead_id AS "leadId",
          l.name AS "lead_name",
          l.phone_number AS "lead_phone",
          c.tag,
          c.comment,
          c.duration_seconds AS "duration",
          c.follow_up_at AS "followUpAt",
          c.created_at
        FROM calls c
        JOIN leads l ON l.id = c.lead_id
      `;
      const queryParams: any[] = [];
      if (id && id !== 'ALL') {
        const cleanId = id.replace('seller-', '');
        query += ` WHERE l.salesperson_id = $1 OR l.salesperson_id = $2 OR LOWER(l.salesperson_name) = LOWER($3)`;
        queryParams.push(id, `seller-${cleanId}`, cleanId);
      }
      query += ` ORDER BY c.created_at DESC LIMIT 100`;

      const result = await pgPool.query(query, queryParams);
      return res.json({
        salespersonId: id,
        recentCalls: result.rows
      });
    } else {
      const allCalls: any[] = [];
      for (const [leadId, calls] of memoryCallLogsMap.entries()) {
        const lead = memoryLeadsMap.get(leadId);
        if (!lead) continue;
        if (id && id !== 'ALL') {
          const cleanId = id.replace('seller-', '').toLowerCase();
          const sellerMatch = 
            lead.salespersonId === id ||
            (lead.salespersonId && lead.salespersonId.replace('seller-', '').toLowerCase() === cleanId) ||
            (lead.salespersonName && lead.salespersonName.toLowerCase() === cleanId);
          if (!sellerMatch) continue;
        }
        for (const c of calls) {
          allCalls.push({
            id: c.id,
            leadId: lead.id,
            lead_name: lead.name,
            lead_phone: lead.phoneNumber,
            tag: c.tag,
            comment: c.comment,
            duration: c.durationSeconds,
            followUpAt: c.followUpAt,
            created_at: c.createdAt
          });
        }
      }
      allCalls.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return res.json({
        salespersonId: id,
        recentCalls: allCalls.slice(0, 100)
      });
    }
  } catch (err: any) {
    console.error('Erro ao buscar stats do vendedor:', err);
    return res.json({ salespersonId: id, recentCalls: [] });
  }
});

// API ROUTES

// 1. Get all leads with call stats & salesperson info (optionally filtered by salesperson)
/**
 * GET /api/inbox — a caixa de entrada do atendimento.
 *
 * Antes a tela de chat usava a lista inteira de leads (`/api/leads`), sem ordem de conversa:
 * quem tinha acabado de escrever podia estar na posição 3.000, não havia contador de não
 * lidas e uma conversa nova só aparecia recarregando tudo.
 *
 * Aqui vêm só os leads COM conversa, do mais recente para o mais antigo, em páginas.
 * `?cursor=<ISO>` traz a página seguinte; `?q=` busca por nome ou telefone;
 * `?filter=unread|waiting` filtra não lidas / sem resposta nossa.
 */
app.get('/api/inbox', async (req: any, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const cursor = String(req.query.cursor || '').trim();
  const q = String(req.query.q || '').trim();
  const filter = String(req.query.filter || '').trim();

  // Mesma regra de carteira do resto do sistema: vendedor só vê o que é dele.
  let ownerFilter: string | null = null;
  if (!isUserAdmin(req.user)) {
    const own = req.user?.salespersonId;
    if (!own) return res.json({ conversations: [], nextCursor: null, hasMore: false });
    ownerFilter = own;
  } else if (req.query.salespersonId && req.query.salespersonId !== 'ALL') {
    ownerFilter = String(req.query.salespersonId);
  }

  if (!usePostgres || !pgPool) {
    const all = Array.from(memoryLeadsMap.values())
      .filter(l => (memoryLeadMessagesMap.get(l.id) || []).length > 0)
      .filter(l => !ownerFilter || (l as any).salespersonId === ownerFilter)
      .sort((a, b) => String((b as any).lastMessageAt || '').localeCompare(String((a as any).lastMessageAt || '')));
    return res.json({ conversations: all.slice(0, limit), nextCursor: null, hasMore: all.length > limit });
  }

  try {
    const params: any[] = [];
    const where: string[] = ['l.last_message_at IS NOT NULL'];

    if (ownerFilter) {
      params.push(ownerFilter);
      where.push(`l.salesperson_id = $${params.length}`);
    }
    if (cursor) {
      params.push(cursor);
      where.push(`l.last_message_at < $${params.length}::timestamptz`);
    }
    if (q) {
      params.push(`%${q}%`);
      params.push(`%${q.replace(/\D/g, '')}%`);
      where.push(`(l.name ILIKE $${params.length - 1} OR l.phone_number ILIKE $${params.length})`);
    }
    if (filter === 'unread') where.push('COALESCE(l.unread_count, 0) > 0');
    if (filter === 'open') where.push('l.resolved_at IS NULL');
    if (filter === 'resolved') where.push('l.resolved_at IS NOT NULL');

    params.push(limit + 1); // +1 só para saber se existe próxima página

    const sql = `
      SELECT l.id, l.name, l.phone_number AS "phoneNumber", l.column_status AS "columnStatus",
             l.sub_status AS "subStatus", l.niche, l.public_url AS "publicUrl",
             l.salesperson_id AS "salespersonId", l.salesperson_name AS "salespersonName",
             l.last_message_at AS "lastMessageAt", COALESCE(l.unread_count, 0) AS "unreadCount",
             l.window_expires_at AS "windowExpiresAt", l.whatsapp_replied AS "whatsappReplied",
             l.resolved_at AS "resolvedAt",
             m.text AS "lastMessageText", m.sender AS "lastMessageSender",
             m.status AS "lastMessageStatus", m.media_type AS "lastMessageMediaType",
             m.is_audio AS "lastMessageIsAudio"
        FROM leads l
        LEFT JOIN LATERAL (
          SELECT text, sender, status, media_type, is_audio
            FROM lead_messages
           WHERE lead_id = l.id
           ORDER BY timestamp DESC
           LIMIT 1
        ) m ON TRUE
       WHERE ${where.join(' AND ')}
         ${filter === 'waiting' ? "AND m.sender = 'lead'" : ''}
       ORDER BY l.last_message_at DESC
       LIMIT $${params.length}
    `;

    const r = await pgPool.query(sql, params);
    const rows = r.rows;
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return res.json({
      conversations: page,
      nextCursor: hasMore && last?.lastMessageAt ? new Date(last.lastMessageAt).toISOString() : null,
      hasMore
    });
  } catch (err: any) {
    console.error('[Inbox] Erro ao montar a caixa de entrada:', err?.message || err);
    return res.status(500).json({ error: 'Erro ao carregar a caixa de entrada.' });
  }
});

/**
 * GET /api/messages/search?q=texto — procura dentro do histórico de mensagens.
 *
 * Antes não havia busca nenhuma: para achar "aquele cliente que falou do orçamento" o
 * vendedor abria conversa por conversa. Respeita a carteira: cada um acha só o que é dele.
 */
app.get('/api/messages/search', async (req: any, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  if (q.length < 2) return res.json({ results: [], query: q });

  if (!usePostgres || !pgPool) {
    const termo = q.toLowerCase();
    const results: any[] = [];
    for (const [leadId, msgs] of memoryLeadMessagesMap.entries()) {
      for (const m of msgs) {
        if (String(m.text || '').toLowerCase().includes(termo)) {
          results.push({ leadId, leadName: memoryLeadsMap.get(leadId)?.name || leadId, messageId: m.id, text: m.text, sender: m.sender, timestamp: m.timestamp });
          if (results.length >= limit) break;
        }
      }
      if (results.length >= limit) break;
    }
    return res.json({ results, query: q });
  }

  const params: any[] = [`%${q}%`];
  let ownerClause = '';
  if (!isUserAdmin(req.user)) {
    const own = req.user?.salespersonId;
    if (!own) return res.json({ results: [], query: q });
    params.push(own);
    ownerClause = ` AND l.salesperson_id = $${params.length}`;
  }
  params.push(limit);

  try {
    const r = await pgPool.query(
      `SELECT m.id AS "messageId", m.lead_id AS "leadId", l.name AS "leadName",
              l.phone_number AS "phoneNumber", m.text, m.sender,
              to_char(m.timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "timestamp"
         FROM lead_messages m
         JOIN leads l ON l.id = m.lead_id
        WHERE m.text ILIKE $1${ownerClause}
        ORDER BY m.timestamp DESC
        LIMIT $${params.length}`,
      params
    );
    return res.json({ results: r.rows, query: q });
  } catch (err: any) {
    console.error('[Busca] Erro ao procurar nas mensagens:', err?.message || err);
    return res.status(500).json({ error: 'Erro ao buscar nas mensagens.' });
  }
});

/** Notas internas da conversa: só a equipe vê, o cliente nunca recebe. */
app.get('/api/leads/:id/notes', async (req: any, res) => {
  const { id } = req.params;
  if (!usePostgres || !pgPool) return res.json({ notes: [] });
  try {
    const r = await pgPool.query(
      `SELECT id, author_id AS "authorId", author_name AS "authorName", text,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
         FROM lead_notes WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [id]
    );
    return res.json({ notes: r.rows });
  } catch {
    return res.json({ notes: [] });
  }
});

app.post('/api/leads/:id/notes', async (req: any, res) => {
  const { id } = req.params;
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Escreva a nota.' });
  if (!usePostgres || !pgPool) return res.status(503).json({ error: 'Sem banco de dados para guardar a nota.' });
  const noteId = `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await pgPool.query(
      `INSERT INTO lead_notes (id, lead_id, author_id, author_name, text) VALUES ($1, $2, $3, $4, $5)`,
      [noteId, id, req.user?.id || null, req.user?.name || 'Equipe', text]
    );
    return res.json({ success: true, id: noteId });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao gravar a nota.' });
  }
});

/** Marca/desmarca a conversa como resolvida (some dos filtros de pendência). */
app.post('/api/leads/:id/resolve', async (req: any, res) => {
  const { id } = req.params;
  const resolver = req.body?.resolved !== false;
  if (!usePostgres || !pgPool) return res.status(503).json({ error: 'Sem banco de dados.' });
  try {
    await pgPool.query(
      `UPDATE leads SET resolved_at = ${resolver ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE id = $1`,
      [id]
    );
    return res.json({ success: true, resolved: resolver });
  } catch {
    return res.status(500).json({ error: 'Erro ao atualizar a conversa.' });
  }
});

/**
 * GET /api/leads/:id/summary — um lead só.
 * Permite ao front atualizar UMA conversa quando chega um evento, em vez de baixar a base toda.
 */
app.get('/api/leads/:id/summary', async (req: any, res) => {
  const { id } = req.params;
  if (!usePostgres || !pgPool) {
    const lead = memoryLeadsMap.get(id);
    return lead ? res.json(lead) : res.status(404).json({ error: 'Lead não encontrado.' });
  }
  try {
    const r = await pgPool.query(
      `SELECT l.id, l.name, l.phone_number AS "phoneNumber", l.column_status AS "columnStatus",
              l.sub_status AS "subStatus", l.niche, l.public_url AS "publicUrl",
              l.salesperson_id AS "salespersonId", l.salesperson_name AS "salespersonName",
              l.last_message_at AS "lastMessageAt", COALESCE(l.unread_count, 0) AS "unreadCount",
              l.window_expires_at AS "windowExpiresAt", l.whatsapp_replied AS "whatsappReplied",
              l.last_whatsapp_message AS "lastWhatsAppMessage",
              m.text AS "lastMessageText", m.sender AS "lastMessageSender", m.status AS "lastMessageStatus"
         FROM leads l
         LEFT JOIN LATERAL (
           SELECT text, sender, status FROM lead_messages WHERE lead_id = l.id ORDER BY timestamp DESC LIMIT 1
         ) m ON TRUE
        WHERE l.id = $1`,
      [id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Lead não encontrado.' });
    return res.json(r.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao carregar o lead.' });
  }
});

app.get('/api/leads', async (req: any, res) => {
  let { salespersonId } = req.query;

  // Isolamento estrito de carteira. Negar por padrão: só ADMIN vê a base inteira.
  // Antes, quem não fosse exatamente role='salesperson' COM salespersonId (um papel
  // 'manager', ou um vendedor sem vínculo) caía no caminho de admin e via todos os leads.
  if (!isUserAdmin(req.user)) {
    const own = req.user?.salespersonId;
    if (!own) {
      return res.json([]); // sem carteira vinculada, não há leads para mostrar
    }
    salespersonId = own;
  }

  try {
    if (usePostgres && pgPool) {
      let whereClause = '';
      const params: any[] = [];
      if (salespersonId && salespersonId !== 'ALL') {
        params.push(salespersonId);
        whereClause = ` WHERE l.salesperson_id = $1`;
      }

      const query = `
        WITH call_stats AS (
          SELECT 
            lead_id,
            COUNT(*)::int AS call_count,
            MAX(created_at) AS last_call_at
          FROM calls
          GROUP BY lead_id
        ),
        latest_calls AS (
          SELECT DISTINCT ON (lead_id)
            lead_id,
            tag AS last_call_tag
          FROM calls
          ORDER BY lead_id, created_at DESC
        )
        SELECT 
          l.id,
          l.name,
          l.phone_number AS "phoneNumber",
          l.public_url AS "publicUrl",
          l.website AS "website",
          COALESCE(l.column_status, 'Leads') AS "columnStatus",
          COALESCE(l.salesperson_id, 'seller-thomas') AS "salespersonId",
          COALESCE(l.salesperson_name, 'Thomas') AS "salespersonName",
          l.niche AS "niche",
          l.categories AS "categories",
          l.sub_status AS "subStatus",
          l.loss_reason AS "lossReason",
          l.next_follow_up_at AS "nextFollowUpAt",
          l.created_at AS "createdAt",
          l.updated_at AS "updatedAt",
          COALESCE(l.whatsapp_replied, FALSE) AS "hasWhatsAppReply",
          COALESCE(l.whatsapp_replied, FALSE) AS "whatsappReplied",
          l.responded_at AS "respondedAt",
          l.last_whatsapp_message AS "lastWhatsAppMessage",
          COALESCE(cs.call_count, 0)::int AS "callCount",
          cs.last_call_at AS "lastCallAt",
          lc.last_call_tag AS "lastCallTag"
        FROM leads l
        LEFT JOIN call_stats cs ON l.id = cs.lead_id
        LEFT JOIN latest_calls lc ON l.id = lc.lead_id
        ${whereClause}
        ORDER BY l.created_at DESC
      `;

      const result = await pgPool.query(query, params);
      return res.json(result.rows);
    } else {
      let allLeads = Array.from(memoryLeadsMap.values());
      if (salespersonId && salespersonId !== 'ALL') {
        allLeads = allLeads.filter(l => (l.salespersonId || 'seller-thomas') === salespersonId);
      }

      const leadsList = allLeads.map(lead => {
        const calls = memoryCallLogsMap.get(lead.id) || [];
        const sortedCalls = [...calls].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const lastCall = sortedCalls.length > 0 ? sortedCalls[0] : undefined;
        return {
          ...lead,
          salespersonId: lead.salespersonId || 'seller-thomas',
          salespersonName: lead.salespersonName || 'Thomas',
          hasWhatsAppReply: Boolean(lead.whatsappReplied || (lead as any).hasWhatsAppReply),
          whatsappReplied: Boolean(lead.whatsappReplied),
          respondedAt: lead.respondedAt,
          lastWhatsAppMessage: lead.lastWhatsAppMessage,
          callCount: calls.length,
          lastCallAt: lastCall?.createdAt,
          lastCallTag: lastCall?.tag
        };
      });
      return res.json(leadsList);
    }
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Erro ao buscar leads do banco de dados.' });
  }
});

// Tags Endpoints: GET, POST, DELETE
app.get('/api/tags', async (req, res) => {
  try {
    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `SELECT id, name, color, bg_color AS "bgColor", created_at AS "createdAt"
         FROM custom_tags
         ORDER BY created_at ASC`
      );
      return res.json(result.rows);
    } else {
      return res.json(Array.from(memoryTagsMap.values()));
    }
  } catch (error) {
    console.error('Error fetching custom tags:', error);
    res.status(500).json({ error: 'Erro ao buscar etiquetas customizadas.' });
  }
});

app.post('/api/tags', async (req, res) => {
  const { name, color, bgColor } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Nome da etiqueta é obrigatório.' });
  }

  const nameTrim = name.trim();
  const tagColor = color || '#15803d';
  const tagBgColor = bgColor || '#dcfce7';
  const tagId = `tag-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  try {
    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `INSERT INTO custom_tags (id, name, color, bg_color)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO UPDATE SET color = EXCLUDED.color, bg_color = EXCLUDED.bg_color
         RETURNING id, name, color, bg_color AS "bgColor", created_at AS "createdAt"`,
        [tagId, nameTrim, tagColor, tagBgColor]
      );
      return res.status(201).json(result.rows[0]);
    } else {
      const existingTag = Array.from(memoryTagsMap.values()).find(t => t.name.toLowerCase() === nameTrim.toLowerCase());
      if (existingTag) {
        existingTag.color = tagColor;
        existingTag.bgColor = tagBgColor;
        return res.json(existingTag);
      }
      const newTag: CustomTag = {
        id: tagId,
        name: nameTrim,
        color: tagColor,
        bgColor: tagBgColor,
        createdAt: new Date().toISOString()
      };
      memoryTagsMap.set(tagId, newTag);
      return res.status(201).json(newTag);
    }
  } catch (error: any) {
    console.error('Error creating tag:', error);
    res.status(500).json({ error: `Erro ao criar etiqueta: ${error.message}` });
  }
});

app.delete('/api/tags/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (usePostgres && pgPool) {
      await pgPool.query(`DELETE FROM custom_tags WHERE id = $1`, [id]);
      return res.json({ success: true });
    } else {
      memoryTagsMap.delete(id);
      return res.json({ success: true });
    }
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: 'Erro ao deletar etiqueta.' });
  }
});

// SALESPEOPLE (VENDEDORES) ENDPOINTS

// 1. Get all salespeople with their lead stats
app.get('/api/salespeople', async (req, res) => {
  try {
    if (usePostgres && pgPool) {
      const spRes = await pgPool.query(`
        SELECT 
          s.id, 
          s.name, 
          s.email, 
          s.phone, 
          s.color, 
          s.bg_color AS "bgColor", 
          s.is_default AS "isDefault", 
          s.slug,
          COALESCE(s.active, TRUE) AS "active",
          COALESCE(s.can_generate_audit_pdf, TRUE) AS "canGenerateAuditPdf",
          COALESCE(s.whatsapp_type, 'business') AS "whatsappType",
          s.created_at AS "createdAt",
          COUNT(l.id)::int AS "totalLeads",
          COUNT(CASE WHEN l.column_status = 'Leads' AND (SELECT COUNT(*) FROM calls WHERE lead_id = l.id) = 0 THEN 1 END)::int AS "uncontactedLeads",
          COUNT(CASE WHEN l.column_status IN ('Ligação 1', 'Ligação 2', 'Ligação 3', 'Ligação 4', 'Interessado') THEN 1 END)::int AS "inProgressLeads",
          COUNT(CASE WHEN l.column_status = 'Fechado' THEN 1 END)::int AS "closedLeads",
          COUNT(CASE WHEN l.column_status = 'Recusado' THEN 1 END)::int AS "refusedLeads"
        FROM salespeople s
        LEFT JOIN leads l ON (l.salesperson_id = s.id OR (s.is_default = TRUE AND l.salesperson_id IS NULL))
        GROUP BY s.id, s.name, s.email, s.phone, s.color, s.bg_color, s.is_default, s.slug, s.active, s.can_generate_audit_pdf, s.whatsapp_type, s.created_at
        ORDER BY s.is_default DESC, s.created_at ASC
      `);
      return res.json(spRes.rows);
    } else {
      const allLeads = Array.from(memoryLeadsMap.values());
      const sellers = Array.from(memorySalespeopleMap.values()).map(s => {
        const myLeads = allLeads.filter(l => (l.salespersonId || 'seller-thomas') === s.id);
        const uncontacted = myLeads.filter(l => {
          if (l.columnStatus !== 'Leads') return false;
          const calls = memoryCallLogsMap.get(l.id) || [];
          return calls.length === 0;
        }).length;
        const inProgress = myLeads.filter(l => ['Ligação 1', 'Ligação 2', 'Ligação 3', 'Ligação 4', 'Interessado'].includes(l.columnStatus)).length;
        const closed = myLeads.filter(l => l.columnStatus === 'Fechado').length;
        const refused = myLeads.filter(l => l.columnStatus === 'Recusado').length;

        return {
          ...s,
          slug: s.slug || undefined,
          active: s.active !== undefined ? s.active : true,
          canGenerateAuditPdf: s.canGenerateAuditPdf !== undefined ? s.canGenerateAuditPdf : true,
          whatsappType: s.whatsappType || 'business',
          totalLeads: myLeads.length,
          uncontactedLeads: uncontacted,
          inProgressLeads: inProgress,
          closedLeads: closed,
          refusedLeads: refused
        };
      });
      return res.json(sellers);
    }
  } catch (error) {
    console.error('Error fetching salespeople:', error);
    res.status(500).json({ error: 'Erro ao buscar vendedores.' });
  }
});

// 2. Create new salesperson
app.post('/api/salespeople', async (req, res) => {
  const { name, email, phone, color, bgColor, whatsappType } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Nome do vendedor(a) é obrigatório.' });
  }

  const nameTrim = name.trim();
  const sellerId = `seller-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const sellerColor = color || '#0284c7';
  const sellerBgColor = bgColor || '#e0f2fe';
  const sellerWhatsAppType = ['business', 'normal', 'ask'].includes(whatsappType) ? whatsappType : 'business';
  const creds = getSalespersonCredentials(nameTrim, email);
  const sellerEmail = creds.email;
  const sellerPhone = phone ? phone.trim() : '';
  const createdAt = new Date().toISOString();
  const cleanSlug = nameTrim.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const hashedPass = hashPassword(creds.defaultPassword);
  const userId = `user-${sellerId}`;

  try {
    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `INSERT INTO salespeople (id, name, email, phone, color, bg_color, is_default, slug, active, whatsapp_type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, TRUE, $8, CURRENT_TIMESTAMP)
         RETURNING id, name, email, phone, color, bg_color AS "bgColor", is_default AS "isDefault", slug, active, COALESCE(whatsapp_type, 'business') AS "whatsappType", created_at AS "createdAt"`,
        [sellerId, nameTrim, sellerEmail, sellerPhone, sellerColor, sellerBgColor, cleanSlug, sellerWhatsAppType]
      );

      // Auto-cria conta de acesso de login do vendedor
      await pgPool.query(
        `INSERT INTO users (id, name, email, password_hash, password_salt, role, salesperson_id, active, created_at)
         VALUES ($1, $2, $3, $4, $5, 'salesperson', $6, TRUE, CURRENT_TIMESTAMP)
         ON CONFLICT (email) DO UPDATE
         SET name = $2, salesperson_id = $6, active = TRUE`,
        [userId, nameTrim, sellerEmail, hashedPass.hash, hashedPass.salt, sellerId]
      );

      return res.status(201).json({
        ...result.rows[0],
        totalLeads: 0,
        uncontactedLeads: 0,
        inProgressLeads: 0,
        closedLeads: 0,
        refusedLeads: 0,
        loginEmail: sellerEmail,
        initialPassword: creds.defaultPassword
      });
    } else {
      const newSeller: Salesperson = {
        id: sellerId,
        name: nameTrim,
        email: sellerEmail,
        phone: sellerPhone,
        color: sellerColor,
        bgColor: sellerBgColor,
        isDefault: false,
        slug: cleanSlug,
        active: true,
        whatsappType: sellerWhatsAppType,
        createdAt
      };
      memorySalespeopleMap.set(sellerId, newSeller);

      memoryUsersMap.set(userId, {
        id: userId,
        name: nameTrim,
        email: sellerEmail,
        passwordHash: hashedPass.hash,
        passwordSalt: hashedPass.salt,
        role: 'salesperson',
        salespersonId: sellerId,
        active: true,
        createdAt
      });

      return res.status(201).json({
        ...newSeller,
        totalLeads: 0,
        uncontactedLeads: 0,
        inProgressLeads: 0,
        closedLeads: 0,
        refusedLeads: 0,
        loginEmail: sellerEmail,
        initialPassword: creds.defaultPassword
      });
    }
  } catch (error: any) {
    console.error('Error creating salesperson:', error);
    res.status(500).json({ error: `Erro ao cadastrar vendedor: ${error.message}` });
  }
});

// 2.1 Batch create multiple salespeople via JSON
app.post('/api/salespeople/batch', async (req, res) => {
  try {
    let items = req.body;
    if (items && !Array.isArray(items)) {
      items = items.salespeople || items.vendedores || items.items || items.data || [];
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Nenhum vendedor fornecido no lote JSON.' });
    }

    const paletteList = [
      { color: '#0284c7', bgColor: '#e0f2fe' },
      { color: '#059669', bgColor: '#d1fae5' },
      { color: '#7c3aed', bgColor: '#ede9fe' },
      { color: '#db2777', bgColor: '#fce7f3' },
      { color: '#d97706', bgColor: '#fef3c7' },
      { color: '#4f46e5', bgColor: '#e0e7ff' },
      { color: '#0891b2', bgColor: '#cffafe' },
      { color: '#475569', bgColor: '#f1f5f9' },
    ];

    const createdList: any[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < items.length; i++) {
      const raw = items[i];
      let sellerName = '';
      let rawEmail = '';
      let sellerPhone = '';
      let sellerColor = '';
      let sellerBgColor = '';

      if (typeof raw === 'string') {
        sellerName = raw.trim();
      } else if (raw && typeof raw === 'object') {
        sellerName = String(raw.name || raw.nome || raw.fullName || '').trim();
        rawEmail = String(raw.email || raw.mail || '').trim();
        sellerPhone = String(raw.phone || raw.telefone || raw.whatsapp || raw.celular || '').trim();
        sellerColor = String(raw.color || raw.cor || '').trim();
        sellerBgColor = String(raw.bgColor || raw.corFundo || '').trim();
      }

      if (!sellerName) continue;

      const pal = paletteList[i % paletteList.length];
      const finalColor = sellerColor || pal.color;
      const finalBgColor = sellerBgColor || pal.bgColor;
      const sellerId = `seller-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;
      const cleanSlug = sellerName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      // Gera e-mail padrão @nyroh.com e senha padrão nome123
      const creds = getSalespersonCredentials(sellerName, rawEmail);
      const sellerEmail = creds.email;
      const hashedPass = hashPassword(creds.defaultPassword);
      const userId = `user-${sellerId}`;

      if (usePostgres && pgPool) {
        const result = await pgPool.query(
          `INSERT INTO salespeople (id, name, email, phone, color, bg_color, is_default, slug, active, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, TRUE, CURRENT_TIMESTAMP)
           RETURNING id, name, email, phone, color, bg_color AS "bgColor", is_default AS "isDefault", slug, active, created_at AS "createdAt"`,
          [sellerId, sellerName, sellerEmail, sellerPhone, finalColor, finalBgColor, cleanSlug]
        );

        // Auto-cria conta de login para este vendedor
        await pgPool.query(
          `INSERT INTO users (id, name, email, password_hash, password_salt, role, salesperson_id, active, created_at)
           VALUES ($1, $2, $3, $4, $5, 'salesperson', $6, TRUE, CURRENT_TIMESTAMP)
           ON CONFLICT (email) DO UPDATE
           SET name = $2, password_hash = $4, password_salt = $5, salesperson_id = $6, active = TRUE`,
          [userId, sellerName, sellerEmail, hashedPass.hash, hashedPass.salt, sellerId]
        );

        createdList.push({
          ...result.rows[0],
          totalLeads: 0,
          uncontactedLeads: 0,
          inProgressLeads: 0,
          closedLeads: 0,
          refusedLeads: 0,
          loginEmail: sellerEmail,
          initialPassword: creds.defaultPassword
        });
      } else {
        const newSeller: Salesperson = {
          id: sellerId,
          name: sellerName,
          email: sellerEmail,
          phone: sellerPhone,
          color: finalColor,
          bgColor: finalBgColor,
          isDefault: false,
          slug: cleanSlug,
          active: true,
          createdAt: now
        };
        memorySalespeopleMap.set(sellerId, newSeller);

        memoryUsersMap.set(userId, {
          id: userId,
          name: sellerName,
          email: sellerEmail,
          passwordHash: hashedPass.hash,
          passwordSalt: hashedPass.salt,
          role: 'salesperson',
          salespersonId: sellerId,
          active: true,
          createdAt: now
        });

        createdList.push({
          ...newSeller,
          totalLeads: 0,
          uncontactedLeads: 0,
          inProgressLeads: 0,
          closedLeads: 0,
          refusedLeads: 0,
          loginEmail: sellerEmail,
          initialPassword: creds.defaultPassword
        });
      }
    }

    if (createdList.length === 0) {
      return res.status(400).json({ error: 'Nenhum vendedor válido com nome preenchido foi encontrado no JSON.' });
    }

    return res.status(201).json({
      success: true,
      count: createdList.length,
      salespeople: createdList,
      message: `${createdList.length} vendedor(es) cadastrado(s) com logins @nyroh.com e senhas gerados com sucesso!`
    });
  } catch (error: any) {
    console.error('Error in batch salespeople creation:', error);
    res.status(500).json({ error: `Erro ao cadastrar vendedores em lote: ${error.message}` });
  }
});

// 3. Update salesperson
app.put('/api/salespeople/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, color, bgColor, slug, active, whatsappType } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Nome do vendedor(a) é obrigatório.' });
  }

  const nameTrim = name.trim();
  const sellerColor = color || '#0284c7';
  const sellerBgColor = bgColor || '#e0f2fe';
  const sellerEmail = email ? email.trim() : '';
  const sellerPhone = phone ? phone.trim() : '';
  const sellerSlug = slug !== undefined && slug !== null ? String(slug).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') : null;
  const sellerActive = typeof active === 'boolean' ? active : true;
  const sellerWhatsAppType = whatsappType && ['business', 'normal', 'ask'].includes(whatsappType) ? whatsappType : null;

  try {
    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `UPDATE salespeople 
         SET name = $1, email = $2, phone = $3, color = $4, bg_color = $5, slug = $6, active = $7,
             whatsapp_type = COALESCE($8, whatsapp_type, 'business')
         WHERE id = $9
         RETURNING id, name, email, phone, color, bg_color AS "bgColor", is_default AS "isDefault", slug, active, COALESCE(can_generate_audit_pdf, TRUE) AS "canGenerateAuditPdf", COALESCE(whatsapp_type, 'business') AS "whatsappType", created_at AS "createdAt"`,
        [nameTrim, sellerEmail, sellerPhone, sellerColor, sellerBgColor, sellerSlug, sellerActive, sellerWhatsAppType, id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Vendedor não encontrado.' });
      }

      // Update salesperson_name in leads table
      await pgPool.query(`UPDATE leads SET salesperson_name = $1 WHERE salesperson_id = $2`, [nameTrim, id]);

      // Sync active state, name, and email with users table if a user exists
      if (sellerEmail) {
        await pgPool.query(
          `UPDATE users SET active = $1, name = $2, email = $3 WHERE salesperson_id = $4`,
          [sellerActive, nameTrim, sellerEmail.toLowerCase(), id]
        );
      } else {
        await pgPool.query(`UPDATE users SET active = $1, name = $2 WHERE salesperson_id = $3`, [sellerActive, nameTrim, id]);
      }

      return res.json(result.rows[0]);
    } else {
      const seller = memorySalespeopleMap.get(id);
      if (!seller) {
        return res.status(404).json({ error: 'Vendedor não encontrado.' });
      }
      seller.name = nameTrim;
      seller.email = sellerEmail;
      seller.phone = sellerPhone;
      seller.color = sellerColor;
      seller.bgColor = sellerBgColor;
      if (sellerSlug !== null) seller.slug = sellerSlug;
      seller.active = sellerActive;
      if (sellerWhatsAppType) seller.whatsappType = sellerWhatsAppType;
      memorySalespeopleMap.set(id, seller);

      // Update leads in memory
      for (const lead of memoryLeadsMap.values()) {
        if (lead.salespersonId === id) {
          lead.salespersonName = nameTrim;
        }
      }

      // Sync user in memory
      for (const u of memoryUsersMap.values()) {
        if (u.salespersonId === id) {
          u.active = sellerActive;
          u.name = nameTrim;
          if (sellerEmail) u.email = sellerEmail.toLowerCase();
        }
      }

      return res.json(seller);
    }
  } catch (error: any) {
    console.error('Error updating salesperson:', error);
    res.status(500).json({ error: 'Erro ao atualizar vendedor.' });
  }
});

// 3.1 Reset/Set password for a salesperson
app.post('/api/salespeople/:id/reset-password', async (req: any, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  // Esta rota é SÓ para conta de vendedor. Nunca pode tocar numa conta de administrador:
  // era por aqui que um vendedor redefinia a senha de `seller-thomas` (admin) e virava dono
  // do sistema. Troca de senha de admin é na tela de usuários, por outro admin.
  if (await isAdminSalesperson(id)) {
    return res.status(403).json({
      error: 'Esta conta é de administrador. Troque a senha pela tela de usuários.',
      code: 'admin_account'
    });
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
  }

  const cleanPass = newPassword.trim();
  const creds = hashPassword(cleanPass);
  const now = new Date().toISOString();

  try {
    if (usePostgres && pgPool) {
      // Find salesperson info
      const spRes = await pgPool.query('SELECT name, email, slug FROM salespeople WHERE id = $1', [id]);
      if (spRes.rowCount === 0) {
        return res.status(404).json({ error: 'Vendedor não encontrado.' });
      }
      const seller = spRes.rows[0];

      // Check if user already exists for this salesperson
      const userRes = await pgPool.query('SELECT id, email FROM users WHERE salesperson_id = $1', [id]);
      if (userRes.rowCount && userRes.rowCount > 0) {
        const userId = userRes.rows[0].id;
        await pgPool.query(
          `UPDATE users SET password_hash = $1, password_salt = $2, active = TRUE WHERE id = $3`,
          [creds.hash, creds.salt, userId]
        );
        return res.json({
          success: true,
          email: userRes.rows[0].email,
          message: `Senha de ${seller.name} atualizada com sucesso!`
        });
      } else {
        // Create user account for this closer
        const credsInfo = getSalespersonCredentials(seller.name, seller.email);
        const email = credsInfo.email;
        const newUserId = `user-${id}`;
        await pgPool.query(
          `INSERT INTO users (id, name, email, password_hash, password_salt, role, salesperson_id, active, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [newUserId, seller.name, email.toLowerCase(), creds.hash, creds.salt, 'salesperson', id, true, now]
        );
        return res.json({
          success: true,
          email: email.toLowerCase(),
          message: `Credencial criada com sucesso para ${seller.name}!`
        });
      }
    } else {
      const seller = memorySalespeopleMap.get(id);
      if (!seller) {
        return res.status(404).json({ error: 'Vendedor não encontrado.' });
      }
      let foundUser: any = null;
      for (const u of memoryUsersMap.values()) {
        if (u.salespersonId === id) {
          foundUser = u;
          break;
        }
      }
      if (foundUser) {
        foundUser.passwordHash = creds.hash;
        foundUser.passwordSalt = creds.salt;
        foundUser.active = true;
        return res.json({
          success: true,
          email: foundUser.email,
          message: `Senha de ${seller.name} atualizada com sucesso!`
        });
      } else {
        const credsInfo = getSalespersonCredentials(seller.name, seller.email);
        const email = credsInfo.email;
        const newUserId = `user-${id}`;
        memoryUsersMap.set(newUserId, {
          id: newUserId,
          name: seller.name,
          email: email.toLowerCase(),
          passwordHash: creds.hash,
          passwordSalt: creds.salt,
          role: 'salesperson',
          salespersonId: id,
          active: true,
          createdAt: now
        });
        return res.json({
          success: true,
          email: email.toLowerCase(),
          message: `Credencial criada com sucesso para ${seller.name}!`
        });
      }
    }
  } catch (error: any) {
    console.error('Error resetting password for salesperson:', error);
    res.status(500).json({ error: 'Erro ao redefinir senha do vendedor.' });
  }
});

// 3.2 Quick Toggle Active status for salesperson
app.patch('/api/salespeople/:id/toggle-active', async (req: any, res) => {
  const { id } = req.params;
  const { active } = req.body;

  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'O status active deve ser booleano.' });
  }

  try {
    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `UPDATE salespeople SET active = $1 WHERE id = $2 RETURNING id, name, active, COALESCE(can_generate_audit_pdf, TRUE) AS "canGenerateAuditPdf"`,
        [active, id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Vendedor não encontrado.' });
      }
      await pgPool.query(`UPDATE users SET active = $1 WHERE salesperson_id = $2`, [active, id]);
      return res.json({ success: true, salesperson: result.rows[0] });
    } else {
      const seller = memorySalespeopleMap.get(id);
      if (!seller) {
        return res.status(404).json({ error: 'Vendedor não encontrado.' });
      }
      seller.active = active;
      for (const u of memoryUsersMap.values()) {
        if (u.salespersonId === id) {
          u.active = active;
        }
      }
      return res.json({ success: true, salesperson: seller });
    }
  } catch (err: any) {
    console.error('Erro ao alternar status do vendedor:', err);
    res.status(500).json({ error: 'Erro ao alternar status do vendedor.' });
  }
});

// 3.2.1 Toggle Can Generate Audit PDF Permission for salesperson
app.patch('/api/salespeople/:id/toggle-audit-pdf', async (req: any, res) => {
  const { id } = req.params;
  const { canGenerateAuditPdf } = req.body;

  if (typeof canGenerateAuditPdf !== 'boolean') {
    return res.status(400).json({ error: 'O status canGenerateAuditPdf deve ser booleano.' });
  }

  try {
    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `UPDATE salespeople SET can_generate_audit_pdf = $1 WHERE id = $2 RETURNING id, name, active, COALESCE(can_generate_audit_pdf, TRUE) AS "canGenerateAuditPdf"`,
        [canGenerateAuditPdf, id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Vendedor não encontrado.' });
      }
      return res.json({ success: true, salesperson: result.rows[0] });
    } else {
      const seller = memorySalespeopleMap.get(id);
      if (!seller) {
        return res.status(404).json({ error: 'Vendedor não encontrado.' });
      }
      seller.canGenerateAuditPdf = canGenerateAuditPdf;
      return res.json({ success: true, salesperson: seller });
    }
  } catch (err: any) {
    console.error('Erro ao alternar permissão de laudo audit PDF:', err);
    res.status(500).json({ error: 'Erro ao alternar permissão de laudo audit PDF.' });
  }
});

// 3.2.1.1 Update Salesperson WhatsApp Type (Business, Normal ou Ask)
app.patch('/api/salespeople/:id/whatsapp-type', async (req: any, res) => {
  const { id } = req.params;
  const { whatsappType } = req.body;
  const cleanType = ['business', 'normal', 'ask'].includes(whatsappType) ? whatsappType : 'business';

  try {
    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `UPDATE salespeople 
         SET whatsapp_type = $1 
         WHERE id = $2 
         RETURNING id, name, active, COALESCE(whatsapp_type, 'business') AS "whatsappType"`,
        [cleanType, id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Vendedor não encontrado.' });
      }
      return res.json({ success: true, salesperson: result.rows[0] });
    } else {
      const seller = memorySalespeopleMap.get(id);
      if (!seller) {
        return res.status(404).json({ error: 'Vendedor não encontrado.' });
      }
      seller.whatsappType = cleanType;
      return res.json({ success: true, salesperson: seller });
    }
  } catch (err: any) {
    console.error('Erro ao atualizar whatsapp_type do vendedor:', err);
    res.status(500).json({ error: 'Erro ao atualizar preferência de WhatsApp.' });
  }
});

// 3.2.2 Live Website Audit Endpoint (Instantâneo, Sem IA)
app.post('/api/leads/:id/audit', async (req: any, res) => {
  const { id } = req.params;

  try {
    let leadName = '';
    let websiteUrl = '';

    if (usePostgres && pgPool) {
      const leadRes = await pgPool.query('SELECT name, website FROM leads WHERE id = $1', [id]);
      if (leadRes.rowCount === 0) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }
      leadName = leadRes.rows[0].name;
      websiteUrl = leadRes.rows[0].website || '';
    } else {
      const lead = memoryLeadsMap.get(id);
      if (!lead) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }
      leadName = lead.name;
      websiteUrl = lead.website || '';
    }

    const report = await performWebsiteAudit(id, leadName, websiteUrl);
    return res.json(report);
  } catch (err: any) {
    console.error('Erro ao gerar auditoria do site:', err);
    res.status(500).json({ error: `Falha ao analisar site: ${err.message}` });
  }
});

// 3.3 Batch assign leads to a salesperson
app.post('/api/leads/batch-assign', async (req: any, res) => {
  if (req.user && !isUserAdmin(req.user)) {
    return res.status(403).json({ error: 'Permissão negada. Apenas administradores podem transferir carteiras de leads.' });
  }
  const { leadIds, targetSalespersonId, targetSalespersonName } = req.body;

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'Nenhum lead selecionado para transferência.' });
  }
  if (!targetSalespersonId) {
    return res.status(400).json({ error: 'Vendedor de destino obrigatório.' });
  }

  try {
    let resolvedName = targetSalespersonName;
    if (!resolvedName) {
      if (usePostgres && pgPool) {
        const spRes = await pgPool.query('SELECT name FROM salespeople WHERE id = $1', [targetSalespersonId]);
        if (spRes.rows.length > 0) resolvedName = spRes.rows[0].name;
      } else {
        const sp = memorySalespeopleMap.get(targetSalespersonId);
        if (sp) resolvedName = sp.name;
      }
    }
    resolvedName = resolvedName || 'Thomas';

    if (usePostgres && pgPool) {
      await pgPool.query(
        `UPDATE leads 
         SET salesperson_id = $1, salesperson_name = $2, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ANY($3::varchar[])`,
        [targetSalespersonId, resolvedName, leadIds]
      );
      return res.json({
        success: true,
        count: leadIds.length,
        message: `${leadIds.length} lead(s) transferido(s) para ${resolvedName} com sucesso!`
      });
    } else {
      let count = 0;
      for (const id of leadIds) {
        const l = memoryLeadsMap.get(id);
        if (l) {
          l.salespersonId = targetSalespersonId;
          l.salespersonName = resolvedName;
          l.updatedAt = new Date().toISOString();
          count++;
        }
      }
      return res.json({
        success: true,
        count,
        message: `${count} lead(s) transferido(s) para ${resolvedName} com sucesso!`
      });
    }
  } catch (err: any) {
    console.error('Erro ao transferir leads em lote:', err);
    res.status(500).json({ error: 'Erro ao transferir leads em lote.' });
  }
});

// 4. Delete salesperson (Reassigns their leads back to Thomas / primary)
app.delete('/api/salespeople/:id', async (req: any, res) => {
  if (req.user && !isUserAdmin(req.user)) {
    return res.status(403).json({ error: 'Permissão negada. Apenas administradores podem remover vendedores.' });
  }
  const { id } = req.params;

  if (id === 'seller-thomas') {
    return res.status(400).json({ error: 'Não é permitido excluir o vendedor principal (Thomas).' });
  }

  try {
    if (usePostgres && pgPool) {
      // Reassign leads to Thomas
      await pgPool.query(
        `UPDATE leads SET salesperson_id = 'seller-thomas', salesperson_name = 'Thomas' WHERE salesperson_id = $1`,
        [id]
      );
      // Delete associated user login
      await pgPool.query(`DELETE FROM users WHERE salesperson_id = $1`, [id]);
      // Delete salesperson
      await pgPool.query(`DELETE FROM salespeople WHERE id = $1`, [id]);
      await logAudit('VENDEDOR_EXCLUIDO', `Excluiu vendedor ID ${id} e removeu suas credenciais de login`, req);
      return res.json({ success: true, message: 'Vendedor e sua conta de acesso foram excluídos, e seus leads foram transferidos para Thomas.' });
    } else {
      for (const lead of memoryLeadsMap.values()) {
        if (lead.salespersonId === id) {
          lead.salespersonId = 'seller-thomas';
          lead.salespersonName = 'Thomas';
        }
      }
      for (const [uid, u] of memoryUsersMap.entries()) {
        if (u.salespersonId === id) {
          memoryUsersMap.delete(uid);
        }
      }
      memorySalespeopleMap.delete(id);
      await logAudit('VENDEDOR_EXCLUIDO', `Excluiu vendedor ID ${id} e removeu suas credenciais de login`, req);
      return res.json({ success: true, message: 'Vendedor e sua conta de acesso foram excluídos, e seus leads foram transferidos para Thomas.' });
    }
  } catch (error) {
    console.error('Error deleting salesperson:', error);
    res.status(500).json({ error: 'Erro ao excluir vendedor.' });
  }
});

// 5. Assign a single lead to a salesperson
app.put('/api/leads/:id/assign', async (req: any, res) => {
  // Admin transfere qualquer lead. O vendedor DONO pode passar a própria conversa para um
  // colega (o guard de /api/leads/:id já garante que ele só chega aqui nos leads dele).
  // Antes só admin transferia, então um vendedor de férias não tinha como repassar nada.
  if (req.user && !isUserAdmin(req.user) && !req.user.salespersonId) {
    return res.status(403).json({ error: 'Sua conta não tem carteira de leads vinculada.' });
  }
  const { id } = req.params;
  const { salespersonId, salespersonName } = req.body;

  if (!salespersonId) {
    return res.status(400).json({ error: 'ID do vendedor é obrigatório.' });
  }

  try {
    let resolvedName = salespersonName;
    if (!resolvedName) {
      if (usePostgres && pgPool) {
        const spRes = await pgPool.query('SELECT name FROM salespeople WHERE id = $1', [salespersonId]);
        if (spRes.rows.length > 0) resolvedName = spRes.rows[0].name;
      } else {
        const sp = memorySalespeopleMap.get(salespersonId);
        if (sp) resolvedName = sp.name;
      }
    }
    resolvedName = resolvedName || 'Thomas';

    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `UPDATE leads SET salesperson_id = $1, salesperson_name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`,
        [salespersonId, resolvedName, id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }
      return res.json({ success: true, lead: result.rows[0] });
    } else {
      const lead = memoryLeadsMap.get(id);
      if (!lead) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }
      lead.salespersonId = salespersonId;
      lead.salespersonName = resolvedName;
      lead.updatedAt = new Date().toISOString();
      memoryLeadsMap.set(id, lead);
      return res.json({ success: true, lead });
    }
  } catch (error) {
    console.error('Error assigning lead:', error);
    res.status(500).json({ error: 'Erro ao atribuir lead ao vendedor.' });
  }
});

// 6. DISTRIBUTE UNCONTACTED LEADS (DIVISÃO DE LEADS)
// RULE: ONLY leads in column 'Leads' with 0 calls are eligible. Leads in progress are NEVER moved.
app.post('/api/leads/distribute', async (req: any, res) => {
  const callerUser = req.user || {
    id: req.headers['x-user-id'] || req.body?.userId,
    email: req.headers['x-user-email'] || req.body?.userEmail,
    role: req.headers['x-user-role'] || req.body?.userRole,
    name: req.headers['x-user-name'] || req.body?.userName
  };

  // Se for explicitamente um vendedor comum não-admin, bloqueia
  if (callerUser && callerUser.role === 'salesperson' && !isUserAdmin(callerUser)) {
    return res.status(403).json({ error: 'Permissão negada. Apenas administradores podem redistribuir carteiras.' });
  }

  const { targetSalespersonId, mode = 'percentage', value, sourceSalespersonId } = req.body;

  if (!targetSalespersonId) {
    return res.status(400).json({ error: 'Vendedor(a) de destino é obrigatório.' });
  }

  const numValue = Number(value);
  if (isNaN(numValue) || numValue <= 0) {
    return res.status(400).json({ error: 'Informe um valor numérico válido (porcentagem ou quantidade).' });
  }

  try {
    let targetSalesperson: Salesperson | undefined;

    if (usePostgres && pgPool) {
      const spRes = await pgPool.query(`SELECT id, name, color, bg_color AS "bgColor" FROM salespeople WHERE id = $1`, [targetSalespersonId]);
      if (spRes.rows.length > 0) {
        targetSalesperson = spRes.rows[0];
      }
    } else {
      targetSalesperson = memorySalespeopleMap.get(targetSalespersonId);
    }

    if (!targetSalesperson) {
      return res.status(404).json({ error: 'Vendedor(a) de destino não encontrado(a).' });
    }

    let eligibleLeadIds: string[] = [];

    if (usePostgres && pgPool) {
      let query = `
        SELECT l.id
        FROM leads l
        LEFT JOIN calls c ON l.id = c.lead_id
        WHERE l.column_status = 'Leads'
      `;
      const params: any[] = [];

      if (sourceSalespersonId && sourceSalespersonId !== 'ALL') {
        params.push(sourceSalespersonId);
        query += ` AND l.salesperson_id = $${params.length}`;
      }

      query += `
        GROUP BY l.id, l.created_at
        HAVING COUNT(c.id) = 0
        ORDER BY l.created_at DESC
      `;

      const eligibleRes = await pgPool.query(query, params);
      eligibleLeadIds = eligibleRes.rows.map(r => r.id);
    } else {
      const allLeads = Array.from(memoryLeadsMap.values());
      eligibleLeadIds = allLeads
        .filter(lead => {
          if (lead.columnStatus !== 'Leads') return false;
          const calls = memoryCallLogsMap.get(lead.id) || [];
          if (calls.length > 0) return false;
          if (sourceSalespersonId && sourceSalespersonId !== 'ALL') {
            return (lead.salespersonId || 'seller-thomas') === sourceSalespersonId;
          }
          return true;
        })
        .map(l => l.id);
    }

    if (eligibleLeadIds.length === 0) {
      return res.status(400).json({
        error: 'Nenhum lead novo não abordado (coluna "Leads" com 0 ligações) está disponível para distribuição.'
      });
    }

    // Calculate count to transfer
    let countToTransfer = 0;
    if (mode === 'percentage') {
      const pct = Math.min(100, Math.max(1, numValue));
      countToTransfer = Math.round((eligibleLeadIds.length * pct) / 100);
      if (countToTransfer < 1 && eligibleLeadIds.length > 0) countToTransfer = 1;
    } else {
      countToTransfer = Math.min(eligibleLeadIds.length, Math.max(1, Math.floor(numValue)));
    }

    const idsToTransfer = eligibleLeadIds.slice(0, countToTransfer);

    if (usePostgres && pgPool) {
      await pgPool.query(
        `UPDATE leads 
         SET salesperson_id = $1, salesperson_name = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($3::text[])`,
        [targetSalesperson.id, targetSalesperson.name, idsToTransfer]
      );
    } else {
      for (const id of idsToTransfer) {
        const lead = memoryLeadsMap.get(id);
        if (lead) {
          lead.salespersonId = targetSalesperson.id;
          lead.salespersonName = targetSalesperson.name;
          lead.updatedAt = new Date().toISOString();
          memoryLeadsMap.set(id, lead);
        }
      }
    }

    return res.json({
      success: true,
      transferredCount: idsToTransfer.length,
      targetSalespersonName: targetSalesperson.name,
      totalEligibleBefore: eligibleLeadIds.length,
      remainingEligible: eligibleLeadIds.length - idsToTransfer.length
    });
  } catch (error: any) {
    console.error('Error distributing leads:', error);
    res.status(500).json({ error: `Erro ao distribuir leads: ${error.message}` });
  }
});

// ============================================================================
// ROLETA DE DISTRIBUIÇÃO COM CONCORRÊNCIA SEGURA (SELECT FOR UPDATE)
// ============================================================================
let memoryRouletteLock = false;

async function assignLeadViaRoulette(
  leadId: string,
  leadType: 'interessado' | 'nao_interessado' | 'geral' = 'geral',
  opts: { force?: boolean } = {}
): Promise<{ salespersonId: string; salespersonName: string } | null> {
  // A roleta distribui lead SEM DONO. Se o lead já tem vendedor, ele continua com esse vendedor.
  //
  // Antes a roleta rodava a cada mensagem recebida: o cliente mandava 4 mensagens e a conversa
  // trocava de dono 4 vezes, cada vendedor via um pedaço do atendimento e ninguém fechava.
  // `force: true` é para a distribuição manual feita pelo admin, que pode reatribuir.
  if (!opts.force) {
    const currentOwner = await getLeadOwnerId(leadId);
    if (currentOwner) {
      return null; // já tem dono: nada muda
    }
  }
  if (usePostgres && pgPool) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');

      // Trava de linha exclusiva (FOR UPDATE) nos vendedores ativos com limite disponível
      const sellersRes = await client.query(
        `SELECT id, name, color, bg_color AS "bgColor",
                COALESCE(pct_interessados, 50.00)::numeric AS "pctInteressados",
                COALESCE(pct_nao_interessados, 50.00)::numeric AS "pctNaoInteressados",
                COALESCE(limite_leads_diario, 50)::int AS "limiteLeadsDiario",
                COALESCE(leads_recebidos_hoje, 0)::int AS "leadsRecebidosHoje"
         FROM salespeople
         WHERE COALESCE(leads_recebidos_hoje, 0) < COALESCE(limite_leads_diario, 50)
         ORDER BY id ASC
         FOR UPDATE`
      );

      let eligibleSellers = sellersRes.rows;

      // Se todos atingiram o limite diário, fallback seguro para o vendedor com menos leads recebidos hoje
      if (eligibleSellers.length === 0) {
        const fallbackRes = await client.query(
          `SELECT id, name, color, bg_color AS "bgColor",
                  COALESCE(pct_interessados, 50.00)::numeric AS "pctInteressados",
                  COALESCE(pct_nao_interessados, 50.00)::numeric AS "pctNaoInteressados",
                  COALESCE(limite_leads_diario, 50)::int AS "limiteLeadsDiario",
                  COALESCE(leads_recebidos_hoje, 0)::int AS "leadsRecebidosHoje"
           FROM salespeople
           ORDER BY leads_recebidos_hoje ASC
           LIMIT 1
           FOR UPDATE`
        );
        eligibleSellers = fallbackRes.rows;
      }

      if (eligibleSellers.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      // Escolhe o vendedor com menor saturação em relação ao seu percentual ponderado
      let chosenSeller = eligibleSellers[0];
      let lowestSaturation = Infinity;

      for (const seller of eligibleSellers) {
        const weight = leadType === 'interessado'
          ? Number(seller.pctInteressados)
          : Number(seller.pctNaoInteressados);
        const effectiveWeight = Math.max(1, weight);
        const saturation = Number(seller.leadsRecebidosHoje) / effectiveWeight;
        if (saturation < lowestSaturation) {
          lowestSaturation = saturation;
          chosenSeller = seller;
        }
      }

      // Atualiza o contador de leads do vendedor atomicamente
      await client.query(
        `UPDATE salespeople 
         SET leads_recebidos_hoje = COALESCE(leads_recebidos_hoje, 0) + 1 
         WHERE id = $1`,
        [chosenSeller.id]
      );

      // Atribui o lead ao vendedor
      await client.query(
        `UPDATE leads 
         SET salesperson_id = $1, salesperson_name = $2, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $3`,
        [chosenSeller.id, chosenSeller.name, leadId]
      );

      await client.query('COMMIT');

      broadcastSSE('LEAD_ASSIGNED', {
        leadId,
        salespersonId: chosenSeller.id,
        salespersonName: chosenSeller.name,
        type: leadType
      }, { owner: chosenSeller.id });

      return {
        salespersonId: chosenSeller.id,
        salespersonName: chosenSeller.name
      };
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[Roleta DB Error]:', err);
      return null;
    } finally {
      client.release();
    }
  } else {
    // Fallback seguro em memória com lock de concorrência
    while (memoryRouletteLock) {
      await new Promise(r => setTimeout(r, 10));
    }
    memoryRouletteLock = true;
    try {
      const allSellers = Array.from(memorySalespeopleMap.values());
      let candidates = allSellers.filter(
        s => (s.leadsRecebidosHoje || 0) < (s.limiteLeadsDiario || 50)
      );
      if (candidates.length === 0) candidates = allSellers;
      if (candidates.length === 0) return null;

      let chosen = candidates[0];
      let lowestSaturation = Infinity;
      for (const seller of candidates) {
        const weight = leadType === 'interessado'
          ? (seller.pctInteressados ?? 50)
          : (seller.pctNaoInteressados ?? 50);
        const saturation = (seller.leadsRecebidosHoje || 0) / Math.max(1, weight);
        if (saturation < lowestSaturation) {
          lowestSaturation = saturation;
          chosen = seller;
        }
      }

      chosen.leadsRecebidosHoje = (chosen.leadsRecebidosHoje || 0) + 1;
      memorySalespeopleMap.set(chosen.id, chosen);

      const lead = memoryLeadsMap.get(leadId);
      if (lead) {
        lead.salespersonId = chosen.id;
        lead.salespersonName = chosen.name;
        lead.updatedAt = new Date().toISOString();
        memoryLeadsMap.set(leadId, lead);
      }

      broadcastSSE('LEAD_ASSIGNED', {
        leadId,
        salespersonId: chosen.id,
        salespersonName: chosen.name,
        type: leadType
      }, { owner: chosen.id });

      return {
        salespersonId: chosen.id,
        salespersonName: chosen.name
      };
    } finally {
      memoryRouletteLock = false;
    }
  }
}

// Reset diário automático de leads recebidos à meia-noite
let lastResetDateString = new Date().toDateString();
setInterval(async () => {
  const currentDateString = new Date().toDateString();
  if (currentDateString !== lastResetDateString) {
    lastResetDateString = currentDateString;
    console.log('[Roleta Diária] Executando reset automático de leads diários da equipe...');
    if (usePostgres && pgPool) {
      try {
        await pgPool.query('UPDATE salespeople SET leads_recebidos_hoje = 0');
      } catch (err) {
        console.warn('[Roleta Diária] Erro ao resetar no Postgres:', err);
      }
    }
    for (const seller of memorySalespeopleMap.values()) {
      seller.leadsRecebidosHoje = 0;
    }
    broadcastSSE('SALESPEOPLE_UPDATED', { resetDaily: true }, { broadcastAll: true });
  }
}, 60000);

// Configuração de Pesos da Roleta por Vendedor
app.post('/api/salespeople/:id/roulette-config', async (req, res) => {
  const { id } = req.params;
  const { pctInteressados, pctNaoInteressados, limiteLeadsDiario } = req.body;

  const pctWarm = Math.max(0, Math.min(100, Number(pctInteressados ?? 50)));
  const pctCold = Math.max(0, Math.min(100, Number(pctNaoInteressados ?? 50)));
  const limit = Math.max(1, Number(limiteLeadsDiario ?? 50));

  if (usePostgres && pgPool) {
    try {
      await pgPool.query(
        `UPDATE salespeople 
         SET pct_interessados = $1, pct_nao_interessados = $2, limite_leads_diario = $3
         WHERE id = $4`,
        [pctWarm, pctCold, limit, id]
      );
    } catch (err: any) {
      return res.status(500).json({ error: `Erro ao salvar configurações da roleta: ${err.message}` });
    }
  }

  const seller = memorySalespeopleMap.get(id);
  if (seller) {
    seller.pctInteressados = pctWarm;
    seller.pctNaoInteressados = pctCold;
    seller.limiteLeadsDiario = limit;
    memorySalespeopleMap.set(id, seller);
  }

  broadcastSSE('SALESPEOPLE_UPDATED', { salespersonId: id }, { broadcastAll: true });
  return res.json({ success: true, salespersonId: id, pctWarm, pctCold, limit });
});

// Reset manual de leads diários da equipe
app.post('/api/salespeople/reset-daily-leads', async (req, res) => {
  if (usePostgres && pgPool) {
    try {
      await pgPool.query('UPDATE salespeople SET leads_recebidos_hoje = 0');
    } catch (err: any) {
      return res.status(500).json({ error: `Erro ao resetar: ${err.message}` });
    }
  }

  for (const s of memorySalespeopleMap.values()) {
    s.leadsRecebidosHoje = 0;
  }

  broadcastSSE('SALESPEOPLE_UPDATED', { resetDaily: true }, { broadcastAll: true });
  return res.json({ success: true, message: 'Contagem diária de leads zerada com sucesso!' });
});

// Execução da Roleta em Lote (Distribui leads pendentes respeitando limites e pesos)
app.post('/api/salespeople/distribute-roulette', async (req, res) => {
  const { leadType = 'geral', maxCount = 50 } = req.body;

  let leadIds: string[] = [];
  if (usePostgres && pgPool) {
    const qRes = await pgPool.query(
      `SELECT id FROM leads 
       WHERE column_status = 'Leads'
       ORDER BY created_at DESC 
       LIMIT $1`,
      [Number(maxCount) || 50]
    );
    leadIds = qRes.rows.map(r => r.id);
  } else {
    leadIds = Array.from(memoryLeadsMap.values())
      .filter(l => l.columnStatus === 'Leads')
      .slice(0, Number(maxCount) || 50)
      .map(l => l.id);
  }

  const assigned: any[] = [];
  for (const id of leadIds) {
    // Distribuição manual do admin: pode reatribuir lead que já tem dono.
    const resAssigned = await assignLeadViaRoulette(id, leadType, { force: true });
    if (resAssigned) assigned.push({ leadId: id, ...resAssigned });
  }

  return res.json({
    success: true,
    totalProcessed: leadIds.length,
    assignedCount: assigned.length,
    assigned
  });
});

// ============================================================================
// QUICK REPLIES (RESPOSTAS RÁPIDAS COM ATALHO '/')
// ============================================================================
app.get('/api/quick-replies', async (req, res) => {
  // Com Postgres, a verdade é o banco — inclusive quando está vazio.
  // Antes, lista vazia no banco fazia aparecerem 4 respostas "padrão" que só existiam na
  // memória: o usuário apagava e elas voltavam, editava e não salvava.
  // As padrão agora são gravadas no banco na primeira subida (ver initDatabase).
  if (usePostgres && pgPool) {
    try {
      const qRes = await pgPool.query(
        `SELECT id, salesperson_id AS "salespersonId", shortcut, title, type, content, media_url AS "mediaUrl", created_at AS "createdAt"
         FROM quick_replies
         ORDER BY created_at ASC`
      );
      return res.json({ success: true, quickReplies: qRes.rows });
    } catch (err: any) {
      console.warn('[PostgreSQL] Erro ao buscar quick_replies:', err.message);
      return res.status(503).json({ error: 'Não foi possível ler as respostas rápidas.' });
    }
  }
  return res.json({
    success: true,
    quickReplies: Array.from(memoryQuickRepliesMap.values())
  });
});

app.post('/api/quick-replies', async (req, res) => {
  const { shortcut, title, content, type = 'text', mediaUrl, salespersonId } = req.body;
  if (!shortcut || !title || !content) {
    return res.status(400).json({ error: 'Atalho, título e conteúdo são obrigatórios.' });
  }

  const cleanShortcut = String(shortcut).replace(/^\//, '').trim().toLowerCase();
  const id = `qr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const newQR: QuickReply = {
    id,
    salespersonId,
    shortcut: cleanShortcut,
    title: String(title).trim(),
    type,
    content: String(content).trim(),
    mediaUrl,
    createdAt: new Date().toISOString()
  };

  memoryQuickRepliesMap.set(id, newQR);

  if (usePostgres && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO quick_replies (id, salesperson_id, shortcut, title, type, content, media_url, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [id, salespersonId || null, cleanShortcut, newQR.title, type, newQR.content, mediaUrl || null]
      );
    } catch (err: any) {
      console.warn('[PostgreSQL] Erro ao criar quick_reply:', err.message);
    }
  }

  broadcastSSE('QUICK_REPLY_CREATED', { quickReply: newQR }, { broadcastAll: true });
  return res.status(201).json({ success: true, quickReply: newQR });
});

app.delete('/api/quick-replies/:id', async (req, res) => {
  const { id } = req.params;
  memoryQuickRepliesMap.delete(id);

  if (usePostgres && pgPool) {
    try {
      await pgPool.query('DELETE FROM quick_replies WHERE id = $1', [id]);
    } catch (err: any) {
      console.warn('[PostgreSQL] Erro ao excluir quick_reply:', err.message);
    }
  }

  broadcastSSE('QUICK_REPLY_DELETED', { id }, { broadcastAll: true });
  return res.json({ success: true, id });
});

// Robust Helper functions for Phone & Nyroh URL Extraction
function extractPhoneNumber(data: any): string {
  if (!data || typeof data !== 'object') return '';

  const candidates = [
    data.phoneNumber,
    data.phone_number,
    data.phone,
    data.telephone,
    data.tel,
    data.whatsapp,
    data.celular,
    data.telefone,
    data.mobile,
    data.contactPhone,
    data.contact_phone,
    data.numero,
    data.numeroTelefone,
    data.formatted_phone_number,
    data.international_phone_number,
    data.national_phone_number,
    data.primaryPhone,
    data.contact?.phone,
    data.contact?.phoneNumber,
    data.contact?.telefone,
    data.contact?.celular,
    data.contact?.whatsapp,
    data.details?.phone,
    data.details?.phoneNumber,
    data.details?.telefone,
    data.business?.phone,
    data.business?.phoneNumber,
    data.lead?.phone,
    data.lead?.phoneNumber,
    data.lead?.telefone
  ];

  // Check array candidates like data.phones or data.phoneNumbers
  if (Array.isArray(data.phones) && data.phones.length > 0) {
    candidates.unshift(data.phones[0]);
  }
  if (Array.isArray(data.phoneNumbers) && data.phoneNumbers.length > 0) {
    candidates.unshift(data.phoneNumbers[0]);
  }

  for (const item of candidates) {
    if (item !== undefined && item !== null) {
      if (typeof item === 'string' && item.trim()) {
        const cleaned = item.trim();
        // Ignore dummy strings
        if (cleaned !== '(Sem telefone)' && cleaned !== 'null' && cleaned !== 'undefined' && cleaned.replace(/\D/g, '').length >= 6) {
          return cleaned;
        }
      } else if (typeof item === 'number') {
        const str = String(item).trim();
        if (str.length >= 6) return str;
      } else if (typeof item === 'object') {
        // e.g. { number: '...', value: '...' }
        const sub = item.number || item.phone || item.value || item.formatted || '';
        if (typeof sub === 'string' && sub.trim() && sub.replace(/\D/g, '').length >= 6) {
          return sub.trim();
        }
      }
    }
  }

  return '';
}

function extractNyrohUrl(data: any): string {
  if (!data || typeof data !== 'object') return '';

  // 1. Check direct metadata objects first (Nyroh / Ditho sites)
  if (data.dithoSitesMetadata && typeof data.dithoSitesMetadata === 'object') {
    const metaUrl = String(data.dithoSitesMetadata.publicUrl || data.dithoSitesMetadata.url || data.dithoSitesMetadata.siteUrl || '').trim();
    if (metaUrl) return metaUrl;
  }

  // 2. Check explicit Nyroh / Ditho fields
  const explicitNyrohFields = [
    data.nyrohUrl,
    data.nyroh_url,
    data.site_nyroh,
    data.siteNyroh,
    data.nyrohSite,
    data.nyroh_site,
    data.dithoUrl,
    data.ditho_url,
    data.site_ditho,
    data.previewUrl,
    data.preview_url
  ];

  for (const field of explicitNyrohFields) {
    if (typeof field === 'string' && field.trim()) {
      return field.trim();
    }
  }

  // 3. Scan all object fields for any URL containing nyroh or ditho
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if ((lower.includes('nyroh.') || lower.includes('ditho.')) && (lower.startsWith('http://') || lower.startsWith('https://') || lower.includes('.com') || lower.includes('.app'))) {
        return value.trim();
      }
    }
  }

  // 4. Check standard publicUrl fields (avoiding generic Google Search/Maps if possible)
  const standardFields = [
    data.publicUrl,
    data.public_url,
    data.siteUrl,
    data.site_url,
    data.publishedUrl
  ];

  for (const field of standardFields) {
    if (typeof field === 'string' && field.trim()) {
      const trimmed = field.trim();
      const lower = trimmed.toLowerCase();
      // Only treat as Nyroh site if it is NOT a generic google link and not obviously an old customer domain
      if (lower.includes('nyroh') || lower.includes('ditho')) {
        return trimmed;
      }
    }
  }

  return '';
}

// Helper to extract the client's original / legacy website (Google Maps / Business profile domain)
function extractLegacyWebsite(data: any): string {
  if (!data || typeof data !== 'object') return '';

  const candidates: any[] = [
    data.website,
    data.web_site,
    data.websiteUrl,
    data.website_url,
    data.site,
    data.siteUrl,
    data.site_url,
    data.url_site,
    data.urlSite,
    data.link_site,
    data.linkSite,
    data.clientWebsite,
    data.client_website,
    data.originalWebsite,
    data.original_website,
    data.legacyWebsite,
    data.legacy_website,
    data.siteAntigo,
    data.site_antigo,
    data.oldWebsite,
    data.old_website,
    data.domain,
    data.domain_url,
    data.domainUrl,
    data.business_website,
    data.businessWebsite,
    data.company_website,
    data.companyWebsite,
    data.external_url,
    data.externalUrl,
    data.page_url,
    data.pageUrl,
    data.link,
    data.url,
    // Nested candidates from various scrapers
    data.contact?.website,
    data.contact?.site,
    data.contact?.url,
    data.google_data?.website,
    data.google_data?.site,
    data.about?.website,
    data.details?.website,
    data.business?.website
  ];

  const isValidWebsite = (val: any): string | null => {
    if (!val) return null;
    let trimmed = String(val).trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();

    // Skip placeholder strings
    if (['não informado', 'nao informado', 'sem site', 'nenhum', 'null', 'undefined', '-', 'n/a', 'nenhum site', 'sem website'].includes(lower)) {
      return null;
    }

    // Skip Nyroh / Ditho preview platforms
    if (lower.includes('nyroh.') || lower.includes('ditho.') || lower.includes('painel.nyroh')) {
      return null;
    }

    // Skip search / map URLs from Google
    if (
      lower.includes('google.com/maps') ||
      lower.includes('goo.gl/maps') ||
      lower.includes('search.google.com') ||
      lower.includes('maps.google.com') ||
      lower.includes('google.com/search')
    ) {
      return null;
    }

    // Skip social media links
    if (
      lower.includes('facebook.com') ||
      lower.includes('instagram.com') ||
      lower.includes('wa.me') ||
      lower.includes('whatsapp.com') ||
      lower.includes('tiktok.com') ||
      lower.includes('youtube.com') ||
      lower.includes('linkedin.com')
    ) {
      return null;
    }

    // Ensure proper protocol if it looks like a domain
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      if (trimmed.includes('.') && !trimmed.includes(' ') && trimmed.length > 4) {
        trimmed = `https://${trimmed}`;
      } else {
        return null;
      }
    }

    return trimmed;
  };

  // 1. Check direct candidates list
  for (const item of candidates) {
    if (typeof item === 'string') {
      const valid = isValidWebsite(item);
      if (valid) return valid;
    } else if (item && typeof item === 'object') {
      if (typeof item.url === 'string') {
        const valid = isValidWebsite(item.url);
        if (valid) return valid;
      }
      if (typeof item.href === 'string') {
        const valid = isValidWebsite(item.href);
        if (valid) return valid;
      }
      if (typeof item.link === 'string') {
        const valid = isValidWebsite(item.link);
        if (valid) return valid;
      }
    }
  }

  // 2. Deep scan all string fields in data for a valid website URL or domain
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      const keyLower = key.toLowerCase();
      if (keyLower.includes('site') || keyLower.includes('web') || keyLower.includes('link') || keyLower.includes('url') || keyLower.includes('domain')) {
        const valid = isValidWebsite(value);
        if (valid) return valid;
      }
    }
  }

  // 3. Fallback scan: any value that looks like a web domain (.com.br, .com, .net, etc.)
  for (const [, value] of Object.entries(data)) {
    if (typeof value === 'string' && (value.includes('.com') || value.includes('.net') || value.includes('.org') || value.includes('.site') || value.includes('.app'))) {
      const valid = isValidWebsite(value);
      if (valid) return valid;
    }
  }

  return '';
}

/**
 * CORTE AUTOMÁTICO: marca como DESCARTADO os leads que ainda estão em STAGING (qualquer safra)
 * mas cujo telefone já recebeu disparo em outra safra ou já consta no CRM como contatado.
 * Roda antes de cada disparo, então o pipeline se limpa sozinho.
 */
async function cortarJaContatados(): Promise<number> {
  if (!pgPool) return 0;
  const digits = (col: string) => `regexp_replace(${col}, '[^0-9]', '', 'g')`;
  try {
    const res = await pgPool.query(
      `UPDATE campaign_leads cl
          SET status = 'DESCARTADO',
              response_preview = 'Já contatado antes (corte automático)'
        WHERE cl.status = 'STAGING'
          AND (
            EXISTS (
              SELECT 1 FROM campaign_leads o
              WHERE o.id <> cl.id
                AND o.status NOT IN ('STAGING', 'DESCARTADO')
                AND ${digits('o.phone_number')} = ${digits('cl.phone_number')}
            )
            OR EXISTS (
              SELECT 1 FROM leads l
              WHERE (l.sub_status ILIKE '%Disparo%' OR l.last_call_tag = 'WhatsApp Enviado')
                AND ${digits('l.phone_number')} = ${digits('cl.phone_number')}
            )
          )`
    );
    const cortados = res.rowCount || 0;
    if (cortados > 0) console.log(`[Corte automático] ${cortados} lead(s) já contatado(s) removidos do pipeline.`);
    return cortados;
  } catch (err: any) {
    console.warn('[Corte automático] falhou:', err.message);
    return 0;
  }
}

// Helper function to process lead items (shared between zip upload and batch JSON API)
async function processLeadItems(items: any[]) {
  let totalProcessed = 0;
  let insertedCount = 0;
  let skippedDuplicates = 0;

  for (const data of items) {
    if (!data || typeof data !== 'object') continue;

    totalProcessed++;

    const leadId = String(
      data.id ||
      data.placeId ||
      data.place_id ||
      data.username ||
      data.pin ||
      data.targetId ||
      data._id ||
      `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    ).trim();

    const name = String(
      data.name ||
      data.title ||
      data.companyName ||
      data.company_name ||
      data.businessName ||
      data.username ||
      'Lead sem nome'
    ).trim();

    const rawExtractedPhone = extractPhoneNumber(data);
    const phoneNumber = rawExtractedPhone || '(Sem telefone)';

    const publicUrl = extractNyrohUrl(data);
    const website = extractLegacyWebsite(data);

    const salespersonId = String(data.salespersonId || data.salesperson_id || 'seller-thomas').trim();
    const salespersonName = String(data.salespersonName || data.salesperson_name || 'Thomas').trim();

    const rawCategories = data.categories || data.types || data.category || data.type || '';
    const categoriesStr = Array.isArray(rawCategories) ? rawCategories.join(', ') : String(rawCategories || '');
    const niche = getLeadNiche(data);

    if (usePostgres && pgPool) {
      const upsertRes = await pgPool.query(
        `INSERT INTO leads (id, name, phone_number, public_url, website, column_status, salesperson_id, salesperson_name, niche, categories, variaveis_json)
         VALUES ($1, $2, $3, $4, $5, 'Leads', $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           name = CASE WHEN EXCLUDED.name != 'Lead sem nome' AND EXCLUDED.name != '' THEN EXCLUDED.name ELSE leads.name END,
           phone_number = CASE 
             WHEN EXCLUDED.phone_number != '(Sem telefone)' AND EXCLUDED.phone_number != '' AND EXCLUDED.phone_number IS NOT NULL THEN EXCLUDED.phone_number 
             ELSE leads.phone_number 
           END,
           public_url = CASE 
             WHEN EXCLUDED.public_url != '' AND EXCLUDED.public_url IS NOT NULL THEN EXCLUDED.public_url 
             ELSE leads.public_url 
           END,
           website = CASE 
             WHEN EXCLUDED.website != '' AND EXCLUDED.website IS NOT NULL THEN EXCLUDED.website 
             ELSE leads.website 
           END,
           niche = CASE WHEN EXCLUDED.niche != '' AND EXCLUDED.niche IS NOT NULL THEN EXCLUDED.niche ELSE leads.niche END,
           categories = CASE WHEN EXCLUDED.categories != '' AND EXCLUDED.categories IS NOT NULL THEN EXCLUDED.categories ELSE leads.categories END,
           variaveis_json = EXCLUDED.variaveis_json,
           updated_at = CURRENT_TIMESTAMP
         RETURNING (xmax = 0) AS is_inserted`,
        [leadId, name, phoneNumber, publicUrl, website, salespersonId, salespersonName, niche, categoriesStr, JSON.stringify(data)]
      );

      if (upsertRes.rows[0]?.is_inserted) {
        insertedCount++;
      } else {
        skippedDuplicates++;
      }
    } else {
      if (memoryLeadsMap.has(leadId)) {
        const existing = memoryLeadsMap.get(leadId)!;
        if (name && name !== 'Lead sem nome') existing.name = name;
        if (phoneNumber && phoneNumber !== '(Sem telefone)') existing.phoneNumber = phoneNumber;
        if (publicUrl) existing.publicUrl = publicUrl;
        if (website) existing.website = website;
        if (niche) existing.niche = niche;
        if (categoriesStr) existing.categories = categoriesStr;
        existing.variaveisJson = data;
        existing.updatedAt = new Date().toISOString();
        skippedDuplicates++;
      } else {
        const newLead: Lead = {
          id: leadId,
          name,
          phoneNumber,
          publicUrl,
          website,
          columnStatus: 'Leads',
          salespersonId,
          salespersonName,
          niche,
          categories: categoriesStr,
          variaveisJson: data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          callCount: 0
        };
        memoryLeadsMap.set(leadId, newLead);
        insertedCount++;
      }
    }
  }

  return { totalProcessed, insertedCount, skippedDuplicates };
}

// --------------------------------------------------------------------------
// RECOVERY ENDPOINT: Varre o banco e recupera telefones reais
// --------------------------------------------------------------------------
app.post('/api/leads/recover-phones', async (req, res) => {
  try {
    let recoveredCount = 0;

    if (usePostgres && pgPool) {
      // 1. Procura em registros de chamadas anteriores
      const callsWithComments = await pgPool.query(`
        SELECT c.lead_id, c.comment, c.tag, l.phone_number AS current_phone
        FROM calls c
        JOIN leads l ON c.lead_id = l.id
        WHERE l.phone_number = '(Sem telefone)' OR l.phone_number = '' OR l.phone_number IS NULL
      `);

      for (const row of callsWithComments.rows) {
        const text = `${row.comment || ''} ${row.tag || ''}`;
        const match = text.match(/(?:\(?([1-9]{2})\)?\s*?)?(9\d{4}[-\s]?\d{4}|\d{4}[-\s]?\d{4})/);
        if (match && match[0]) {
          const cleanPhone = match[0].trim();
          await pgPool.query(
            `UPDATE leads SET phone_number = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [cleanPhone, row.lead_id]
          );
          recoveredCount++;
        }
      }

      // 2. Extrai telefone se o ID, Nome ou link contiver números válidos
      const leadsWithoutPhone = await pgPool.query(`
        SELECT id, name, public_url FROM leads 
        WHERE phone_number = '(Sem telefone)' OR phone_number = '' OR phone_number IS NULL
      `);

      for (const lead of leadsWithoutPhone.rows) {
        const textToSearch = `${lead.id} ${lead.name} ${lead.public_url || ''}`;
        const phoneMatch = textToSearch.match(/(?:\+?55\s?)?(?:\(?([1-9]{2})\)?\s*?)?(9\d{4}[-\s]?\d{4})/);
        if (phoneMatch && phoneMatch[0]) {
          const foundNumber = phoneMatch[0].trim();
          if (foundNumber.replace(/\D/g, '').length >= 8) {
            await pgPool.query(
              `UPDATE leads SET phone_number = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [foundNumber, lead.id]
            );
            recoveredCount++;
          }
        }
      }

      return res.json({
        success: true,
        recoveredCount,
        message: `${recoveredCount} telefones recuperados e restaurados no banco!`
      });
    } else {
      for (const lead of memoryLeadsMap.values()) {
        if (!lead.phoneNumber || lead.phoneNumber === '(Sem telefone)') {
          const calls = memoryCallLogsMap.get(lead.id) || [];
          for (const c of calls) {
            const match = `${c.comment} ${c.tag}`.match(/(?:\(?([1-9]{2})\)?\s*?)?(9\d{4}[-\s]?\d{4}|\d{4}[-\s]?\d{4})/);
            if (match && match[0]) {
              lead.phoneNumber = match[0].trim();
              recoveredCount++;
              break;
            }
          }
        }
      }
      return res.json({
        success: true,
        recoveredCount,
        message: `${recoveredCount} telefones restaurados em memória!`
      });
    }
  } catch (err: any) {
    console.error('Error recovering phones:', err);
    res.status(500).json({ error: `Erro ao recuperar telefones: ${err.message}` });
  }
});

// --------------------------------------------------------------------------
// RECOVERY ENDPOINT: Varre o banco e recupera sites reais para leads sem site
// --------------------------------------------------------------------------
app.post('/api/leads/recover-websites', async (req, res) => {
  try {
    let recoveredCount = 0;

    if (usePostgres && pgPool) {
      // 1. Procura leads onde website está vazio mas public_url ou categories tem link externo
      const candidatesRes = await pgPool.query(`
        SELECT id, public_url, categories, niche 
        FROM leads 
        WHERE website IS NULL OR website = '' OR website = '-'
      `);

      for (const row of candidatesRes.rows) {
        let foundSite = '';

        // Se public_url tiver um site externo que não é Nyroh nem Ditho
        if (row.public_url && typeof row.public_url === 'string') {
          const lower = row.public_url.toLowerCase();
          if (
            !lower.includes('nyroh.') &&
            !lower.includes('ditho.') &&
            !lower.includes('google.com') &&
            !lower.includes('maps.') &&
            (lower.startsWith('http') || lower.includes('.com') || lower.includes('.site') || lower.includes('.app'))
          ) {
            foundSite = row.public_url.trim();
          }
        }

        // Se categories tiver uma URL
        if (!foundSite && row.categories && typeof row.categories === 'string') {
          const urlMatch = row.categories.match(/(?:https?:\/\/|www\.)[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+(?:\/[^\s"',]*)?/i);
          if (
            urlMatch &&
            urlMatch[0] &&
            !urlMatch[0].toLowerCase().includes('nyroh') &&
            !urlMatch[0].toLowerCase().includes('ditho') &&
            !urlMatch[0].toLowerCase().includes('google')
          ) {
            let matchedUrl = urlMatch[0].trim();
            if (!matchedUrl.startsWith('http')) matchedUrl = `https://${matchedUrl}`;
            foundSite = matchedUrl;
          }
        }

        if (foundSite) {
          await pgPool.query(
            `UPDATE leads SET website = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [foundSite, row.id]
          );
          recoveredCount++;
        }
      }

      // 2. Procura em registros de chamadas se algum vendedor ou bot anotou o site do cliente no comentário
      const callsRes = await pgPool.query(`
        SELECT c.lead_id, c.comment, l.website
        FROM calls c
        JOIN leads l ON c.lead_id = l.id
        WHERE l.website IS NULL OR l.website = '' OR l.website = '-'
      `);

      for (const row of callsRes.rows) {
        if (row.comment && typeof row.comment === 'string') {
          const urlMatch = row.comment.match(/(?:https?:\/\/|www\.)[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+(?:\/[^\s]*)?/i);
          if (
            urlMatch &&
            urlMatch[0] &&
            !urlMatch[0].toLowerCase().includes('nyroh') &&
            !urlMatch[0].toLowerCase().includes('ditho') &&
            !urlMatch[0].toLowerCase().includes('google.com')
          ) {
            let cleanSite = urlMatch[0].trim();
            if (!cleanSite.startsWith('http')) cleanSite = `https://${cleanSite}`;
            await pgPool.query(
              `UPDATE leads SET website = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [cleanSite, row.lead_id]
            );
            recoveredCount++;
          }
        }
      }

      return res.json({
        success: true,
        recoveredCount,
        message: `${recoveredCount} sites recuperados e sincronizados com sucesso no banco!`
      });
    } else {
      for (const lead of memoryLeadsMap.values()) {
        if (!lead.website || !lead.website.trim() || lead.website === '-') {
          if (
            lead.publicUrl &&
            !lead.publicUrl.includes('nyroh.') &&
            !lead.publicUrl.includes('ditho.') &&
            !lead.publicUrl.includes('google.')
          ) {
            lead.website = lead.publicUrl;
            lead.updatedAt = new Date().toISOString();
            recoveredCount++;
          }
        }
      }

      return res.json({
        success: true,
        recoveredCount,
        message: `${recoveredCount} sites restaurados em memória!`
      });
    }
  } catch (err: any) {
    console.error('Error recovering websites:', err);
    res.status(500).json({ error: `Erro ao recuperar sites: ${err.message}` });
  }
});

// 2. Upload ZIP recursively and parse JSONs (Otimizado para Railway com stream e fila BullMQ)
app.post('/api/upload-zip', diskUpload.single('zipFile') as any, async (req, res) => {
  const tempFilePath = req.file?.path;
  try {
    if (!req.file || !tempFilePath) {
      return res.status(400).json({ error: 'Nenhum arquivo .ZIP enviado.' });
    }

    const isAsync = req.query.async === 'true';

    if (isAsync) {
      // Processamento 100% assíncrono via Worker BullMQ para Railway
      await enqueueZipImportJob({
        tempFilePath,
        originalFileName: req.file.originalname,
        uploadedAt: Date.now()
      });

      return res.status(202).json({
        success: true,
        queued: true,
        message: 'Arquivo .ZIP recebido com sucesso! O processamento em segundo plano foi iniciado via BullMQ.',
        fileName: req.file.originalname
      });
    }

    const fileBuffer = await fs.promises.readFile(tempFilePath);
    const zip = new JSZip();
    const contents = await zip.loadAsync(fileBuffer);

    let totalProcessed = 0;
    let insertedCount = 0;
    let skippedDuplicates = 0;
    const errors: string[] = [];

    const jsonEntries: { relativePath: string; content: string }[] = [];

    // Recursively iterate over all files in ZIP subfolders
    for (const [relativePath, fileObj] of Object.entries(contents.files)) {
      const normPath = relativePath.replace(/\\/g, '/');
      const fileName = normPath.split('/').pop() || '';

      if (
        !fileObj.dir &&
        !normPath.includes('__MACOSX') &&
        !fileName.startsWith('.') &&
        !fileName.startsWith('._')
      ) {
        try {
          const rawContent = await fileObj.async('string');
          const cleanContent = rawContent.replace(/^\uFEFF/, '').trim();
          
          const isJsonExt = normPath.toLowerCase().endsWith('.json');
          const isJsonContent = cleanContent.startsWith('{') || cleanContent.startsWith('[');

          if (cleanContent && (isJsonExt || isJsonContent)) {
            jsonEntries.push({ relativePath: normPath, content: cleanContent });
          }
        } catch (e: any) {
          errors.push(`Erro ao ler ${normPath}: ${e.message}`);
        }
      }
    }

    const allItems: any[] = [];
    for (const entry of jsonEntries) {
      try {
        let parsed: any;
        try {
          parsed = JSON.parse(entry.content);
        } catch (err1) {
          try {
            const stripped = entry.content
              .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*/g, '$1')
              .replace(/,\s*([}\]])/g, '$1');
            parsed = JSON.parse(stripped);
          } catch (err2: any) {
            errors.push(`Erro ao processar JSON em ${entry.relativePath}: ${err2.message}`);
            continue;
          }
        }

        if (Array.isArray(parsed)) {
          allItems.push(...parsed);
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.leads)) allItems.push(...parsed.leads);
          else if (Array.isArray(parsed.data)) allItems.push(...parsed.data);
          else if (Array.isArray(parsed.clients)) allItems.push(...parsed.clients);
          else if (Array.isArray(parsed.items)) allItems.push(...parsed.items);
          else if (Array.isArray(parsed.results)) allItems.push(...parsed.results);
          else allItems.push(parsed);
        }
      } catch (err: any) {
        errors.push(`Erro ao ler ${entry.relativePath}: ${err.message}`);
      }
    }

    const stats = await processLeadItems(allItems);

    // Limpa o arquivo temporário após o término
    await fs.promises.unlink(tempFilePath).catch(() => {});

    return res.json({
      totalProcessed: stats.totalProcessed,
      insertedCount: stats.insertedCount,
      skippedDuplicates: stats.skippedDuplicates,
      errors
    });
  } catch (error: any) {
    if (tempFilePath) {
      await fs.promises.unlink(tempFilePath).catch(() => {});
    }
    console.error('Error handling zip upload:', error);
    res.status(500).json({ error: `Erro no servidor ao processar o arquivo ZIP: ${error.message}` });
  }
});

// Helper to map flexible status names to official ColumnStatus
function mapToColumnStatus(rawStatus: any, defaultFallback: ColumnStatus = 'Recusado'): ColumnStatus {
  if (!rawStatus || typeof rawStatus !== 'string') return defaultFallback;
  const clean = rawStatus.toLowerCase().trim();

  if (
    clean.includes('nao fechado') ||
    clean.includes('não fechado') ||
    clean.includes('nao_fechado') ||
    clean.includes('recusad') ||
    clean.includes('desist') ||
    clean.includes('perdido') ||
    clean.includes('fora')
  ) {
    return 'Recusado';
  }
  if (
    clean.includes('fechad') ||
    clean.includes('ganho') ||
    clean.includes('venda') ||
    clean.includes('cliente')
  ) {
    return 'Fechado';
  }
  if (
    clean.includes('interessad') ||
    clean.includes('proposta') ||
    clean.includes('quente') ||
    clean.includes('oportunidade')
  ) {
    return 'Interessado';
  }
  if (
    clean.includes('abordad') ||
    clean.includes('contatad') ||
    clean.includes('conversad') ||
    clean.includes('ligacao 1') ||
    clean.includes('ligação 1') ||
    clean === '1'
  ) {
    return 'Ligação 1';
  }
  if (clean.includes('ligacao 2') || clean.includes('ligação 2') || clean === '2') {
    return 'Ligação 2';
  }
  if (clean.includes('ligacao 3') || clean.includes('ligação 3') || clean === '3') {
    return 'Ligação 3';
  }
  if (clean.includes('ligacao 4') || clean.includes('ligação 4') || clean === '4') {
    return 'Ligação 4';
  }
  if (clean.includes('lead') || clean.includes('novo') || clean.includes('triagem')) {
    return 'Leads';
  }

  // Check exact column match
  const exact = PIPELINE_COLUMNS.find((col) => col.toLowerCase() === clean);
  if (exact) return exact;

  return defaultFallback;
}

// Helper to strip non-digits for phone matching
function getOnlyDigits(str: string): string {
  return str.replace(/\D/g, '');
}

// Flexible Batch Lead Status Update Endpoint via JSON
app.post('/api/leads/batch-update', async (req, res) => {
  try {
    const { jsonPayload, defaultStatus = 'Recusado', addCallLog = true } = req.body;

    if (!jsonPayload) {
      return res.status(400).json({ error: 'Payload JSON é obrigatório.' });
    }

    let parsed: any = jsonPayload;
    if (typeof jsonPayload === 'string') {
      try {
        parsed = JSON.parse(jsonPayload);
      } catch (e: any) {
        // Try stripping comments or trailing commas
        try {
          const cleanStr = jsonPayload
            .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*/g, '$1')
            .replace(/,\s*([}\]])/g, '$1');
          parsed = JSON.parse(cleanStr);
        } catch (e2: any) {
          return res.status(400).json({ error: `JSON inválido: ${e.message}` });
        }
      }
    }

    const fallbackCol = mapToColumnStatus(defaultStatus, 'Recusado');
    const updateTasks: {
      identifier: string;
      targetStatus: ColumnStatus;
      comment?: string;
      tag?: string;
      website?: string;
    }[] = [];

    // Parse various JSON schemas into standardized updateTasks array
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item === 'string') {
          updateTasks.push({
            identifier: item.trim(),
            targetStatus: fallbackCol
          });
        } else if (item && typeof item === 'object') {
          const identifier = String(
            item.nome ||
            item.name ||
            item.lead ||
            item.telefone ||
            item.phone ||
            item.phoneNumber ||
            item.id ||
            ''
          ).trim();

          if (identifier) {
            const rawStat = item.status || item.estagio || item.coluna || item.state || item.situacao || item.situacaoWhatsApp;
            const targetStatus = mapToColumnStatus(rawStat, fallbackCol);
            const comment = String(item.observacao || item.comment || item.comentario || item.nota || '').trim();
            const tag = String(item.tag || item.etiqueta || 'WhatsApp abordado').trim();
            const website = extractLegacyWebsite(item);
            updateTasks.push({ identifier, targetStatus, comment, tag, website: website || undefined });
          }
        }
      }
    } else if (parsed && typeof parsed === 'object') {
      // Check if it's an object with keys mapped to arrays e.g. { "não fechado": ["Lead 1", "Lead 2"], "interessado": ["Lead 3"] }
      // Or object with a "leads" or "items" property
      let targetArray = parsed.leads || parsed.data || parsed.items || parsed.clients;

      if (Array.isArray(targetArray)) {
        for (const item of targetArray) {
          if (typeof item === 'string') {
            updateTasks.push({ identifier: item.trim(), targetStatus: fallbackCol });
          } else if (item && typeof item === 'object') {
            const identifier = String(item.nome || item.name || item.lead || item.telefone || item.phone || item.id || '').trim();
            if (identifier) {
              const targetStatus = mapToColumnStatus(item.status || item.estagio || item.coluna, fallbackCol);
              const comment = String(item.observacao || item.comment || item.comentario || item.nota || '').trim();
              const tag = String(item.tag || item.etiqueta || 'WhatsApp abordado').trim();
              const website = extractLegacyWebsite(item);
              updateTasks.push({ identifier, targetStatus, comment, tag, website: website || undefined });
            }
          }
        }
      } else {
        // Treat keys of object as status names
        for (const [key, val] of Object.entries(parsed)) {
          const statusForKey = mapToColumnStatus(key, fallbackCol);
          if (Array.isArray(val)) {
            for (const subItem of val) {
              if (typeof subItem === 'string') {
                updateTasks.push({ identifier: subItem.trim(), targetStatus: statusForKey });
              } else if (subItem && typeof subItem === 'object') {
                const identifier = String(subItem.nome || subItem.name || subItem.telefone || subItem.phone || subItem.id || '').trim();
                if (identifier) {
                  const comment = String(subItem.observacao || subItem.comment || subItem.comentario || '').trim();
                  const website = extractLegacyWebsite(subItem);
                  updateTasks.push({ identifier, targetStatus: statusForKey, comment, website: website || undefined });
                }
              }
            }
          } else if (typeof val === 'string') {
            // Key could be lead name and val status, or key status and val lead name
            // Let's check if key looks like a status
            const keyAsStatus = mapToColumnStatus(key, '' as any);
            if (keyAsStatus) {
              updateTasks.push({ identifier: val.trim(), targetStatus: keyAsStatus });
            } else {
              const valAsStatus = mapToColumnStatus(val, fallbackCol);
              updateTasks.push({ identifier: key.trim(), targetStatus: valAsStatus });
            }
          }
        }
      }
    }

    if (updateTasks.length === 0) {
      return res.status(400).json({ error: 'Nenhum lead ou identificador válido foi encontrado no JSON.' });
    }

    // Load existing leads from DB/memory to perform matching
    let allLeads: Lead[] = [];
    if (usePostgres && pgPool) {
      const dbRes = await pgPool.query(`SELECT id, name, phone_number AS "phoneNumber", column_status AS "columnStatus" FROM leads`);
      allLeads = dbRes.rows;
    } else {
      allLeads = Array.from(memoryLeadsMap.values());
    }

    const updatedLeadsList: { id: string; name: string; oldStatus: string; newStatus: string }[] = [];
    const notFoundIdentifiers: string[] = [];

    for (const task of updateTasks) {
      const cleanIdent = task.identifier.toLowerCase().trim();
      const digitsIdent = getOnlyDigits(task.identifier);

      // Find matching lead
      let matched = allLeads.find((l) => l.id.toLowerCase() === cleanIdent);

      if (!matched && digitsIdent.length >= 8) {
        matched = allLeads.find((l) => getOnlyDigits(l.phoneNumber).includes(digitsIdent) || digitsIdent.includes(getOnlyDigits(l.phoneNumber)));
      }

      if (!matched) {
        matched = allLeads.find((l) => l.name.toLowerCase().trim() === cleanIdent);
      }

      if (!matched && cleanIdent.length >= 3) {
        matched = allLeads.find((l) => {
          const lName = l.name.toLowerCase().trim();
          return lName.includes(cleanIdent) || cleanIdent.includes(lName);
        });
      }

      if (matched) {
        const oldStatus = matched.columnStatus;
        const newStatus = task.targetStatus;

        // Perform DB update
        if (usePostgres && pgPool) {
          if (task.website) {
            await pgPool.query(
              `UPDATE leads SET column_status = $1, website = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
              [newStatus, task.website, matched.id]
            );
          } else {
            await pgPool.query(
              `UPDATE leads SET column_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [newStatus, matched.id]
            );
          }

          if (addCallLog) {
            const callId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const commentText = task.comment || `Atualizado em lote para "${newStatus}" via JSON.`;
            const tagText = task.tag || 'Atualização via JSON';
            await pgPool.query(
              `INSERT INTO calls (id, lead_id, tag, comment, duration_seconds, created_at)
               VALUES ($1, $2, $3, $4, 0, CURRENT_TIMESTAMP)`,
              [callId, matched.id, tagText, commentText]
            );
          }
        } else {
          const memLead = memoryLeadsMap.get(matched.id);
          if (memLead) {
            memLead.columnStatus = newStatus;
            if (task.website) memLead.website = task.website;
            memLead.updatedAt = new Date().toISOString();
            memoryLeadsMap.set(matched.id, memLead);

            if (addCallLog) {
              const callId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
              const existingCalls = memoryCallLogsMap.get(matched.id) || [];
              const newCall: CallLog = {
                id: callId,
                leadId: matched.id,
                tag: task.tag || 'Atualização via JSON',
                comment: task.comment || `Atualizado em lote para "${newStatus}" via JSON.`,
                durationSeconds: 0,
                createdAt: new Date().toISOString()
              };
              existingCalls.push(newCall);
              memoryCallLogsMap.set(matched.id, existingCalls);
              memLead.callCount = existingCalls.length;
              memLead.lastCallAt = newCall.createdAt;
              memLead.lastCallTag = newCall.tag;
            }
          }
        }

        updatedLeadsList.push({
          id: matched.id,
          name: matched.name,
          oldStatus,
          newStatus
        });
      } else {
        notFoundIdentifiers.push(task.identifier);
      }
    }

    return res.json({
      totalProcessed: updateTasks.length,
      updatedCount: updatedLeadsList.length,
      notFoundCount: notFoundIdentifiers.length,
      updatedLeads: updatedLeadsList,
      notFoundIdentifiers
    });
  } catch (error: any) {
    console.error('Error in batch update:', error);
    res.status(500).json({ error: `Erro ao processar atualização via JSON: ${error.message}` });
  }
});

// Batch API to import parsed leads array directly (avoiding payload size limits on huge ZIP uploads)
app.post('/api/leads/batch', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Formato inválido. Esperado array de items.' });
    }

    const stats = await processLeadItems(items);
    return res.json(stats);
  } catch (error: any) {
    console.error('Error handling batch leads:', error);
    res.status(500).json({ error: `Erro ao salvar lote de leads: ${error.message}` });
  }
});

// 3. Update lead column status & sub-stages
app.put('/api/leads/:id/status', async (req, res) => {
  const { id } = req.params;
  const { columnStatus, subStatus, lossReason } = req.body;

  if (columnStatus && !PIPELINE_COLUMNS.includes(columnStatus as ColumnStatus)) {
    return res.status(400).json({ error: 'Status de coluna inválido.' });
  }

  try {
    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `UPDATE leads 
         SET column_status = COALESCE($1, column_status),
             sub_status = COALESCE($2, sub_status),
             loss_reason = COALESCE($3, loss_reason),
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $4 RETURNING *`,
        [columnStatus || null, subStatus || null, lossReason || null, id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }
      return res.json({ success: true, lead: result.rows[0] });
    } else {
      const lead = memoryLeadsMap.get(id);
      if (!lead) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }
      if (columnStatus) lead.columnStatus = columnStatus as ColumnStatus;
      if (subStatus !== undefined) lead.subStatus = subStatus;
      if (lossReason !== undefined) lead.lossReason = lossReason;
      lead.updatedAt = new Date().toISOString();
      memoryLeadsMap.set(id, lead);
      return res.json({ success: true, lead });
    }
  } catch (error) {
    console.error('Error updating lead status:', error);
    res.status(500).json({ error: 'Erro ao atualizar coluna do lead.' });
  }
});

// Update full lead properties (Name, Phone, PublicUrl, Website)
app.put('/api/leads/:id', async (req, res) => {
  const { id } = req.params;
  const { name, phoneNumber, publicUrl, website } = req.body;

  try {
    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `UPDATE leads 
         SET name = COALESCE($1, name),
             phone_number = COALESCE($2, phone_number),
             public_url = COALESCE($3, public_url),
             website = COALESCE($4, website),
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $5 RETURNING *`,
        [name || null, phoneNumber || null, publicUrl || null, website || null, id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }
      return res.json({ success: true, lead: result.rows[0] });
    } else {
      const lead = memoryLeadsMap.get(id);
      if (!lead) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }
      if (name) lead.name = name;
      if (phoneNumber) lead.phoneNumber = phoneNumber;
      if (publicUrl !== undefined) lead.publicUrl = publicUrl;
      if (website !== undefined) lead.website = website;
      lead.updatedAt = new Date().toISOString();
      memoryLeadsMap.set(id, lead);
      return res.json({ success: true, lead });
    }
  } catch (error: any) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Erro ao atualizar dados do lead.' });
  }
});

// 4. Get calls for a specific lead
app.get('/api/leads/:id/calls', async (req, res) => {
  const { id } = req.params;

  try {
    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `SELECT id, lead_id AS "leadId", tag, comment, duration_seconds AS "durationSeconds", follow_up_at AS "followUpAt", created_at AS "createdAt"
         FROM calls
         WHERE lead_id = $1
         ORDER BY created_at DESC`,
        [id]
      );
      return res.json(result.rows);
    } else {
      const calls = memoryCallLogsMap.get(id) || [];
      return res.json(calls.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }
  } catch (error) {
    console.error('Error fetching call logs:', error);
    res.status(500).json({ error: 'Erro ao buscar histórico de ligações.' });
  }
});

// 5. Add call log entry
app.post('/api/leads/:id/calls', async (req, res) => {
  const { id } = req.params;
  const { tag, comment, durationSeconds, followUpAt } = req.body;

  if (!tag) {
    return res.status(400).json({ error: 'A etiqueta da ligação é obrigatória.' });
  }

  const callId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const createdAt = new Date().toISOString();
  const duration = typeof durationSeconds === 'number' && durationSeconds >= 0 ? Math.floor(durationSeconds) : 0;
  const followUp = followUpAt && typeof followUpAt === 'string' && followUpAt.trim() ? followUpAt : null;

  try {
    if (usePostgres && pgPool) {
      await pgPool.query(
        `INSERT INTO calls (id, lead_id, tag, comment, duration_seconds, follow_up_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [callId, id, tag, comment || '', duration, followUp, createdAt]
      );

      // Touch lead updated_at and update next_follow_up_at
      if (followUp) {
        await pgPool.query(`UPDATE leads SET updated_at = CURRENT_TIMESTAMP, next_follow_up_at = $2 WHERE id = $1`, [id, followUp]);
      } else {
        await pgPool.query(`UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
      }

      return res.json({
        id: callId,
        leadId: id,
        tag,
        comment,
        durationSeconds: duration,
        followUpAt: followUp || undefined,
        createdAt
      });
    } else {
      const lead = memoryLeadsMap.get(id);
      if (!lead) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }

      const existingCalls = memoryCallLogsMap.get(id) || [];
      const newCallLog: CallLog = {
        id: callId,
        leadId: id,
        tag,
        comment: comment || '',
        durationSeconds: duration,
        followUpAt: followUp || undefined,
        createdAt
      };

      existingCalls.push(newCallLog);
      memoryCallLogsMap.set(id, existingCalls);

      lead.callCount = existingCalls.length;
      lead.lastCallAt = createdAt;
      lead.lastCallTag = tag;
      if (followUp) {
        lead.nextFollowUpAt = followUp;
      }
      lead.updatedAt = createdAt;
      memoryLeadsMap.set(id, lead);

      return res.json(newCallLog);
    }
  } catch (error) {
    console.error('Error adding call log:', error);
    res.status(500).json({ error: 'Erro ao registrar ligação.' });
  }
});

// 6. Delete a lead
app.delete('/api/leads/:id', async (req: any, res) => {
  const { id } = req.params;
  try {
    await logAudit('EXCLUIR_LEAD', `Excluiu lead ID: ${id}`, req);
    if (usePostgres && pgPool) {
      await pgPool.query(`DELETE FROM leads WHERE id = $1`, [id]);
      return res.json({ success: true });
    } else {
      memoryLeadsMap.delete(id);
      memoryCallLogsMap.delete(id);
      return res.json({ success: true });
    }
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Erro ao excluir lead.' });
  }
});

// 6.1 Bulk Delete Leads
app.post('/api/leads/bulk-delete', async (req: any, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Nenhum lead selecionado para exclusão.' });
  }

  try {
    await logAudit('EXCLUIR_LEADS_LOTE', `Excluiu ${ids.length} leads em lote`, req);
    if (usePostgres && pgPool) {
      await pgPool.query(`DELETE FROM leads WHERE id = ANY($1::varchar[])`, [ids]);
      return res.json({ success: true, count: ids.length, message: `${ids.length} lead(s) excluído(s) com sucesso!` });
    } else {
      for (const id of ids) {
        memoryLeadsMap.delete(id);
        memoryCallLogsMap.delete(id);
      }
      return res.json({ success: true, count: ids.length, message: `${ids.length} lead(s) excluído(s) com sucesso!` });
    }
  } catch (error: any) {
    console.error('Error bulk deleting leads:', error);
    res.status(500).json({ error: 'Erro ao excluir leads em lote.' });
  }
});

// Endpoint to fetch call logs (for Metrics & Reports, optionally filtered by salesperson)
app.get('/api/calls', async (req: any, res) => {
  let { salespersonId } = req.query;

  // Mesma regra de /api/leads: só admin vê as ligações da equipe toda.
  // Antes, `?salespersonId=ALL` devolvia as ligações de todo mundo para qualquer vendedor.
  if (!isUserAdmin(req.user)) {
    const own = req.user?.salespersonId;
    if (!own) return res.json([]);
    salespersonId = own;
  }

  try {
    if (usePostgres && pgPool) {
      let query = `
        SELECT c.id, c.lead_id AS "leadId", l.name AS "leadName", l.phone_number AS "phoneNumber",
               l.column_status AS "columnStatus", COALESCE(l.salesperson_id, 'seller-thomas') AS "salespersonId",
               COALESCE(l.salesperson_name, 'Thomas') AS "salespersonName",
               c.tag, c.comment, c.duration_seconds AS "durationSeconds",
               c.follow_up_at AS "followUpAt", c.created_at AS "createdAt"
        FROM calls c
        JOIN leads l ON c.lead_id = l.id
      `;
      const params: any[] = [];
      if (salespersonId && salespersonId !== 'ALL') {
        params.push(salespersonId);
        query += ` WHERE l.salesperson_id = $1`;
      }
      query += ` ORDER BY c.created_at DESC`;

      const result = await pgPool.query(query, params);
      return res.json(result.rows);
    } else {
      const allCalls: any[] = [];
      memoryCallLogsMap.forEach((calls, leadId) => {
        const lead = memoryLeadsMap.get(leadId);
        const sellerId = lead?.salespersonId || 'seller-thomas';
        const sellerName = lead?.salespersonName || 'Thomas';

        if (!salespersonId || salespersonId === 'ALL' || sellerId === salespersonId) {
          calls.forEach((c) => {
            allCalls.push({
              ...c,
              leadName: lead?.name || 'Lead Excluído',
              phoneNumber: lead?.phoneNumber || '',
              columnStatus: lead?.columnStatus || 'Leads',
              salespersonId: sellerId,
              salespersonName: sellerName
            });
          });
        }
      });
      allCalls.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return res.json(allCalls);
    }
  } catch (error) {
    console.error('Error fetching all calls:', error);
    res.status(500).json({ error: 'Erro ao buscar chamadas.' });
  }
});

// CSV Export Endpoint (Apenas Administradores / Gestores)
app.get('/api/export/csv', async (req: any, res) => {
  if (req.user && req.user.role === 'salesperson') {
    await logAudit('TENTATIVA_EXPORT_BLOQUEADA', 'Vendedor tentou exportar CSV da base.', req);
    return res.status(403).json({ error: 'Acesso negado. Apenas o administrador pode exportar a base de dados.' });
  }

  await logAudit('EXPORTAR_CSV', 'Exportação de relatório CSV com histórico completo de chamadas', req);

  try {
    let rows: any[] = [];
    if (usePostgres && pgPool) {
      const query = `
        SELECT 
          l.id AS "lead_id",
          l.name AS "lead_name",
          l.phone_number AS "phone_number",
          l.public_url AS "public_url",
          l.column_status AS "column_status",
          COALESCE(l.salesperson_name, 'Thomas') AS "salesperson_name",
          l.next_follow_up_at AS "next_follow_up_at",
          l.created_at AS "lead_created_at",
          c.id AS "call_id",
          c.tag AS "call_tag",
          c.comment AS "call_comment",
          c.duration_seconds AS "duration_seconds",
          c.follow_up_at AS "call_follow_up_at",
          c.created_at AS "call_created_at"
        FROM leads l
        LEFT JOIN calls c ON l.id = c.lead_id
        ORDER BY l.created_at DESC, c.created_at DESC
      `;
      const result = await pgPool.query(query);
      rows = result.rows;
    } else {
      memoryLeadsMap.forEach((lead) => {
        const calls = memoryCallLogsMap.get(lead.id) || [];
        if (calls.length === 0) {
          rows.push({
            lead_id: lead.id,
            lead_name: lead.name,
            phone_number: lead.phoneNumber,
            public_url: lead.publicUrl || '',
            column_status: lead.columnStatus,
            salesperson_name: lead.salespersonName || 'Thomas',
            next_follow_up_at: lead.nextFollowUpAt || '',
            lead_created_at: lead.createdAt,
            call_id: '',
            call_tag: '',
            call_comment: '',
            duration_seconds: 0,
            call_follow_up_at: '',
            call_created_at: ''
          });
        } else {
          calls.forEach((c) => {
            rows.push({
              lead_id: lead.id,
              lead_name: lead.name,
              phone_number: lead.phoneNumber,
              public_url: lead.publicUrl || '',
              column_status: lead.columnStatus,
              salesperson_name: lead.salespersonName || 'Thomas',
              next_follow_up_at: lead.nextFollowUpAt || '',
              lead_created_at: lead.createdAt,
              call_id: c.id,
              call_tag: c.tag,
              call_comment: c.comment,
              duration_seconds: c.durationSeconds || 0,
              call_follow_up_at: c.followUpAt || '',
              call_created_at: c.createdAt
            });
          });
        }
      });
    }

    // Generate CSV string with BOM for Excel compatibility in UTF-8
    const headers = [
      'ID Lead',
      'Nome do Lead',
      'Nicho / Segmento',
      'Telefone',
      'URL do Site',
      'Vendedor Responsável',
      'Estágio no Pipeline',
      'ID da Ligação',
      'Etiqueta / Resultado',
      'Duração (Segundos)',
      'Duração Formatada',
      'Comentário / Observação',
      'Retorno Agendado na Ligação',
      'Próximo Retorno do Lead',
      'Data da Ligação',
      'Data de Criação do Lead'
    ];

    const escapeCsvField = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const formatSeconds = (sec: number) => {
      if (!sec || sec <= 0) return '00:00';
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const csvLines = [headers.map(escapeCsvField).join(';')];

    rows.forEach((r) => {
      const niche = getLeadNiche({ name: r.lead_name, publicUrl: r.public_url });
      const line = [
        r.lead_id,
        r.lead_name,
        niche,
        r.phone_number,
        r.public_url,
        r.salesperson_name || 'Thomas',
        r.column_status,
        r.call_id,
        r.call_tag,
        r.duration_seconds || 0,
        formatSeconds(r.duration_seconds || 0),
        r.call_comment,
        r.call_follow_up_at ? new Date(r.call_follow_up_at).toLocaleString('pt-BR') : '',
        r.next_follow_up_at ? new Date(r.next_follow_up_at).toLocaleString('pt-BR') : '',
        r.call_created_at ? new Date(r.call_created_at).toLocaleString('pt-BR') : '',
        r.lead_created_at ? new Date(r.lead_created_at).toLocaleString('pt-BR') : ''
      ].map(escapeCsvField).join(';');
      csvLines.push(line);
    });

    const csvBuffer = '\uFEFF' + csvLines.join('\n'); // UTF-8 BOM
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio_vendas_ligacoes_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.status(200).send(csvBuffer);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório CSV.' });
  }
});

// 7. Seed sample leads endpoint
app.post('/api/seed-samples', async (req, res) => {
  const samples = [
    { id: 'lead-sample-101', name: 'Dr. Roberto Campos', phoneNumber: '(31) 99881-2233', publicUrl: 'https://nyroh.com.br/dr-roberto' },
    { id: 'lead-sample-102', name: 'Boutique Flor de Lis', phoneNumber: '(11) 97722-4455', publicUrl: 'https://nyroh.com.br/flor-de-lis' },
    { id: 'lead-sample-103', name: 'Oficina Mecânica Precision', phoneNumber: '(41) 99111-8899', publicUrl: 'https://nyroh.com.br/precision' },
    { id: 'lead-sample-104', name: 'Clínica Odonto Riso', phoneNumber: '(31) 98844-3322', publicUrl: 'https://nyroh.com.br/odontoriso' },
    { id: 'lead-sample-105', name: 'Restaurante Sabor Mineiro', phoneNumber: '(31) 99150-3721', publicUrl: 'https://nyroh.com.br/sabor-mineiro' }
  ];

  let insertedCount = 0;

  for (const s of samples) {
    if (usePostgres && pgPool) {
      const res = await pgPool.query(
        `INSERT INTO leads (id, name, phone_number, public_url, column_status)
         VALUES ($1, $2, $3, $4, 'Leads')
         ON CONFLICT (id) DO NOTHING`,
        [s.id, s.name, s.phoneNumber, s.publicUrl]
      );
      if (res.rowCount && res.rowCount > 0) insertedCount++;
    } else {
      if (!memoryLeadsMap.has(s.id)) {
        memoryLeadsMap.set(s.id, {
          id: s.id,
          name: s.name,
          phoneNumber: s.phoneNumber,
          publicUrl: s.publicUrl,
          columnStatus: 'Leads',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          callCount: 0
        });
        insertedCount++;
      }
    }
  }

  res.json({ message: `${insertedCount} leads de exemplo adicionados com sucesso!` });
});

// ==========================================================================
// ÁREA DE DISPAROS & CAMPANHAS EM MASSA (META CLOUD / FLUXOAPI / STAGING)
// ==========================================================================

function classifyPhoneNumber(phoneStr: string) {
  const digits = (phoneStr || '').replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('55') && local.length >= 12) {
    local = local.substring(2);
  }
  if (local.length === 11) {
    const isMobile = local[2] === '9';
    return {
      isValid: true,
      isMobile: true,
      phoneType: isMobile ? 'Celular WhatsApp' : 'Comercial WhatsApp',
      formatted: `+55 (${local.substring(0, 2)}) ${local.substring(2, 7)}-${local.substring(7)}`,
      clean: `+55${local}`
    };
  } else if (local.length === 10) {
    // No Brasil, telefones fixos e comerciais (10 dígitos), especialmente os que começam com 3 (ex: (11) 3xxx-xxxx),
    // utilizam amplamente WhatsApp Business ativo. NÃO devem ser descartados!
    const startsWith3 = local[2] === '3';
    return {
      isValid: true,
      isMobile: true, // Habilitado para WhatsApp e disparos
      phoneType: startsWith3 ? 'Comercial 3xxx (WhatsApp)' : 'Comercial/Fixo (WhatsApp)',
      formatted: `+55 (${local.substring(0, 2)}) ${local.substring(2, 6)}-${local.substring(6)}`,
      clean: `+55${local}`
    };
  } else if (local.length >= 8) {
    return {
      isValid: true,
      isMobile: true,
      phoneType: 'WhatsApp Comercial',
      formatted: phoneStr || local,
      clean: `+55${local}`
    };
  }
  return {
    isValid: false,
    isMobile: false,
    phoneType: 'Sem número válido',
    formatted: phoneStr || '(Sem telefone)',
    clean: digits
  };
}

// 1. Get all campaign batches (Safras)
app.get('/api/campaign/batches', async (req, res) => {
  try {
    if (usePostgres && pgPool) {
      const result = await pgPool.query(`
        SELECT 
          b.id,
          b.name,
          b.total_leads AS "totalLeads",
          b.valid_mobiles AS "validMobiles",
          b.landlines AS "landlines",
          b.with_nyroh_url AS "withNyrohUrl",
          b.with_website AS "withWebsite",
          b.status,
          b.template_name AS "templateName",
          b.quarantine_hours AS "quarantineHours",
          b.quarantine_started_at AS "quarantineStartedAt",
          b.quarantine_ends_at AS "quarantineEndsAt",
          b.allowed_closers AS "allowedClosers",
          b.hot_retained_by_admin AS "hotLeadsRetainedByAdmin",
          b.dispatched_count AS "dispatchedCount",
          b.hot_count AS "hotCount",
          b.cold_count AS "coldCount",
          b.opt_out_count AS "optOutCount",
          b.created_at AS "createdAt"
        FROM campaign_batches b
        ORDER BY b.created_at DESC
      `);
      return res.json(result.rows);
    } else {
      const batches = Array.from(memoryCampaignBatchesMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return res.json(batches);
    }
  } catch (err: any) {
    console.error('Erro ao buscar safras de disparo:', err);
    res.status(500).json({ error: 'Erro ao buscar safras de disparo.' });
  }
});

// 2. Create a new campaign batch
app.post('/api/campaign/batches', async (req: any, res) => {
  const { name, templateName = 'notificacao_pedido_atendimento', quarantineHours = 4 } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Nome da safra é obrigatório.' });
  }

  const batchId = `safra-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const cleanName = name.trim();
  const hours = Number(quarantineHours) > 0 ? Number(quarantineHours) : 4;
  const now = new Date().toISOString();

  try {
    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `INSERT INTO campaign_batches (id, name, template_name, quarantine_hours, created_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING id, name, total_leads AS "totalLeads", valid_mobiles AS "validMobiles", 
                   landlines, with_nyroh_url AS "withNyrohUrl", with_website AS "withWebsite",
                   status, template_name AS "templateName", quarantine_hours AS "quarantineHours",
                   allowed_closers AS "allowedClosers", hot_retained_by_admin AS "hotLeadsRetainedByAdmin",
                   dispatched_count AS "dispatchedCount", hot_count AS "hotCount", 
                   cold_count AS "coldCount", opt_out_count AS "optOutCount", created_at AS "createdAt"`,
        [batchId, cleanName, templateName, hours]
      );
      await logAudit('CAMPANHA_SAFRA_CRIADA', `Criou safra: ${cleanName}`, req);
      return res.status(201).json(result.rows[0]);
    } else {
      const newBatch: StoredCampaignBatch = {
        id: batchId,
        name: cleanName,
        totalLeads: 0,
        validMobiles: 0,
        landlines: 0,
        withNyrohUrl: 0,
        withWebsite: 0,
        status: 'draft',
        templateName,
        quarantineHours: hours,
        allowedClosers: ['seller-thomas'],
        hotLeadsRetainedByAdmin: true,
        dispatchedCount: 0,
        hotCount: 0,
        coldCount: 0,
        optOutCount: 0,
        createdAt: now
      };
      memoryCampaignBatchesMap.set(batchId, newBatch);
      await logAudit('CAMPANHA_SAFRA_CRIADA', `Criou safra: ${cleanName}`, req);
      return res.status(201).json(newBatch);
    }
  } catch (err: any) {
    console.error('Erro ao criar safra:', err);
    res.status(500).json({ error: 'Erro ao criar safra de campanha.' });
  }
});

// Helper para inserção em lote (bulk insert) no PostgreSQL sem sobrecarregar conexões
async function bulkInsertCampaignLeads(
  pool: any,
  leads: Array<{
    id: string;
    batchId: string;
    name: string;
    phoneNumber: string;
    isMobile: boolean;
    publicUrl: string;
    website: string;
    niche: string;
    status: string;
    responsePreview: string | null;
  }>
) {
  if (!leads || leads.length === 0) return;

  const valueRows: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  for (const l of leads) {
    valueRows.push(
      `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, CURRENT_TIMESTAMP)`
    );
    params.push(
      l.id,
      l.batchId,
      l.name,
      l.phoneNumber,
      l.isMobile,
      l.publicUrl,
      l.website,
      l.niche,
      l.status,
      l.responsePreview
    );
    paramIdx += 10;
  }

  const query = `
    INSERT INTO campaign_leads (id, batch_id, name, phone_number, is_mobile, public_url, website, niche, status, response_preview, created_at)
    VALUES ${valueRows.join(', ')}
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      phone_number = EXCLUDED.phone_number,
      is_mobile = EXCLUDED.is_mobile,
      public_url = EXCLUDED.public_url,
      website = EXCLUDED.website,
      niche = EXCLUDED.niche,
      status = EXCLUDED.status,
      response_preview = EXCLUDED.response_preview
  `;

  await pool.query(query, params);
}

// Rota de inicialização de progresso da importação
app.post('/api/campaign/import-progress/init', (req, res) => {
  const { jobId, fileName, fileSizeBytes, batchId } = req.body;
  const id = jobId || `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const item: CampaignImportProgress = {
    jobId: id,
    batchId,
    fileName: fileName || '',
    fileSizeBytes: Number(fileSizeBytes) || 0,
    stage: 'uploading',
    percent: 5,
    statusText: 'Recebendo arquivo ZIP no disco temporário...',
    processedFiles: 0,
    totalFiles: 0,
    totalLeadsFound: 0,
    savedLeads: 0,
    validMobiles: 0,
    landlines: 0,
    withNyrohUrl: 0,
    withWebsite: 0,
    logs: [
      {
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        text: `Iniciando upload de ${fileName || 'arquivo'} (${((Number(fileSizeBytes) || 0) / (1024 * 1024)).toFixed(1)} MB)...`,
        type: 'info'
      }
    ],
    startedAt: Date.now(),
    updatedAt: Date.now()
  };
  campaignImportProgressMap.set(id, item);
  res.json({ success: true, jobId: id });
});

// Rota de consulta de progresso em tempo real
app.get('/api/campaign/import-progress/:jobId', (req, res) => {
  const progress = campaignImportProgressMap.get(req.params.jobId);
  if (!progress) {
    return res.status(404).json({ error: 'Job de importação não encontrado.' });
  }
  res.json(progress);
});

// 3. Upload ZIP dedicado para a Área de Disparo (Staging Oficial Meta)
// Otimizado com disco temporário + lotes no Postgres + faxina automática para não estourar RAM da Railway
app.post('/api/campaign/upload-zip', diskUpload.single('zipFile') as any, async (req: any, res) => {
  const tempFilePath = req.file?.path;
  const jobId = req.body.jobId || `import_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    if (!req.file || !tempFilePath) {
      updateCampaignImportProgress(jobId, {
        stage: 'error',
        error: 'Nenhum arquivo .ZIP foi enviado pelo formulário.'
      }, { text: 'Erro: Nenhum arquivo ZIP recebido.', type: 'error' });
      return res.status(400).json({ error: 'Nenhum arquivo .ZIP enviado.' });
    }

    const { batchId: requestedBatchId, safraName } = req.body;
    let targetBatchId = requestedBatchId;
    const fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(1);

    updateCampaignImportProgress(jobId, {
      fileName: req.file.originalname,
      fileSizeBytes: req.file.size,
      stage: 'extracting',
      percent: 20,
      statusText: `Descompactando ${req.file.originalname} (${fileSizeMB} MB) no disco...`
    }, {
      text: `Arquivo ${req.file.originalname} (${fileSizeMB} MB) recebido com segurança no disco da Railway. Descompactando...`,
      type: 'info'
    });

    const fileBuffer = await fs.promises.readFile(tempFilePath);
    const zip = new JSZip();
    const contents = await zip.loadAsync(fileBuffer);

    // Localizar arquivos JSON relevantes ignorando lixo de sistema
    const validJsonFiles: Array<{ relativePath: string; fileObj: any }> = [];
    for (const [relativePath, fileObj] of Object.entries(contents.files)) {
      const normPath = relativePath.replace(/\\/g, '/');
      const fileName = normPath.split('/').pop() || '';

      if (
        !fileObj.dir &&
        !normPath.includes('__MACOSX') &&
        !fileName.startsWith('.') &&
        !fileName.startsWith('._')
      ) {
        const isJsonExt = normPath.toLowerCase().endsWith('.json');
        if (isJsonExt || normPath.includes('cliente') || normPath.includes('lead')) {
          validJsonFiles.push({ relativePath: normPath, fileObj });
        }
      }
    }

    updateCampaignImportProgress(jobId, {
      stage: 'parsing',
      percent: 35,
      totalFiles: validJsonFiles.length,
      statusText: `Lendo dados de ${validJsonFiles.length} arquivos JSON extraídos...`
    }, {
      text: `${validJsonFiles.length} arquivos JSON identificados dentro do pacote ZIP. Extraindo leads...`,
      type: 'info'
    });

    const rawLeads: any[] = [];
    for (let fIdx = 0; fIdx < validJsonFiles.length; fIdx++) {
      const { relativePath, fileObj } = validJsonFiles[fIdx];
      try {
        const rawContent = await fileObj.async('string');
        const cleanContent = rawContent.replace(/^\uFEFF/, '').trim();
        if (!cleanContent) continue;

        let parsed: any;
        try {
          parsed = JSON.parse(cleanContent);
        } catch {
          const stripped = cleanContent
            .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*/g, '$1')
            .replace(/,\s*([}\]])/g, '$1');
          parsed = JSON.parse(stripped);
        }

        if (Array.isArray(parsed)) {
          rawLeads.push(...parsed);
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.leads)) rawLeads.push(...parsed.leads);
          else if (Array.isArray(parsed.data)) rawLeads.push(...parsed.data);
          else if (Array.isArray(parsed.clients)) rawLeads.push(...parsed.clients);
          else if (Array.isArray(parsed.items)) rawLeads.push(...parsed.items);
          else if (Array.isArray(parsed.results)) rawLeads.push(...parsed.results);
          else rawLeads.push(parsed);
        }
      } catch (err: any) {
        console.warn(`Aviso ao ler JSON em ${relativePath}:`, err.message);
      }
    }

    if (rawLeads.length === 0) {
      updateCampaignImportProgress(jobId, {
        stage: 'error',
        error: 'Nenhum lead encontrado nos arquivos JSON do arquivo ZIP.'
      }, { text: 'Nenhum lead encontrado nos arquivos JSON do ZIP.', type: 'error' });
      return res.status(400).json({ error: 'Nenhum lead encontrado nos arquivos JSON do arquivo ZIP.' });
    }

    // Auto-criação da Safra se não foi fornecido um batchId existente
    if (!targetBatchId) {
      targetBatchId = `safra-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const name = safraName || `Safra Importada ${new Date().toLocaleDateString('pt-BR')} (${rawLeads.length} leads)`;

      if (usePostgres && pgPool) {
        await pgPool.query(
          `INSERT INTO campaign_batches (id, name, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)`,
          [targetBatchId, name]
        );
      } else {
        memoryCampaignBatchesMap.set(targetBatchId, {
          id: targetBatchId,
          name,
          totalLeads: 0,
          validMobiles: 0,
          landlines: 0,
          withNyrohUrl: 0,
          withWebsite: 0,
          status: 'draft',
          templateName: 'dns_escassez_np4',
          quarantineHours: 4,
          allowedClosers: ['seller-thomas'],
          hotLeadsRetainedByAdmin: true,
          dispatchedCount: 0,
          hotCount: 0,
          coldCount: 0,
          optOutCount: 0,
          createdAt: new Date().toISOString()
        });
      }
    } else {
      const name = safraName || `Safra ${targetBatchId}`;
      if (usePostgres && pgPool) {
        await pgPool.query(
          `INSERT INTO campaign_batches (id, name, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING`,
          [targetBatchId, name]
        );
      } else if (!memoryCampaignBatchesMap.has(targetBatchId)) {
        memoryCampaignBatchesMap.set(targetBatchId, {
          id: targetBatchId,
          name,
          totalLeads: 0,
          validMobiles: 0,
          landlines: 0,
          withNyrohUrl: 0,
          withWebsite: 0,
          status: 'draft',
          templateName: 'dns_escassez_np4',
          quarantineHours: 4,
          allowedClosers: ['seller-thomas'],
          hotLeadsRetainedByAdmin: true,
          dispatchedCount: 0,
          hotCount: 0,
          coldCount: 0,
          optOutCount: 0,
          createdAt: new Date().toISOString()
        });
      }
    }

    updateCampaignImportProgress(jobId, {
      batchId: targetBatchId,
      batchName: safraName || targetBatchId,
      stage: 'validating',
      percent: 45,
      totalLeadsFound: rawLeads.length,
      statusText: `Higienizando ${rawLeads.length.toLocaleString('pt-BR')} contatos para WhatsApp...`
    }, {
      text: `Safra ID: ${targetBatchId} configurada. Higienizando telefones e preparando gravação no PostgreSQL...`,
      type: 'info'
    });

    // Sanitização e formatação dos leads
    let validMobiles = 0;
    let landlines = 0;
    let withNyrohUrl = 0;
    let withWebsite = 0;

    const formattedLeadsToSave: Array<{
      id: string;
      batchId: string;
      name: string;
      phoneNumber: string;
      isMobile: boolean;
      publicUrl: string;
      website: string;
      niche: string;
      status: string;
      responsePreview: string | null;
    }> = [];

    for (const item of rawLeads) {
      if (!item || typeof item !== 'object') continue;

      const leadId = String(
        item.id ||
        item.placeId ||
        item.place_id ||
        item.username ||
        item.pin ||
        `clead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      ).trim();

      const name = String(
        item.name || item.title || item.companyName || item.company_name || item.businessName || 'Lead Sem Nome'
      ).trim();

      const rawPhone = extractPhoneNumber(item);
      const phoneInfo = classifyPhoneNumber(rawPhone);
      const publicUrl = extractNyrohUrl(item) || '';
      const website = extractLegacyWebsite(item) || '';
      const niche = getLeadNiche(item) || 'Geral';

      if (phoneInfo.isMobile) validMobiles++;
      else landlines++;

      if (publicUrl) withNyrohUrl++;
      if (website) withWebsite++;

      const initialStatus = phoneInfo.isValid ? 'STAGING' : 'DESCARTADO';
      const descReason = !phoneInfo.isValid ? 'Número inválido ou sem telefone informado' : null;

      formattedLeadsToSave.push({
        id: leadId,
        batchId: targetBatchId,
        name,
        phoneNumber: phoneInfo.formatted,
        isMobile: phoneInfo.isMobile,
        publicUrl,
        website,
        niche,
        status: initialStatus,
        responsePreview: descReason
      });
    }

    // DEDUP POR TELEFONE: não sobe de novo quem já recebeu disparo (outra safra ou CRM) nem quem está repetido no arquivo.
    if (pgPool) {
      const alreadyContacted = new Set<string>();
      try {
        const prev = await pgPool.query(
          `SELECT regexp_replace(phone_number, '[^0-9]', '', 'g') AS d
             FROM campaign_leads WHERE status NOT IN ('STAGING', 'DESCARTADO')
           UNION
           SELECT regexp_replace(phone_number, '[^0-9]', '', 'g') AS d
             FROM leads WHERE sub_status ILIKE '%Disparo%' OR last_call_tag = 'WhatsApp Enviado'`
        );
        for (const r of prev.rows) if (r.d) alreadyContacted.add(String(r.d));
      } catch (dedupErr: any) {
        console.warn('[Import] Dedup por telefone indisponível:', dedupErr.message);
      }

      const seenInFile = new Set<string>();
      const kept: typeof formattedLeadsToSave = [];
      let skippedContacted = 0;
      let skippedRepeated = 0;
      for (const item of formattedLeadsToSave) {
        const d = String(item.phoneNumber || '').replace(/[^0-9]/g, '');
        if (!d) { kept.push(item); continue; }
        if (alreadyContacted.has(d)) { skippedContacted++; continue; }
        if (seenInFile.has(d)) { skippedRepeated++; continue; }
        seenInFile.add(d);
        kept.push(item);
      }
      if (skippedContacted || skippedRepeated) {
        console.log(`[Import] Ignorados: ${skippedContacted} já disparado(s) antes, ${skippedRepeated} repetido(s) no arquivo.`);
      }
      formattedLeadsToSave.length = 0;
      formattedLeadsToSave.push(...kept);
    }

    // Gravação em Lotes no PostgreSQL (Chunks de 250 itens por consulta SQL)
    // Isso evita estourar memória RAM e reduz 15.000 queries para apenas algumas dezenas
    const CHUNK_SIZE = 250;
    const totalBatches = Math.ceil(formattedLeadsToSave.length / CHUNK_SIZE);
    let savedLeadsCount = 0;

    updateCampaignImportProgress(jobId, {
      stage: 'saving_db',
      percent: 50,
      totalBatches,
      currentBatchIndex: 1,
      validMobiles,
      landlines,
      withNyrohUrl,
      withWebsite,
      statusText: `Gravando leads no PostgreSQL (Lote 1 de ${totalBatches})...`
    }, {
      text: `Iniciando gravação no PostgreSQL em ${totalBatches} lotes de ${CHUNK_SIZE} leads...`,
      type: 'info'
    });

    for (let cIdx = 0; cIdx < formattedLeadsToSave.length; cIdx += CHUNK_SIZE) {
      const chunk = formattedLeadsToSave.slice(cIdx, cIdx + CHUNK_SIZE);
      const currentBatchNumber = Math.floor(cIdx / CHUNK_SIZE) + 1;

      if (usePostgres && pgPool) {
        await bulkInsertCampaignLeads(pgPool, chunk);
      } else {
        // Fallback em memória
        for (const l of chunk) {
          memoryCampaignLeadsMap.set(l.id, {
            id: l.id,
            batchId: l.batchId,
            name: l.name,
            phoneNumber: l.phoneNumber,
            isMobile: l.isMobile,
            publicUrl: l.publicUrl,
            website: l.website,
            niche: l.niche,
            status: l.status as any,
            responsePreview: l.responsePreview || undefined,
            createdAt: new Date().toISOString()
          });
        }
      }

      savedLeadsCount += chunk.length;
      const progressPercent = Math.min(95, 50 + Math.floor((savedLeadsCount / formattedLeadsToSave.length) * 45));

      updateCampaignImportProgress(jobId, {
        savedLeads: savedLeadsCount,
        currentBatchIndex: currentBatchNumber,
        percent: progressPercent,
        statusText: `Gravando no PostgreSQL: ${savedLeadsCount.toLocaleString('pt-BR')} de ${formattedLeadsToSave.length.toLocaleString('pt-BR')} leads (${currentBatchNumber}/${totalBatches})...`
      }, {
        text: `Lote ${currentBatchNumber}/${totalBatches} gravado com sucesso no PostgreSQL (+${chunk.length} leads).`,
        type: 'info'
      });
    }

    // Atualização final dos contadores da Safra
    if (usePostgres && pgPool) {
      await pgPool.query(
        `UPDATE campaign_batches 
         SET total_leads = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1),
             valid_mobiles = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1 AND is_mobile = TRUE),
             landlines = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1 AND is_mobile = FALSE),
             with_nyroh_url = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1 AND public_url != '' AND public_url IS NOT NULL),
             with_website = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1 AND website != '' AND website IS NOT NULL)
         WHERE id = $1`,
        [targetBatchId]
      );
    } else {
      const b = memoryCampaignBatchesMap.get(targetBatchId);
      if (b) {
        const batchLeads = Array.from(memoryCampaignLeadsMap.values()).filter(l => l.batchId === targetBatchId);
        b.totalLeads = batchLeads.length;
        b.validMobiles = batchLeads.filter(l => l.isMobile).length;
        b.landlines = batchLeads.filter(l => !l.isMobile).length;
        b.withNyrohUrl = batchLeads.filter(l => Boolean(l.publicUrl)).length;
        b.withWebsite = batchLeads.filter(l => Boolean(l.website)).length;
      }
    }

    await logAudit('CAMPANHA_ZIP_IMPORTADO', `Safra ID: ${targetBatchId} - ${savedLeadsCount} leads processados em lotes`, req);

    updateCampaignImportProgress(jobId, {
      stage: 'completed',
      percent: 100,
      savedLeads: savedLeadsCount,
      completedAt: Date.now(),
      statusText: `Importação concluída com sucesso! ${savedLeadsCount.toLocaleString('pt-BR')} leads salvos no PostgreSQL.`
    }, {
      text: `🎉 Sucesso absoluto! ${validMobiles.toLocaleString('pt-BR')} celulares válidos prontos para disparo. Disco temporário limpo.`,
      type: 'success'
    });

    return res.json({
      success: true,
      jobId,
      batchId: targetBatchId,
      totalProcessed: savedLeadsCount,
      validMobiles,
      landlines,
      withNyrohUrl,
      withWebsite
    });
  } catch (err: any) {
    console.error('Erro ao importar ZIP de campanha:', err);
    updateCampaignImportProgress(jobId, {
      stage: 'error',
      percent: 100,
      error: err.message || 'Erro interno ao processar o arquivo ZIP.'
    }, {
      text: `Erro fatal: ${err.message}`,
      type: 'error'
    });
    res.status(500).json({ error: `Erro ao importar ZIP: ${err.message}` });
  } finally {
    // Faxina garantida: remove arquivo temporário do disco da Railway para não acumular espaço
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      await fs.promises.unlink(tempFilePath).catch(() => {});
      console.log(`🧹 [CleanUp Railway] Arquivo temporário de ZIP removido: ${tempFilePath}`);
    }
  }
});

// 4. Get campaign leads with filters
app.get('/api/campaign/leads', async (req, res) => {
  const { batchId, status, search, limit } = req.query as any;

  try {
    // Recupera automaticamente quaisquer leads fixos que tenham sido marcados incorretamente como descartados
    for (const lead of memoryCampaignLeadsMap.values()) {
      if (lead.status === 'DESCARTADO' && (lead.responsePreview?.includes('Telefone fixo') || (lead.phoneNumber && lead.phoneNumber.replace(/\D/g, '').length >= 8))) {
        lead.status = 'STAGING';
        lead.responsePreview = undefined;
      }
    }

    if (usePostgres && pgPool) {
      await pgPool.query(`
        UPDATE campaign_leads
        SET status = 'STAGING', response_preview = NULL
        WHERE status = 'DESCARTADO' AND response_preview LIKE '%Telefone fixo%'
      `).catch(() => {});

      let query = `
        SELECT 
          id,
          batch_id AS "batchId",
          name,
          phone_number AS "phoneNumber",
          is_mobile AS "isMobile",
          public_url AS "publicUrl",
          website,
          niche,
          status,
          quarantine_expires_at AS "quarantineExpiresAt",
          sent_at AS "sentAt",
          responded_at AS "respondedAt",
          response_preview AS "responsePreview",
          assigned_salesperson_id AS "assignedSalespersonId",
          assigned_salesperson_name AS "assignedSalespersonName",
          created_at AS "createdAt"
        FROM campaign_leads
        WHERE 1=1
      `;
      const params: any[] = [];

      if (batchId) {
        params.push(batchId);
        query += ` AND batch_id = $${params.length}`;
      }
      if (status && status !== 'ALL') {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }
      if (search && typeof search === 'string' && search.trim()) {
        params.push(`%${search.trim().toLowerCase()}%`);
        query += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(phone_number) LIKE $${params.length} OR LOWER(COALESCE(niche, '')) LIKE $${params.length})`;
      }

      if (limit && (limit === 'ALL' || limit === 'all')) {
        query += ` ORDER BY created_at DESC LIMIT 50000`;
      } else if (limit && Number(limit) > 0) {
        params.push(Number(limit));
        query += ` ORDER BY created_at DESC LIMIT $${params.length}`;
      } else if (batchId) {
        // Quando uma safra é selecionada, carrega todos os seus leads para contagem e disparo sem travar em 500
        query += ` ORDER BY created_at DESC LIMIT 50000`;
      } else {
        query += ` ORDER BY created_at DESC LIMIT 1000`;
      }

      const result = await pgPool.query(query, params);
      return res.json(result.rows);
    } else {
      let list = Array.from(memoryCampaignLeadsMap.values());
      if (batchId) {
        list = list.filter(l => l.batchId === batchId);
      }
      if (status && status !== 'ALL') {
        list = list.filter(l => l.status === status);
      }
      if (search && typeof search === 'string' && search.trim()) {
        const s = search.trim().toLowerCase();
        list = list.filter(l => 
          l.name.toLowerCase().includes(s) || 
          l.phoneNumber.includes(s) || 
          (l.niche && l.niche.toLowerCase().includes(s))
        );
      }
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (limit && limit !== 'ALL' && limit !== 'all' && Number(limit) > 0) {
        list = list.slice(0, Number(limit));
      }
      return res.json(list);
    }
  } catch (err: any) {
    console.error('Erro ao buscar leads de campanha:', err);
    res.status(500).json({ error: 'Erro ao buscar leads de campanha.' });
  }
});

// 4.5. Campaign Copy Templates (Message Copies & Content Variables Library)
app.get('/api/campaign/copies', async (req: any, res) => {
  try {
    if (usePostgres && pgPool) {
      try {
        // Garantir que a tabela existe
        await pgPool.query(`
          CREATE TABLE IF NOT EXISTS campaign_copy_templates (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            category VARCHAR(50) DEFAULT 'prospeccao',
            var1 TEXT NOT NULL,
            var2 TEXT NOT NULL,
            var3 TEXT NOT NULL,
            is_default BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);

        const result = await pgPool.query(`
          SELECT id, name, description, category, var1, var2, var3, 
                 created_at AS "createdAt", updated_at AS "updatedAt", is_default AS "isDefault"
          FROM campaign_copy_templates
          ORDER BY is_default DESC, created_at DESC
        `);

        if (result.rows.length > 0) {
          // Sincronizar com o mapa em memória
          for (const row of result.rows) {
            memoryCampaignCopyTemplatesMap.set(row.id, {
              id: row.id,
              name: row.name,
              description: row.description,
              category: row.category,
              var1: row.var1,
              var2: row.var2,
              var3: row.var3,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
              isDefault: row.isDefault
            });
          }
          return res.json(result.rows);
        } else {
          // Se a tabela estiver vazia, semear com os padrões e retornar
          for (const defTpl of Array.from(memoryCampaignCopyTemplatesMap.values())) {
            await pgPool.query(
              `INSERT INTO campaign_copy_templates (id, name, description, category, var1, var2, var3, is_default)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (id) DO NOTHING`,
              [defTpl.id, defTpl.name, defTpl.description, defTpl.category, defTpl.var1, defTpl.var2, defTpl.var3, defTpl.isDefault]
            );
          }
          const seeded = await pgPool.query(`
            SELECT id, name, description, category, var1, var2, var3, 
                   created_at AS "createdAt", updated_at AS "updatedAt", is_default AS "isDefault"
            FROM campaign_copy_templates
            ORDER BY is_default DESC, created_at DESC
          `);
          if (seeded.rows.length > 0) {
            return res.json(seeded.rows);
          }
        }
      } catch (tableErr: any) {
        console.warn('[PostgreSQL] Erro ao buscar campaign_copy_templates:', tableErr.message);
      }
    }
    const list = Array.from(memoryCampaignCopyTemplatesMap.values());
    return res.json(list);
  } catch (err: any) {
    console.error('Erro ao buscar templates de copy:', err);
    res.status(500).json({ error: 'Erro ao listar templates de copy.' });
  }
});

app.post('/api/campaign/copies', async (req: any, res) => {
  const { name, description, category = 'prospeccao', var1, var2, var3 } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Nome da copy de mensagem é obrigatório.' });
  }

  const id = `tpl_copy_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newTemplate: StoredCampaignCopyTemplate = {
    id,
    name: name.trim(),
    description: description ? description.trim() : '',
    category: category || 'prospeccao',
    var1: var1 || '',
    var2: var2 || '',
    var3: var3 || '',
    createdAt: now,
    isDefault: false
  };

  try {
    if (usePostgres && pgPool) {
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS campaign_copy_templates (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          category VARCHAR(50) DEFAULT 'prospeccao',
          var1 TEXT NOT NULL,
          var2 TEXT NOT NULL,
          var3 TEXT NOT NULL,
          is_default BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await pgPool.query(
        `INSERT INTO campaign_copy_templates (id, name, description, category, var1, var2, var3, created_at, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
         ON CONFLICT (id) DO UPDATE 
         SET name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,
             var1 = EXCLUDED.var1, var2 = EXCLUDED.var2, var3 = EXCLUDED.var3, updated_at = CURRENT_TIMESTAMP`,
        [id, newTemplate.name, newTemplate.description, newTemplate.category, newTemplate.var1, newTemplate.var2, newTemplate.var3, now]
      );
      console.log(`[Campaign Copies] Template "${newTemplate.name}" salvo no PostgreSQL com id ${id}`);
    }

    memoryCampaignCopyTemplatesMap.set(id, newTemplate);
    await logAudit('COPY_TEMPLATE_CRIADO', `Criado template de copy "${newTemplate.name}"`, req);

    return res.status(201).json(newTemplate);
  } catch (err: any) {
    console.error('Erro ao salvar template de copy:', err);
    res.status(500).json({ error: 'Erro ao salvar template de copy no banco: ' + err.message });
  }
});

app.put('/api/campaign/copies/:id', async (req: any, res) => {
  const { id } = req.params;
  const { name, description, category, var1, var2, var3 } = req.body;

  try {
    let existing = memoryCampaignCopyTemplatesMap.get(id);

    if (usePostgres && pgPool) {
      try {
        const checkRes = await pgPool.query(`SELECT * FROM campaign_copy_templates WHERE id = $1`, [id]);
        if (checkRes.rows.length > 0) {
          const row = checkRes.rows[0];
          existing = {
            id: row.id,
            name: row.name,
            description: row.description,
            category: row.category,
            var1: row.var1,
            var2: row.var2,
            var3: row.var3,
            createdAt: row.created_at,
            isDefault: row.is_default
          };
        }
      } catch (err) {}
    }

    if (!existing) {
      return res.status(404).json({ error: 'Template de copy não encontrado.' });
    }

    const updated: StoredCampaignCopyTemplate = {
      ...existing,
      name: name ? name.trim() : existing.name,
      description: description !== undefined ? description : existing.description,
      category: category || existing.category,
      var1: var1 !== undefined ? var1 : existing.var1,
      var2: var2 !== undefined ? var2 : existing.var2,
      var3: var3 !== undefined ? var3 : existing.var3,
      updatedAt: new Date().toISOString()
    };

    memoryCampaignCopyTemplatesMap.set(id, updated);

    if (usePostgres && pgPool) {
      await pgPool.query(
        `UPDATE campaign_copy_templates
         SET name = $1, description = $2, category = $3, var1 = $4, var2 = $5, var3 = $6, updated_at = CURRENT_TIMESTAMP
         WHERE id = $7`,
        [updated.name, updated.description, updated.category, updated.var1, updated.var2, updated.var3, id]
      );
    }

    await logAudit('COPY_TEMPLATE_ATUALIZADO', `Atualizado template de copy "${updated.name}"`, req);
    return res.json(updated);
  } catch (err: any) {
    console.error('Erro ao atualizar template de copy:', err);
    res.status(500).json({ error: 'Erro ao atualizar template de copy.' });
  }
});

app.delete('/api/campaign/copies/:id', async (req: any, res) => {
  const { id } = req.params;
  try {
    let existing = memoryCampaignCopyTemplatesMap.get(id);

    if (usePostgres && pgPool) {
      try {
        const checkRes = await pgPool.query(`SELECT * FROM campaign_copy_templates WHERE id = $1`, [id]);
        if (checkRes.rows.length > 0) {
          existing = {
            id: checkRes.rows[0].id,
            name: checkRes.rows[0].name,
            isDefault: checkRes.rows[0].is_default
          } as any;
        }
      } catch (err) {}
    }

    if (!existing) {
      return res.status(404).json({ error: 'Template de copy não encontrado.' });
    }

    if (existing.isDefault) {
      return res.status(400).json({ error: 'Templates padrão do sistema não podem ser excluídos.' });
    }

    memoryCampaignCopyTemplatesMap.delete(id);

    if (usePostgres && pgPool) {
      await pgPool.query(`DELETE FROM campaign_copy_templates WHERE id = $1`, [id]);
    }

    await logAudit('COPY_TEMPLATE_EXCLUIDO', `Excluído template de copy "${existing.name}"`, req);
    return res.json({ success: true, message: 'Template de copy removido com sucesso.' });
  } catch (err: any) {
    console.error('Erro ao excluir template de copy:', err);
    res.status(500).json({ error: 'Erro ao excluir template de copy.' });
  }
});

// 5. Trigger Campaign Dispatch (Meta Template Blast - Alta Velocidade / Throughput Oficial Meta)
app.post('/api/campaign/dispatch', async (req: any, res) => {
  const {
    batchId,
    templateName = 'dns_escassez_np4',
    quarantineHours = 4,
    variableValues,
    customBodyText,
    speedMode = 'turbo',
    limit,
    leadIds,
    salespersonId,
    salespersonIds,
    dryRun = false
  } = req.body;

  if (!batchId) {
    return res.status(400).json({ error: 'ID da safra é obrigatório para disparo.' });
  }

  // Resolver lista de vendedores para distribuição (round-robin)
  let rawSellerIds: string[] = [];
  if (Array.isArray(salespersonIds) && salespersonIds.length > 0) {
    rawSellerIds = salespersonIds.filter(Boolean);
  } else if (salespersonId) {
    rawSellerIds = [salespersonId];
  }
  if (rawSellerIds.length === 0) {
    rawSellerIds = ['seller-thomas'];
  }

  // Carregar dados dos vendedores para obter nomes reais
  const sellerMap = new Map<string, { id: string; name: string }>();
  if (usePostgres && pgPool) {
    try {
      const spRes = await pgPool.query('SELECT id, name FROM salespeople WHERE id = ANY($1::text[])', [rawSellerIds]);
      for (const row of spRes.rows) {
        sellerMap.set(row.id, { id: row.id, name: row.name });
      }
    } catch (spErr: any) {
      console.warn('[Dispatch] Erro ao carregar salespeople do banco:', spErr.message);
    }
  } else {
    for (const sid of rawSellerIds) {
      const sp = memorySalespeopleMap.get(sid);
      if (sp) sellerMap.set(sid, { id: sp.id, name: sp.name });
    }
  }

  // Lista normalizada de vendedores disponíveis
  const activeSellers = rawSellerIds.map(sid => {
    const s = sellerMap.get(sid);
    return {
      id: sid,
      name: s?.name || (sid === 'seller-thomas' ? 'Thomas Gabriel' : 'Thomas')
    };
  });

  const hours = Number(quarantineHours) > 0 ? Number(quarantineHours) : 4;
  const now = new Date();
  const quarantineEnds = new Date(now.getTime() + hours * 3600 * 1000).toISOString();
  const sentAt = now.toISOString();
  let numLimit: number | undefined = undefined;
  if (limit === 'ALL' || req.body.allowAll === true) {
    numLimit = undefined;
  } else if (limit && Number(limit) > 0) {
    numLimit = Number(limit);
  } else if (!Array.isArray(leadIds) || leadIds.length === 0) {
    // Salvaguarda: se nenhum limite ou IDs específicos foram passados, padrão seguro de 100 leads
    numLimit = 100;
  }

  // Credenciais FluxoAPI / Meta Cloud API
  const apiKey = (memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
  const apiSecret = (memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();
  const instanceId = memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '';
  const targetPath = fluxoInstancePath('/messages/template', instanceId);

  try {
    let dispatchedLeads: any[] = [];

    if (usePostgres && pgPool) {
      // Antes de disparar, tira do pipeline quem já foi contatado (outra safra ou CRM)
      await cortarJaContatados();

      if (Array.isArray(leadIds) && leadIds.length > 0) {
        const updateRes = await pgPool.query(
          `UPDATE campaign_leads
           SET status = 'QUARENTENA',
               sent_at = CURRENT_TIMESTAMP,
               quarantine_expires_at = $1
           WHERE batch_id = $2 AND id = ANY($3::text[])
           RETURNING id, name, phone_number AS "phoneNumber", is_mobile AS "isMobile", public_url AS "publicUrl", website, niche`,
          [quarantineEnds, batchId, leadIds]
        );
        dispatchedLeads = updateRes.rows || [];
      } else if (numLimit) {
        const updateRes = await pgPool.query(
          `UPDATE campaign_leads
           SET status = 'QUARENTENA',
               sent_at = CURRENT_TIMESTAMP,
               quarantine_expires_at = $1
           WHERE id IN (
             SELECT id FROM campaign_leads
             WHERE batch_id = $2 AND status = 'STAGING' AND is_mobile = TRUE
               AND NOT EXISTS (
                 SELECT 1 FROM campaign_leads cl2
                 WHERE cl2.id <> campaign_leads.id
                   AND cl2.status NOT IN ('STAGING', 'DESCARTADO')
                   AND regexp_replace(cl2.phone_number, '[^0-9]', '', 'g') = regexp_replace(campaign_leads.phone_number, '[^0-9]', '', 'g')
               )
             ORDER BY created_at ASC
             LIMIT $3
           )
           RETURNING id, name, phone_number AS "phoneNumber", is_mobile AS "isMobile", public_url AS "publicUrl", website, niche`,
          [quarantineEnds, batchId, numLimit]
        );
        dispatchedLeads = updateRes.rows || [];
      } else {
        // Disparo explícito de TODOS os celulares válidos em STAGING
        const updateRes = await pgPool.query(
          `UPDATE campaign_leads
           SET status = 'QUARENTENA',
               sent_at = CURRENT_TIMESTAMP,
               quarantine_expires_at = $1
           WHERE id IN (
             SELECT id FROM campaign_leads
             WHERE batch_id = $2 AND status = 'STAGING' AND is_mobile = TRUE
               AND NOT EXISTS (
                 SELECT 1 FROM campaign_leads cl2
                 WHERE cl2.id <> campaign_leads.id
                   AND cl2.status NOT IN ('STAGING', 'DESCARTADO')
                   AND regexp_replace(cl2.phone_number, '[^0-9]', '', 'g') = regexp_replace(campaign_leads.phone_number, '[^0-9]', '', 'g')
               )
             ORDER BY created_at ASC
           )
           RETURNING id, name, phone_number AS "phoneNumber", is_mobile AS "isMobile", public_url AS "publicUrl", website, niche`,
          [quarantineEnds, batchId]
        );
        dispatchedLeads = updateRes.rows || [];
      }

      const dispatchedCount = dispatchedLeads.length;

      // Update batch stats
      await pgPool.query(
        `UPDATE campaign_batches
         SET status = 'quarantine',
             template_name = COALESCE($1, template_name),
             quarantine_hours = $2,
             quarantine_started_at = CURRENT_TIMESTAMP,
             quarantine_ends_at = $3,
             dispatched_count = dispatched_count + $4,
             copy_var1 = $6,
             copy_var2 = $7,
             copy_var3 = $8
         WHERE id = $5`,
        [templateName, hours, quarantineEnds, dispatchedCount, batchId, variableValues?.var1 || '', variableValues?.var2 || '', variableValues?.var3 || '']
      );

      // Disparo REAL via esteira BullMQ + Redis com velocidade configurável
      // Velocidade SEMPRE dentro do que o plano da FluxoAPI aguenta (limite por MINUTO — §A10)
      const requestedSpeed = effectiveSpeedPerSecond(Number(req.body.speedPerSecond) || getCampaignSpeed());
      const dispatchJobs: any[] = [];

      for (let i = 0; i < dispatchedLeads.length; i++) {
        const dLead = dispatchedLeads[i];
        const assignedSeller = activeSellers[i % activeSellers.length];
        const sellerName = assignedSeller.name;
        const sellerId = assignedSeller.id;

        // Atualizar vendedor atribuído no campaign_leads
        await pgPool.query(
          `UPDATE campaign_leads
           SET assigned_salesperson_id = $1, assigned_salesperson_name = $2
           WHERE id = $3`,
          [sellerId, sellerName, dLead.id]
        ).catch(() => {});

        // Resolver variáveis da copy dinamicamente para este lead e vendedor
        const firstName = (dLead.name || 'Cliente').trim().split(' ')[0] || 'Cliente';
        const company = (dLead.name && dLead.name !== 'Cliente' ? dLead.name : 'sua empresa').trim();
        const nyrohUrl = dLead.publicUrl || 'https://nyroh.app/preview';

        const rawVar1 = variableValues?.var1 || '{nome}! Bom diaaa! Ótima semana 😄 Falo com o responsável pela {empresa}?';
        const rawVar2 = variableValues?.var2 || 'Eu sou {vendedor} e queria te fazer uma pergunta: você ficaria chateado se eu tivesse criado um site para a {empresa} sem pedir? 😂';
        const rawVar3 = variableValues?.var3 || 'Desenvolvi uma prévia exclusiva para vocês: 🔗 {site_novo}';

        const leadVar1 = rawVar1
          .replace(/\{nome\}/gi, firstName)
          .replace(/\{empresa\}/gi, company)
          .replace(/\{vendedor\}/gi, sellerName)
          .replace(/\{site_novo\}/gi, nyrohUrl);

        const leadVar2 = rawVar2
          .replace(/\{nome\}/gi, firstName)
          .replace(/\{empresa\}/gi, company)
          .replace(/\{vendedor\}/gi, sellerName)
          .replace(/\{site_novo\}/gi, nyrohUrl);

        const leadVar3 = rawVar3
          .replace(/\{nome\}/gi, firstName)
          .replace(/\{empresa\}/gi, company)
          .replace(/\{vendedor\}/gi, sellerName)
          .replace(/\{site_novo\}/gi, nyrohUrl);

        // Sem corte por tamanho: os limites de 100/160/120 caracteres cortavam o valor no meio
        // e o link do site do cliente chegava quebrado (a variável {{2}} costuma ser a URL).
        // A Meta só exige que a variável não tenha quebra de linha nem espaços repetidos.
        const sanitizedVariables: Record<string, string> = {
          '1': sanitizeTemplateVariable(leadVar1),
          '2': sanitizeTemplateVariable(leadVar2),
          '3': sanitizeTemplateVariable(leadVar3)
        };

        const cleanDigits = String(dLead.phoneNumber || '').replace(/\D/g, '');
        let formattedE164 = '';
        if (cleanDigits.length >= 10) {
          formattedE164 = cleanDigits.startsWith('55') ? `+${cleanDigits}` : `+55${cleanDigits}`;
        }

        dispatchJobs.push({
          campaignId: batchId,
          batchId,
          leadId: dLead.id,
          phone: formattedE164 || dLead.phoneNumber || '',
          leadName: dLead.name,
          templateName: templateName || 'dns_escassez_np4',
          templateLanguage: 'pt_BR',
          variables: sanitizedVariables,
          salespersonId: sellerId,
          salespersonName: sellerName,
          publicUrl: nyrohUrl,
          speedPerSecond: requestedSpeed,
          dryRun: Boolean(dryRun),
          // Modelos com botão de URL variável / cupom / mídia de cabeçalho exigem esses valores (§A4)
          buttonValues: req.body.buttonValues && typeof req.body.buttonValues === 'object' ? req.body.buttonValues : undefined,
          headerMediaUrl: typeof req.body.headerMediaUrl === 'string' ? req.body.headerMediaUrl : undefined,
          dispatchedAt: Date.now()
        });

        // Sincronizar lead com o CRM para aparecer no Kanban e no WhatsApp do vendedor atribuído
        try {
          await pgPool.query(
            `INSERT INTO leads (
              id, name, phone_number, public_url, website, niche, column_status, sub_status,
              salesperson_id, salesperson_name, last_call_tag, call_count, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 'Leads', 'Disparo WhatsApp Realizado (Aguardando Resposta)', $7, $8, 'WhatsApp Enviado', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
              sub_status = 'Disparo WhatsApp Realizado (Aguardando Resposta)',
              salesperson_id = EXCLUDED.salesperson_id,
              salesperson_name = EXCLUDED.salesperson_name,
              last_call_tag = 'WhatsApp Enviado',
              updated_at = CURRENT_TIMESTAMP`,
            [dLead.id, dLead.name || 'Cliente', formattedE164 || dLead.phoneNumber || '', dLead.publicUrl || null, dLead.website || null, dLead.niche || null, sellerId, sellerName]
          );
        } catch (dbErr: any) {
          console.warn('[Postgres Sync Lead Warning]:', dbErr.message);
        }
      }

      initBatchProgress(batchId, dispatchJobs.length, requestedSpeed);
      const queueInfo = await enqueueCampaignDispatchBatch(dispatchJobs, requestedSpeed);

      await logAudit(
        'CAMPANHA_DISPARO_ENFILEIRADO',
        `Disparo enfileirado na esteira BullMQ: ${dispatchJobs.length} leads da safra ${batchId} a ${queueInfo.speed} msgs/s com template ${templateName}`,
        req
      );

      broadcastSSE('DISPATCH_QUEUED', {
        batchId,
        dispatchedCount,
        speed: queueInfo.speed,
        estimatedSeconds: queueInfo.estimatedSeconds,
        templateName,
        quarantineEndsAt: quarantineEnds
      });
      broadcastSSE('LEAD_UPDATED', { batchId, count: dispatchedCount });

      return res.json({
        success: true,
        queued: true,
        dispatchedCount,
        enqueuedCount: dispatchJobs.length,
        speedPerSecond: queueInfo.speed,
        estimatedDurationSeconds: queueInfo.estimatedSeconds,
        templateName,
        quarantineHours: hours,
        quarantineEndsAt: quarantineEnds,
        sellersUsed: activeSellers.map(s => s.name),
        batchId,
        speedPerMinute: Math.round(queueInfo.speed * 60),
        // o corte ao teto do plano acontece ANTES de a fila ver o número, então compara com o que o usuário pediu
        cappedByPlan: queueInfo.cappedByPlan || (Number(req.body.speedPerSecond) > queueInfo.speed + 1e-9),
        planRpm: planRpm(),
        message: `🚀 ${dispatchJobs.length} leads enfileirados à velocidade de ${Math.round(queueInfo.speed * 60)} msgs/min${queueInfo.cappedByPlan ? ` (reduzida ao teto do seu plano FluxoAPI: ${dispatchRpm()}/min)` : ''}. Duração estimada: ~${Math.ceil(queueInfo.estimatedSeconds / 60)} min.`
      });
    } else {
      // Memory Branch
      let dispatchedCount = 0;
      const dispatchedLeads: StoredCampaignLead[] = [];

      let leadsToProcess = Array.from(memoryCampaignLeadsMap.values())
        .filter(l => l.batchId === batchId && l.status === 'STAGING');

      if (Array.isArray(leadIds) && leadIds.length > 0) {
        leadsToProcess = leadsToProcess.filter(l => leadIds.includes(l.id));
      } else if (numLimit) {
        leadsToProcess = leadsToProcess.slice(0, numLimit);
      }

      // Velocidade SEMPRE dentro do que o plano da FluxoAPI aguenta (limite por MINUTO — §A10)
      const requestedSpeed = effectiveSpeedPerSecond(Number(req.body.speedPerSecond) || getCampaignSpeed());
      const dispatchJobs: any[] = [];

      for (let i = 0; i < leadsToProcess.length; i++) {
        const lead = leadsToProcess[i];
        const assignedSeller = activeSellers[i % activeSellers.length];
        const sellerName = assignedSeller.name;
        const sellerId = assignedSeller.id;

        lead.status = 'QUARENTENA';
        lead.sentAt = sentAt;
        lead.quarantineExpiresAt = quarantineEnds;
        lead.assignedSalespersonId = sellerId;
        lead.assignedSalespersonName = sellerName;
        dispatchedCount++;
        dispatchedLeads.push(lead);

        const firstName = (lead.name || 'Cliente').trim().split(' ')[0] || 'Cliente';
        const company = (lead.name && lead.name !== 'Cliente' ? lead.name : 'sua empresa').trim();
        const nyrohUrl = lead.publicUrl || 'https://nyroh.app/preview';

        const rawVar1 = variableValues?.var1 || '{nome}! Bom diaaa! Ótima semana 😄 Falo com o responsável pela {empresa}?';
        const rawVar2 = variableValues?.var2 || 'Eu sou {vendedor} e queria te fazer uma pergunta: você ficaria chateado se eu tivesse criado um site para a {empresa} sem pedir? 😂';
        const rawVar3 = variableValues?.var3 || 'Desenvolvi uma prévia exclusiva para vocês: 🔗 {site_novo}';

        const leadVar1 = rawVar1
          .replace(/\{nome\}/gi, firstName)
          .replace(/\{empresa\}/gi, company)
          .replace(/\{vendedor\}/gi, sellerName)
          .replace(/\{site_novo\}/gi, nyrohUrl);

        const leadVar2 = rawVar2
          .replace(/\{nome\}/gi, firstName)
          .replace(/\{empresa\}/gi, company)
          .replace(/\{vendedor\}/gi, sellerName)
          .replace(/\{site_novo\}/gi, nyrohUrl);

        const leadVar3 = rawVar3
          .replace(/\{nome\}/gi, firstName)
          .replace(/\{empresa\}/gi, company)
          .replace(/\{vendedor\}/gi, sellerName)
          .replace(/\{site_novo\}/gi, nyrohUrl);

        // Sem corte por tamanho: os limites de 100/160/120 caracteres cortavam o valor no meio
        // e o link do site do cliente chegava quebrado (a variável {{2}} costuma ser a URL).
        // A Meta só exige que a variável não tenha quebra de linha nem espaços repetidos.
        const sanitizedVariables: Record<string, string> = {
          '1': sanitizeTemplateVariable(leadVar1),
          '2': sanitizeTemplateVariable(leadVar2),
          '3': sanitizeTemplateVariable(leadVar3)
        };

        const cleanDigits = String(lead.phoneNumber || '').replace(/\D/g, '');
        let formattedE164 = '';
        if (cleanDigits.length >= 10) {
          formattedE164 = cleanDigits.startsWith('55') ? `+${cleanDigits}` : `+55${cleanDigits}`;
        }

        dispatchJobs.push({
          campaignId: batchId,
          batchId,
          leadId: lead.id,
          phone: formattedE164 || lead.phoneNumber || '',
          leadName: lead.name,
          templateName: templateName || 'dns_escassez_np4',
          templateLanguage: 'pt_BR',
          variables: sanitizedVariables,
          salespersonId: sellerId,
          salespersonName: sellerName,
          publicUrl: nyrohUrl,
          speedPerSecond: requestedSpeed,
          dryRun: Boolean(dryRun),
          // Modelos com botão de URL variável / cupom / mídia de cabeçalho exigem esses valores (§A4)
          buttonValues: req.body.buttonValues && typeof req.body.buttonValues === 'object' ? req.body.buttonValues : undefined,
          headerMediaUrl: typeof req.body.headerMediaUrl === 'string' ? req.body.headerMediaUrl : undefined,
          dispatchedAt: Date.now()
        });

        // Sync into memory CRM leads
        const existingCRMLead = memoryLeadsMap.get(lead.id);
        if (existingCRMLead) {
          existingCRMLead.subStatus = 'Disparo WhatsApp Realizado (Aguardando Resposta)';
          existingCRMLead.salespersonId = sellerId;
          existingCRMLead.salespersonName = sellerName;
          existingCRMLead.lastCallTag = 'WhatsApp Enviado';
          existingCRMLead.updatedAt = sentAt;
        } else {
          memoryLeadsMap.set(lead.id, {
            id: lead.id,
            name: lead.name || 'Cliente',
            phoneNumber: formattedE164 || lead.phoneNumber || '',
            publicUrl: lead.publicUrl,
            website: lead.website,
            niche: lead.niche,
            columnStatus: 'Leads',
            subStatus: 'Disparo WhatsApp Realizado (Aguardando Resposta)',
            salespersonId: sellerId,
            salespersonName: sellerName,
            lastCallTag: 'WhatsApp Enviado',
            callCount: 1,
            createdAt: sentAt,
            updatedAt: sentAt
          });
        }
      }

      const batch = memoryCampaignBatchesMap.get(batchId);
      if (batch) {
        batch.status = 'quarantine';
        if (templateName) batch.templateName = templateName;
        batch.quarantineHours = hours;
        batch.quarantineStartedAt = sentAt;
        batch.quarantineEndsAt = quarantineEnds;
        batch.dispatchedCount = (batch.dispatchedCount || 0) + dispatchedCount;
      }

      initBatchProgress(batchId, dispatchJobs.length, requestedSpeed);
      const queueInfo = await enqueueCampaignDispatchBatch(dispatchJobs, requestedSpeed);

      await logAudit(
        'CAMPANHA_DISPARO_ENFILEIRADO',
        `Disparo enfileirado na esteira BullMQ (memória): ${dispatchJobs.length} leads da safra ${batchId} a ${queueInfo.speed} msgs/s com template ${templateName}`,
        req
      );

      broadcastSSE('DISPATCH_QUEUED', {
        batchId,
        dispatchedCount,
        speed: queueInfo.speed,
        estimatedSeconds: queueInfo.estimatedSeconds,
        templateName,
        quarantineEndsAt: quarantineEnds
      });
      broadcastSSE('LEAD_UPDATED', { batchId, count: dispatchedCount });

      return res.json({
        success: true,
        queued: true,
        dispatchedCount,
        enqueuedCount: dispatchJobs.length,
        speedPerSecond: queueInfo.speed,
        estimatedDurationSeconds: queueInfo.estimatedSeconds,
        templateName,
        quarantineHours: hours,
        quarantineEndsAt: quarantineEnds,
        sellersUsed: activeSellers.map(s => s.name),
        batchId,
        speedPerMinute: Math.round(queueInfo.speed * 60),
        // o corte ao teto do plano acontece ANTES de a fila ver o número, então compara com o que o usuário pediu
        cappedByPlan: queueInfo.cappedByPlan || (Number(req.body.speedPerSecond) > queueInfo.speed + 1e-9),
        planRpm: planRpm(),
        message: `🚀 ${dispatchJobs.length} leads enfileirados à velocidade de ${Math.round(queueInfo.speed * 60)} msgs/min${queueInfo.cappedByPlan ? ` (reduzida ao teto do seu plano FluxoAPI: ${dispatchRpm()}/min)` : ''}. Duração estimada: ~${Math.ceil(queueInfo.estimatedSeconds / 60)} min.`
      });
    }
  } catch (err: any) {
    console.error('Erro ao disparar campanha:', err);
    res.status(500).json({ error: `Erro ao executar disparo: ${err.message}` });
  }
});

// Endpoint para consultar e atualizar a velocidade de disparo da esteira BullMQ/Redis
// A velocidade é limitada pelo plano da FluxoAPI, que mede por MINUTO e conta TODA requisição da credencial
// (§A10: Starter 60/min, Pro 300, Escala 1.200, Enterprise 6.000 — env FLUXO_PLAN_RPM). O disparo usa só uma
// fração (FLUXO_DISPATCH_SHARE, padrão 80%) para sobrar fôlego para o atendimento manual.
app.get('/api/campaign/dispatch/speed', (req, res) => {
  const maxPerSec = maxDispatchPerSecond();
  const preset = (label: string, fraction: number, extra: string) => {
    const speed = Math.max(1 / 60, maxPerSec * fraction);
    return { label, speed, perMinute: Math.round(speed * 60), description: `${Math.round(speed * 60)} msgs/min - ${extra}` };
  };
  res.json({
    currentSpeed: getCampaignSpeed(),
    currentPerMinute: Math.round(getCampaignSpeed() * 60),
    maxSpeed: maxPerSec,
    maxPerMinute: dispatchRpm(),
    planRpm: planRpm(),
    presets: [
      preset('Seguro / Aquecimento', 0.25, 'Recomendado para números recentes'),
      preset('Equilibrado', 0.5, 'Ritmo comercial seguro'),
      preset('Máximo do plano', 1, 'Teto do seu plano FluxoAPI (reserva fôlego p/ o atendimento)')
    ]
  });
});

app.post('/api/campaign/dispatch/speed', (req, res) => {
  const { speed } = req.body;
  const requested = Number(speed);
  const newSpeed = setCampaignSpeed(requested);
  const cappedByPlan = Number.isFinite(requested) && requested > newSpeed + 1e-9;
  broadcastSocketEvent('campaign_speed_changed', { speed: newSpeed });
  broadcastSSE('CAMPAIGN_SPEED_CHANGED', { speed: newSpeed });
  res.json({ success: true, speed: newSpeed, perMinute: Math.round(newSpeed * 60), cappedByPlan, planRpm: planRpm() });
});

// Endpoint para obter o progresso em tempo real de um lote em execução
app.get('/api/campaign/batches/:batchId/progress', (req, res) => {
  const { batchId } = req.params;
  const progress = getBatchProgress(batchId);
  if (!progress) {
    return res.status(404).json({ error: 'Lote não está na esteira ativa no momento.' });
  }
  res.json(progress);
});

// Pausar execução do lote
app.post('/api/campaign/batches/:batchId/pause', (req, res) => {
  const ok = pauseBatchProgress(req.params.batchId);
  broadcastSocketEvent('campaign_batch_paused', { batchId: req.params.batchId });
  res.json({ success: ok, batchId: req.params.batchId });
});

// Retomar execução do lote
app.post('/api/campaign/batches/:batchId/resume', (req, res) => {
  const ok = resumeBatchProgress(req.params.batchId);
  broadcastSocketEvent('campaign_batch_resumed', { batchId: req.params.batchId });
  res.json({ success: ok, batchId: req.params.batchId });
});

// Cancelar execução do lote
app.post('/api/campaign/batches/:batchId/cancel', (req, res) => {
  const ok = cancelBatchProgress(req.params.batchId);
  broadcastSocketEvent('campaign_batch_cancelled', { batchId: req.params.batchId });
  res.json({ success: ok, batchId: req.params.batchId });
});

// 6. Interactive Simulator Action (Simulate Lead Hot Response, Opt-out, or Quarantine Expiration)
app.post('/api/campaign/simulate-action', async (req: any, res) => {
  const { leadId, action, responseText } = req.body;
  if (!leadId || !action) {
    return res.status(400).json({ error: 'leadId e action são obrigatórios.' });
  }

  const now = new Date().toISOString();

  try {
    let newStatus: string = 'QUARENTENA';
    let preview: string | null = null;

    if (action === 'SET_STATUS' && req.body.status) {
      newStatus = req.body.status;
      preview = responseText || null;
    } else if (action === 'HOT_RESPONSE') {
      newStatus = 'INTERESSADO';
      preview = responseText || 'Olá! Vi o link da página que vocês criaram. Ficou ótimo! Quanto custa pra colocar no ar?';
    } else if (action === 'OPTOUT') {
      newStatus = 'DESCARTADO';
      preview = 'PARAR - Não tenho interesse no momento, por favor não me mande mais mensagens.';
    } else if (action === 'EXPIRE_COLD') {
      newStatus = 'FRIO';
      preview = 'Sem resposta durante o período de quarentena. Liberado para abordagem telefônica da equipe.';
    } else if (action === 'RESET_STAGING') {
      newStatus = 'STAGING';
      preview = null;
    }

    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `UPDATE campaign_leads
         SET status = $1,
             responded_at = CASE WHEN $1 = 'INTERESSADO' THEN CURRENT_TIMESTAMP ELSE responded_at END,
             response_preview = $2
         WHERE id = $3
         RETURNING *`,
        [newStatus, preview, leadId]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Lead de campanha não encontrado.' });
      }
      return res.json({ success: true, lead: result.rows[0] });
    } else {
      const lead = memoryCampaignLeadsMap.get(leadId);
      if (!lead) {
        return res.status(404).json({ error: 'Lead de campanha não encontrado.' });
      }
      lead.status = newStatus as any;
      if (newStatus === 'INTERESSADO') lead.respondedAt = now;
      lead.responsePreview = preview || undefined;
      return res.json({ success: true, lead });
    }
  } catch (err: any) {
    console.error('Erro ao simular ação do lead:', err);
    res.status(500).json({ error: `Erro na simulação: ${err.message}` });
  }
});

// 7. Distribute leads to Salespeople (Transfers leads into active CRM pipeline!)
app.post('/api/campaign/distribute', async (req: any, res) => {
  const { batchId, distributions, sellerQuotas, onlyCold = true, retainHotForAdmin = true, includeQuarantine = true } = req.body;

  // Normalizar distribuição aceitando tanto array de distribuições quanto objeto sellerQuotas
  let normalizedDistributions: { salespersonId: string; salespersonName: string; quota: number }[] = [];

  if (Array.isArray(distributions) && distributions.length > 0) {
    normalizedDistributions = distributions;
  } else if (sellerQuotas && typeof sellerQuotas === 'object') {
    normalizedDistributions = Object.entries(sellerQuotas).map(([sellerId, quota]) => {
      const seller = memorySalespeopleMap.get(sellerId);
      return {
        salespersonId: sellerId,
        salespersonName: seller ? seller.name : (sellerId === 'seller-thomas' ? 'Thomas' : sellerId),
        quota: Number(quota) || 0
      };
    }).filter(d => d.quota > 0);
  }

  if (normalizedDistributions.length === 0) {
    return res.status(400).json({ error: 'Nenhuma cota de vendedor configurada para distribuição.' });
  }

  try {
    let eligibleLeads: any[] = [];

    if (usePostgres && pgPool) {
      // Montar lista de status aceitos
      const statuses: string[] = ['FRIO'];
      if (includeQuarantine) {
        statuses.push('QUARENTENA', 'DISPARADO');
      }
      if (!onlyCold) {
        statuses.push('STAGING');
      }
      if (!retainHotForAdmin) {
        statuses.push('INTERESSADO');
      }

      const statusPlaceholders = statuses.map(s => `'${s}'`).join(', ');

      const leadsRes = await pgPool.query(
        `SELECT id, name, phone_number, public_url, website, niche, status
         FROM campaign_leads
         WHERE batch_id = $1 AND status IN (${statusPlaceholders}) AND is_mobile = TRUE
         ORDER BY 
           CASE WHEN status = 'FRIO' THEN 1 WHEN status = 'QUARENTENA' THEN 2 ELSE 3 END,
           created_at ASC`,
        [batchId]
      );
      eligibleLeads = leadsRes.rows;
    } else {
      eligibleLeads = Array.from(memoryCampaignLeadsMap.values()).filter(l => {
        if (l.batchId !== batchId || !l.isMobile) return false;
        if (l.status === 'FRIO') return true;
        if (includeQuarantine && (l.status === 'QUARENTENA' || l.status === 'DISPARADO')) return true;
        if (!onlyCold && l.status === 'STAGING') return true;
        if (!retainHotForAdmin && l.status === 'INTERESSADO') return true;
        return false;
      });
    }

    if (eligibleLeads.length === 0) {
      return res.status(400).json({ 
        error: 'Nenhum lead qualificado para distribuição nesta safra. Se os leads ainda estiverem em Quarentena, use "Liberar Leads Agora" primeiro.' 
      });
    }

    let distributedTotal = 0;
    let leadIndex = 0;
    const summaryPerSeller: { sellerName: string; count: number }[] = [];

    for (const dist of normalizedDistributions) {
      const { salespersonId, salespersonName, quota } = dist;
      if (!salespersonId || !quota || quota <= 0) continue;

      let countForThisSeller = 0;

      while (countForThisSeller < quota && leadIndex < eligibleLeads.length) {
        const lead = eligibleLeads[leadIndex];
        leadIndex++;
        countForThisSeller++;

        // Inserir / Atualizar na tabela oficial de CRM de Leads com flag para ligação telefônica
        if (usePostgres && pgPool) {
          await pgPool.query(
            `INSERT INTO leads (
              id, name, phone_number, public_url, website, column_status, sub_status,
              salesperson_id, salesperson_name, niche, last_call_tag, call_count, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, 'Leads', 'Distribuído para Ligação Ativa (Campanha)',
              $6, $7, $8, 'Aguardando Ligação', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            ON CONFLICT (id) DO UPDATE SET
              salesperson_id = EXCLUDED.salesperson_id,
              salesperson_name = EXCLUDED.salesperson_name,
              sub_status = 'Distribuído para Ligação Ativa (Campanha)',
              last_call_tag = 'Aguardando Ligação',
              updated_at = CURRENT_TIMESTAMP`,
            [lead.id, lead.name, lead.phone_number || lead.phoneNumber, lead.public_url || lead.publicUrl, lead.website, salespersonId, salespersonName, lead.niche]
          );

          await pgPool.query(
            `UPDATE campaign_leads
             SET assigned_salesperson_id = $1, assigned_salesperson_name = $2, status = 'FRIO'
             WHERE id = $3`,
            [salespersonId, salespersonName, lead.id]
          );
        } else {
          const mainLead: Lead = {
            id: lead.id,
            name: lead.name,
            phoneNumber: lead.phoneNumber || lead.phone_number,
            publicUrl: lead.publicUrl || lead.public_url,
            website: lead.website,
            columnStatus: 'Leads',
            subStatus: 'Distribuído para Ligação Ativa (Campanha)',
            salespersonId,
            salespersonName,
            niche: lead.niche,
            lastCallTag: 'Aguardando Ligação',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            callCount: 0
          };
          memoryLeadsMap.set(lead.id, mainLead);

          const cLead = memoryCampaignLeadsMap.get(lead.id);
          if (cLead) {
            cLead.assignedSalespersonId = salespersonId;
            cLead.assignedSalespersonName = salespersonName;
            cLead.status = 'FRIO';
          }
        }
      }

      if (countForThisSeller > 0) {
        summaryPerSeller.push({ sellerName: salespersonName, count: countForThisSeller });
        distributedTotal += countForThisSeller;
      }
    }

    await logAudit('CAMPANHA_DISTRIBUICAO_EXECUTADA', `Distribuídos ${distributedTotal} leads da safra ${batchId} entre ${summaryPerSeller.length} vendedores`, req);

    return res.json({
      success: true,
      totalDistributed: distributedTotal,
      remaining: eligibleLeads.length - leadIndex,
      summary: summaryPerSeller,
      message: `${distributedTotal} leads distribuídos com sucesso no Pipeline CRM para ligação telefônica!`
    });
  } catch (err: any) {
    console.error('Erro na distribuição de campanha:', err);
    res.status(500).json({ error: `Erro na distribuição: ${err.message}` });
  }
});

// Liberar quarentena antecipadamente (move leads de QUARENTENA para FRIO para ficarem aptos à discagem/distribuição)
app.post('/api/campaign/batches/:batchId/release-quarantine', async (req: any, res) => {
  const { batchId } = req.params;
  try {
    let releasedCount = 0;
    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `UPDATE campaign_leads
         SET status = 'FRIO',
             quarantine_expires_at = CURRENT_TIMESTAMP
         WHERE batch_id = $1 AND status IN ('QUARENTENA', 'DISPARADO')
         RETURNING id`,
        [batchId]
      );
      releasedCount = result.rowCount || 0;

      await pgPool.query(
        `UPDATE campaign_batches
         SET status = 'completed',
             quarantine_ends_at = CURRENT_TIMESTAMP,
             cold_count = cold_count + $1
         WHERE id = $2`,
        [releasedCount, batchId]
      );
    } else {
      for (const lead of memoryCampaignLeadsMap.values()) {
        if (lead.batchId === batchId && (lead.status === 'QUARENTENA' || lead.status === 'DISPARADO')) {
          lead.status = 'FRIO';
          lead.quarantineExpiresAt = new Date().toISOString();
          releasedCount++;
        }
      }
      const batch = memoryCampaignBatchesMap.get(batchId);
      if (batch) {
        batch.status = 'completed';
        batch.quarantineEndsAt = new Date().toISOString();
        batch.coldCount = (batch.coldCount || 0) + releasedCount;
      }
    }

    await logAudit('CAMPANHA_QUARENTENA_LIBERADA', `Liberou ${releasedCount} leads da safra ${batchId} da quarentena`, req);
    broadcastSSE('CAMPAIGN_BATCH_UPDATED', { batchId });

    return res.json({
      success: true,
      releasedCount,
      message: `${releasedCount} leads liberados da quarentena! Agora estão na coluna "Sem Resposta (Frio)" e prontos para distribuição e ligação.`
    });
  } catch (err: any) {
    console.error('Erro ao liberar quarentena:', err);
    return res.status(500).json({ error: `Erro ao liberar quarentena: ${err.message}` });
  }
});

// Salvar configurações de Quarentena no banco de dados
app.post('/api/campaign/batches/:batchId/quarantine-config', async (req: any, res) => {
  const { batchId } = req.params;
  const { quarantineHours, allowedClosers, hotRetainedByAdmin, onReplyAction, onExpireAction } = req.body;
  const hours = Number(quarantineHours) > 0 ? Number(quarantineHours) : 4;

  try {
    if (usePostgres && pgPool) {
      await pgPool.query(
        `UPDATE campaign_batches
         SET quarantine_hours = $1,
             allowed_closers = COALESCE($2, allowed_closers),
             hot_retained_by_admin = COALESCE($3, hot_retained_by_admin)
         WHERE id = $4`,
        [hours, allowedClosers ? JSON.stringify(allowedClosers) : null, typeof hotRetainedByAdmin === 'boolean' ? hotRetainedByAdmin : null, batchId]
      );
    } else {
      const batch = memoryCampaignBatchesMap.get(batchId);
      if (batch) {
        batch.quarantineHours = hours;
        if (allowedClosers) batch.allowedClosers = allowedClosers;
        if (typeof hotRetainedByAdmin === 'boolean') batch.hotLeadsRetainedByAdmin = hotRetainedByAdmin;
      }
    }

    await logAudit('CAMPANHA_QUARENTENA_CONFIGURADA', `Atualizou parâmetros de quarentena da safra ${batchId}`, req);
    return res.json({ success: true, message: `Configurações salvas: Quarentena de ${hours}h gravada com sucesso!` });
  } catch (err: any) {
    console.error('Erro ao salvar configuração de quarentena:', err);
    return res.status(500).json({ error: `Erro ao salvar configuração: ${err.message}` });
  }
});

// Resetar Safra para Staging (Recuperação e recomeço limpo de disparos)
app.post('/api/campaign/batches/:batchId/reset-staging', async (req: any, res) => {
  const { batchId } = req.params;
  try {
    let resetCount = 0;
    if (usePostgres && pgPool) {
      const result = await pgPool.query(
        `UPDATE campaign_leads
         SET status = 'STAGING',
             sent_at = NULL,
             quarantine_expires_at = NULL,
             responded_at = NULL,
             response_preview = NULL
         WHERE batch_id = $1 AND is_mobile = TRUE
         RETURNING id`,
        [batchId]
      );
      resetCount = result.rowCount || 0;

      await pgPool.query(
        `UPDATE campaign_batches
         SET status = 'draft',
             dispatched_count = 0,
             hot_count = 0,
             cold_count = 0,
             quarantine_started_at = NULL,
             quarantine_ends_at = NULL
         WHERE id = $1`,
        [batchId]
      );
    } else {
      for (const lead of memoryCampaignLeadsMap.values()) {
        if (lead.batchId === batchId && lead.isMobile) {
          lead.status = 'STAGING';
          lead.sentAt = undefined;
          lead.quarantineExpiresAt = undefined;
          lead.respondedAt = undefined;
          lead.responsePreview = undefined;
          resetCount++;
        }
      }
      const batch = memoryCampaignBatchesMap.get(batchId);
      if (batch) {
        batch.status = 'draft';
        batch.dispatchedCount = 0;
        batch.hotCount = 0;
        batch.coldCount = 0;
        batch.quarantineStartedAt = undefined;
        batch.quarantineEndsAt = undefined;
      }
    }

    await logAudit('CAMPANHA_SAFRA_RESETADA', `Resetou ${resetCount} leads da safra ${batchId} para STAGING`, req);
    broadcastSSE('CAMPAIGN_BATCH_UPDATED', { batchId });

    return res.json({
      success: true,
      resetCount,
      message: `Safra reiniciada! ${resetCount} leads foram restaurados para "Novos Leads (Staging)" prontos para novo disparo.`
    });
  } catch (err: any) {
    console.error('Erro ao resetar safra:', err);
    return res.status(500).json({ error: `Erro ao resetar safra: ${err.message}` });
  }
});

// Sincronizar Safra com lista real capturada no WhatsApp Web
app.post('/api/campaign/batches/:batchId/sync-whatsapp-web', async (req: any, res) => {
  const { batchId } = req.params;
  const { items, rawText } = req.body;

  let rawList: any[] = [];
  if (Array.isArray(items)) {
    rawList = items;
  } else if (typeof rawText === 'string' && rawText.trim()) {
    try {
      const parsed = JSON.parse(rawText.trim());
      if (Array.isArray(parsed)) rawList = parsed;
      else if (parsed && Array.isArray(parsed.items)) rawList = parsed.items;
      else if (parsed && Array.isArray(parsed.leads)) rawList = parsed.leads;
    } catch {
      // Fallback: linhas de texto
      rawList = rawText.split('\n').map((l: string) => l.trim()).filter(Boolean);
    }
  }

  if (rawList.length === 0) {
    return res.status(400).json({ error: 'Nenhum contato ou JSON fornecido para sincronização.' });
  }

  // Conjunto de nomes ignorados (contatos pessoais/sistema)
  const IGNORE_NAMES = new Set(['thomas', 'whatsapp business', 'facebook business', 'amor ❤️', 'amor', 'desconhecido', '‎desconhecido']);
  
  const parsedPhoneSet = new Set<string>();
  const parsedNameList: string[] = [];

  for (const item of rawList) {
    let nameVal = '';
    if (typeof item === 'string') {
      nameVal = item.trim();
    } else if (item && typeof item === 'object') {
      nameVal = String(item.nome || item.name || item.phone || item.telefone || '').trim();
    }

    if (!nameVal) continue;
    const lowerName = nameVal.toLowerCase();
    if (IGNORE_NAMES.has(lowerName)) continue;

    // Números de telefone
    const digits = nameVal.replace(/\D/g, '');
    if (digits.length >= 8) {
      parsedPhoneSet.add(digits);
      if (digits.length >= 8) parsedPhoneSet.add(digits.slice(-8));
      if (digits.length >= 9) parsedPhoneSet.add(digits.slice(-9));
      if (digits.length >= 10) parsedPhoneSet.add(digits.slice(-10));
      if (digits.length >= 11) parsedPhoneSet.add(digits.slice(-11));
    }

    // Nomes comerciais limpos
    const lettersOnly = nameVal.replace(/[^a-zA-Z0-9\s]/g, '').trim().toLowerCase();
    if (lettersOnly.length >= 3 && !/^\d+$/.test(lettersOnly)) {
      parsedNameList.push(lettersOnly);
    }
  }

  let totalBatchLeads = 0;
  let confirmedDispatched = 0;
  let recycledToStaging = 0;
  let movedToLandlines = 0;
  let alreadyResponded = 0;

  try {
    if (usePostgres && pgPool) {
      const leadsRes = await pgPool.query(
        `SELECT id, name, phone_number, is_mobile, status, notes
         FROM campaign_leads
         WHERE batch_id = $1`,
        [batchId]
      );
      const leads = leadsRes.rows || [];
      totalBatchLeads = leads.length;

      const leadsToStaging: string[] = [];
      const leadsToLandline: string[] = [];
      const leadsToConfirm: string[] = [];

      for (const lead of leads) {
        if (lead.status === 'INTERESSADO') {
          alreadyResponded++;
          continue;
        }

        const leadDigits = (lead.phone_number || '').replace(/\D/g, '');
        const last8 = leadDigits.slice(-8);
        const last9 = leadDigits.slice(-9);

        // Match por telefone
        let isMatched = (
          parsedPhoneSet.has(leadDigits) ||
          (last9.length === 9 && parsedPhoneSet.has(last9)) ||
          (last8.length === 8 && parsedPhoneSet.has(last8))
        );

        // Match por nome se ainda não deu match
        if (!isMatched && lead.name) {
          const leadCleanName = lead.name.replace(/[^a-zA-Z0-9\s]/g, '').trim().toLowerCase();
          if (leadCleanName.length >= 3) {
            for (const pName of parsedNameList) {
              if (leadCleanName.includes(pName) || pName.includes(leadCleanName)) {
                isMatched = true;
                break;
              }
            }
          }
        }

        if (isMatched) {
          confirmedDispatched++;
          leadsToConfirm.push(lead.id);
        } else {
          // Checar se é telefone fixo (8 dígitos, início 2,3,4,5)
          const localDigits = leadDigits.startsWith('55') ? leadDigits.slice(4) : leadDigits.slice(2);
          const isLandline = localDigits.length === 8 && ['2', '3', '4', '5'].includes(localDigits[0]);

          if (isLandline) {
            movedToLandlines++;
            leadsToLandline.push(lead.id);
          } else {
            // Celular válido que NÃO foi disparado -> RECICLA PARA STAGING
            recycledToStaging++;
            leadsToStaging.push(lead.id);
          }
        }
      }

      // Executar atualizações em lote no Postgres
      if (leadsToStaging.length > 0) {
        await pgPool.query(
          `UPDATE campaign_leads
           SET status = 'STAGING',
               is_mobile = TRUE,
               sent_at = NULL,
               quarantine_expires_at = NULL,
               notes = COALESCE(notes, '') || ' [Reciclado: Não constava no WhatsApp Web]'
           WHERE id = ANY($1::text[])`,
          [leadsToStaging]
        );
      }

      if (leadsToLandline.length > 0) {
        await pgPool.query(
          `UPDATE campaign_leads
           SET status = 'DESCARTADO',
               is_mobile = FALSE,
               response_preview = 'Telefone fixo comercial (Sem WhatsApp) - Destinado a ligação ativa',
               notes = COALESCE(notes, '') || ' [Fixo Comercial: Ligação Telefônica]'
           WHERE id = ANY($1::text[])`,
          [leadsToLandline]
        );
      }

      if (leadsToConfirm.length > 0) {
        await pgPool.query(
          `UPDATE campaign_leads
           SET status = 'QUARENTENA',
               notes = COALESCE(notes, '') || ' [Confirmado WhatsApp Web]'
           WHERE id = ANY($1::text[]) AND status != 'INTERESSADO'`,
          [leadsToConfirm]
        );
      }

      // Atualizar métricas da safra
      await pgPool.query(
        `UPDATE campaign_batches
         SET dispatched_count = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1 AND status IN ('QUARENTENA', 'INTERESSADO')),
             valid_mobiles = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1 AND is_mobile = TRUE),
             landlines = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1 AND is_mobile = FALSE)
         WHERE id = $1`,
        [batchId]
      );
    } else {
      // Modo em memória
      for (const lead of memoryCampaignLeadsMap.values()) {
        if (lead.batchId !== batchId) continue;
        totalBatchLeads++;
        if (lead.status === 'INTERESSADO') {
          alreadyResponded++;
          continue;
        }
        const leadDigits = (lead.phoneNumber || '').replace(/\D/g, '');
        const last8 = leadDigits.slice(-8);
        const last9 = leadDigits.slice(-9);

        let isMatched = (
          parsedPhoneSet.has(leadDigits) ||
          (last9.length === 9 && parsedPhoneSet.has(last9)) ||
          (last8.length === 8 && parsedPhoneSet.has(last8))
        );

        if (!isMatched && lead.name) {
          const leadCleanName = lead.name.replace(/[^a-zA-Z0-9\s]/g, '').trim().toLowerCase();
          if (leadCleanName.length >= 3) {
            for (const pName of parsedNameList) {
              if (leadCleanName.includes(pName) || pName.includes(leadCleanName)) {
                isMatched = true;
                break;
              }
            }
          }
        }

        if (isMatched) {
          confirmedDispatched++;
          lead.status = 'QUARENTENA';
        } else {
          const localDigits = leadDigits.startsWith('55') ? leadDigits.slice(4) : leadDigits.slice(2);
          const isLandline = localDigits.length === 8 && ['2', '3', '4', '5'].includes(localDigits[0]);
          if (isLandline) {
            movedToLandlines++;
            lead.status = 'DESCARTADO';
            lead.isMobile = false;
            lead.responsePreview = 'Telefone fixo comercial (Sem WhatsApp) - Destinado a ligação ativa';
          } else {
            recycledToStaging++;
            lead.status = 'STAGING';
            lead.isMobile = true;
            lead.sentAt = undefined;
            lead.quarantineExpiresAt = undefined;
          }
        }
      }
    }

    await logAudit('CAMPANHA_WHATSAPP_SYNC', `Sincronizou safra ${batchId} com WhatsApp Web: ${confirmedDispatched} confirmados, ${recycledToStaging} reciclados para Staging, ${movedToLandlines} fixos isolados`, req);
    broadcastSSE('CAMPAIGN_BATCH_UPDATED', { batchId });

    return res.json({
      success: true,
      stats: {
        totalBatchLeads,
        whatsappChatsProvided: rawList.length,
        confirmedDispatched,
        recycledToStaging,
        movedToLandlines,
        alreadyResponded
      },
      message: `Sincronização concluída com sucesso! ${confirmedDispatched} disparos confirmados e mantidos, ${recycledToStaging} celulares não disparados reciclados de volta para a 1ª Etapa e ${movedToLandlines} telefones fixos isolados para ligação.`
    });
  } catch (err: any) {
    console.error('Erro ao sincronizar safra com WhatsApp Web:', err);
    return res.status(500).json({ error: `Erro na sincronização: ${err.message}` });
  }
});

// Delete a campaign batch and its staging leads
app.delete('/api/campaign/batches/:batchId', async (req: any, res) => {
  const { batchId } = req.params;
  try {
    if (usePostgres && pgPool) {
      await pgPool.query('DELETE FROM campaign_leads WHERE batch_id = $1', [batchId]);
      await pgPool.query('DELETE FROM campaign_batches WHERE id = $1', [batchId]);
    } else {
      memoryCampaignBatchesMap.delete(batchId);
      for (const [id, lead] of memoryCampaignLeadsMap.entries()) {
        if (lead.batchId === batchId) {
          memoryCampaignLeadsMap.delete(id);
        }
      }
    }
    await logAudit('CAMPANHA_EXCLUIDA', `Excluiu safra ${batchId}`, req);
    broadcastSSE('CAMPAIGN_BATCH_DELETED', { batchId });
    return res.json({ success: true, message: 'Safra excluída com sucesso.' });
  } catch (err: any) {
    console.error('Erro ao excluir safra:', err);
    res.status(500).json({ error: 'Erro ao excluir safra.' });
  }
});

// Realtime Server-Sent Events (SSE) Endpoint
// Cada evento tem um `id` crescente. Quando o navegador reconecta (queda de rede, proxy, sleep do notebook)
// ele manda o cabeçalho Last-Event-ID e o servidor REENVIA o que ele perdeu. Se o buraco não cabe no buffer
// (ou o servidor reiniciou), manda `resync` e o front recarrega os dados.
app.get('/api/realtime/stream', (req: any, res) => {
  // Identidade de quem abriu a conexão: decide quais eventos este navegador recebe.
  const client: SseClient = {
    res,
    salespersonId: req.user?.salespersonId || null,
    isAdmin: isUserAdmin(req.user)
  };

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 3000\n');
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', lastEventId: sseEventSeq })}\n\n`);

  const lastId = Number(req.headers['last-event-id']);
  if (Number.isFinite(lastId) && lastId > 0) {
    const oldest = sseEventBuffer.length ? sseEventBuffer[0].id : sseEventSeq + 1;
    if (lastId > sseEventSeq || lastId + 1 < oldest) {
      res.write('event: resync\ndata: {"reason":"gap"}\n\n');
    } else {
      for (const e of sseEventBuffer) {
        if (e.id <= lastId) continue;
        // O reenvio também respeita o dono: nada de recuperar evento de outro vendedor.
        const visible = e.owner === 'ALL' ? true : sseClientMaySee(client, { owner: e.owner ?? null });
        if (visible) res.write(e.payload);
      }
    }
  }

  sseClients.add(client);

  // Keep-alive ping every 15s (proxies derrubam conexões ociosas)
  const pingInterval = setInterval(() => {
    try {
      res.write('event: ping\ndata: {"time":' + Date.now() + '}\n\n');
    } catch {
      clearInterval(pingInterval);
      sseClients.delete(client);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    sseClients.delete(client);
  });
});

/**
 * Fim da janela de 24h de um lead: o mais tardio entre o valor gravado no lead e a última mensagem
 * recebida do cliente (+24h). Serve de DICA para a interface; quem decide de verdade é a FluxoAPI (422 window_closed).
 */
async function resolveLeadWindowExpiry(leadId: string, leadTarget?: any): Promise<string | null> {
  const candidates: Array<string | Date | null | undefined> = [leadTarget?.window_expires_at, leadTarget?.windowExpiresAt];
  const mem = memoryLeadMessagesMap.get(leadId) || [];
  for (let i = mem.length - 1; i >= 0; i--) {
    if (mem[i].sender === 'lead') {
      candidates.push(windowExpiryFromInbound(mem[i].timestamp));
      break;
    }
  }
  if (usePostgres && pgPool) {
    try {
      const r = await pgPool.query(`SELECT MAX(timestamp) AS ts FROM lead_messages WHERE lead_id = $1 AND sender = 'lead'`, [leadId]);
      if (r.rows[0]?.ts) candidates.push(windowExpiryFromInbound(r.rows[0].ts));
    } catch {
      /* dica apenas */
    }
  }
  return latestExpiry(...candidates);
}

async function findLeadTarget(leadId: string): Promise<any> {
  if (usePostgres && pgPool) {
    const lRes = await pgPool.query('SELECT * FROM leads WHERE id = $1', [leadId]);
    if (lRes.rows.length > 0) return lRes.rows[0];
    const cRes = await pgPool.query('SELECT * FROM campaign_leads WHERE id = $1', [leadId]);
    if (cRes.rows.length > 0) return cRes.rows[0];
    return null;
  }
  return memoryLeadsMap.get(leadId) || memoryCampaignLeadsMap.get(leadId) || null;
}

// GET /api/leads/:leadId/messages (Histórico de mensagens de WhatsApp com o lead)
app.get('/api/leads/:leadId/messages', async (req: any, res) => {
  const { leadId } = req.params;
  const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);
  // `before=<ISO>`: traz o pedaço ANTERIOR da conversa ("carregar mensagens antigas").
  // Antes vinham só as 500 mais recentes e o resto do histórico era inalcançável pela tela.
  const before = String(req.query.before || '').trim();
  let messages: LeadChatMessage[] = [];
  let hasMoreOlder = false;

  if (usePostgres && pgPool) {
    try {
      const params: any[] = [leadId];
      let beforeClause = '';
      if (before) {
        params.push(before);
        beforeClause = ` AND timestamp < $${params.length}::timestamptz`;
      }
      params.push(limit + 1); // +1 para saber se ainda há mais para trás
      const qRes = await pgPool.query(
        `SELECT * FROM (
           SELECT id, lead_id AS "leadId", sender, sender_name AS "senderName", text, template_name AS "templateName",
                  status, COALESCE(status_rank, -1) AS "statusRank", whatsapp_message_id AS "remoteMessageId",
                  conversation_id AS "conversationId", COALESCE(sent_from_phone, FALSE) AS "sentFromPhone",
                  error_code AS "errorCode", error_message AS "errorMessage",
                  is_audio AS "isAudio", audio_url AS "audioUrl", audio_duration AS "audioDuration",
                  media_type AS "mediaType", media_url AS "mediaUrl", media_name AS "mediaName",
                  timestamp AS "ts",
                  -- AT TIME ZONE 'UTC' é obrigatório: sem ele o Postgres renderiza no fuso do
                  -- servidor e o texto sai rotulado como "Z" (UTC) mesmo assim. Num servidor em
                  -- São Paulo, TODA mensagem aparecia 3 horas fora do lugar no chat, e o cursor
                  -- de "carregar mensagens antigas" comparava horários trocados.
                  to_char(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "timestamp"
           FROM lead_messages
           WHERE lead_id = $1${beforeClause}
           ORDER BY ts DESC
           LIMIT $${params.length}
         ) t ORDER BY ts ASC`,
        params
      );
      if (qRes.rows.length > limit) {
        hasMoreOlder = true;
        qRes.rows.shift(); // descarta a linha extra (a mais antiga do lote)
      }
      if (qRes.rows.length > 0) {
        messages = qRes.rows.map((r: any) => {
          const { ts, errorCode, errorMessage, ...msg } = r;
          if (msg.status === 'failed' && (errorCode || errorMessage)) {
            msg.error = { code: errorCode || undefined, message: errorMessage || undefined };
          }
          return msg as LeadChatMessage;
        });
      }
    } catch (err: any) {
      console.warn('[PostgreSQL] Erro ao buscar mensagens em lead_messages:', err.message);
    }
  }

  if (messages.length === 0 && !before) {
    messages = (memoryLeadMessagesMap.get(leadId) || []).slice(-limit);
  }

  const windowExpiresAt = await resolveLeadWindowExpiry(leadId, await findLeadTarget(leadId).catch(() => null));

  return res.json({
    success: true,
    leadId,
    total: messages.length,
    windowExpiresAt,
    windowOpen: isWindowOpen(windowExpiresAt),
    // Cursor para "carregar mensagens antigas": o horário da mensagem mais antiga deste lote.
    hasMoreOlder,
    olderCursor: hasMoreOlder && messages.length > 0 ? messages[0].timestamp : null,
    messages
  });
});

// GET /api/leads/:leadId/window (a interface usa para avisar "janela fechada — use um modelo")
app.get('/api/leads/:leadId/window', async (req: any, res) => {
  const { leadId } = req.params;
  const target = await findLeadTarget(leadId).catch(() => null);
  const windowExpiresAt = await resolveLeadWindowExpiry(leadId, target);
  return res.json({ success: true, leadId, windowExpiresAt, windowOpen: isWindowOpen(windowExpiresAt) });
});

// ---------------------------------------------------------------------------
// Catálogo de modelos (cache de 5 min): traz `fields[]` = o que PRECISA ser preenchido para enviar (§A5)
// ---------------------------------------------------------------------------
const templateDefCache = new Map<string, { at: number; def: CatalogTemplate | null }>();
const TEMPLATE_CACHE_OK_MS = 5 * 60 * 1000;
const TEMPLATE_CACHE_MISS_MS = 60 * 1000;

async function getTemplateDefinition(
  name: string,
  language: string,
  creds: { instanceId: string; apiKey: string; apiSecret: string }
): Promise<CatalogTemplate | null> {
  const key = `${creds.instanceId}:${name.toLowerCase()}:${language}`;
  const cached = templateDefCache.get(key);
  if (cached && Date.now() - cached.at < (cached.def ? TEMPLATE_CACHE_OK_MS : TEMPLATE_CACHE_MISS_MS)) return cached.def;

  let def: CatalogTemplate | null = null;
  try {
    const r = await executeFluxoRequest<any>({
      method: 'GET',
      path: fluxoInstancePath(`/templates?name=${encodeURIComponent(name)}&language=${encodeURIComponent(language)}`, creds.instanceId),
      apiKey: creds.apiKey,
      apiSecret: creds.apiSecret
    });
    if (r.success) {
      const list: any[] = Array.isArray(r.data) ? r.data : Array.isArray((r.raw as any)?.data) ? (r.raw as any).data : [];
      def = list.find(t => String(t.name).toLowerCase() === name.toLowerCase() && (!language || t.language === language)) || null;
    } else {
      console.warn(`[Templates] Não consegui ler o catálogo (${r.error?.code || r.status}). Envio segue sem validar os campos.`);
    }
  } catch (e: any) {
    console.warn('[Templates] Falha ao consultar catálogo:', e?.message || e);
  }
  templateDefCache.set(key, { at: Date.now(), def });
  return def;
}

/**
 * Envia um modelo aprovado pela FluxoAPI montando o corpo a partir da definição REAL do modelo (`fields[]`).
 * Se faltar valor obrigatório ou o modelo não for enviável, devolve um resultado de falha SEM gastar requisição.
 */
async function sendTemplateViaFluxo(opts: {
  to: string;
  name: string;
  language?: string;
  variables?: Record<string, string>;
  buttons?: Record<string, string>;
  headerMediaUrl?: string;
  idempotencyKey?: string;
  creds: { instanceId: string; apiKey: string; apiSecret: string };
}): Promise<FluxoApiResult<any>> {
  const language = opts.language || 'pt_BR';
  const def = await getTemplateDefinition(opts.name, language, opts.creds);
  if (def && ((def.status && String(def.status).toUpperCase() !== 'APPROVED') || def.sendable === false)) {
    return {
      success: false,
      status: 422,
      error: {
        code: 'template_not_found',
        message: `O modelo "${opts.name}" não pode ser enviado${def.status && String(def.status).toUpperCase() !== 'APPROVED' ? ` (status ${def.status})` : ''}${def.blockedReason ? `: ${def.blockedReason}` : '.'}`
      }
    };
  }
  const built = buildTemplatePayload(def, opts.name, language, {
    body: opts.variables,
    buttons: opts.buttons,
    headerMediaLink: opts.headerMediaUrl
  });
  if (built.missing.length > 0) {
    return {
      success: false,
      status: 422,
      error: { code: 'invalid_input', message: `O modelo "${opts.name}" exige valores não informados: ${built.missing.join(', ')}.` }
    };
  }
  return executeFluxoRequest({
    method: 'POST',
    path: fluxoInstancePath('/messages/template', opts.creds.instanceId),
    body: { to: opts.to, template: built.template, ...(opts.idempotencyKey ? { idempotency_key: opts.idempotencyKey } : {}) },
    apiKey: opts.creds.apiKey,
    apiSecret: opts.creds.apiSecret
  });
}

function extractRemoteMessageId(fRes: FluxoApiResult<any>): string | undefined {
  const d: any = fRes.data;
  const raw: any = fRes.raw;
  return d?.id || d?.message_id || d?.messages?.[0]?.id || raw?.id || raw?.data?.id || raw?.message_id || undefined;
}

/** Legenda de verdade: ignora o texto-marcador que a interface coloca quando só há arquivo. */
function realCaption(text: string): string {
  const t = String(text || '').trim();
  if (!t) return '';
  if (/^\[Arquivo: .*\]$/.test(t) || /^🎤 Mensagem de voz/.test(t)) return '';
  return t.slice(0, 1024);
}

const inFlightClientSends = new Set<string>();

// POST /api/leads/:leadId/messages (Enviar mensagem de WhatsApp para o lead)
//  - AGUARDA a resposta da FluxoAPI: a rota só diz "ok" (202 queued) quando a API aceitou de fato;
//    qualquer recusa volta como erro com o motivo (code/message/action/request_id), nunca como "enviado" falso.
//  - `clientMessageId` torna o envio idempotente (duplo clique / retry da rede não duplica no celular do cliente).
app.post('/api/leads/:leadId/messages', requireDatabaseReady, async (req: any, res) => {
  const { leadId } = req.params;
  const {
    text,
    templateName,
    templateLanguage,
    templateVariables,
    templateButtons,
    templateHeaderMediaUrl,
    isAudio,
    senderName,
    audioUrl,
    audioDuration,
    mediaType,
    mediaUrl,
    mediaName,
    phone: bodyPhone,
    clientMessageId
  } = req.body || {};

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Texto da mensagem é obrigatório.' });
  }

  // --- idempotência por clientMessageId ---------------------------------------------------------
  const clientId = clientMessageId ? String(clientMessageId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) : '';
  const messageLocalId = clientId ? `msg_${clientId}` : `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  if (clientId) {
    let existing: any = (memoryLeadMessagesMap.get(leadId) || []).find(m => m.id === messageLocalId);
    if (!existing && usePostgres && pgPool) {
      const r = await pgPool.query(
        `SELECT id, status, COALESCE(status_rank, -1) AS "statusRank", whatsapp_message_id AS "remoteMessageId", error_message, error_code FROM lead_messages WHERE id = $1`,
        [messageLocalId]
      );
      if (r.rows.length > 0) existing = { ...r.rows[0], leadId };
    }
    if (existing) {
      return res.status(existing.status === 'failed' ? 422 : 200).json({
        success: existing.status !== 'failed',
        replayed: true,
        status: existing.status,
        remoteMessageId: existing.remoteMessageId,
        message: existing
      });
    }
    if (inFlightClientSends.has(messageLocalId)) {
      return res.status(409).json({ success: false, error: { code: 'send_in_progress', message: 'Esta mensagem já está sendo enviada.' } });
    }
    inFlightClientSends.add(messageLocalId);
  }

  try {
    // Find lead in CRM leads or campaign leads
    let leadTarget: any = await findLeadTarget(leadId);

    const phoneFromId = leadId.startsWith('lead_wa_')
      ? leadId.replace('lead_wa_', '').replace(/\D/g, '')
      : /^\+?\d{10,15}$/.test(leadId)
      ? leadId.replace(/\D/g, '')
      : '';

    const phoneRaw = bodyPhone || leadTarget?.phoneNumber || leadTarget?.phone_number || leadTarget?.phone || phoneFromId;
    const cleanPhone = String(phoneRaw || '').replace(/\D/g, '');

    if (!leadTarget && cleanPhone) {
      leadTarget = {
        id: leadId,
        name: `Lead (${cleanPhone})`,
        phoneNumber: normalizeE164Phone(cleanPhone),
        status: 'EM_NEGOCIACAO',
        createdAt: new Date().toISOString()
      };
      memoryLeadsMap.set(leadId, leadTarget);
    }

    const newMessage: LeadChatMessage = {
      id: messageLocalId,
      leadId,
      sender: 'salesperson',
      senderName: senderName || 'Thomas (Admin / Closer)',
      text: text.trim(),
      templateName,
      isAudio: !!isAudio,
      audioDuration: typeof audioDuration === 'number' ? audioDuration : undefined,
      mediaType: mediaType || undefined,
      mediaName: mediaName || undefined,
      status: 'sending',
      statusRank: statusRank('sending'),
      timestamp: new Date().toISOString()
    };

    const fluxoKey = (memoryFluxoConfig.apiKey || '').trim();
    const fluxoSecret = (memoryFluxoConfig.apiSecret || '').trim();
    const instanceId = (memoryFluxoConfig.instanceId || '').trim();

    // ---- 1) PREPARA a mídia ANTES de gravar: o que fica no histórico é a URL, nunca o base64 gigante ----
    const effectiveKind: 'audio' | 'image' | 'document' | 'video' | null = templateName
      ? null
      : (isAudio || mediaType === 'audio') ? 'audio'
      : mediaType === 'image' ? 'image'
      : mediaType === 'video' ? 'video'
      : mediaType === 'document' ? 'document'
      : null;

    let preparedMediaUrl = '';
    let preFailure: ReturnType<typeof describeFluxoError> | null = null;
    if (effectiveKind) {
      const source = effectiveKind === 'audio' ? (audioUrl || mediaUrl) : mediaUrl;
      const defaultName = effectiveKind === 'audio' ? 'voice_note.ogg' : effectiveKind === 'image' ? 'imagem.jpg' : effectiveKind === 'video' ? 'video.mp4' : 'documento.pdf';
      const prepared = await prepareOutboundMedia(source || '', mediaName || defaultName, effectiveKind);
      if (prepared.url) {
        preparedMediaUrl = prepared.url;
        newMessage.mediaUrl = prepared.url;
        newMessage.mediaType = effectiveKind;
        if (effectiveKind === 'audio') {
          newMessage.audioUrl = prepared.url;
          newMessage.isAudio = true;
        }
      } else {
        preFailure = {
          code: 'invalid_input',
          message: prepared.error || 'Não foi possível preparar o arquivo para envio.',
          action: 'Verifique o arquivo (tamanho/formato) e a configuração APP_PUBLIC_URL; depois tente de novo.',
          httpStatus: 422,
          retryable: false
        };
      }
    }

    // ---- 2) GRAVA a mensagem (status "sending") ----
    const currentList = memoryLeadMessagesMap.get(leadId) || [];
    currentList.push(newMessage);
    memoryLeadMessagesMap.set(leadId, currentList);

    if (usePostgres && pgPool) {
      try {
        await pgPool.query(
          `INSERT INTO lead_messages (id, lead_id, phone_number, sender, sender_name, text, template_name, status, status_rank, is_audio, audio_url, audio_duration, media_type, media_url, media_name, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'sending', -1, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO NOTHING`,
          [
            newMessage.id,
            leadId,
            cleanPhone || null,
            newMessage.sender,
            newMessage.senderName,
            newMessage.text,
            newMessage.templateName || null,
            newMessage.isAudio,
            newMessage.audioUrl || null,
            newMessage.audioDuration || null,
            newMessage.mediaType || null,
            newMessage.mediaUrl || null,
            newMessage.mediaName || null
          ]
        );
      } catch (msgErr: any) {
        console.error('[PostgreSQL] Erro ao salvar mensagem enviada em lead_messages:', msgErr.message);
        return res.status(503).json({
          success: false,
          error: { code: 'database_error', message: 'Não foi possível gravar a mensagem no banco de dados. Nada foi enviado.', action: 'Tente novamente em instantes.' }
        });
      }
    }

    // Marca como FALHA, grava o motivo, avisa todos os desktops e responde com o erro real
    const failMessage = async (info: ReturnType<typeof describeFluxoError>, httpStatusOverride?: number, retryAfterSec?: number) => {
      const errorObj = { code: info.code, message: info.message, action: info.action, requestId: info.requestId };
      newMessage.status = 'failed';
      newMessage.statusRank = statusRank('failed');
      newMessage.error = errorObj;

      if (usePostgres && pgPool) {
        await pgPool.query(
          `UPDATE lead_messages SET status = 'failed', status_rank = 9, error_message = $1, error_code = $2 WHERE id = $3`,
          [info.message, info.code, newMessage.id]
        ).catch((e: any) => console.warn('[PostgreSQL] Erro ao gravar falha de envio:', e.message));
      }

      const payload = { leadId, messageId: newMessage.id, status: 'failed', rank: 9, error: errorObj };
      broadcastSSE('MESSAGE_STATUS_UPDATE', payload);
      broadcastSocketEvent('message_status_update', payload);
      broadcastSSE('NEW_MESSAGE', { leadId, leadName: leadTarget?.name, message: newMessage });

      if (retryAfterSec) res.setHeader('Retry-After', String(Math.ceil(retryAfterSec)));
      return res.status(httpStatusOverride ?? info.httpStatus).json({
        success: false,
        error: { ...errorObj, retryable: info.retryable, windowExpiredAt: info.windowExpiredAt, requiredScope: info.requiredScope, metaCode: info.metaCode },
        message: newMessage
      });
    };

    if (preFailure) return await failMessage(preFailure);

    // ---- 3) PRÉ-REQUISITOS de envio ----
    if (!fluxoKey || !fluxoSecret) {
      return await failMessage(describeFluxoError({ code: 'missing_credentials' }));
    }
    if (!instanceId) {
      return await failMessage(describeFluxoError({ code: 'instance_required' }));
    }
    const phoneCheck = formatAndValidateE164Phone(cleanPhone);
    if (!phoneCheck.isValid) {
      return await failMessage({
        code: 'invalid_input',
        message: `Telefone inválido para envio: ${phoneCheck.error || cleanPhone}`,
        action: 'Corrija o telefone do lead (DDD + número).',
        httpStatus: 422,
        retryable: false
      });
    }
    const e164 = phoneCheck.e164;

    // ---- 4) MONTA o corpo conforme o contrato (§A3/§A4) ----
    const idempotencyKey = clientId ? `nyroh:${clientId}` : `${leadId}:${newMessage.id}`;
    let targetPath = '';
    let bodyPayload: any = null;

    if (templateName) {
      const language = String(templateLanguage || 'pt_BR');
      const def = await getTemplateDefinition(String(templateName).trim(), language, { instanceId, apiKey: fluxoKey, apiSecret: fluxoSecret });

      if (def && ((def.status && String(def.status).toUpperCase() !== 'APPROVED') || def.sendable === false)) {
        return await failMessage({
          code: 'template_not_found',
          message: `O modelo "${templateName}" não pode ser enviado${def.status && String(def.status).toUpperCase() !== 'APPROVED' ? ` (status ${def.status})` : ''}${def.blockedReason ? `: ${def.blockedReason}` : '.'}`,
          action: 'Aguarde a aprovação da Meta ou escolha outro modelo aprovado.',
          httpStatus: 422,
          retryable: false
        });
      }

      const firstName = String(leadTarget?.name || 'Cliente').trim().split(/\s+/)[0] || 'Cliente';
      const publicUrl = leadTarget?.publicUrl || leadTarget?.public_url || 'https://nyroh.com.br';
      const sellerFirst = String(senderName || 'Thomas').replace(/\(.*\)/, '').trim().split(/\s+/)[0] || 'Thomas';
      const values: TemplateValues = {
        body: templateVariables && typeof templateVariables === 'object' ? templateVariables : undefined,
        // padrão (compatível com o comportamento antigo): {{1}} nome, {{2}} link do site, {{3}} vendedor
        positional: [firstName, publicUrl, sellerFirst],
        buttons: templateButtons && typeof templateButtons === 'object' ? templateButtons : undefined,
        headerMediaLink: templateHeaderMediaUrl || undefined
      };
      const built = buildTemplatePayload(def, String(templateName).trim(), language, values);
      if (built.missing.length > 0) {
        return await failMessage({
          code: 'invalid_input',
          message: `O modelo "${templateName}" exige valores que não foram informados: ${built.missing.join(', ')}.`,
          action: 'Envie templateVariables / templateButtons / templateHeaderMediaUrl com esses campos.',
          httpStatus: 422,
          retryable: false
        });
      }
      targetPath = fluxoInstancePath('/messages/template', instanceId);
      bodyPayload = { to: e164, template: built.template, idempotency_key: idempotencyKey };
    } else if (effectiveKind === 'audio') {
      targetPath = fluxoInstancePath('/messages', instanceId);
      // Em áudio a Meta NÃO aceita legenda (a FluxoAPI ignora)
      bodyPayload = { to: e164, type: 'audio', media: { url: preparedMediaUrl }, idempotency_key: idempotencyKey };
    } else if (effectiveKind === 'document') {
      targetPath = fluxoInstancePath('/messages', instanceId);
      const caption = realCaption(text);
      bodyPayload = {
        to: e164,
        type: 'document',
        media: { url: preparedMediaUrl, filename: (mediaName || 'documento.pdf').slice(0, 240), ...(caption ? { caption } : {}) },
        idempotency_key: idempotencyKey
      };
    } else if (effectiveKind === 'image' || effectiveKind === 'video') {
      targetPath = fluxoInstancePath('/messages', instanceId);
      const caption = realCaption(text);
      bodyPayload = {
        to: e164,
        type: effectiveKind,
        media: { url: preparedMediaUrl, ...(caption ? { caption } : {}) },
        idempotency_key: idempotencyKey
      };
    } else {
      targetPath = fluxoInstancePath('/messages', instanceId);
      bodyPayload = { to: e164, type: 'text', text: { body: text.trim().slice(0, 4096) }, idempotency_key: idempotencyKey };
    }

    // ---- 5) ENVIA e AGUARDA a resposta da FluxoAPI ----
    const fRes = await executeFluxoRequest({
      method: 'POST',
      path: targetPath,
      body: bodyPayload,
      apiKey: fluxoKey,
      apiSecret: fluxoSecret
    });

    if (!fRes.success) {
      const info = describeFluxoError(fRes.error, fRes.status);
      console.warn(`[Envio] FluxoAPI recusou (${info.code}${info.requestId ? `, ${info.requestId}` : ''}): ${info.message}`);
      return await failMessage(info, undefined, fRes.retryAfterSec);
    }

    // ---- 6) 202 Accepted: a mensagem entrou na FILA da FluxoAPI (ainda não é "entregue") ----
    const remoteId = extractRemoteMessageId(fRes);
    newMessage.remoteMessageId = remoteId;
    if (shouldApplyStatus({ status: newMessage.status, rank: newMessage.statusRank }, { status: 'queued' })) {
      newMessage.status = 'queued';
      newMessage.statusRank = statusRank('queued');
    }

    if (usePostgres && pgPool) {
      await pgPool.query(
        `UPDATE lead_messages
            SET whatsapp_message_id = COALESCE($1, whatsapp_message_id),
                status = CASE WHEN COALESCE(status_rank, -1) < 0 THEN 'queued' ELSE status END,
                status_rank = GREATEST(COALESCE(status_rank, -1), 0)
          WHERE id = $2`,
        [remoteId || null, newMessage.id]
      ).catch((e: any) => console.warn('[PostgreSQL] Erro ao gravar id remoto da mensagem:', e.message));
    }

    // Um webhook `sent`/`delivered` pode ter chegado ANTES de eu gravar o id remoto: aplica agora
    if (remoteId) await applyPendingStatus(remoteId);

    const statusPayload = {
      leadId,
      messageId: newMessage.id,
      remoteMessageId: remoteId,
      status: newMessage.status,
      rank: newMessage.statusRank
    };
    broadcastSSE('MESSAGE_STATUS_UPDATE', statusPayload);
    broadcastSocketEvent('message_status_update', statusPayload);
    broadcastSSE('NEW_MESSAGE', { leadId, leadName: leadTarget?.name, message: newMessage });

    return res.status(202).json({
      success: true,
      status: newMessage.status,
      remoteMessageId: remoteId,
      replayed: fRes.replayed === true,
      billable: (fRes.raw as any)?.billable === true,
      message: newMessage
    });
  } catch (sendErr: any) {
    console.error('[Envio] Erro inesperado:', sendErr);
    return res.status(500).json({
      success: false,
      error: { code: 'internal_error', message: sendErr?.message || 'Erro interno ao enviar a mensagem.' }
    });
  } finally {
    if (clientId) inFlightClientSends.delete(messageLocalId);
  }
});

// ----------------------------------------------------------------------------------------------------------
// PRESENÇA (vários vendedores no MESMO WhatsApp): quem está com a conversa aberta / digitando.
// Evita o pior problema de caixa compartilhada: dois vendedores respondendo o mesmo cliente sem saber um do outro.
// Não bloqueia ninguém — só avisa em tempo real (SSE `LEAD_PRESENCE`). A entrada expira em 15s sem sinal.
// ----------------------------------------------------------------------------------------------------------
interface PresenceEntry { userId: string; name: string; typing: boolean; at: number }
const presenceByLead = new Map<string, Map<string, PresenceEntry>>();
const PRESENCE_TTL_MS = 15000;

function presenceSnapshot(leadId: string): Array<{ id: string; name: string; typing: boolean }> {
  const m = presenceByLead.get(leadId);
  if (!m) return [];
  const now = Date.now();
  const out: Array<{ id: string; name: string; typing: boolean }> = [];
  for (const [uid, e] of m.entries()) {
    if (now - e.at > PRESENCE_TTL_MS) m.delete(uid);
    else out.push({ id: e.userId, name: e.name, typing: e.typing });
  }
  if (m.size === 0) presenceByLead.delete(leadId);
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function broadcastPresenceIfChanged(leadId: string, before: string) {
  const users = presenceSnapshot(leadId);
  if (JSON.stringify(users) !== before) void broadcastLeadSSE('LEAD_PRESENCE', { leadId, users }, leadId);
}

app.get('/api/leads/:leadId/presence', (req: any, res) => {
  return res.json({ success: true, leadId: req.params.leadId, users: presenceSnapshot(req.params.leadId) });
});

app.post('/api/leads/:leadId/presence', (req: any, res) => {
  const { leadId } = req.params;
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Não autenticado.' });
  const before = JSON.stringify(presenceSnapshot(leadId));
  if (req.body?.leave) {
    presenceByLead.get(leadId)?.delete(user.id);
  } else {
    let m = presenceByLead.get(leadId);
    if (!m) presenceByLead.set(leadId, (m = new Map()));
    m.set(user.id, { userId: user.id, name: String(user.name || 'Vendedor'), typing: Boolean(req.body?.typing), at: Date.now() });
  }
  broadcastPresenceIfChanged(leadId, before);
  return res.json({ success: true, me: user.id, users: presenceSnapshot(leadId) });
});

// Expira quem sumiu (aba fechada, queda de rede) e avisa os outros
setInterval(() => {
  for (const leadId of Array.from(presenceByLead.keys())) {
    const m = presenceByLead.get(leadId);
    if (!m) continue;
    const had = m.size;
    const before = JSON.stringify(Array.from(m.values()).map(e => ({ id: e.userId, name: e.name, typing: e.typing })).sort((a, b) => a.id.localeCompare(b.id)));
    const after = presenceSnapshot(leadId);
    if (after.length !== had) {
      void broadcastLeadSSE('LEAD_PRESENCE', { leadId, users: after }, leadId);
    } else if (JSON.stringify(after) !== before) {
      void broadcastLeadSSE('LEAD_PRESENCE', { leadId, users: after }, leadId);
    }
  }
}, 5000).unref();
// POST /api/leads/:leadId/read — marca a última mensagem recebida como LIDA (dois traços azuis no celular do cliente)
const lastReadMarkAt = new Map<string, number>();
app.post('/api/leads/:leadId/read', async (req: any, res) => {
  const { leadId } = req.params;
  const now = Date.now();

  // Zerar o contador de não lidas é NOSSO, não custa nada à API da Meta: acontece sempre que a
  // conversa é aberta. Antes ficava depois da trava de 20s abaixo, então reabrir a conversa
  // dentro desse intervalo deixava o contador aceso para sempre.
  if (usePostgres && pgPool) {
    pgPool.query(`UPDATE leads SET unread_count = 0 WHERE id = $1`, [leadId]).catch(() => {});
  }

  // no máx. 1 marcação a cada 20s por lead: abrir/fechar conversa não consome o limite da API
  if (now - (lastReadMarkAt.get(leadId) || 0) < 20000) return res.json({ success: true, marked: false, reason: 'recent' });

  let wamid: string | undefined;
  if (usePostgres && pgPool) {
    const r = await pgPool.query(
      `SELECT whatsapp_message_id FROM lead_messages
        WHERE lead_id = $1 AND sender = 'lead' AND whatsapp_message_id LIKE 'msg\\_%'
        ORDER BY timestamp DESC LIMIT 1`,
      [leadId]
    ).catch(() => null);
    wamid = r?.rows?.[0]?.whatsapp_message_id;
  } else {
    const mem = memoryLeadMessagesMap.get(leadId) || [];
    for (let i = mem.length - 1; i >= 0; i--) {
      if (mem[i].sender === 'lead' && mem[i].remoteMessageId && mem[i].remoteMessageId!.startsWith('msg_')) {
        wamid = mem[i].remoteMessageId;
        break;
      }
    }
  }
  if (usePostgres && pgPool) {
    pgPool.query(`UPDATE leads SET unread_count = 0 WHERE id = $1`, [leadId]).catch(() => {});
  }
  if (!wamid) return res.json({ success: true, marked: false, reason: 'no_inbound' });
  if (!memoryFluxoConfig.apiKey || !memoryFluxoConfig.apiSecret) return res.json({ success: true, marked: false, reason: 'not_configured' });

  lastReadMarkAt.set(leadId, now);
  const fRes = await executeFluxoRequest({
    method: 'POST',
    path: `/v1/messages/${encodeURIComponent(wamid)}/read`,
    apiKey: memoryFluxoConfig.apiKey,
    apiSecret: memoryFluxoConfig.apiSecret
  });
  if (!fRes.success) {
    const info = describeFluxoError(fRes.error, fRes.status);
    return res.status(200).json({ success: true, marked: false, reason: info.code, message: info.message });
  }
  return res.json({ success: true, marked: true, messageId: wamid });
});

// POST /api/leads/:leadId/simulate-reply (Simular resposta de lead no WhatsApp em tempo real)
app.post('/api/leads/:leadId/simulate-reply', async (req: any, res) => {
  const { leadId } = req.params;
  const { text, isInterested = true, isAudio = false, audioDuration = 11, audioUrl } = req.body;

  let leadTarget: any = null;
  if (usePostgres && pgPool) {
    const lRes = await pgPool.query('SELECT * FROM leads WHERE id = $1', [leadId]);
    if (lRes.rows.length > 0) leadTarget = lRes.rows[0];
    else {
      const cRes = await pgPool.query('SELECT * FROM campaign_leads WHERE id = $1', [leadId]);
      if (cRes.rows.length > 0) leadTarget = cRes.rows[0];
    }
  } else {
    leadTarget = memoryLeadsMap.get(leadId) || memoryCampaignLeadsMap.get(leadId);
  }

  const defaultText = isAudio
    ? `🎤 Mensagem de áudio (${audioDuration}s)`
    : (isInterested 
        ? 'Olá! Vi a prévia do novo site que vocês criaram. Ficou muito bacana! Como funciona para colocar no ar e qual o valor?'
        : 'Não temos interesse no momento, por favor não enviar mais mensagens.');

  const replyText = text || defaultText;

  const incomingMessage: LeadChatMessage = {
    id: `msg_in_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    leadId,
    sender: 'lead',
    senderName: leadTarget?.name || 'Lead',
    text: replyText,
    isAudio: !!isAudio,
    audioDuration: isAudio ? audioDuration : undefined,
    audioUrl: audioUrl || undefined,
    status: 'read',
    timestamp: new Date().toISOString()
  };

  const currentList = memoryLeadMessagesMap.get(leadId) || [];
  currentList.push(incomingMessage);
  memoryLeadMessagesMap.set(leadId, currentList);

  // If it's a campaign lead, update status to INTERESSADO or DESCARTADO
  const cLead = memoryCampaignLeadsMap.get(leadId);
  if (cLead) {
    if (isInterested) {
      cLead.status = 'INTERESSADO';
      cLead.respondedAt = new Date().toISOString();
      cLead.responsePreview = replyText;
    } else {
      cLead.status = 'DESCARTADO';
      cLead.responsePreview = 'Opt-out / Recusou contato';
    }
  }

  // Also if in CRM leads, update column if interested
  const crmLead = memoryLeadsMap.get(leadId);
  if (crmLead && isInterested) {
    crmLead.columnStatus = 'Interessado';
    crmLead.subStatus = 'Em Negociação WhatsApp';
    crmLead.lastCallTag = '🔥 Respondeu no WhatsApp';
  }

  // Broadcast real-time SSE
  broadcastSSE('NEW_MESSAGE', {
    leadId,
    leadName: leadTarget?.name,
    message: incomingMessage,
    isReply: true,
    isInterested
  });

  if (isInterested) {
    broadcastSSE('LEAD_HOT_REPLY', {
      leadId,
      leadName: leadTarget?.name,
      replyText
    });
  }

  return res.json({
    success: true,
    message: incomingMessage
  });
});


// Rota de diagnóstico de infraestrutura (Redis, BullMQ, WebSockets)
/**
 * Lista honesta do que está (ou NÃO está) pronto para o WhatsApp funcionar de ponta a ponta.
 * Cada item `ok:false` traz o que fazer. Não expõe nenhum segredo, só se está configurado.
 */
/**
 * Contas ativas que AINDA usam uma senha previsível: as senhas padrão escritas no código-fonte (admin123, 123…)
 * ou a senha inicial gerada para vendedor (`<primeironome>123`). Retorna só e-mails, nunca senhas.
 */
async function findUsersWithPredictablePasswords(): Promise<string[]> {
  const flagged: string[] = [];
  try {
    const defaultHashes = new Map(DEFAULT_USERS.map(u => [u.id, u.passwordHash]));
    let rows: Array<{ id: string; name: string; email: string; role: string; hash: string; salt: string; active: boolean }> = [];
    if (usePostgres && pgPool) {
      const r = await pgPool.query(`SELECT id, name, email, role, password_hash AS hash, password_salt AS salt, active FROM users WHERE active = TRUE LIMIT 300`);
      rows = r.rows;
    } else {
      rows = Array.from(memoryUsersMap.values())
        .filter(u => u.active)
        .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, hash: u.passwordHash, salt: u.passwordSalt, active: u.active }));
    }
    for (const u of rows) {
      if (defaultHashes.get(u.id) === u.hash) {
        flagged.push(u.email);
        continue;
      }
      // Continua checando a senha previsível ANTIGA (<primeironome>123) para avisar
      // quem ainda está com ela de contas criadas antes da correção.
      const creds = getSalespersonCredentials(u.name, u.email);
      if (verifyPassword(creds.legacyPredictablePassword, u.hash, u.salt)) flagged.push(u.email);
    }
  } catch (e: any) {
    console.warn('[Segurança] Não consegui verificar senhas previsíveis:', e?.message || e);
  }
  return flagged;
}

async function buildWhatsAppReadiness() {
  const ffmpeg = await hasFfmpeg().catch(() => false);
  const items: Array<{ key: string; ok: boolean; level: 'critical' | 'warning' | 'info'; message: string; action?: string }> = [];

  const hasCreds = Boolean(memoryFluxoConfig.apiKey && memoryFluxoConfig.apiSecret);
  items.push({
    key: 'credentials',
    ok: hasCreds,
    level: 'critical',
    message: hasCreds ? 'Credenciais da FluxoAPI configuradas.' : 'Credenciais da FluxoAPI NÃO configuradas: nenhuma mensagem será enviada.',
    action: hasCreds ? undefined : 'Defina FLUXO_KEY e FLUXO_SECRET (Railway > Variables).'
  });
  items.push({
    key: 'instance',
    ok: Boolean(memoryFluxoConfig.instanceId),
    level: 'critical',
    message: memoryFluxoConfig.instanceId ? 'Instância (número) definida.' : 'FLUXO_INSTANCE_ID não definido.',
    action: memoryFluxoConfig.instanceId ? undefined : 'Defina FLUXO_INSTANCE_ID (ou use a tela do WhatsApp para escolher a instância).'
  });
  const hasWebhookSecret = Boolean((process.env.FLUXO_WEBHOOK_SECRET || '').trim());
  items.push({
    key: 'webhook_secret',
    ok: hasWebhookSecret,
    level: 'critical',
    message: hasWebhookSecret
      ? 'Assinatura do webhook ATIVA (eventos forjados são rejeitados).'
      : 'FLUXO_WEBHOOK_SECRET ausente: o webhook aceita QUALQUER requisição (qualquer pessoa pode injetar "mensagens recebidas").',
    action: hasWebhookSecret ? undefined : 'Copie o segredo whsec_… do endpoint no painel da FluxoAPI para FLUXO_WEBHOOK_SECRET.'
  });
  const base = publicBaseUrl();
  items.push({
    key: 'public_url',
    ok: Boolean(base),
    level: 'critical',
    message: base ? `URL pública: ${base}` : 'APP_PUBLIC_URL ausente: a Meta não consegue baixar imagens/áudios/arquivos que você envia.',
    action: base ? undefined : 'Defina APP_PUBLIC_URL com a URL https pública do Nyroh.'
  });
  items.push({
    key: 'media_storage',
    ok: isUploadsDirDurable(),
    level: 'warning',
    message: isUploadsDirDurable()
      ? `Mídia salva em disco persistente (${UPLOADS_DIR}).`
      : 'Mídia salva em disco EFÊMERO: some a cada deploy/restart (fotos/áudios recebidos deixam de abrir).',
    action: isUploadsDirDurable() ? undefined : 'Crie um Volume na Railway e defina UPLOADS_DIR (ou use o RAILWAY_VOLUME_MOUNT_PATH automático).'
  });
  items.push({
    key: 'ffmpeg',
    ok: ffmpeg,
    level: 'warning',
    message: ffmpeg ? 'ffmpeg disponível (áudios gravados no navegador são convertidos para OGG/Opus).' : 'ffmpeg ausente: áudios gravados em WebM não podem ser convertidos e a Meta os recusa.',
    action: ffmpeg ? undefined : 'Mantenha "ffmpeg" em nixpacks.toml (nixPkgs) e refaça o deploy.'
  });
  items.push({
    key: 'database',
    ok: usePostgres,
    level: 'critical',
    message: usePostgres ? 'PostgreSQL conectado: mensagens são gravadas de forma durável.' : (isDatabaseStarting() ? 'PostgreSQL ainda conectando…' : 'SEM PostgreSQL: tudo vive em memória e SE PERDE no restart.'),
    action: usePostgres ? undefined : 'Configure DATABASE_URL.'
  });
  items.push({
    key: 'redis',
    ok: Boolean((await getQueueSystemStatus()).redisConnected),
    level: 'warning',
    message: (await getQueueSystemStatus()).redisConnected ? 'Redis/BullMQ ativo (fila durável com retry).' : 'Sem Redis: webhooks e disparos usam a fila em memória (perde o que está pendente se reiniciar).',
    action: 'Configure REDIS_URL para ter fila durável.'
  });
  items.push({
    key: 'plan_rpm',
    ok: true,
    level: 'info',
    message: `Plano FluxoAPI: ${planRpm()} req/min (FLUXO_PLAN_RPM). Disparo limitado a ${dispatchRpm()} msgs/min.`
  });
  if (instanceHealth.quality === 'red' || instanceHealth.quality === 'yellow') {
    items.push({
      key: 'quality',
      ok: false,
      level: 'critical',
      message: `Qualidade do número caiu para ${String(instanceHealth.quality).toUpperCase()}: a Meta reduz o limite e pode desativar o número.`,
      action: 'Reduza o volume de disparos e revise as mensagens enviadas.'
    });
  }
  if (typeof instanceHealth.accessDaysLeft === 'number') {
    items.push({
      key: 'access_expiring',
      ok: false,
      level: 'critical',
      message: `O acesso do número vence em ${instanceHealth.accessDaysLeft} dia(s).`,
      action: 'Reconecte o número pelo painel da FluxoAPI antes de vencer.'
    });
  }
  const weak = await findUsersWithPredictablePasswords();
  items.push({
    key: 'default_passwords',
    ok: weak.length === 0,
    level: 'critical',
    message: weak.length === 0
      ? 'Nenhuma conta usa senha padrão/previsível.'
      : `${weak.length} conta(s) ainda usam senha padrão/previsível (conhecida pelo código-fonte): ${weak.slice(0, 6).join(', ')}${weak.length > 6 ? '…' : ''}`,
    action: weak.length === 0 ? undefined : 'Troque a senha dessas contas (Admin > Usuários) ou desative as que não usa.'
  });

  return {
    ready: items.filter(i => i.level === 'critical').every(i => i.ok),
    items
  };
}

app.get('/api/infrastructure/status', async (req, res) => {
  try {
    const queueStatus = await getQueueSystemStatus();
    const readiness = await buildWhatsAppReadiness();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      server: 'Nyroh CRM Node.js + Railway',
      database: { connected: usePostgres, starting: isDatabaseStarting() },
      whatsapp: {
        ...readiness,
        instanceHealth,
        plan: { planRpm: planRpm(), dispatchRpm: dispatchRpm() }
      },
      ...queueStatus
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 404 Handler for unhandled API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Rota de API não encontrada: ${req.originalUrl}` });
});

// Global Express Error Handler for API errors and Multer limits
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Express API Error:', err);
  if (res.headersSent) {
    return next(err);
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'Arquivo muito grande. O limite máximo permitido para importação de ZIP é de 1.5 GB.',
        code: 'LIMIT_FILE_SIZE'
      });
    }
    return res.status(400).json({
      error: `Erro no upload de arquivo: ${err.message}`,
      code: err.code
    });
  }
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Erro interno no servidor.'
  });
});

// START SERVER & VITE INTEGRATION
async function main() {
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  initSocketServer(httpServer, async (cookieHeader, authHeader) => {
    const m = /(?:^|;\s*)crm_session=([^;]+)/.exec(cookieHeader || '');
    const token = m ? decodeURIComponent(m[1]) : (authHeader || '').replace(/^Bearer\s+/i, '');
    return resolveSessionUser(token || null);
  });

  // Registrar processadores dos Workers em segundo plano (BullMQ + Redis)
  registerWorkerProcessors({
    processWebhook: async (jobData) => {
      await processWebhookEventAsync(jobData.rawPayload);
    },
    processZipImport: async (jobData) => {
      try {
        if (!fs.existsSync(jobData.tempFilePath)) return;
        const fileBuffer = await fs.promises.readFile(jobData.tempFilePath);
        const zip = new JSZip();
        const contents = await zip.loadAsync(fileBuffer);
        const allItems: any[] = [];
        for (const [relativePath, fileObj] of Object.entries(contents.files)) {
          if (!fileObj.dir && !relativePath.includes('__MACOSX') && (relativePath.endsWith('.json') || relativePath.includes('cliente.json'))) {
            try {
              const text = await fileObj.async('string');
              const clean = text.replace(/^\uFEFF/, '').trim();
              const parsed = JSON.parse(clean);
              if (Array.isArray(parsed)) allItems.push(...parsed);
              else if (parsed && typeof parsed === 'object') {
                if (Array.isArray(parsed.leads)) allItems.push(...parsed.leads);
                else if (Array.isArray(parsed.data)) allItems.push(...parsed.data);
                else allItems.push(parsed);
              }
            } catch (e) {}
          }
        }
        const stats = await processLeadItems(allItems);
        broadcastSocketEvent('zip_import_completed', {
          originalFileName: jobData.originalFileName,
          stats,
          completedAt: new Date().toISOString()
        });
        await fs.promises.unlink(jobData.tempFilePath).catch(() => {});
      } catch (err: any) {
        console.error('[Worker ZIP BullMQ] Erro ao processar arquivo:', err.message);
      }
    },
    processCampaignDispatch: async (jobData, ctx) => {
      const apiKey = (memoryFluxoConfig.apiKey || '').trim();
      const apiSecret = (memoryFluxoConfig.apiSecret || '').trim();
      const instanceId = (memoryFluxoConfig.instanceId || '').trim();
      const attempt = ctx?.attempt ?? 1;
      const maxAttempts = ctx?.maxAttempts ?? 1;
      const isLastAttempt = attempt >= maxAttempts;

      const cleanDigits = String(jobData.phone || '').replace(/\D/g, '');
      const phoneCheck = formatAndValidateE164Phone(String(jobData.phone || ''));
      const formattedE164 = phoneCheck.isValid ? phoneCheck.e164 : '';
      const templateName = jobData.templateName || 'dns_escassez_np4';
      const language = jobData.templateLanguage || 'pt_BR';

      // Id local ÚNICO por disparo (job): retry do BullMQ reaproveita o mesmo id e a mesma idempotency_key
      const dispatchStamp = jobData.dispatchedAt || Date.now();
      const localMessageId = `msg_b_${String(jobData.leadId).replace(/[^a-zA-Z0-9_-]/g, '')}_${dispatchStamp}`;
      const idempotencyKey = `${jobData.batchId || jobData.campaignId}:${jobData.leadId}:${dispatchStamp}`;

      // Variáveis do modelo (já resolvidas por lead no momento do disparo)
      const sanitizedVariables: Record<string, string> = {};
      for (const [k, v] of Object.entries(jobData.variables || {})) {
        sanitizedVariables[k] = String(v || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
      }

      let renderedText = jobData.messageText || (
        templateName === 'dns_escassez_np4'
          ? `Ei,\n\n${sanitizedVariables['1'] || ''}\n\n${sanitizedVariables['2'] || ''}\n\n${sanitizedVariables['3'] || ''}\n\n*Clique no link abaixo para saber mais*`
          : `Ei, ${sanitizedVariables['1'] || ''}\n\n${sanitizedVariables['2'] || ''}\n\n${sanitizedVariables['3'] || ''}`
      );

      // ---------------------------------------------------------------- resultado: SUCESSO / FALHA
      const nowIso = () => new Date().toISOString();

      const recordFailure = async (message: string, code?: string) => {
        console.warn(`[Disparo] Falha para ${formattedE164 || jobData.phone} (${code || 'erro'}): ${message}`);
        if (usePostgres && pgPool) {
          try {
            await pgPool.query(
              `UPDATE campaign_leads
                  SET status = 'FALHA', notes = COALESCE(notes, '') || ' [Falha: ' || $1 || ']'
                WHERE id = $2`,
              [message, jobData.leadId]
            );
            await pgPool.query(
              `INSERT INTO lead_messages (id, lead_id, phone_number, sender, sender_name, text, template_name, status, status_rank, error_message, error_code, timestamp)
               VALUES ($1, $2, $3, 'salesperson', $4, $5, $6, 'failed', 9, $7, $8, CURRENT_TIMESTAMP)
               ON CONFLICT (id) DO NOTHING`,
              [localMessageId, jobData.leadId, cleanDigits || null, jobData.salespersonName || 'Thomas', renderedText, templateName, message, code || null]
            );
          } catch (dbErr: any) {
            console.warn('[Disparo] Erro ao gravar a falha no Postgres:', dbErr.message);
          }
        }
        const leadItem = memoryCampaignLeadsMap.get(jobData.leadId);
        if (leadItem) {
          leadItem.status = 'FALHA';
          leadItem.sentAt = nowIso();
        }
        const msgs = memoryLeadMessagesMap.get(jobData.leadId) || [];
        if (!msgs.some(m => m.id === localMessageId)) {
          msgs.push({
            id: localMessageId,
            leadId: jobData.leadId,
            sender: 'salesperson',
            senderName: jobData.salespersonName || 'Thomas',
            text: renderedText,
            templateName,
            status: 'failed',
            statusRank: statusRank('failed'),
            error: { code, message },
            timestamp: nowIso()
          });
          memoryLeadMessagesMap.set(jobData.leadId, msgs);
        }
        if (jobData.batchId) {
          recordBatchJobResult(jobData.batchId, jobData.leadId, formattedE164 || jobData.phone, jobData.leadName, false, message);
        }
        broadcastSocketEvent('campaign_lead_sent', { leadId: jobData.leadId, campaignId: jobData.campaignId, batchId: jobData.batchId, status: 'falhou', phone: formattedE164, name: jobData.leadName, error: message });
        broadcastSSE('CAMPAIGN_LEAD_DISPATCHED', { leadId: jobData.leadId, batchId: jobData.batchId, phone: formattedE164, status: 'falhou', error: message });
      };

      const recordSuccess = async (remoteId: string | undefined, opts: { dryRun?: boolean } = {}) => {
        const status: 'queued' | 'delivered' = opts.dryRun ? 'delivered' : 'queued';
        const rank = statusRank(status);
        if (usePostgres && pgPool) {
          try {
            await pgPool.query(
              `UPDATE campaign_leads
                  SET status = 'QUARENTENA', sent_at = CURRENT_TIMESTAMP, whatsapp_message_id = $1
                WHERE id = $2`,
              [remoteId || null, jobData.leadId]
            );
            await pgPool.query(
              `INSERT INTO lead_messages (id, lead_id, phone_number, sender, sender_name, text, template_name, status, status_rank, whatsapp_message_id, timestamp)
               VALUES ($1, $2, $3, 'salesperson', $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
               ON CONFLICT (id) DO NOTHING`,
              [localMessageId, jobData.leadId, cleanDigits || null, jobData.salespersonName || 'Thomas', renderedText, templateName, status, rank, remoteId || null]
            );
          } catch (dbErr: any) {
            // Já saiu pela API: NÃO dá para "desenviar". Se o banco falhou, tenta de novo SEM reenviar (idempotency_key evita duplicar).
            throw new Error(`Mensagem aceita pela API mas o banco falhou ao registrar: ${dbErr.message}`);
          }
        }
        const leadItem = memoryCampaignLeadsMap.get(jobData.leadId);
        if (leadItem) {
          leadItem.status = 'QUARENTENA';
          leadItem.sentAt = nowIso();
        }
        const msgs = memoryLeadMessagesMap.get(jobData.leadId) || [];
        if (!msgs.some(m => m.id === localMessageId)) {
          msgs.push({
            id: localMessageId,
            leadId: jobData.leadId,
            sender: 'salesperson',
            senderName: jobData.salespersonName || 'Thomas',
            text: renderedText,
            templateName,
            status,
            statusRank: rank,
            remoteMessageId: remoteId,
            timestamp: nowIso()
          });
          memoryLeadMessagesMap.set(jobData.leadId, msgs);
        }
        // Webhook `sent`/`delivered` pode ter chegado antes de o id remoto estar gravado
        if (remoteId && !opts.dryRun) await applyPendingStatus(remoteId);

        if (jobData.batchId) {
          recordBatchJobResult(jobData.batchId, jobData.leadId, formattedE164, jobData.leadName, true);
        }
        broadcastSocketEvent('campaign_lead_sent', { leadId: jobData.leadId, campaignId: jobData.campaignId, batchId: jobData.batchId, status: 'enviado', phone: formattedE164, name: jobData.leadName, messageId: remoteId });
        broadcastSSE('CAMPAIGN_LEAD_DISPATCHED', { leadId: jobData.leadId, batchId: jobData.batchId, phone: formattedE164, status: 'enviado' });
      };

      // ---------------------------------------------------------------- execução
      if (jobData.dryRun) {
        console.log(`[QA Dry-Run] Disparo simulado para ${formattedE164 || jobData.phone} (Lead: ${jobData.leadName || jobData.leadId}) via template ${templateName} (sem envio real).`);
        await recordSuccess(`dryrun_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`, { dryRun: true });
        return;
      }

      if (!formattedE164) {
        await recordFailure(`Telefone inválido: ${phoneCheck.error || jobData.phone}`, 'invalid_input');
        return;
      }
      if (!apiKey || !apiSecret) {
        await recordFailure(describeFluxoError({ code: 'missing_credentials' }).message, 'missing_credentials');
        return;
      }
      if (!instanceId) {
        await recordFailure(describeFluxoError({ code: 'instance_required' }).message, 'instance_required');
        return;
      }

      // Monta o corpo conforme a definição REAL do modelo (faltar o parâmetro de um botão faz a Meta recusar tudo)
      const def = await getTemplateDefinition(templateName, language, { instanceId, apiKey, apiSecret });
      if (def && ((def.status && String(def.status).toUpperCase() !== 'APPROVED') || def.sendable === false)) {
        await recordFailure(`Modelo "${templateName}" não pode ser enviado${def.status && String(def.status).toUpperCase() !== 'APPROVED' ? ` (status ${def.status})` : ''}${def.blockedReason ? `: ${def.blockedReason}` : ''}`, 'template_not_found');
        return;
      }
      const built = buildTemplatePayload(def, templateName, language, {
        body: sanitizedVariables,
        buttons: jobData.buttonValues,
        headerMediaLink: jobData.headerMediaUrl
      });
      if (built.missing.length > 0) {
        await recordFailure(`O modelo "${templateName}" exige valores que a campanha não informou: ${built.missing.join(', ')}.`, 'invalid_input');
        return;
      }

      const fRes = await executeFluxoRequest({
        method: 'POST',
        path: fluxoInstancePath('/messages/template', instanceId),
        body: { to: formattedE164, template: built.template, idempotency_key: idempotencyKey },
        apiKey,
        apiSecret
      });

      if (!fRes.success) {
        // 429: a fila pausa pelo Retry-After e devolve o job (não conta como tentativa nem como falha)
        if (fRes.status === 429 || fRes.error?.code === 'rate_limited') {
          throw new FluxoRateLimitedError(fRes.retryAfterSec ?? 30);
        }
        const info = describeFluxoError(fRes.error, fRes.status);
        // Erro transitório (API/instância/rede): deixa o BullMQ tentar de novo; só vira falha na ÚLTIMA tentativa
        if (info.retryable && !isLastAttempt) {
          throw new Error(`Falha transitória (${info.code}): ${info.message}`);
        }
        await recordFailure(info.message, info.code);
        return;
      }

      const remoteId = extractRemoteMessageId(fRes);
      const preview = (fRes.raw as any)?.preview;
      if (!jobData.messageText && typeof preview === 'string' && preview.trim()) {
        renderedText = preview.trim(); // exatamente o texto que o contato vai ver
      } else if (!jobData.messageText && def?.bodyText) {
        const bodyVals = (built.template.body || {}) as Record<string, string>;
        renderedText = String(def.bodyText).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, ref) => bodyVals[String(ref).trim()] ?? '');
      }
      await recordSuccess(remoteId);
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Nyroh CRM Server running on http://0.0.0.0:${PORT}`);

    // Diagnóstico de boot: o que falta para o WhatsApp funcionar 100%
    buildWhatsAppReadiness()
      .then(({ items }) => {
        for (const it of items) {
          if (it.ok || it.level === 'info') continue;
          const tag = it.level === 'critical' ? '❌' : '⚠️';
          console.warn(`${tag} [Config] ${it.message}${it.action ? ` → ${it.action}` : ''}`);
        }
      })
      .catch(() => {});
    
    // Connect to database in the background without holding up server startup or healthchecks
    initDatabase().catch((err) => {
      console.error('Background initDatabase error:', err);
    });
  });
}

main();
