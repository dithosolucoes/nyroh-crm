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
import { Lead, CallLog, ColumnStatus, PIPELINE_COLUMNS, CustomTag, Salesperson, DistributeLeadsParams, User, AuditLog, QuickReply } from './shared/types.js';
import { getLeadNiche } from './shared/lib/niche.js';
import { registerUxRoutes, applyUxMigration, uxSchemaOn, abrirRemessa, regrasDeContatoSql, instanciaDaSafra } from './shared/lib/uxRoutes.js';
import { validarInstanciaEscolhida, escolherInstanciaDisparo } from './shared/lib/dispatchInstancia.js';
import { recuperarFixosDescartados } from './shared/lib/recuperacaoFixos.js';
import { variaveisFaltando, mensagemFaltando } from './shared/lib/configObrigatoria.js';
import { aplicarMigracoes } from './shared/lib/migracoes.js';
import { optOutPorBotaoDoWebhook, confirmarDescadastroSeLigada, enviarTextoFluxo } from './shared/lib/descadastroPadrao.js';
import { configurarRotasWebhooks, registrarRotasWebhooks, processWebhookEventAsync, instanceHealth } from './shared/lib/rotas/webhooks.js';
import { configurarRotasUploads, registrarRotasUploads } from './shared/lib/rotas/uploads.js';
import { configurarLeads, registrarLeads } from './shared/lib/rotas/leads.js';
import { configurarDisparos, registrarDisparos } from './shared/lib/rotas/disparos.js';
import { configurarConversas, registrarConversas } from './shared/lib/rotas/conversas.js';
import { configurarVendedores, registrarVendedores } from './shared/lib/rotas/vendedores.js';
import { configurarFluxoMeta, registrarFluxoMeta } from './shared/lib/rotas/fluxoMeta.js';
import { configurarAuth, registrarAuth } from './shared/lib/rotas/auth.js';
import { configurarLeadsRestantes, registrarLeadsRestantes } from './shared/lib/rotas/leadsRestantes.js';
import { ESQUEMA_BASE } from './shared/lib/esquemaBase.js';
import { VIEWS_COMPATIBILIDADE } from './shared/lib/esquemaViews.js';
import { NOTAS_E_RESOLVIDA } from './shared/lib/esquemaNotas.js';
import { CAIXA_DE_ENTRADA } from './shared/lib/esquemaCaixa.js';
import { BUSCA_MENSAGENS } from './shared/lib/esquemaBusca.js';
import type { RespostaListaUploads, UploadZipRegistro, RespostaUploadZipOk, RespostaEnviarMensagem, StatusMensagemEnviada, RespostaLoginOk, RespostaSessaoAtual, RespostaSucesso, UsuarioAdmin, RespostaListaUsuarios, RespostaAuditLogs, RespostaLogsServidor, RespostaListaVendedores, RespostaVendedorCriado, RespostaLoteVendedores, RespostaVendedorAtualizado, RespostaSenhaVendedor, RespostaVendedorStatus, RespostaRoletaConfig, RespostaDistribuicaoRoleta, RespostaListaEtiquetas, RespostaEtiquetaSalva, RespostaOk, RespostaListaNotas, RespostaNotaCriada, RespostaResolucao, RespostaAuditoriaSite, RespostaAtualizacaoLead, RespostaResumoLead, RespostaListaLigacoes, RespostaLigacaoRegistrada, RespostaListaLigacoesGerais, RespostaListaLeads, RespostaListaRespostasRapidas, RespostaRespostaRapidaCriada, RespostaRespostaRapidaExcluida, RespostaStatusMeta, RespostaContasMeta, RespostaSincronizacaoConta, RespostaSincronizacaoTodas, RespostaMetaRemovida, RespostaConfigFluxo, RespostaStatusFluxo, RespostaEventosFluxo, RespostaModoInstancia, RespostaListaModelosFluxo, RespostaSincronizacaoModelos, RespostaModeloCriado, RespostaInstanciasFluxo, RespostaCadastroContaOk, RespostaConfigEmbeddedSignup, RespostaEmbeddedSignupConcluido, RespostaLeituraMeta, RespostaCriacaoInstancia, RespostaEnvioTesteSucesso, RespostaDistribuicaoLeads, RespostaEstatisticasVendedor, RespostaTransferenciaLote, RespostaListaCopias, RespostaCopiaSalva, RespostaCopiaRemovida, RespostaListaLotes, RespostaVelocidadeDisparo, RespostaAlteracaoVelocidade, RespostaAcaoLote, RespostaCancelamentoLote, RespostaLiberacaoQuarentena, RespostaDevolucaoLeads, RespostaRetornoQuarentena, RespostaResetSafra, LoteCampanha, ProgressoLote, RespostaDisparo, RespostaTesteDisparo, RespostaStatusTesteDisparo, RespostaSincronizacaoWhatsApp, RespostaListaLeadsCampanha, RespostaCamposLead, RespostaImportacaoIniciada, ProgressoImportacao, RespostaApagarZipsEmLote, RespostaApagarZip, RespostaInbox, RespostaBuscaMensagens, RespostaMensagensLead, RespostaRecuperacao, RespostaAtualizacaoLoteLeads, RespostaLoteLeads, RespostaExclusaoLote, RespostaCliquesLink, RespostaSalvarConfigFluxo, RespostaTesteConexaoFluxo, RespostaRuntimeConfig, RespostaEventoSimulado, RespostaJanelaLead, RespostaPresenca, RespostaLeituraMarcada, RespostaCatalogoModelosMeta, RespostaSimulacaoWebhook, RespostaLigacoesRecentesVendedor, RespostaImportacaoZipDireta, RespostaSementes, RespostaAcaoSimulada, RespostaDistribuicaoCampanha, RespostaRespostaSimulada, RespostaStatusInfraestrutura, RespostaSaudeBasica, RespostaSaudeSimples, RespostaWebhookJaProcessado, RespostaWebhookRecebido, RespostaZipEnfileirado, RespostaLeituraNaoMarcada, RequisicaoDistribuicaoRoleta } from './shared/contracts/rotas.js';
import type { InboxConversation } from './shared/types.js';
import { registerAutomacoesRoutes, applyAutomacoesMigration, applyAutomacoesEstadoMigration, applyAutomacoesFilaMigration, automacoesPersistenciaOn, iniciarWorkerAutomacoes } from './shared/lib/automacoesRoutes.js';
import { registrarEventoCliente, registrarEventoGeral, pedidoDePararPelasRegras, pedidoDeAlertaPelasRegras, type ItemFila } from './shared/lib/automacoesExecucao.js';
import type { EventoV } from './shared/lib/automacoes.js';
import type { ContextoEvento } from './shared/lib/automacoesExecucao.js';
import { registerBackupRoutes } from './shared/lib/backupRoutes.js';
import { hashPassword, verifyPassword, generateSessionToken, DEFAULT_USERS, StoredUser, isUserAdmin } from './shared/lib/serverAuth.js';
import { performWebsiteAudit } from './shared/lib/auditEngine.js';
import { missingFluxoVars, summarizeFluxoInstance } from './shared/lib/fluxoInstanceStatus.js';
import { buildLeadVariables } from './shared/lib/templateCopy.js';
import { buildFluxoAudioMedia, isFluxoAudioVoiceEnabled, uploadFluxoAudioMedia } from './shared/lib/fluxoAudio.js';
import { installLogBuffer, readLogs, logCategories } from './shared/lib/logBuffer.js';
installLogBuffer();
import { executeFluxoRequest, downloadFluxoMediaBinary, prepareOutboundMedia, fluxoInstancePath, hasFfmpeg } from './shared/lib/fluxoClient.js';
import { setMetaRegistry, listMetaRegistry, encryptMetaToken, decryptMetaToken, metaDownloadMedia, metaSyncAccount, metaValidateToken, resolveMetaAccount, receivingPhoneNumberId, parseCoexistenceEchoes, getEmbeddedSignupConfig, metaExchangeSignupCode, metaSubscribeWaba, metaDiscoverWabaIds, type MetaAccountRecord, type MetaNumberRecord } from './shared/lib/metaClient.js';
import type { FluxoApiResult } from './shared/lib/fluxoClient.js';
import { verifyFluxoWebhook } from './shared/lib/webhookAuth.js';
import { sanitizeTemplateVariable, resolveManualInterest, SEM_INTERESSE_TAG } from './shared/lib/leadIntent.js';
import { distributionByCount } from './shared/lib/distribution.js';
import { getMetaProvider, getMetaCredentials, verifyMetaSignature, metaSendText, metaSendTemplate, metaSendMedia, metaMarkRead, metaCreateTemplate, metaDeleteTemplate, metaListPhoneNumbers, metaListTemplates } from './shared/lib/metaClient.js';
import { listExtraFieldKeys, normalizeFieldKey, TOKEN_NAMES } from './shared/lib/leadTokens.js';
import { validateTemplateCategory, buildMetaButtons, defaultExamples as neutralExamples, validateTemplateVariables } from './shared/lib/templateRules.js';
import { arePhonesEquivalent, normalizeE164Phone, phoneDigitVariants, formatAndValidateE164Phone } from './shared/lib/phone.js';
import { getUploadsDir, getInboxDir, INBOX_SUBDIR, isUploadsDirDurable, publicBaseUrl, saveMediaBuffer, extensionFor } from './shared/lib/mediaStorage.js';
import { statusRank, shouldApplyStatus, normalizeStatus } from './shared/lib/fluxoStatus.js';
import { describeFluxoError } from './shared/lib/fluxoErrors.js';
import { buildTemplatePayload, type CatalogTemplate, type TemplateValues } from './shared/lib/fluxoTemplate.js';
import { WINDOW_MS, windowExpiryFromInbound, latestExpiry, isWindowOpen } from './shared/lib/windowUtil.js';
import { effectiveSpeedPerSecond, maxDispatchPerSecond, dispatchRpm, planRpm, FluxoRateLimitedError } from './shared/lib/dispatchRate.js';
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
  removeBatchWaitingJobs,
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

