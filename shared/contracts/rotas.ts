import type { User, AuditLog, Salesperson, CustomTag, Lead } from '../types';
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
  lead: unknown;
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
