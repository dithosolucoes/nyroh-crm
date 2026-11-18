import type { User, AuditLog, Salesperson, CustomTag, Lead, LeadChatMessage, CampaignLead, InboxPage } from '../types';
import type { ConfigEnvio } from '../lib/automacoesEnvio';
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
 * memória devolve o Lead completo). Por isso é este subconjunto (ResumoLead), não o Lead inteiro.
 */
export interface ResumoLead {
  id: string;
  name: string;
  phoneNumber: string;
  columnStatus: string;
  subStatus?: string | null;
  niche?: string | null;
  publicUrl?: string | null;
  salespersonId?: string | null;
  salespersonName?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
  windowExpiresAt?: string | null;
  whatsappReplied?: boolean;
  lastWhatsAppMessage?: string | null;
  lastMessageText?: string | null;
  lastMessageSender?: string | null;
  lastMessageStatus?: string | null;
}

/** GET /api/leads/:id/summary: o resumo de um lead (ver ResumoLead) */
export type RespostaResumoLead = ResumoLead;

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
  cached?: boolean;
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
 * Resultado devolvido pela FluxoAPI/Meta ao disparo de teste. O servidor monta esse objeto a partir
 * de respostas de rede variadas, então `error` aceita string (erro de rede) ou objeto (erro da Meta).
 */
export interface ResultadoEnvioFluxo {
  success: boolean;
  mode?: string;
  messageId?: string;
  status?: number;
  error?: string | { message?: string; [chave: string]: unknown };
  data?: { id?: string; message?: string; error?: { message?: string }; [chave: string]: unknown };
}

/**
 * POST /api/campaign/test-dispatch: disparo de teste para um número. `success: true` só quando a
 * FluxoAPI/Meta aceitou o envio (ver `dispatchResult.success`).
 */