// Pasta de mídia (UPLOADS_DIR > volume da Railway > ./uploads). Ver shared/lib/mediaStorage.ts
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
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    // Nota de voz do WhatsApp: OGG com Opus. Sem o parâmetro codecs a Meta pode tratar como arquivo comum.
    if (filePath.toLowerCase().endsWith('.ogg')) {
      res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
    }
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

// Link de rastreio por lead: o CRM registra o clique e redireciona para o site do cliente.
const TRACKING_BASE_URL = (process.env.PUBLIC_APP_URL || 'https://nyroh-crm-production-fedd.up.railway.app').replace(/\/$/, '');
async function trackedLinkFor(leadId: string, targetUrl: string): Promise<string> {
  const destino = String(targetUrl || '').trim();
  if (!destino || !/^https?:\/\//i.test(destino) || !usePostgres || !pgPool) return destino;
  try {
    const token = crypto.randomBytes(9).toString('base64url');
    await pgPool.query('INSERT INTO link_clicks (token, lead_id, target_url) VALUES ($1, $2, $3)', [token, leadId, destino]);
    return `${TRACKING_BASE_URL}/r/${token}`;
  } catch (err) {
    console.warn('[Rastreio] não consegui criar o link de rastreio; usando o link direto.', err);
    return destino;
  }
}

app.get('/r/:token', async (req: any, res) => {
  const token = String(req.params.token || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!token || !usePostgres || !pgPool) return res.status(404).send('Link não encontrado.');
  try {
    const r = await pgPool.query(
      `UPDATE link_clicks
          SET click_count = click_count + 1,
              last_clicked_at = now(),
              first_clicked_at = COALESCE(first_clicked_at, now())
        WHERE token = $1
    RETURNING target_url`,
      [token]
    );
    if (r.rowCount === 0) return res.status(404).send('Link não encontrado.');
    return res.redirect(302, r.rows[0].target_url);
  } catch (err) {
    console.error('Erro no link de rastreio:', err);
    return res.status(500).send('Erro ao abrir o link.');
  }
});

// Quem clicou (admin): leads com pelo menos um clique, do mais recente para o mais antigo.
app.get('/api/campaign/link-clicks', async (req: any, res) => {
  if (!isUserAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
  if (!usePostgres || !pgPool) return res.json({ clicks: [] } satisfies RespostaCliquesLink);
  try {
    const r = await pgPool.query(
      `SELECT c.token, c.lead_id, c.target_url, c.click_count, c.first_clicked_at, c.last_clicked_at,
              l.name, l.phone_number
         FROM link_clicks c
         LEFT JOIN campaign_leads l ON l.id = c.lead_id
        WHERE c.click_count > 0
        ORDER BY c.last_clicked_at DESC
        LIMIT 200`
    );
    res.json({ clicks: r.rows } satisfies RespostaCliquesLink);
  } catch (err) {
    console.error('Erro ao listar cliques:', err);
    res.status(500).json({ error: 'Erro ao listar cliques.' });
  }
});

app.get('/api/health', (req, res) => {
  // /health (acima) continua respondendo na hora para o healthcheck da Railway; aqui o estado do banco, para monitoramento
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), database: { connected: usePostgres, starting: isDatabaseStarting() } } satisfies RespostaSaudeBasica);
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
// O formato do progresso mora em shared/contracts/rotas.ts (ProgressoImportacao).
export type CampaignImportProgress = ProgressoImportacao;

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
  { id: SEM_INTERESSE_TAG.id, name: SEM_INTERESSE_TAG.name, color: SEM_INTERESSE_TAG.color, bgColor: SEM_INTERESSE_TAG.bgColor },
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
  verifyToken: process.env.META_VERIFY_TOKEN || ''
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
  rawData?: Record<string, string> | null;
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
  metaTemplateName?: string | null;
  values?: Record<string, string>;
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
        // Esquema base (DDL) pelo runner de migrações (item 2.2a). Ver shared/lib/esquemaBase.ts.
        await aplicarMigracoes(client, [ESQUEMA_BASE]);

        // Dados e ajustes pontuais que continuam no boot (item 2.2b).
        await client.query(`
-- Seed default primary salesperson (Thomas)
          INSERT INTO salespeople (id, name, email, color, bg_color, is_default)
          VALUES ('seller-thomas', 'Thomas', 'thomas@empresa.com', '#0284c7', '#e0f2fe', TRUE)
          ON CONFLICT (id) DO NOTHING;
-- Backfill any leads without a salesperson
          UPDATE leads 
          SET salesperson_id = 'seller-thomas', salesperson_name = 'Thomas'
          WHERE salesperson_id IS NULL OR salesperson_id = '';
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
-- Desfazer restrição NOT NULL em phone_number se existir
          DO $$ 
          BEGIN 
            BEGIN
              ALTER TABLE lead_messages ALTER COLUMN phone_number DROP NOT NULL;
EXCEPTION 
              WHEN undefined_column THEN NULL;
END;
END $$;
-- Atualiza phone_clean retroativamente nos leads existentes
          UPDATE leads 
          SET phone_clean = regexp_replace(phone_number, '\D', '', 'g')
          WHERE (phone_clean IS NULL OR phone_clean = '') AND phone_number IS NOT NULL;
        `);

        // Views de compatibilidade pelo runner de migrações (item 2.2a-2 a). Ver shared/lib/esquemaViews.ts.
        try {
          await aplicarMigracoes(client, [VIEWS_COMPATIBILIDADE]);
        } catch (viewErr: any) {
          console.warn('[PostgreSQL Views] Aviso ao criar views relacionais de compatibilidade:', viewErr?.message);
        }

        // Notas internas da conversa (só a equipe vê; o cliente nunca) e marcação de "resolvida".
        // Notas internas e "resolvida" pelo runner de migrações (item 2.2a-2 b). Ver shared/lib/esquemaNotas.ts.
        try {
          await aplicarMigracoes(client, [NOTAS_E_RESOLVIDA]);
        } catch (notasErr: any) {
          console.warn('[PostgreSQL] Aviso ao aplicar notas/resolvida:', notasErr?.message);
        }
        // Índice de busca no histórico de mensagens pelo runner (item 2.2a-2 d). Ver shared/lib/esquemaBusca.ts.
        try {
          await aplicarMigracoes(client, [BUSCA_MENSAGENS]);
        } catch (buscaErr: any) {
          console.warn('[PostgreSQL] Aviso ao aplicar índice de busca:', buscaErr?.message);
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
          await aplicarMigracoes(client, [CAIXA_DE_ENTRADA]);

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
        if (uxSchemaOn()) { await applyUxMigration(pool).catch((e: any) => console.error('[UX] migração falhou:', e?.message)); }
        if (automacoesPersistenciaOn()) { await applyAutomacoesMigration(pool).catch((e: any) => console.error('[AUTOMACOES] migração falhou:', e?.message)); }
        if (automacoesPersistenciaOn()) { await applyAutomacoesEstadoMigration(pool).catch((e: any) => console.error('[AUTOMACOES] estado/etiquetas/configuração falhou:', e?.message)); }
        if (process.env.NYROH_AUTOMACOES_EXECUCAO === 'true') { await applyAutomacoesFilaMigration(pool).catch((e: any) => console.error('[AUTOMACOES] fila falhou:', e?.message)); }
        if (process.env.NYROH_AUTOMACOES_EXECUCAO === 'true') iniciarWorkerAutomacoes(pool, { carregarRegras: carregarRegrasAutomacoes, gravarFila: gravarFilaAutomacoes });
        await loadMetaRegistryFromDb().catch((e: any) => console.error('[Meta] falha ao carregar contas:', e?.message));
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
  } satisfies RespostaSaudeSimples);
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
async function carregarRegrasAutomacoes() {
  if (!usePostgres || !pgPool) return [];
  const r = await pgPool.query(`SELECT id, status, definicao FROM automacoes_respostas WHERE status = 'ativa'`);
  return r.rows.map((x: any) => ({ id: x.id, status: x.status, def: x.definicao }));
}

