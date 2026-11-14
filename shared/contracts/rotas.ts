import type { User, AuditLog, Salesperson, CustomTag, Lead, LeadChatMessage } from '../types';
import type { WebsiteAuditReport } from '../types/audit';
import type { LogEntry } from '../lib/logBuffer';

/**
 * Contratos (C1): formato das respostas das rotas críticas, compartilhado entre back e front.
 *
 * Quem muda um destes tipos quebra o build de quem usa, e isso é o objetivo.
 * Os exemplos abaixo são conferidos pelo compilador (`npm run lint`), então um campo
 * renomeado ou removido aparece como erro antes de subir.
 */

/** POST /api/campaign/upload-zip (sucesso) */
export interface RespostaUploadZipOk {
  success: true;
  jobId: string;
  batchId: string;
  totalProcessed: number;
  validMobiles: number;
  landlines: number;
  withNyrohUrl: number;
  withWebsite: number;
}

/** Resposta de erro das rotas de upload (HTTP 4xx/5xx) */
export interface RespostaErroApi {
  success?: false;
  error: string;
}

/** POST /api/campaign/upload-zip: sucesso ou erro */
export type RespostaUploadZip = RespostaUploadZipOk | RespostaErroApi;

/** Item de GET /api/campaign/uploads */
export interface UploadZipRegistro {
  id: string;
  batchId: string | null;
  batchName: string | null;
  fileName: string;
  fileSizeBytes: number;
  leadsInZip: number;
  leadsSaved: number;
  skippedContacted: number;
  skippedRepeated: number;
  validMobiles: number;
  landlines: number;
  createdAt: string;
}

/** Resposta de GET /api/campaign/uploads */
export interface RespostaListaUploads {
  uploads: UploadZipRegistro[];
}

/** Status de uma mensagem enviada pelo CRM. */
export type StatusMensagemEnviada = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

/** POST /api/leads/:leadId/messages (sucesso) */
export interface RespostaEnviarMensagem {
  success: boolean;
  replayed?: boolean;
  billable?: boolean;
  status: StatusMensagemEnviada;
  remoteMessageId?: string | null;
  message?: unknown;
}

/** POST /api/auth/login (sucesso) */
export interface RespostaLoginOk {
  user: User;
  token: string;
}

/** POST /api/auth/login: sucesso ou erro (400, 401, 403, 429, 500) */
export type RespostaLogin = RespostaLoginOk | RespostaErroApi;

/** GET /api/auth/me (logado; sem sessão responde 401 com erro) */
export interface RespostaSessaoAtual {
  user: User;
}

/** Resposta de sucesso genérica (logout, troca de senha, atualização e exclusão de usuário) */
export interface RespostaSucesso {
  success: true;
  message: string;
}

/** POST /api/auth/change-password: sucesso ou erro */
export type RespostaAlterarSenha = RespostaSucesso | RespostaErroApi;

/** Item de GET /api/admin/users e corpo de POST /api/admin/users (201) */
export interface UsuarioAdmin {
  id: string;
  name: string;
  email: string;
  role: User['role'];
  salespersonId?: string | null;
  active: boolean;
  createdAt: string;
}

/** GET /api/admin/users */
export type RespostaListaUsuarios = UsuarioAdmin[];

/** GET /api/admin/audit-logs (últimos 100) */
export type RespostaAuditLogs = AuditLog[];

/** GET /api/admin/logs (painel de logs do servidor) */
export interface RespostaLogsServidor {
  logs: LogEntry[];
  categories: string[];
}

/** GET /api/salespeople (vendedores com métricas) */
export type RespostaListaVendedores = Salesperson[];

/** POST /api/salespeople (201) e cada item de POST /api/salespeople/batch */
export type RespostaVendedorCriado = Salesperson & {
  loginEmail: string;
  initialPassword: string;
};