export interface RespostaTesteDisparo {
  success: boolean;
  message?: string;
  error?: string;
  lead: Lead;
  outgoingMessage: LeadChatMessage;
  dispatchResult: ResultadoEnvioFluxo;
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

/** POST /api/campaign/import-progress/init (sucesso): job de importação criado */
export interface RespostaImportacaoIniciada {
  success: true;
  jobId: string;
}

/** GET /api/campaign/import-progress/:jobId: andamento da importação do ZIP (memória do servidor) */
export interface ProgressoImportacao {
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

/** POST /api/campaign/uploads/apagar-todos (dryRun ou apagado): resumo do que sai ou saiu */
export interface RespostaApagarZipsEmLote {
  dryRun: boolean;
  safras: number;
  zips: number;
  leads: number;
  bloqueadas: number;
  leadsBloqueados: number;
}

/** DELETE /api/campaign/uploads/:uploadId (sucesso) */
export interface RespostaApagarZip {
  success: true;
  message: string;
}

/** GET /api/admin/automacoes: regras salvas (definição é JSON da própria automação) */
export type RespostaListaAutomacoes = Array<{ id: string; status: string; def: unknown }>;

/** PUT /api/admin/automacoes/:id (salva): versão nova da regra */
export interface RespostaAutomacaoSalva {
  ok: true;
  id: string;
  status: string;
  versao: number;
}

/** DELETE /api/admin/automacoes/:id */
export interface RespostaRemocaoAutomacao {
  ok: true;
}

/** GET /api/admin/automacoes/execucoes: últimas decisões registradas */
export type RespostaExecucoesAutomacao = Array<{
  quando: string;
  decisao: string;
  motivo: string | null;
  leadId: string | null;
  regraId: string | null;
  versao: number | null;
}>;

/** GET /api/admin/automacoes/fila: passos agendados */
export type RespostaFilaAutomacao = Array<{
  id: unknown;
  automacaoId: string;
  leadId: string;
  passoOrdem: number;
  acao: string;
  status: string;
  executarEm: string;
  resultado: unknown;
}>;

/** GET /api/admin/automacoes/revisao: leads que pediram revisão */
export type RespostaRevisaoAutomacao = Array<{
  leadId: string;
  ultimoComando: string | null;
  em: string | null;
}>;

/** GET /api/admin/automacoes/configuracoes (lista de um item, como as outras leituras da tela) */
export type RespostaConfiguracaoAutomacao = Array<{
  persistenciaLigada: boolean;
  execucaoLigada: boolean;
  pausaGeral: boolean;
  limites: null;
}>;

/** PUT /api/admin/automacoes/configuracoes */
export interface RespostaPausaGeral {
  pausaGeral: boolean;
}

/** GET e PUT /api/admin/automacoes/envio: controle do envio real */
export interface RespostaEnvioAutomacao extends ConfigEnvio {
  persistenciaLigada: boolean;
  envioRealConectado: boolean;
}

/** GET /api/inbox: uma página da caixa de entrada (mesmo tipo que o front já usa) */
export type RespostaInbox = InboxPage;

/** GET /api/messages/search: um trecho encontrado numa conversa */
export interface ResultadoBuscaMensagem {
  leadId: string;
  leadName: string;
  messageId: string;
  text: string;
  sender: string;
  timestamp: string;
}

/** GET /api/messages/search */
export interface RespostaBuscaMensagens {
  results: ResultadoBuscaMensagem[];
  query: string;
}

/** GET /api/leads/:leadId/messages: histórico de uma conversa, com janela de 24h */
export interface RespostaMensagensLead {
  success: true;
  leadId: string;
  total: number;
  windowExpiresAt: string | null;
  windowOpen: boolean;
  hasMoreOlder: boolean;
  olderCursor: string | null;
  messages: LeadChatMessage[];
}

/** POST /api/leads/recover-phones e /recover-websites (sucesso): quantos leads foram recuperados */
export interface RespostaRecuperacao {
  success: true;
  recoveredCount: number;
  message: string;
}

/** POST /api/leads/batch-update (sucesso): resultado da atualização em lote por JSON */
export interface RespostaAtualizacaoLoteLeads {
  totalProcessed: number;
  updatedCount: number;
  notFoundCount: number;
  updatedLeads: Array<{ id: string; name: string; oldStatus: string; newStatus: string }>;
  notFoundIdentifiers: string[];
}

/** POST /api/leads/batch (sucesso): resultado da importação em lote de leads por JSON */
export interface RespostaLoteLeads {
  totalProcessed: number;
  insertedCount: number;
  skippedDuplicates: number;
}

/** POST /api/leads/bulk-delete (sucesso) */
export interface RespostaExclusaoLote {
  success: true;
  count: number;
  message: string;
}

/** GET /api/campaign/leads: leads da campanha (linhas do Postgres com os aliases da rota, ou memória) */
export type RespostaListaLeadsCampanha = CampaignLead[];

/** GET /api/campaign/lead-fields: campos disponíveis para as tags da copy */
export interface RespostaCamposLead {
  fields: string[];
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

/** GET /api/campaign/link-clicks: cliques registrados nos links da campanha */
export interface RespostaCliquesLink {
  clicks: Array<Record<string, unknown>>;
}

/** POST /api/admin/fluxo/config: credenciais salvas (sem segredo na resposta) */
export interface RespostaSalvarConfigFluxo {
  success: true;
  message: string;
  isConfigured: boolean;
  isMetaConfigured: boolean;
}

/** POST /api/admin/fluxo/test-connection: conexão autenticada */
export interface RespostaTesteConexaoFluxo {
  success: true;
  latencyMs: number;
  instances: unknown[];
  message: string;
}

/** GET /api/runtime-config: flags de execução para a interface */
export interface RespostaRuntimeConfig {
  simulatorsEnabled: boolean;
  isProduction: boolean;
  instancePhone: string | null;
  instanceStatus: string;
  whatsappConnected: boolean;
}

/** POST /api/admin/fluxo/events/simulate */
export interface RespostaEventoSimulado {
  success: true;
  event: EventoWebhookFluxo;
}

/** GET /api/leads/:leadId/window: janela de 24h do lead */
export interface RespostaJanelaLead {
  success: true;
  leadId: string;
  windowExpiresAt: string | null;
  windowOpen: boolean;
}

/** GET e POST /api/leads/:leadId/presence: quem está com o lead aberto */
export interface RespostaPresenca {
  success: true;
  leadId?: string;
  me?: string;
  users: unknown[];
}

/** POST /api/leads/:leadId/read: marca como lida (ou o motivo de não marcar) */
export interface RespostaLeituraMarcada {
  success: true;
  marked: boolean;
  reason?: string;
  messageId?: string;
}

/** GET /api/whatsapp/fluxo-templates (catálogo da Meta, formato bruto da Meta) */
export interface RespostaCatalogoModelosMeta {
  success: true;
  templates: Array<Record<string, unknown>>;
}

/** POST /api/webhooks/simulate-incoming */
export interface RespostaSimulacaoWebhook {
  success: true;
  message: string;
  data: unknown;
}

/** GET /api/admin/salesperson/:id/stats: últimas ligações do vendedor */
export interface RespostaLigacoesRecentesVendedor {
  salespersonId: string;
  recentCalls: LigacaoRecenteVendedor[];
}

/** POST /api/upload-zip: importação direta de leads (sem campanha) */
export interface RespostaImportacaoZipDireta {
  totalProcessed: number;
  insertedCount: number;
  skippedDuplicates: number;
  errors: unknown[];
}

/** POST /api/seed-samples: leads de exemplo */
export interface RespostaSementes {
  message: string;
}

/** POST /api/campaign/simulate-action: ação simulada sobre um lead */
export interface RespostaAcaoSimulada {
  success: true;
  lead: unknown;
}

/** POST /api/campaign/distribute: distribuição de leads no Pipeline para ligação */
export interface RespostaDistribuicaoCampanha {
  success: true;
  totalDistributed: number;
  remaining: number;
  summary: unknown;
  message: string;
}

/** POST /api/leads/:leadId/simulate-reply */
export interface RespostaRespostaSimulada {
  success: true;
  message: LeadChatMessage;
}

/** GET /api/infrastructure/status: saúde do servidor, banco, WhatsApp e fila */
export interface RespostaStatusInfraestrutura {
  status: 'ok';
  timestamp: string;
  server: string;
  database: { connected: boolean; starting: boolean };
  whatsapp: Record<string, unknown> & { plan: { planRpm: number; dispatchRpm: number } };
  [chave: string]: unknown;
}

/* ---------- Experiências de UX (shared/lib/uxRoutes.ts) ---------- */

/** GET /api/brands: marca com os números vinculados */
export interface RespostaMarca {
  id: string;
  name: string;
  services: string;
  messageTemplates: unknown;
  numberIds: string[];
}
export type RespostaListaMarcas = RespostaMarca[];

/** PATCH /api/brands/:id */
export interface RespostaMarcaAtualizada {
  id: string;
  name: string;
  services: string;
}

/** PUT /api/brands/:id/numbers */
export interface RespostaVinculoMarcaNumeros {
  brandId: string;
  numberIds: string[];
}

/** GET /api/phone-numbers: número com as marcas que o usam */
export interface RespostaNumero {
  id: string;
  label: string;
  phoneDisplay: string | null;
  metaPhoneNumberId: string | null;
  fluxoInstanceId: string | null;
  brandIds: string[];
}
export type RespostaListaNumeros = RespostaNumero[];

/** PATCH /api/phone-numbers/:id */
export interface RespostaNumeroAtualizado {
  id: string;
  label: string;
  phoneDisplay: string | null;
  metaPhoneNumberId: string | null;
}

/** PUT /api/campaign/batches/:id/brand */
export interface RespostaVinculoSafraMarca {
  batchId: string;
  brandId: string | null;
}

/** Pedido de bloqueio de um lead, como sai do banco */
export interface PedidoBloqueioLead {
  id: string;
  reasonCode: string;
  reasonText: string | null;
  status: string;
  decisionNote: string | null;
  requestedAt: string;
  decidedAt: string | null;
}
export type RespostaListaPedidosBloqueioLead = PedidoBloqueioLead[];

/** GET /api/regras-contato */
export interface RegraContatoLinha {
  id: string;
  nome: string;
  tipo: string;
  escopo: string;
  marcaId: string | null;
  marcaNome: string | null;
  maxContatos: number | null;
  janelaHoras: number | null;
  ativa: boolean;
}
export type RespostaListaRegrasContato = RegraContatoLinha[];

/** PATCH e DELETE /api/regras-contato/:id */
export interface RespostaConfirmacao {
  ok: true;
}

/** POST /api/regras-contato/previa */
export interface RespostaPreviaRegras {
  emEspera: number;
  passariam: number;
  barrados: number;
}

/** Remessa com a contagem de leads, bloqueados e contatados hoje */
export interface RemessaCentral {
  id: string;
  name: string;
  createdAt: string;
  leadCount: number;
  blockedCount: number;
  contatadosHoje: number;
}

/** GET /api/central/remessas */
export interface RespostaCentralRemessas {
  remessas: RemessaCentral[];
  semRemessa: number;
  tamanhosBloco: readonly number[];
}

/** GET /api/block-requests: pedido de bloqueio com o lead */
export interface PedidoBloqueioFila {
  id: string;
  leadId: string;
  requestedBy: string | null;
  reasonCode: string;
  reasonText: string | null;
  status: string;
  decidedBy: string | null;
  decisionNote: string | null;
  requestedAt: string;
  decidedAt: string | null;
}
export type RespostaListaPedidosBloqueio = PedidoBloqueioFila[];

/** PATCH /api/block-requests/:id */
export interface RespostaDecisaoBloqueio {
  id: string;
  status: string;
}

/** Bloco salvo por ID, como sai de GET /api/central/selections */
export interface SelecaoCentral {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  contatadosHoje: number;
}
export type RespostaListaSelecoesCentral = SelecaoCentral[];

/** GET /api/central/analise: leads com histórico de envio */
export interface RespostaAnaliseCentral {
  leads: Array<Record<string, unknown>>;
  total: number;
}

/* ---------- Respostas de criação e saúde (status 200/201/202) ---------- */

/** GET /api/health (e /api/status simples): saúde do servidor */
export interface RespostaSaudeBasica {
  status: 'ok';
  timestamp: string;
  database: { connected: boolean; starting: boolean };
}

/** GET de saúde detalhada: uptime e banco */
export interface RespostaSaudeSimples {
  status: 'ok';
  uptime: number;
  database: string;
  timestamp: string;
}

/** POST de webhook que já foi processado (mesmo event_id) */
export interface RespostaWebhookJaProcessado {
  status: 'already_processed';
  event_id: string;
  accepted_at: string;
}

/** POST de webhook recebido e aceito para processamento */
export interface RespostaWebhookRecebido {
  status: 'received';
  received: true;
  event_id: string;
  accepted_at: string;
}

/** POST /api/upload-zip (ZIP grande): enfileirado no BullMQ */
export interface RespostaZipEnfileirado {
  success: true;
  queued: true;
  message: string;
  fileName: string;
}

/** POST /api/leads/:leadId/read quando a Meta não marca como lida */
export interface RespostaLeituraNaoMarcada {
  success: true;
  marked: false;
  reason: string;
  message: string;
}

/** POST /api/brands */
export interface RespostaMarcaCriada {
  id: string;
  name: string;
}

/** POST /api/phone-numbers */
export interface RespostaNumeroCriado {
  id: string;
  label: string;
}

/** POST /api/regras-contato */
export interface RespostaRegraCriada {
  id: string;
}

/** POST /api/central/remessas */
export interface RespostaRemessaCriada {
  id: string;
  name: string;
}

/** POST /api/central/selections */
export interface RespostaSelecaoCriada {
  id: string;
  name: string;
  size: number;
}

/** POST /api/leads/... pedido de bloqueio criado */
export interface RespostaPedidoBloqueioCriado {
  id: string;
  status: string;
}

/** POST /api/campaign/batches (criada pela central, com marca) */
export interface RespostaSafraCriadaUx {
  batchId: string;
  name: string;
  brandId: string | null;
  total: number;
}

/** POST /api/salespeople/distribute-roulette: o front envia `count`; `maxCount` ficou só por compatibilidade */
export interface RequisicaoDistribuicaoRoleta {
  leadType?: string;
  count?: number | null;
  maxCount?: number;
}