/** Dispara um evento de automação para um lead (etiqueta, status, funil). Sem flag, não faz nada. Não bloqueia a resposta. */
function emitirEventoLead(evento: EventoV, leadId: string, contexto: ContextoEvento): void {
  if (!usePostgres || !pgPool) return;
  registrarEventoGeral(evento, leadId, contexto, new Date(), { carregarRegras: carregarRegrasAutomacoes, gravarFila: gravarFilaAutomacoes })
    .catch((e: any) => console.warn('[AUTOMACOES] evento não agendado:', e?.message));
}

async function gravarFilaAutomacoes(itens: ItemFila[]) {
  if (!usePostgres || !pgPool) return;
  for (const it of itens) {
    await pgPool.query(
      `INSERT INTO automacoes_fila (id, automacao_id, lead_id, passo_ordem, acao, texto, executar_em, condicoes, limites, params, evento_em) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [it.id, it.automacaoId, it.leadId, it.passoOrdem, it.acao, it.texto, it.executarEm.toISOString(), JSON.stringify(it.condicoes ?? []), it.limites ? JSON.stringify(it.limites) : null, it.params ? JSON.stringify(it.params) : null, it.eventoEm ?? null]
    );
  }
}

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

// S1: com NYROH_EXIGIR_CONFIG=true, recusa subir se faltar variável obrigatória.
// Desligada por padrão: sem a chave, o comportamento continua o mesmo de sempre.
if (process.env.NYROH_EXIGIR_CONFIG === 'true') {
  const faltandoConfig = variaveisFaltando(process.env, IS_PRODUCTION ? 'production' : 'development');
  if (faltandoConfig.length > 0) {
    console.error(`\n[CONFIG] ${mensagemFaltando(faltandoConfig)}\n[CONFIG] Subida recusada (NYROH_EXIGIR_CONFIG=true).\n`);
    process.exit(1);
  }
}

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
// B6 Auth e usuários administrativos: rotas em shared/lib/rotas/auth.ts (item 4.1 f3).
configurarAuth({
    get IS_PRODUCTION() { return IS_PRODUCTION; },
    get LOGIN_WINDOW_MS() { return LOGIN_WINDOW_MS; },
    get MIN_PASSWORD_LENGTH() { return MIN_PASSWORD_LENGTH; },
    get SESSION_TTL_MS() { return SESSION_TTL_MS; },
    get VALID_ROLES() { return VALID_ROLES; },
    get getSalespersonCredentials() { return getSalespersonCredentials; },
    get hashSessionToken() { return hashSessionToken; },
    get isLoginBlocked() { return isLoginBlocked; },
    get logAudit() { return logAudit; },
    get loginFailures() { return loginFailures; },
    get loginKey() { return loginKey; },
    get memoryAuditLogs() { return memoryAuditLogs; },
    get memorySessionsMap() { return memorySessionsMap; },
    get memoryUsersMap() { return memoryUsersMap; },
    get pgPool() { return pgPool; },
    get registerLoginFailure() { return registerLoginFailure; },
    get syncSalespeopleUsers() { return syncSalespeopleUsers; },
    get usePostgres() { return usePostgres; },
});
registrarAuth(app);

// --------------------------------------------------------------------------
// 7.1 WHATSAPP CLOUD API OFICIAL (FLUXOAPI) - ENDPOINTS
// --------------------------------------------------------------------------

// B6 Fluxo e Meta administrativos: rotas em shared/lib/rotas/fluxoMeta.ts (item 4.1 f2).
configurarFluxoMeta({
    get IS_PRODUCTION() { return IS_PRODUCTION; },
    get SIMULATORS_ENABLED() { return SIMULATORS_ENABLED; },
    get coexistenceSeen() { return coexistenceSeen; },
    get fetchMetaGraphTemplates() { return fetchMetaGraphTemplates; },
    get fluxoCatalogCache() { return fluxoCatalogCache; },
    setFluxoCatalogCache(valor: any) { fluxoCatalogCache = valor; },
    get getInstanceInfo() { return getInstanceInfo; },
    get lastFluxoWebhookEvents() { return lastFluxoWebhookEvents; },
    get loadMetaRegistryFromDb() { return loadMetaRegistryFromDb; },
    get metaToFluxoResult() { return metaToFluxoResult; },
    get memoryFluxoConfig() { return memoryFluxoConfig; },
    get memoryMetaConfig() { return memoryMetaConfig; },
    get memoryTemplates() { return memoryTemplates; },
    get normalizeMetaGraphTemplate() { return normalizeMetaGraphTemplate; },
    get pgPool() { return pgPool; },
    get usePostgres() { return usePostgres; },
    get sendTemplateViaFluxo() { return sendTemplateViaFluxo; },
    get syncMetaAccountIntoDb() { return syncMetaAccountIntoDb; },
    get logAudit() { return logAudit; },
});
registrarFluxoMeta(app);





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

  // Nome oficial do template aprovado na Meta (sempre escolhido pelo operador)
  const effectiveMetaTemplate = String(metaTemplateName || templateName || '').trim();

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
    // Aceita qualquer quantidade de variáveis ({{1}}, {{2}}, ...) e mantém var1..var3 como antes
    resolvedVariables = {};
    for (const k of Object.keys(variables)) {
      if (/^\d+$/.test(k)) resolvedVariables[k] = String(variables[k] ?? '').trim();
    }
    for (const n of ['1', '2', '3']) {
      if (!resolvedVariables[n]) resolvedVariables[n] = String(variables[`var${n}`] || '').trim();
    }
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

  // Sem texto padrão: variável vazia continua vazia e o envio informa qual falta (nada fixo é enviado)

  // Montar texto completo da mensagem para o histórico do chat
  const renderedFullText = messageText || (
    `Ei, ${resolvedVariables['1']}\n\n${resolvedVariables['2']}\n\n${resolvedVariables['3']}\n\nClique no botão abaixo para acessar:`
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

  if ((apiKey && apiSecret) || getMetaProvider() === 'meta') {
    try {
      if (dispatchMode === 'direct_text') {
        // Modo de envio direto de texto puro
        const targetPath = fluxoInstancePath('/messages', instanceId);
        const fRes = getMetaProvider() === 'meta'
          ? metaToFluxoResult(await metaSendText(formattedE164, renderedFullText, String(req.body?.phoneNumberId || '').trim() || undefined))
          : await executeFluxoRequest({
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
          phoneNumberId: String(req.body?.phoneNumberId || '').trim() || undefined,
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

  // Só é sucesso se a FluxoAPI/Meta realmente aceitou o envio (antes sempre dizia sucesso)
  const dispatchOk = dispatchResult?.success === true;
  if (!dispatchOk) {
    const motivo = dispatchResult?.error
      || dispatchResult?.data?.error?.message
      || dispatchResult?.data?.message
      || (dispatchResult?.status ? `Erro HTTP ${dispatchResult.status} ao enviar o modelo` : 'A Fluxo/Meta não aceitou o envio');
    console.warn('[Test Dispatch] Envio não saiu:', motivo, JSON.stringify(dispatchResult).slice(0, 800));
    return res.json({
      success: false,
      error: `O teste não saiu: ${motivo}`,
      lead: createdLead,
      outgoingMessage,
      dispatchResult
    } satisfies RespostaTesteDisparo);
  }

  return res.json({
    success: true,
    message: 'Disparo de teste executado com sucesso!',
    lead: createdLead,
    outgoingMessage,
    dispatchResult
  } satisfies RespostaTesteDisparo);
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
    } satisfies RespostaStatusTesteDisparo);
  }

  return res.json({
    success: true,
    messageId,
    deliveryStatus: 'queued',
    message: 'Mensagem ainda na fila de processamento da Meta (aguardando confirmação).'
  } satisfies RespostaStatusTesteDisparo);
});

// GET Webhook Events

// ============================================================================
// MULTI-BM / MULTI-NÚMERO: contas (BM/WABA) cadastradas no CRM
// ============================================================================
// Número (phone_number_id) que recebeu a conversa: responder e marcar leitura saem por ele (multi-número)
const memoryLeadMetaRoute = new Map<string, string>();
async function setLeadMetaRoute(leadId: string, phoneNumberId: string) {
  memoryLeadMetaRoute.set(leadId, phoneNumberId);
  if (!usePostgres || !pgPool) return;
  await pgPool.query(
    `INSERT INTO lead_meta_routes (lead_id, phone_number_id, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (lead_id) DO UPDATE SET phone_number_id = EXCLUDED.phone_number_id, updated_at = CURRENT_TIMESTAMP`,
    [leadId, phoneNumberId]
  ).catch((e: any) => console.warn('[Meta] falha ao gravar rota da conversa:', e?.message));
}
async function getLeadMetaRoute(leadId: string): Promise<string | undefined> {
  if (memoryLeadMetaRoute.has(leadId)) return memoryLeadMetaRoute.get(leadId);
  if (!usePostgres || !pgPool) return undefined;
  const r = await pgPool.query('SELECT phone_number_id FROM lead_meta_routes WHERE lead_id = $1', [leadId]).catch(() => null);
  const pid = r?.rows?.[0]?.phone_number_id as string | undefined;
  if (pid) memoryLeadMetaRoute.set(leadId, pid);
  return pid;
}

async function loadMetaRegistryFromDb() {
  if (!usePostgres || !pgPool) return;
  const accRes = await pgPool.query('SELECT id, name, waba_id, business_id, access_token_enc FROM meta_accounts ORDER BY created_at ASC');
  const numRes = await pgPool.query('SELECT phone_number_id, account_id, display_phone_number, verified_name, quality_rating, status FROM meta_numbers');
  const accounts: MetaAccountRecord[] = [];
  for (const row of accRes.rows) {
    try {
      accounts.push({ id: row.id, name: row.name, wabaId: row.waba_id, businessId: row.business_id, accessToken: decryptMetaToken(row.access_token_enc) });
    } catch (err: any) {
      // Chave de criptografia trocada ou token corrompido: a conta fica fora do roteamento, sem derrubar o resto.
      console.error(`[Meta] conta ${row.id} não pôde ser descriptografada:`, err?.message);
    }
  }
  const numbers: MetaNumberRecord[] = numRes.rows.map((r: any) => ({
    phoneNumberId: r.phone_number_id,
    accountId: r.account_id,
    displayPhoneNumber: r.display_phone_number,
    verifiedName: r.verified_name,
    qualityRating: r.quality_rating,
    status: r.status
  }));
  setMetaRegistry(accounts, numbers);
}

async function syncMetaAccountIntoDb(accountId: string): Promise<{ success: boolean; error?: string; numbers: number; templates: number }> {
  if (!pgPool || !usePostgres) return { success: false, error: 'Banco indisponível.', numbers: 0, templates: 0 };
  const full = await pgPool.query('SELECT name, waba_id, access_token_enc FROM meta_accounts WHERE id = $1', [accountId]);
  if (full.rows.length === 0) return { success: false, error: 'Conta não encontrada.', numbers: 0, templates: 0 };
  const token = decryptMetaToken(full.rows[0].access_token_enc);
  const { phones, templates } = await metaSyncAccount({ id: accountId, name: full.rows[0].name, wabaId: full.rows[0].waba_id, accessToken: token });
  if (!phones.success) return { success: false, error: phones.error || 'Falha ao listar números', numbers: 0, templates: 0 };

  const list: any[] = phones.data?.data || [];
  for (const n of list) {
    await pgPool.query(
      `INSERT INTO meta_numbers (phone_number_id, account_id, display_phone_number, verified_name, quality_rating, status, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (phone_number_id) DO UPDATE SET account_id = EXCLUDED.account_id, display_phone_number = EXCLUDED.display_phone_number,
         verified_name = EXCLUDED.verified_name, quality_rating = EXCLUDED.quality_rating, status = EXCLUDED.status, synced_at = CURRENT_TIMESTAMP`,
      [n.id, accountId, n.display_phone_number || null, n.verified_name || null, n.quality_rating || null, n.status || null]
    );
  }
  // Remove números que sumiram da BM
  const ids = list.map(n => n.id);
  await pgPool.query('DELETE FROM meta_numbers WHERE account_id = $1 AND NOT (phone_number_id = ANY($2::text[]))', [accountId, ids]);

  // Status de aprovação dos modelos desta BM
  let tplCount = 0;
  if (templates.success) {
    for (const t of templates.data?.data || []) {
      tplCount++;
      await pgPool.query(
        `UPDATE meta_templates SET status = $1, rejected_reason = $2, updated_at = CURRENT_TIMESTAMP WHERE LOWER(name) = LOWER($3)`,
        [String(t.status || 'PENDING'), t.rejected_reason || null, t.name]
      );
    }
  }
  await loadMetaRegistryFromDb();
  return { success: true, numbers: list.length, templates: tplCount };
}













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
  optOutPorBotao?: boolean;
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
  // só depois entra no cache em memória. Item 3.1 d: clique de descadastro não grava balão.
  if (usePostgres && pgPool && !params.optOutPorBotao) {
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
  if (!params.optOutPorBotao && !currentList.some(m => m.id === incomingMessage.id)) currentList.push(incomingMessage);
  memoryLeadMessagesMap.set(targetId!, currentList);

  // Detecção de descadastro por PALAVRA INTEIRA.
  //
  // Antes era `texto.includes('pare')`, então "parece ótimo, quanto custa?" era lido como
  // pedido de descadastro e o lead quente saía do funil. Agora "pare" só conta quando é a
  // palavra "pare" de verdade ("remover" não dispara dentro de "removeram", etc.).
  // Opt-out: palavras vêm só das automações ativas no JSON (gatilho "pediu para parar").
  const regrasParaParar = await carregarRegrasAutomacoes().catch(() => []);
  const isOptOut = params.optOutPorBotao ?? pedidoDePararPelasRegras(String(effectiveText || ''), regrasParaParar);
  // Palavra de alerta: também só do JSON (gatilho "cliente_ameacou"). Usada só pela automação.
  const isAlerta = pedidoDeAlertaPelasRegras(String(effectiveText || ''), regrasParaParar);

  // Qualquer resposta do lead (exceto opt-out explícito) é engajamento e demonstra interesse ativo
  const isPositiveInterest = !isOptOut;

  // Automações de resposta: só agenda na fila com NYROH_AUTOMACOES_EXECUCAO=true (padrão: desligada).
  // Nunca envia. Não aguarda o resultado, para não atrasar o recebimento da mensagem.
  registrarEventoCliente(
    { leadId: String(matched?.id ?? targetId ?? ''), texto: String(effectiveText || ''), optout: isOptOut, alerta: isAlerta },
    new Date(),
    { carregarRegras: carregarRegrasAutomacoes, gravarFila: gravarFilaAutomacoes }
  ).catch((e: any) => console.warn('[AUTOMACOES] não agendei a resposta:', e?.message));

  if (isOptOut && targetId) await confirmarDescadastroSeLigada({ telefone: cleanPhone, enviarTexto: (t, x) => enviarTextoFluxo(t, x, { apiKey: (memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim(), apiSecret: (memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim(), instanceId: memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '' }) }).catch((e: any) => console.warn('[descadastro] confirmação não enviada:', e?.message)); // item 3.2, desligado por padrão
  // FASE 2: quem pediu descadastro recebe a tag "Sem interesse" (atrás de flag, desligada por padrão).
  if (isOptOut && matched && process.env.NYROH_TAG_SEM_INTERESSE === 'true') {
    const taggedLead = memoryLeadsMap.get(matched.id);
    if (taggedLead) taggedLead.lastCallTag = SEM_INTERESSE_TAG.name;
    if (usePostgres && pgPool) {
      try {
        await pgPool.query(
          `INSERT INTO custom_tags (id, name, color, bg_color) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING`,
          [SEM_INTERESSE_TAG.id, SEM_INTERESSE_TAG.name, SEM_INTERESSE_TAG.color, SEM_INTERESSE_TAG.bgColor]
        );
        await pgPool.query(`UPDATE leads SET last_call_tag = $1 WHERE id = $2`, [SEM_INTERESSE_TAG.name, matched.id]);
      } catch (tagErr: any) {
        console.warn('[fase2] não consegui aplicar a tag Sem interesse:', tagErr?.message);
      }
    }
  }

  // Atualizar estágio do lead caso encontrado
  if (matched) {
    if (isPositiveInterest) emitirEventoLead('status_mudou', matched.id, { status: 'INTERESSADO' });
    else if (isOptOut) emitirEventoLead('status_mudou', matched.id, { status: 'DESCARTADO' });
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

  if (!params.optOutPorBotao) { // notifica painéis em tempo real; clique de descadastro (3.1 d) não vira balão
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
  if (targetId) broadcastToLead(targetId, 'new_message', incomingMessage);
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
// B1 webhooks: rotas em shared/lib/rotas/webhooks.ts (item 4.1 a).
configurarRotasWebhooks({
    get IS_PRODUCTION() { return IS_PRODUCTION; },
    get TransientProcessingError() { return TransientProcessingError; },
    get applyMessageStatus() { return applyMessageStatus; },
    get broadcastSSE() { return broadcastSSE; },
    get coexistenceSeen() { return coexistenceSeen; },
    get enqueueIncomingWebhook() { return enqueueIncomingWebhook; },
    get lastFluxoWebhookEvents() { return lastFluxoWebhookEvents; },
    get memoryMetaConfig() { return memoryMetaConfig; },
    get memoryTemplates() { return memoryTemplates; },
    get metaDownloadMedia() { return metaDownloadMedia; },
    get parseCoexistenceEchoes() { return parseCoexistenceEchoes; },
    get pgPool() { return pgPool; },
    get processDeliveryStatusUpdate() { return processDeliveryStatusUpdate; },
    get processIncomingWhatsAppMessage() { return processIncomingWhatsAppMessage; },
    get processOutboundPhoneMessage() { return processOutboundPhoneMessage; },
    get requireDatabaseReady() { return requireDatabaseReady; },
    get saveMediaBuffer() { return saveMediaBuffer; },
    get setLeadMetaRoute() { return setLeadMetaRoute; },
    get usePostgres() { return usePostgres; },
    get verifyFluxoWebhook() { return verifyFluxoWebhook; },
    get verifyMetaSignature() { return verifyMetaSignature; },
});
registrarRotasWebhooks(app);

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
      } satisfies RespostaEstatisticasVendedor);
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
      } satisfies RespostaEstatisticasVendedor);
    }
  } catch (err: any) {
    console.error('Erro ao buscar stats do vendedor:', err);
    return res.json({ salespersonId: id, recentCalls: [] } satisfies RespostaLigacoesRecentesVendedor);
  }
});

// API ROUTES

// B5 conversas: rotas em shared/lib/rotas/conversas.ts (item 4.1 e).
configurarConversas({
    get applyPendingStatus() { return applyPendingStatus; },
    get broadcastPresenceIfChanged() { return broadcastPresenceIfChanged; },
    get broadcastSSE() { return broadcastSSE; },
    get broadcastSocketEvent() { return broadcastSocketEvent; },
    get extractRemoteMessageId() { return extractRemoteMessageId; },
    get findLeadTarget() { return findLeadTarget; },
    get getLeadMetaRoute() { return getLeadMetaRoute; },
    get getTemplateDefinition() { return getTemplateDefinition; },
    get inFlightClientSends() { return inFlightClientSends; },
    get lastReadMarkAt() { return lastReadMarkAt; },
    get memoryCampaignLeadsMap() { return memoryCampaignLeadsMap; },
    get memoryFluxoConfig() { return memoryFluxoConfig; },
    get memoryLeadMessagesMap() { return memoryLeadMessagesMap; },
    get memoryLeadsMap() { return memoryLeadsMap; },
    get metaToFluxoResult() { return metaToFluxoResult; },
    get pgPool() { return pgPool; },
    get presenceByLead() { return presenceByLead; },
    get presenceSnapshot() { return presenceSnapshot; },
    get realCaption() { return realCaption; },
    get requireDatabaseReady() { return requireDatabaseReady; },
    get resolveLeadWindowExpiry() { return resolveLeadWindowExpiry; },
    get sendBodyViaMeta() { return sendBodyViaMeta; },
    get usePostgres() { return usePostgres; },
});
registrarConversas(app);


// B3 leads: rotas em shared/lib/rotas/leads.ts (item 4.1 c).
configurarLeads({
    get emitirEventoLead() { return emitirEventoLead; },
    get memoryCallLogsMap() { return memoryCallLogsMap; },
    get memoryLeadsMap() { return memoryLeadsMap; },
    get pgPool() { return pgPool; },
    get usePostgres() { return usePostgres; },
});
registrarLeads(app);


// B6 vendedores, etiquetas e respostas rápidas: rotas em shared/lib/rotas/vendedores.ts (item 4.1 f).
configurarVendedores({
    get MIN_PASSWORD_LENGTH() { return MIN_PASSWORD_LENGTH; },
    get assignLeadViaRoulette() { return assignLeadViaRoulette; },
    get broadcastSSE() { return broadcastSSE; },
    get getSalespersonCredentials() { return getSalespersonCredentials; },
    get isAdminSalesperson() { return isAdminSalesperson; },
    get logAudit() { return logAudit; },
    get memoryCallLogsMap() { return memoryCallLogsMap; },
    get memoryLeadsMap() { return memoryLeadsMap; },
    get memoryQuickRepliesMap() { return memoryQuickRepliesMap; },
    get memorySalespeopleMap() { return memorySalespeopleMap; },
    get memoryTagsMap() { return memoryTagsMap; },
    get memoryUsersMap() { return memoryUsersMap; },
    get pgPool() { return pgPool; },
    get usePostgres() { return usePostgres; },
});
registrarVendedores(app);



// SALESPEOPLE (VENDEDORES) ENDPOINTS









// 3.2.2 Live Website Audit Endpoint (Instantâneo, Sem IA)
// B6 Leads restantes: rotas em shared/lib/rotas/leadsRestantes.ts (item 4.1 f4).
configurarLeadsRestantes({
    get emitirEventoLead() { return emitirEventoLead; },
    get extractLegacyWebsite() { return extractLegacyWebsite; },
    get getOnlyDigits() { return getOnlyDigits; },
    get logAudit() { return logAudit; },
    get mapToColumnStatus() { return mapToColumnStatus; },
    get memoryCallLogsMap() { return memoryCallLogsMap; },
    get memoryLeadsMap() { return memoryLeadsMap; },
    get memorySalespeopleMap() { return memorySalespeopleMap; },
    get pgPool() { return pgPool; },
    get processLeadItems() { return processLeadItems; },
    get usePostgres() { return usePostgres; },
});
registrarLeadsRestantes(app);

// 3.3 Batch assign leads to a salesperson


// 5. Assign a single lead to a salesperson

// 6. DISTRIBUTE UNCONTACTED LEADS (DIVISÃO DE LEADS)
// RULE: ONLY leads in column 'Leads' with 0 calls are eligible. Leads in progress are NEVER moved.

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
        const weight = distributionByCount() ? 1 : leadType === 'interessado'
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
        const weight = distributionByCount() ? 1 : leadType === 'interessado'
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
                AND (o.whatsapp_message_id IS NOT NULL OR o.status = 'INTERESSADO')
                AND ${digits('o.phone_number')} = ${digits('cl.phone_number')}
            )
            OR EXISTS (
              SELECT 1 FROM leads l
              WHERE (l.sub_status ILIKE '%Disparo%' OR l.last_call_tag = 'WhatsApp Enviado')
                AND EXISTS (
                  SELECT 1 FROM lead_messages m
                  WHERE m.lead_id = l.id AND m.whatsapp_message_id IS NOT NULL
                )
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
async function processLeadItems(items: any[], remessaNome?: string) {
  const remessaId = remessaNome && usePostgres && pgPool ? await abrirRemessa(pgPool, remessaNome).catch(() => null) : null;
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

      if (remessaId) {
        await pgPool.query(`UPDATE leads SET remessa_id = COALESCE(remessa_id, $1) WHERE id = $2`, [remessaId, leadId]).catch(() => {});
      }
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

// --------------------------------------------------------------------------
// RECOVERY ENDPOINT: Varre o banco e recupera sites reais para leads sem site
// --------------------------------------------------------------------------

// B2 uploads e importação: rotas em shared/lib/rotas/uploads.ts (item 4.1 b).
configurarRotasUploads({
    get broadcastSSE() { return broadcastSSE; },
    get bulkInsertCampaignLeads() { return bulkInsertCampaignLeads; },
    get campaignImportProgressMap() { return campaignImportProgressMap; },
    get classifyPhoneNumber() { return classifyPhoneNumber; },
    get diskUpload() { return diskUpload; },
    get enqueueZipImportJob() { return enqueueZipImportJob; },
    get extractLegacyWebsite() { return extractLegacyWebsite; },
    get extractNyrohUrl() { return extractNyrohUrl; },
    get extractPhoneNumber() { return extractPhoneNumber; },
    get getLeadNiche() { return getLeadNiche; },
    get isUserAdmin() { return isUserAdmin; },
    get logAudit() { return logAudit; },
    get memoryCampaignBatchesMap() { return memoryCampaignBatchesMap; },
    get memoryCampaignLeadsMap() { return memoryCampaignLeadsMap; },
    get pgPool() { return pgPool; },
    get processLeadItems() { return processLeadItems; },
    get sanitizeRawLead() { return sanitizeRawLead; },
    get updateCampaignImportProgress() { return updateCampaignImportProgress; },
    get usePostgres() { return usePostgres; },
});
registrarRotasUploads(app);

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

// Batch API to import parsed leads array directly (avoiding payload size limits on huge ZIP uploads)


// 4. Get calls for a specific lead

// 5. Add call log entry

// 6. Delete a lead

// 6.1 Bulk Delete Leads

// Endpoint to fetch call logs (for Metrics & Reports, optionally filtered by salesperson)

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

  res.json({ message: `${insertedCount} leads de exemplo adicionados com sucesso!` } satisfies RespostaSementes);
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

// B4 disparos e safras: rotas em shared/lib/rotas/disparos.ts (item 4.1 d).
configurarDisparos({
    get COPY_VALUE_MAX() { return COPY_VALUE_MAX; },
    get broadcastSSE() { return broadcastSSE; },
    get broadcastSocketEvent() { return broadcastSocketEvent; },
    get cancelBatchProgress() { return cancelBatchProgress; },
    get camposDoLoteParaCopy() { return camposDoLoteParaCopy; },
    get copiesByIndexFromBody() { return copiesByIndexFromBody; },
    get cortarJaContatados() { return cortarJaContatados; },
    get devolverNaoEnviadosDoLote() { return devolverNaoEnviadosDoLote; },
    get enqueueCampaignDispatchBatch() { return enqueueCampaignDispatchBatch; },
    get garantirSchemaCopias() { return garantirSchemaCopias; },
    get getBatchProgress() { return getBatchProgress; },
    get getCampaignSpeed() { return getCampaignSpeed; },
    get initBatchProgress() { return initBatchProgress; },
    get logAudit() { return logAudit; },
    get memoryCampaignBatchesMap() { return memoryCampaignBatchesMap; },
    get memoryCampaignCopyTemplatesMap() { return memoryCampaignCopyTemplatesMap; },
    get memoryCampaignLeadsMap() { return memoryCampaignLeadsMap; },
    get memoryFluxoConfig() { return memoryFluxoConfig; },
    get memoryLeadsMap() { return memoryLeadsMap; },
    get memorySalespeopleMap() { return memorySalespeopleMap; },
    get normalizarValoresCopy() { return normalizarValoresCopy; },
    get pauseBatchProgress() { return pauseBatchProgress; },
    get pgPool() { return pgPool; },
    get removeBatchWaitingJobs() { return removeBatchWaitingJobs; },
    get resumeBatchProgress() { return resumeBatchProgress; },
    get setCampaignSpeed() { return setCampaignSpeed; },
    get trackedLinkFor() { return trackedLinkFor; },
    get usePostgres() { return usePostgres; },
    get valoresDaLinhaCopy() { return valoresDaLinhaCopy; },
});
registrarDisparos(app);


// Helper para inserção em lote (bulk insert) no PostgreSQL sem sobrecarregar conexões
// Guarda o item completo do arquivo do lead (campos extras viram tags da copy). Limite para não inflar o banco.
function sanitizeRawLead(item: any): Record<string, string> | null {
  if (!item || typeof item !== 'object') return null;
  const out: Record<string, string> = {};
  let n = 0;
  for (const [k, v] of Object.entries(item)) {
    if (n >= 80) break;
    if (v === null || v === undefined || k.length > 80) continue;
    if (typeof v === 'object') {
      try {
        const j = JSON.stringify(v);
        if (j.length <= 500) { out[k] = j; n++; }
      } catch {}
      continue;
    }
    out[k] = String(v).slice(0, 500);
    n++;
  }
  return out;
}

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
    rawData?: Record<string, string> | null;
  }>
) {
  if (!leads || leads.length === 0) return;

  const valueRows: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  for (const l of leads) {
    valueRows.push(
      `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}::jsonb, CURRENT_TIMESTAMP)`
    );
    params.push(
      l.id, l.batchId, l.name, l.phoneNumber, l.isMobile, l.publicUrl, l.website, l.niche, l.status, l.responsePreview,
      l.rawData ? JSON.stringify(l.rawData) : null
    );
    paramIdx += 11;
  }

  const query = `
    INSERT INTO campaign_leads (id, batch_id, name, phone_number, is_mobile, public_url, website, niche, status, response_preview, raw_data, created_at)
    VALUES ${valueRows.join(', ')}
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      phone_number = EXCLUDED.phone_number,
      is_mobile = EXCLUDED.is_mobile,
      public_url = EXCLUDED.public_url,
      website = EXCLUDED.website,
      niche = EXCLUDED.niche,
      raw_data = EXCLUDED.raw_data,
      status = EXCLUDED.status,
      response_preview = EXCLUDED.response_preview
  `;

  await pool.query(query, params);
}




// 4. Get campaign leads with filters
app.get('/api/campaign/leads', async (req, res) => {
  const { batchId, batchIds, status, search, limit } = req.query as any;
  // Várias safras de uma vez (quadro com as safras marcadas). Lista separada por vírgula.
  const listaSafras: string[] = typeof batchIds === 'string'
    ? batchIds.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 200)
    : [];

  try {
    // Recupera automaticamente quaisquer leads fixos que tenham sido marcados incorretamente como descartados
    recuperarFixosDescartados(memoryCampaignLeadsMap.values());

    if (usePostgres && pgPool) {
      await pgPool.query(`
        UPDATE campaign_leads
        SET status = 'STAGING', response_preview = NULL
        WHERE status = 'DESCARTADO' AND response_preview LIKE '%Telefone fixo%'
      `).catch(() => {});

      // Tira da lista do disparo quem já foi contatado (CRM ou outra campanha)
      await cortarJaContatados();

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
          CASE WHEN status = 'FALHA' THEN notes END AS "failureNote",
          (SELECT lm.status FROM lead_messages lm
            WHERE lm.whatsapp_message_id IS NOT NULL AND lm.whatsapp_message_id = campaign_leads.whatsapp_message_id
            ORDER BY lm.status_rank DESC NULLS LAST LIMIT 1) AS "deliveryStatus",
          (SELECT lm.error_message FROM lead_messages lm
            WHERE lm.whatsapp_message_id IS NOT NULL AND lm.whatsapp_message_id = campaign_leads.whatsapp_message_id
            ORDER BY lm.status_rank DESC NULLS LAST LIMIT 1) AS "deliveryError",
          assigned_salesperson_id AS "assignedSalespersonId",
          assigned_salesperson_name AS "assignedSalespersonName",
          created_at AS "createdAt"
        FROM campaign_leads
        WHERE 1=1
      `;
      const params: any[] = [];

      if (listaSafras.length > 0) {
        params.push(listaSafras);
        query += ` AND batch_id = ANY($${params.length}::text[])`;
      } else if (batchId) {
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
      } else if (batchId || listaSafras.length > 0) {
        // Quando uma safra é selecionada, carrega todos os seus leads para contagem e disparo sem travar em 500
        query += ` ORDER BY created_at DESC LIMIT 50000`;
      } else {
        query += ` ORDER BY created_at DESC LIMIT 1000`;
      }

      const result = await pgPool.query(query, params);
      const leadsDoBanco: RespostaListaLeadsCampanha = result.rows;
      return res.json(leadsDoBanco);
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
      const leadsMemoria: RespostaListaLeadsCampanha = list;
      return res.json(leadsMemoria);
    }
  } catch (err: any) {
    console.error('Erro ao buscar leads de campanha:', err);
    res.status(500).json({ error: 'Erro ao buscar leads de campanha.' });
  }
});