/** POST /api/salespeople/batch (201) */
export interface RespostaLoteVendedores {
  success: true;
  count: number;
  salespeople: RespostaVendedorCriado[];
  message: string;
}

/** PUT /api/salespeople/:id (sucesso devolve o vendedor atualizado) */
export type RespostaVendedorAtualizado = Salesperson;

/** POST /api/salespeople/:id/reset-password (sucesso) */
export interface RespostaSenhaVendedor {
  success: true;
  email: string;
  message: string;
}

/** Campos devolvidos ao mudar um status de vendedor (o PG devolve só parte dos campos) */
export interface VendedorStatus {
  id: string;
  name: string;
  active?: boolean;
  canGenerateAuditPdf?: boolean;
  whatsappType?: Salesperson['whatsappType'];
}

/** PATCH /api/salespeople/:id/toggle-active, toggle-audit-pdf e whatsapp-type (sucesso) */
export interface RespostaVendedorStatus {
  success: true;
  salesperson: VendedorStatus;
}

/** POST /api/salespeople/:id/roulette-config (sucesso, valores já limitados pelo servidor) */
export interface RespostaRoletaConfig {
  success: true;
  salespersonId: string;
  pctWarm: number;
  pctCold: number;
  limit: number;
}

/** POST /api/salespeople/distribute-roulette (sucesso) */
export interface RespostaDistribuicaoRoleta {
  success: true;
  totalProcessed: number;
  assignedCount: number;
  assigned: Array<Record<string, unknown>>;
}

/** GET /api/tags (lista de etiquetas) */
export type RespostaListaEtiquetas = CustomTag[];

/** POST /api/tags (201, ou 200 quando a etiqueta já existia pelo nome) */
export type RespostaEtiquetaSalva = CustomTag;

/** Resposta de sucesso sem corpo além do flag (DELETE /api/tags/:id) */
export interface RespostaOk {
  success: true;
}

/** Nota interna de uma conversa: só a equipe vê, o cliente nunca recebe */
export interface NotaInterna {
  id: string;
  authorId: string | null;
  authorName: string;
  text: string;
  createdAt: string;
}

/** GET /api/leads/:id/notes */
export interface RespostaListaNotas {
  notes: NotaInterna[];
}

/** POST /api/leads/:id/notes (sucesso) */
export interface RespostaNotaCriada {
  success: true;
  id: string;
}

/** POST /api/leads/:id/resolve (sucesso) */
export interface RespostaResolucao {
  success: true;
  resolved: boolean;
}

/** POST /api/leads/:id/audit (relatório instantâneo do site do lead) */
export type RespostaAuditoriaSite = WebsiteAuditReport;

/**
 * PUT /api/leads/:id/status e PUT /api/leads/:id/assign (sucesso).
 * `lead` fica como unknown de propósito: no Postgres o servidor devolve as colunas
 * do banco (snake_case, RETURNING *), e na memória devolve o Lead. Ninguém no front lê
 * esse campo hoje. Tipar com precisão exige alinhar o SELECT do Postgres (fase futura).
 */
export interface RespostaAtualizacaoLead {
  success: true;
  lead: LeadAtualizado;
}