// 4.5. Campaign Copy Templates (Message Copies & Content Variables Library)
// ---- Copy por MODELO: um valor por índice {{n}} do template escolhido. Nada fixo. ----
const COPY_VALUE_MAX = 1024;
function normalizarValoresCopy(input: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input)) {
    const n = Number(k);
    if (Number.isInteger(n) && n > 0) out[String(n)] = String(v ?? '').slice(0, COPY_VALUE_MAX);
  }
  return out;
}
// Copy antiga (só var1..var3) continua valendo: vira {1,2,3}
function valoresDaLinhaCopy(row: any): Record<string, string> {
  const fromJson = normalizarValoresCopy(row.values);
  if (Object.keys(fromJson).length > 0) return fromJson;
  const legacy: Record<string, string> = {};
  if (row.var1) legacy['1'] = String(row.var1);
  if (row.var2) legacy['2'] = String(row.var2);
  if (row.var3) legacy['3'] = String(row.var3);
  return legacy;
}
let copiaSchemaPronto: Promise<void> | null = null;
// Mudança ADITIVA: colunas novas e var1..3 deixam de ser obrigatórias. Nada é apagado.
function garantirSchemaCopias(): Promise<void> {
  if (!copiaSchemaPronto) {
    copiaSchemaPronto = (async () => {
      const pool = pgPool!;
      await pool.query(`
        CREATE TABLE IF NOT EXISTS campaign_copy_templates (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          category VARCHAR(50) DEFAULT 'prospeccao',
          var1 TEXT,
          var2 TEXT,
          var3 TEXT,
          is_default BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await pool.query(`ALTER TABLE campaign_copy_templates ADD COLUMN IF NOT EXISTS meta_template_name TEXT`);
      await pool.query(`ALTER TABLE campaign_copy_templates ADD COLUMN IF NOT EXISTS values_json JSONB`);
      await pool.query(`ALTER TABLE campaign_copy_templates ALTER COLUMN var1 DROP NOT NULL`);
      await pool.query(`ALTER TABLE campaign_copy_templates ALTER COLUMN var2 DROP NOT NULL`);
      await pool.query(`ALTER TABLE campaign_copy_templates ALTER COLUMN var3 DROP NOT NULL`);
    })().catch(err => { copiaSchemaPronto = null; throw err; });
  }
  return copiaSchemaPronto;
}

// Campos do arquivo importado das safras (viram tags da copy: {cidade}, {endereco}...)
async function camposDoLoteParaCopy(batchId: string): Promise<string[]> {
  const rows: Array<Record<string, unknown> | null> = [];
  if (usePostgres && pgPool) {
    const r = await pgPool.query(
      `SELECT raw_data FROM campaign_leads WHERE raw_data IS NOT NULL ${batchId ? 'AND batch_id = $1' : ''} LIMIT 300`,
      batchId ? [batchId] : []
    );
    for (const row of r.rows) rows.push(row.raw_data);
  } else {
    for (const l of memoryCampaignLeadsMap.values()) {
      if (!batchId || l.batchId === batchId) rows.push(l.rawData || null);
    }
  }
  return listExtraFieldKeys(rows);
}

app.get('/api/campaign/lead-fields', async (req: any, res) => {
  const batchId = String(req.query.batchId || '').trim();
  try {
    const fields = await camposDoLoteParaCopy(batchId);
    return res.json({ fields } satisfies RespostaCamposLead);
  } catch (err: any) {
    console.error('Erro ao listar campos do lead:', err);
    return res.status(500).json({ error: 'Erro ao listar campos do lead.' });
  }
});





// 5. Trigger Campaign Dispatch (Meta Template Blast - Alta Velocidade / Throughput Oficial Meta)
// Lê as copies por índice enviadas pelo montador; sem elas, cai nas 3 variáveis antigas (var1..var3).
function copiesByIndexFromBody(variableValues: any): Record<number, string> {
  if (variableValues?.byIndex && typeof variableValues.byIndex === 'object' && Object.keys(variableValues.byIndex).length > 0) {
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(variableValues.byIndex)) {
      const n = Number(k);
      if (Number.isFinite(n) && n > 0) out[n] = String(v ?? '');
    }
    return out;
  }
  // Sem byIndex (formato antigo): só o que veio em var1..var3. Nunca texto padrão.
  const out: Record<number, string> = {};
  for (const n of [1, 2, 3]) {
    const v = variableValues?.[`var${n}`];
    if (v !== undefined && v !== null) out[n] = String(v);
  }
  return out;
}












// Devolve para Novos Leads só quem NÃO foi aceito pela Meta (sem ID de mensagem), tirando da fila as mensagens pendentes.
// Usada pelo botão "Devolver" e pelo "Cancelar", para o cancelamento também mexer no banco.
async function devolverNaoEnviadosDoLote(batchId: string) {
  if (!pgPool) throw new Error('Recurso disponível apenas com banco Postgres.');

  // 1) Tira da fila as mensagens desse lote que ainda não saíram (evita envio duplicado depois)
  const removedFromQueue = await removeBatchWaitingJobs(batchId);

  // 2) Candidatos: em quarentena sem ID de envio da Meta
  const candidates = await pgPool.query(
    `SELECT id, phone_number AS "phoneNumber" FROM campaign_leads
      WHERE batch_id = $1 AND status = 'QUARENTENA' AND whatsapp_message_id IS NULL`,
    [batchId]
  );
  const ids: string[] = candidates.rows
    .filter((r: any) => formatAndValidateE164Phone(String(r.phoneNumber || '')).isValid)
    .map((r: any) => r.id);
  const skippedInvalid = (candidates.rowCount || 0) - ids.length;

  let returned = 0;
  if (ids.length > 0) {
    const upd = await pgPool.query(
      `UPDATE campaign_leads
          SET status = 'STAGING', sent_at = NULL, quarantine_expires_at = NULL
        WHERE batch_id = $1 AND id = ANY($2::text[])
          AND status = 'QUARENTENA' AND whatsapp_message_id IS NULL`,
      [batchId, ids]
    );
    returned = upd.rowCount || 0;
  }

  // 2b) Os que o corte antigo descartou por engano (marcados só porque estavam na fila, sem envio real)
  const cutBack = await pgPool.query(
    `UPDATE campaign_leads
        SET status = 'STAGING', response_preview = NULL
      WHERE batch_id = $1 AND status = 'DESCARTADO'
        AND response_preview = 'Já contatado antes (corte automático)'
        AND whatsapp_message_id IS NULL`,
    [batchId]
  );
  returned += cutBack.rowCount || 0;

  // 3) Recalcula o contador do lote a partir do banco
  await pgPool.query(
    `UPDATE campaign_batches
        SET dispatched_count = (SELECT COUNT(*) FROM campaign_leads
                                 WHERE batch_id = $1 AND status IN ('QUARENTENA', 'INTERESSADO'))
      WHERE id = $1`,
    [batchId]
  );

  broadcastSocketEvent('LEAD_UPDATED', { batchId, count: returned });
  return {
    returned,
    removedFromQueue,
    skippedInvalid,
    message: `${returned} lead(s) voltaram para Novos Leads. ${removedFromQueue} mensagem(ns) removida(s) da fila. ${skippedInvalid} número(s) inválido(s) ficaram de fora.`
  };
}





// Delete a campaign batch and its staging leads


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
/** Converte a resposta da Graph API (Meta) para o formato usado pelo restante do CRM. */
function metaToFluxoResult(r: { success: boolean; status: number; data: any; error?: string }): FluxoApiResult<any> {
  if (r.success) {
    return { success: true, status: r.status, data: { id: r.data?.messages?.[0]?.id, ...r.data } } as FluxoApiResult<any>;
  }
  return { success: false, status: r.status, error: { code: 'meta_error', message: r.error || 'Erro na Meta' } } as FluxoApiResult<any>;
}

/** Envia um corpo (formato usado pela rota de chat) direto pela Meta. */
async function sendBodyViaMeta(body: any, phoneNumberId?: string): Promise<FluxoApiResult<any>> {
  const to = String(body?.to || '');
  if (body?.template) {
    const t = body.template;
    return metaToFluxoResult(await metaSendTemplate({
      to,
      name: String(t.name),
      language: t.language || 'pt_BR',
      variables: (t.body && typeof t.body === 'object') ? t.body : {},
      headerImageUrl: t.header?.media?.link,
      phoneNumberId
    }));
  }
  if (body?.type === 'text') {
    return metaToFluxoResult(await metaSendText(to, String(body.text?.body || ''), phoneNumberId));
  }
  if (['image', 'video', 'audio', 'document'].includes(body?.type)) {
    return metaToFluxoResult(await metaSendMedia({
      to,
      kind: body.type,
      phoneNumberId,
      link: String(body.media?.url || ''),
      caption: body.media?.caption,
      filename: body.media?.filename
    }));
  }
  return { success: false, status: 422, error: { code: 'unsupported_type', message: 'Tipo de mensagem não suportado pelo envio direto da Meta.' } } as any;
}

async function sendTemplateViaFluxo(opts: {
  to: string;
  name: string;
  language?: string;
  variables?: Record<string, string>;
  buttons?: Record<string, string>;
  headerMediaUrl?: string;
  idempotencyKey?: string;
  phoneNumberId?: string;
  creds: { instanceId: string; apiKey: string; apiSecret: string };
}): Promise<FluxoApiResult<any>> {
  const language = opts.language || 'pt_BR';
  if (getMetaProvider() === 'meta') {
    // Confere as variáveis contra o corpo do modelo, antes de gastar uma chamada na Meta
    const stored = memoryTemplates.find(t => String(t.name).toLowerCase() === String(opts.name).toLowerCase());
    const bodyComp: any = (stored?.components as any[] | undefined)?.find((c: any) => c.type === 'BODY');
    if (bodyComp?.text) {
      const check = validateTemplateVariables(String(bodyComp.text), opts.variables || {});
      if (!check.ok) {
        return {
          success: false,
          status: 422,
          error: { code: 'invalid_input', message: `O modelo "${opts.name}" exige valores não informados: ${check.missing.join(', ')}.` }
        } as any;
      }
    }
    // Botões de URL dinâmica: o valor vem em opts.buttons, índice -> sufixo do link
    const urlButtonValues = Object.entries(opts.buttons || {})
      .filter(([k]) => /^\d+$/.test(k))
      .map(([k, v]) => ({ index: Number(k), value: String(v || '') }));
    const direct = await metaSendTemplate({
      to: opts.to,
      name: opts.name,
      language,
      variables: opts.variables,
      headerImageUrl: opts.headerMediaUrl,
      phoneNumberId: opts.phoneNumberId,
      urlButtonValues
    });
    return metaToFluxoResult(direct);
  }
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
/** phone_number_id -> última vez que chegou eco do celular (prova de coexistência). Em memória. */
const coexistenceSeen = new Map<string, number>();


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
    } satisfies RespostaStatusInfraestrutura);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Experiências de UX: marcas, números, central de leads e bloqueio com aprovação.
registerUxRoutes(app, {
  getPool: () => (usePostgres ? pgPool : null),
  currentUser: (req: any) => req.user,
  isAdmin: (user: any) => isUserAdmin(user),
  getLeadOwnerId,
});

// Backup manual do banco (download, só admin, sem restauração).
registerBackupRoutes(app, {
  getPool: () => (usePostgres ? pgPool : null),
  currentUser: (req: any) => req.user,
  isAdmin: (user: any) => isUserAdmin(user),
  logAudit: (action: string, details?: string, req?: any) => logAudit(action, details, req),
});

// Automações de resposta: só persistem regras (admin). Nenhum envio.
registerAutomacoesRoutes(app, {
  getPool: () => (usePostgres ? pgPool : null),
  currentUser: (req: any) => req.user,
  isAdmin: (user: any) => isUserAdmin(user),
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
      root: path.resolve(process.cwd(), 'frontend'),
      configFile: path.resolve(process.cwd(), 'frontend/vite.config.ts'),
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
        const stats = await processLeadItems(allItems, `Upload ZIP (fila) ${new Date().toLocaleString('pt-BR')}`);
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
      // Safra ligada a marca: envia pelo número vinculado à marca. Sem marca, usa a instância global.
      const safraInst = await instanciaDaSafra(pgPool, String(jobData.batchId || jobData.campaignId || ''));
      const instanceId = escolherInstanciaDisparo({
        escolhida: jobData.instanceId,
        daSafra: safraInst.temMarca ? safraInst.instanceId : '',
        global: memoryFluxoConfig.instanceId || '',
      });
      const attempt = ctx?.attempt ?? 1;
      const maxAttempts = ctx?.maxAttempts ?? 1;
      const isLastAttempt = attempt >= maxAttempts;

      const cleanDigits = String(jobData.phone || '').replace(/\D/g, '');
      const phoneCheck = formatAndValidateE164Phone(String(jobData.phone || ''));
      const formattedE164 = phoneCheck.isValid ? phoneCheck.e164 : '';
      const templateName = String(jobData.templateName || '').trim();
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
        `Ei, ${sanitizedVariables['1'] || ''}\n\n${sanitizedVariables['2'] || ''}\n\n${sanitizedVariables['3'] || ''}`
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
            // Histórico de marcas: registra que este telefone foi abordado pela marca da safra.
            if (uxSchemaOn() && !opts.dryRun) {
              try {
                await pgPool.query(
                  `INSERT INTO contato_marcas (telefone, marca_id, primeiro_contato, ultimo_contato)
                   SELECT regexp_replace(cl.phone_number, '[^0-9]', '', 'g'), cb.brand_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                     FROM campaign_leads cl JOIN campaign_batches cb ON cb.id = cl.batch_id
                    WHERE cl.id = $1 AND cb.brand_id IS NOT NULL
                   ON CONFLICT (telefone, marca_id) DO UPDATE SET ultimo_contato = CURRENT_TIMESTAMP`,
                  [jobData.leadId]
                );
              } catch (historicoErr: any) {
                console.error('[contato_marcas] não gravou histórico da marca:', historicoErr?.message || historicoErr);
              }
            }
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