/** Lead devolvido depois de atribuir, mudar status ou editar (campos com o nome do Lead do front) */
export interface LeadAtualizado {
  id: string;
  name: string;
  phoneNumber?: string | null;
  columnStatus: string;
  subStatus?: string | null;
  lossReason?: string | null;
  salespersonId?: string | null;
  salespersonName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/**
 * GET /api/leads/:id/summary: um lead só, com os campos da conversa.
 * Não é o Lead inteiro: o SELECT do Postgres traz um subconjunto (e no fallback de
 * memória devolve o Lead completo). Por isso é Partial.
 */
export type RespostaResumoLead = Partial<Lead>;

/**
 * Ligação registrada num lead, como sai do servidor. `followUpAt` vem null do
 * Postgres quando não há retorno agendado, e some do JSON na memória (undefined).
 */
export interface LigacaoLead {
  id: string;
  leadId: string;
  tag: string;
  comment: string;
  durationSeconds?: number;
  followUpAt?: string | null;
  createdAt: string;
}

/** GET /api/leads/:id/calls (lista, mais recente primeiro) */
export type RespostaListaLigacoes = LigacaoLead[];

/** POST /api/leads/:id/calls (sucesso) */
export type RespostaLigacaoRegistrada = LigacaoLead;

/** Ligação com os dados do lead, como vem de GET /api/calls */
export interface LigacaoComLead extends LigacaoLead {
  leadName: string;
  phoneNumber: string;
  columnStatus: string;
  salespersonId: string;
  salespersonName: string;
}

/** GET /api/calls (ligações da equipe, ou só do vendedor) */
export type RespostaListaLigacoesGerais = LigacaoComLead[];

/**
 * Item de GET /api/leads, como sai do servidor.
 *
 * Não é o `Lead` de shared/types: o Postgres devolve `null` onde o Lead diz "opcional"
 * (ex.: lossReason, nextFollowUpAt, lastCallAt), e a memória devolve o Lead espalhado,
 * com alguns campos ausentes. Por isso, só id, name, columnStatus, salesperson,
 * whatsapp e callCount são obrigatórios (os dois lados preenchem esses).
 */
export interface LeadListado {
  id: string;
  name: string;
  phoneNumber?: string | null;
  publicUrl?: string | null;
  website?: string | null;
  columnStatus: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  salespersonId: string;
  salespersonName: string;
  niche?: string | null;
  categories?: string | string[] | null;
  subStatus?: string | null;
  lossReason?: string | null;
  nextFollowUpAt?: string | null;
  hasWhatsAppReply: boolean;
  whatsappReplied: boolean;
  respondedAt?: string | null;
  lastWhatsAppMessage?: string | null;
  callCount: number;
  lastCallAt?: string | null;
  lastCallTag?: string | null;
  /** Só vem do Postgres (disparos de hoje para este telefone). */
  contatosHoje?: number;
  /** Só vem do Postgres (marcas que já abordaram este telefone). */
  marcas?: Array<{ id: string; name: string; lastAt?: string | null }>;
}

/** GET /api/leads (base de leads, filtrada pela carteira de quem pede) */
export type RespostaListaLeads = LeadListado[];

/**
 * Resposta rápida como sai de /api/quick-replies. O Postgres manda null em mediaUrl
 * quando não há mídia, e o tipo `type` vem do banco sem validação (o POST aceita qualquer texto).
 */
export interface RespostaRapida {
  id: string;
  salespersonId?: string | null;
  shortcut: string;
  title: string;
  type: string;
  content: string;
  mediaUrl?: string | null;
  createdAt?: string | null;
}

/** GET /api/quick-replies */
export interface RespostaListaRespostasRapidas {
  success: true;
  quickReplies: RespostaRapida[];
}

/** POST /api/quick-replies (201) */
export interface RespostaRespostaRapidaCriada {
  success: true;
  quickReply: RespostaRapida;
}

/** DELETE /api/quick-replies/:id */
export interface RespostaRespostaRapidaExcluida {
  success: true;
  id: string;
}

/** GET /api/admin/meta/status: estado da integração (sem segredos, só se existem) */
export interface RespostaStatusMeta {
  provider: 'meta' | 'fluxo';
  envToken: boolean;
  envPhoneNumberId: boolean;
  appSecret: boolean;
  verifyToken: boolean;
  webhookReady: boolean;
  accounts: number;
  numbers: number;
}

/** Uma conta (BM/WABA) cadastrada, sem token */
export interface ContaMeta {
  id: string;
  name: string;
  wabaId: string;
  businessId: string | null;
  numbers: number;
}

/** GET /api/admin/meta/accounts */
export interface RespostaContasMeta {
  success: true;
  accounts: ContaMeta[];
}

/** Resultado de sincronizar uma conta com a Meta (números e modelos) */
export interface ResultadoSincronizacaoMeta {
  success: boolean;
  error?: string;
  numbers: number;
  templates: number;
}

/** POST /api/admin/meta/accounts/:id/sync (200 ok, 502 falhou) */
export type RespostaSincronizacaoConta = ResultadoSincronizacaoMeta;

/** POST /api/admin/meta/sync-all */
export interface RespostaSincronizacaoTodas {
  success: boolean;
  results: Array<ResultadoSincronizacaoMeta & { id: string }>;
}

/** DELETE /api/admin/meta/accounts/:id */
export interface RespostaMetaRemovida {
  success: true;
}

/**
 * GET /api/admin/fluxo/config (só admin). Segredos vêm mascarados (••••1234): o segredo
 * inteiro nunca sai do servidor, então não existe apiSecret na resposta.
 */
export interface RespostaConfigFluxo {
  apiKey: string;
  hasApiKey: boolean;
  hasSecret: boolean;
  instanceId: string;
  isConfigured: boolean;
  source: 'env' | 'custom' | 'none';
  metaAccessToken: string;
  hasMetaToken: boolean;
  metaWabaId: string;
  metaPhoneNumberId: string;
  metaVerifyToken: string;
  isMetaConfigured: boolean;
}

/** Resumo da instância da FluxoAPI usada pelo CRM */
export interface InstanciaFluxoResumo {
  found: boolean;
  status: string;
  name: string | null;
  phone: string | null;
}

/** GET /api/admin/fluxo/status (200; a falha de servidor não tem este formato) */
export interface RespostaStatusFluxo {
  provider: 'meta' | 'fluxo';
  missing: string[];
  source: 'railway' | 'sistema' | 'nenhuma';
  webhookPath: string;
  connected: boolean;
  instance: InstanciaFluxoResumo;
  message: string;
}

/** Evento recebido do webhook da FluxoAPI (ou simulado) */
export interface EventoWebhookFluxo {
  id: string;
  receivedAt: string;
  type: string;
  summary: string;
  payload: unknown;
}

/** GET /api/admin/fluxo/events */
export interface RespostaEventosFluxo {
  success: true;
  total: number;
  events: EventoWebhookFluxo[];
}

/** GET /api/admin/fluxo/instance-mode (sucesso; os erros têm outro formato) */
export interface RespostaModoInstancia {
  configured: true;
  instanceId: string;
  mode: string;
  status: string;
  quality: string;
  throughputMps: number;
  messagingLimit24h: number;
  isCoexistenceReady: boolean;
  coexistenceNotice: string;
  raw: unknown;
}

/**
 * Modelo de mensagem (template) como sai de GET /api/admin/fluxo/templates.
 * Os dois caminhos do servidor (Meta direto e FluxoAPI) devolvem formatos diferentes:
 * o que só um deles traz fica opcional.
 */
export interface ModeloFluxo {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  components: unknown[];
  usageCount: number;
  qualityScore: string;
  rejectedReason: string | null;
  submittedToMeta: boolean;
  /** Só no caminho da Meta direta (multi-BM) */
  accountId?: string;
  accountName?: string;
  /** Só no caminho da FluxoAPI */
  headerText?: string;
  bodyText?: string;
  footerText?: string;
  buttons?: unknown[];
  createdAt?: string;
  sendable?: boolean;
  blockedReason?: string | null;
  fields?: unknown[];
}

/** GET /api/admin/fluxo/templates (sucesso ou erro; o campo `success` diz qual) */
export interface RespostaListaModelosFluxo {
  success: boolean;
  templates: ModeloFluxo[];
  error?: { message: string };
  errors?: Array<{ accountId: string; accountName?: string; message: string }>;
  remoteMetaCount?: number;
  remoteFluxoCount?: number;
  remoteCount?: number;
  remoteError?: string | null;
  metaConnected?: boolean;
}

/**
 * Número (instância) de WhatsApp como sai de GET /api/admin/fluxo/instances.
 * Vem de dois caminhos: Meta direta (com coexistência e BM) e FluxoAPI (com limites).
 * Cada campo que só um caminho traz fica opcional.
 */
export interface InstanciaWhatsApp {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  quality?: string | null;
  mode?: string;
  coexistence: boolean | null;
  coexistenceSeenAt?: string | null;
  messagingLimit?: null;
  messagingLimit24h?: number | null;
  throughputMps?: number | null;
  conversations24h?: number | null;
  messages24h?: number | null;
  accountId?: string;
}

/** GET /api/admin/fluxo/instances (sucesso ou erro; `success` diz qual) */
export interface RespostaInstanciasFluxo {
  success: boolean;
  configured?: boolean;
  selectedInstanceId?: string | null;
  instances: InstanciaWhatsApp[];
  accounts?: Array<{ id: string; name: string; wabaId: string; businessId: string | null }>;
  error?: { message: string; action?: string; code?: string };
}

/**
 * POST /api/admin/fluxo/templates (criar, enviar para aprovação ou salvar rascunho; sucesso).
 * O modelo recém-criado ainda não tem rejectedReason no servidor, por isso é opcional aqui.
 */
export interface RespostaModeloCriado {
  success: true;
  template: Omit<ModeloFluxo, 'rejectedReason'> & { rejectedReason?: string | null };
  remoteResult?: unknown;
  message: string;
}

/** POST /api/admin/fluxo/templates/sync-meta (sucesso) */
export interface RespostaSincronizacaoModelos {
  success: true;
  count: number;
  templates: ModeloFluxo[];
  message: string;
}

/** POST /api/admin/meta/accounts (sucesso): conta cadastrada e resultado da primeira sincronização */
export interface RespostaCadastroContaOk {
  success: true;
  account: { id: string; name: string; wabaId: string; businessId: string | null };
  sync: ResultadoSincronizacaoMeta;
}

/** POST /api/admin/meta/accounts: sucesso ou erro (400, 500 ou 503) */
export type RespostaCadastroConta = RespostaCadastroContaOk | { success: false; error: string };

/** GET /api/admin/meta/embedded-signup/config */
export interface RespostaConfigEmbeddedSignup {
  success: true;
  appId: string;
  configId: string;
  ready: boolean;
}

/** POST /api/admin/meta/embedded-signup/complete (o `success` diz se a conexão terminou de vez) */
export interface RespostaEmbeddedSignupConcluido {
  success: boolean;
  accountId: string;
  numbers: number;
  warning: string | null;
  error?: string | null;
}

/** GET /api/admin/meta/sync: leitura direta da Meta (sem gravar nada) */
export interface RespostaLeituraMeta {
  provider: 'meta' | 'fluxo';
  configured: { accessToken: boolean; phoneNumberId: boolean; wabaId: boolean; appSecret: boolean };
  phoneNumbers: unknown[];
  templates: unknown[];
  errors: { phoneNumbers: string | null; templates: string | null };
}

/** POST /api/admin/fluxo/instances (criar instância na FluxoAPI; a Meta não cria por aqui) */
export interface RespostaCriacaoInstancia {
  success: boolean;
  data: unknown;
  message: string;
}

/** POST /api/admin/fluxo/send-test-message (sucesso) */
export interface RespostaEnvioTesteSucesso {
  success: true;
  messageId?: string;
  provider?: 'meta';
  to?: string;
  instanceId?: string;
  /** Só no envio de modelo (send-template-test) */
  templateName?: string;
  latencyMs?: number;
  result?: unknown;
  message?: string;
}

/** POST /api/admin/fluxo/send-test-message e send-template-test: sucesso ou falha da FluxoAPI */
export type RespostaEnvioTeste = RespostaEnvioTesteSucesso | {
  success: false;
  status?: number;
  latencyMs?: number;
  /** Objeto da FluxoAPI na falha de envio; texto na falta de credenciais (HTTP 400). */
  error?: { code?: string; message?: string } | string;
  raw?: unknown;
  message?: string;
};

/** POST /api/leads/distribute (distribuição manual de carteira; sucesso) */
export interface RespostaDistribuicaoLeads {
  success: true;
  transferredCount: number;
  targetSalespersonName: string;
  totalEligibleBefore: number;
  remainingEligible: number;
}

/** Ligação recente do vendedor, como sai de GET /api/admin/salesperson/:id/stats (nomes de coluna do banco) */
export interface LigacaoRecenteVendedor {
  id: string;
  leadId: string;
  lead_name: string | null;
  lead_phone: string | null;
  tag: string | null;
  comment: string | null;
  duration: number | null;
  followUpAt?: string | null;
  created_at: string | null;
}

/** GET /api/admin/salesperson/:id/stats */
export interface RespostaEstatisticasVendedor {
  salespersonId: string;
  recentCalls: LigacaoRecenteVendedor[];
}

/** POST /api/leads/batch-assign (transferência em lote; sucesso) */
export interface RespostaTransferenciaLote {
  success: true;
  count: number;
  message: string;
}

/**
 * Modelo de copy de disparo (GET/POST/PUT /api/campaign/copies).
 * As variáveis são sempre texto: o servidor grava '' quando não há valor.
 */
export interface CopiaCampanha {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  var1: string;
  var2: string;
  var3: string;
  metaTemplateName?: string | null;
  values?: Record<string, string>;
  createdAt?: string | null;
  updatedAt?: string | null;
  isDefault?: boolean;
}

/** GET /api/campaign/copies */
export type RespostaListaCopias = CopiaCampanha[];

/** POST /api/campaign/copies (201) e PUT /api/campaign/copies/:id (copia salva) */
export type RespostaCopiaSalva = CopiaCampanha;

/** DELETE /api/campaign/copies/:id */
export interface RespostaCopiaRemovida {
  success: true;
  message: string;
}

/**
 * Lote de disparo como sai de GET /api/campaign/batches. O Postgres manda mais campos
 * que o CampaignBatch do front (ex.: stagingCount) e null em quarentena não iniciada.
 */
export interface LoteCampanha {
  id: string;
  name: string;
  totalLeads: number;
  validMobiles: number;
  landlines: number;
  withNyrohUrl: number;
  withWebsite: number;
  status: string;
  templateName: string | null;
  quarantineHours: number | null;
  quarantineStartedAt?: string | null;
  quarantineEndsAt?: string | null;
  allowedClosers?: string[] | null;
  hotLeadsRetainedByAdmin: boolean;
  onReplyAction?: string | null;
  onExpireAction?: string | null;
  dispatchedCount: number;
  acceptedCount?: number;
  deliveredCount?: number;
  failedCount?: number;
  hotCount: number;
  coldCount: number;
  optOutCount: number;
  stagingCount?: number;
  createdAt: string;
}

/** GET /api/campaign/batches */
export type RespostaListaLotes = LoteCampanha[];

/** GET /api/campaign/dispatch/speed */
export interface RespostaVelocidadeDisparo {
  currentSpeed: number;
  currentPerMinute: number;
  maxSpeed: number;
  maxPerMinute: number;
  planRpm: number;
  presets: Array<{ label: string; speed: number; perMinute: number; description: string }>;
}

/** POST /api/campaign/dispatch/speed */
export interface RespostaAlteracaoVelocidade {
  success: true;
  speed: number;
  perMinute: number;
  cappedByPlan: boolean;
  planRpm: number;
}

/** POST /api/campaign/batches/:id/pause e /resume */
export interface RespostaAcaoLote {
  success: boolean;
  batchId: string;
}

/** POST /api/campaign/batches/:id/cancel (devolve os leads que a Meta não aceitou) */
export interface RespostaCancelamentoLote {
  success: boolean;
  batchId: string;
  returned: number;
  removedFromQueue?: number;
  skippedInvalid?: number;
  message: string;
}

/** POST /api/campaign/batches/:id/release-quarantine (sucesso) */
export interface RespostaLiberacaoQuarentena {
  success: true;
  releasedCount: number;
  message: string;
}

/** POST /api/campaign/batches/:id/return-unsent (sucesso): leads que a Meta não aceitou voltam para Novos */
export interface RespostaDevolucaoLeads {
  success: true;
  returned: number;
  removedFromQueue: number;
  skippedInvalid: number;
  message: string;
}

/**
 * POST /api/campaign/test-dispatch: disparo de teste para um número. `lead` e `dispatchResult`
 * ainda são `unknown` (no servidor são `any`). Tipar esses dois é pendência de depois.
 */
export interface RespostaTesteDisparo {
  success: boolean;
  message?: string;
  error?: string;
  lead: unknown;
  outgoingMessage: LeadChatMessage;
  dispatchResult: unknown;
}

/** GET /api/campaign/test-dispatch/status/:messageId: situação de entrega do teste */
export interface RespostaStatusTesteDisparo {
  success: true;
  messageId: string;
  deliveryStatus: string;
  error?: unknown;
  translation?: unknown;
  eventTimestamp?: string;
  message?: string;
}

/** POST /api/campaign/batches/:id/sync-whatsapp-web (sucesso): safra conferida com a lista do WhatsApp Web */
export interface RespostaSincronizacaoWhatsApp {
  success: true;
  stats: {
    totalBatchLeads: number;
    whatsappChatsProvided: number;
    confirmedDispatched: number;
    recycledToStaging: number;
    movedToLandlines: number;
    alreadyResponded: number;
  };
  message: string;
}

/** POST /api/campaign/dispatch (sucesso): leads da safra entraram na fila de envio */
export interface RespostaDisparo {
  success: true;
  queued: true;
  dispatchedCount: number;
  enqueuedCount: number;
  speedPerSecond: number;
  estimatedDurationSeconds: number;
  templateName: string;
  quarantineHours: number;
  quarantineEndsAt: string;
  sellersUsed: string[];
  batchId: string;
  speedPerMinute: number;
  cappedByPlan?: boolean;
  planRpm?: number;
  message?: string;
}

/** GET /api/campaign/batches/:id/progress: andamento do lote na esteira de envio (memória do servidor) */
export interface ProgressoLote {
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

/** POST /api/campaign/batches/:id/return-quarantine (sucesso): leads em Em Espera voltam para Novos */
export interface RespostaRetornoQuarentena {
  success: true;
  returned: number;
  removedFromQueue: number;
  message: string;
}

/** POST /api/campaign/batches/:id/reset-staging (sucesso): safra volta ao rascunho com os leads em STAGING */
export interface RespostaResetSafra {
  success: true;
  resetCount: number;
  message: string;
}

/** Exemplos conferidos pelo compilador. Se um campo mudar de nome, o build quebra aqui. */
export const EXEMPLO_UPLOAD_ZIP = {
  success: true,
  jobId: 'job_1',
  batchId: 'batch_1',
  totalProcessed: 10,
  validMobiles: 9,
  landlines: 1,
  withNyrohUrl: 0,
  withWebsite: 0
} satisfies RespostaUploadZipOk;

export const EXEMPLO_UPLOAD_REGISTRO = {
  id: 'up_1',
  batchId: 'batch_1',
  batchName: 'Safra E2E',
  fileName: 'safra.zip',
  fileSizeBytes: 1024,
  leadsInZip: 4,
  leadsSaved: 3,
  skippedContacted: 0,
  skippedRepeated: 1,
  validMobiles: 3,
  landlines: 0,
  createdAt: '2026-11-13T18:00:00.000Z'
} satisfies UploadZipRegistro;
