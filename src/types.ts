export type ColumnStatus = 
  | 'Leads'
  | 'Ligação 1'
  | 'Ligação 2'
  | 'Ligação 3'
  | 'Ligação 4'
  | 'Interessado'
  | 'Fechado'
  | 'Recusado';

export const PIPELINE_COLUMNS: ColumnStatus[] = [
  'Leads',
  'Ligação 1',
  'Ligação 2',
  'Ligação 3',
  'Ligação 4',
  'Interessado',
  'Fechado',
  'Recusado'
];

export type MasterColumnId = 'novos' | 'tentativas' | 'interessados' | 'fechados' | 'recusados';

export type InteressadoSubStage = 
  | 'Contato Inicial'
  | 'Site Enviado'
  | 'Site Visualizado'
  | 'Em Decisão';

export type LossReason =
  | 'Sem Interesse'
  | 'Sem Orçamento'
  | 'Não Atendeu'
  | 'Concorrente'
  | 'Outro';

export interface CustomTag {
  id: string;
  name: string;
  color: string;
  bgColor: string;
  createdAt?: string;
}

export interface Salesperson {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  color: string;
  bgColor: string;
  isDefault?: boolean;
  slug?: string;
  active?: boolean;
  canGenerateAuditPdf?: boolean;
  whatsappType?: 'business' | 'normal' | 'ask';
  createdAt?: string;
  pctInteressados?: number;
  pctNaoInteressados?: number;
  limiteLeadsDiario?: number;
  leadsRecebidosHoje?: number;
  ativoRoleta?: boolean;
  totalLeads?: number;
  uncontactedLeads?: number;
  inProgressLeads?: number;
  closedLeads?: number;
  refusedLeads?: number;
}

export interface DistributeLeadsParams {
  targetSalespersonId: string;
  mode: 'percentage' | 'count';
  value: number;
  sourceSalespersonId?: string;
}

export type CallTag = string;

export interface CallLog {
  id: string;
  leadId: string;
  tag: string;
  comment: string;
  durationSeconds?: number;
  followUpAt?: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  name: string;
  phoneNumber: string;
  publicUrl?: string;
  website?: string; // Site legado / original do cliente (Google Maps / Google Meu Negócio)
  columnStatus: ColumnStatus;
  createdAt: string;
  updatedAt: string;
  callCount?: number;
  lastCallAt?: string;
  lastCallTag?: string;
  nextFollowUpAt?: string;
  salespersonId?: string;
  salespersonName?: string;
  niche?: string;
  categories?: string | string[];
  city?: string;
  subStatus?: string;
  lossReason?: string;
  hasWhatsAppReply?: boolean;
  whatsappReplied?: boolean;
  respondedAt?: string;
  lastWhatsAppMessage?: string;
  variaveisJson?: Record<string, any>;
  ultimaInteracaoCliente?: string;
  windowExpiresAt?: string;
  notes?: string;
  calls?: CallLog[];
  /** Caixa de entrada: quando foi a última mensagem (de qualquer lado) e quantas não lidas. */
  lastMessageAt?: string;
  unreadCount?: number;
  lastMessageText?: string;
  lastMessageSender?: 'lead' | 'salesperson' | 'system';
  lastMessageStatus?: string;
  lastMessageMediaType?: string;
  lastMessageIsAudio?: boolean;
}

/** Uma conversa na caixa de entrada (`GET /api/inbox`). */
export interface InboxConversation extends Lead {
  lastMessageAt: string;
  unreadCount: number;
}

export interface InboxPage {
  conversations: InboxConversation[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'salesperson';
  salespersonId?: string;
  active: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  action: string;
  details?: string;
  ip?: string;
  createdAt: string;
}

export interface ImportResult {
  totalProcessed: number;
  insertedCount: number;
  skippedDuplicates: number;
  errors: string[];
}

export interface FluxoConfig {
  /** Mascarado (••••1234). O segredo inteiro nunca sai do servidor. */
  apiKey: string;
  apiSecret: string;
  hasApiKey?: boolean;
  hasSecret?: boolean;
  instanceId?: string;
  isConfigured: boolean;
  source: 'env' | 'database' | 'memory' | 'none';
  // Meta Cloud API Oficial
  /** Mascarado, como `apiKey`. */
  metaAccessToken?: string;
  hasMetaToken?: boolean;
  metaWabaId?: string;
  metaPhoneNumberId?: string;
  metaVerifyToken?: string;
  isMetaConfigured?: boolean;
}

export interface FluxoInstance {
  id: string;
  name: string;
  phone: string | null;
  status: 'pending' | 'connected' | 'disconnected' | 'suspended';
  mode?: 'coexistence' | 'api_only';
  quality?: 'green' | 'yellow' | 'red' | 'unknown';
  throughput_mps?: number;
  messaging_limit_24h?: number;
}

export type CampaignLeadStatus = 
  | 'STAGING'
  | 'DISPARADO'
  | 'QUARENTENA'
  | 'INTERESSADO'
  | 'FRIO'
  | 'DESCARTADO'
  /** A FluxoAPI/Meta recusou o envio (telefone inválido, sem WhatsApp, modelo reprovado...). */
  | 'FALHA';

export interface CampaignLead {
  id: string;
  batchId?: string;
  name: string;
  phoneNumber: string;
  isMobile: boolean;
  publicUrl?: string;
  website?: string;
  niche?: string;
  status: CampaignLeadStatus;
  quarantineExpiresAt?: string;
  sentAt?: string;
  respondedAt?: string;
  responsePreview?: string;
  assignedSalespersonId?: string;
  assignedSalespersonName?: string;
  createdAt: string;
}

export interface CampaignBatch {
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

export interface CampaignCopyTemplate {
  id: string;
  name: string;
  description?: string;
  category?: 'prospeccao' | 'followup' | 'reativacao' | 'personalizado';
  metaTemplateName?: string;
  var1: string;
  var2: string;
  var3: string;
  createdAt: string;
  updatedAt?: string;
  isDefault?: boolean;
}

export interface LeadChatMessage {
  id: string;
  leadId: string;
  sender: 'lead' | 'salesperson' | 'system';
  senderName?: string;
  text: string;
  templateName?: string;
  timestamp: string;
  status?: 'sending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  /** Posto do status (queued 0 → sent 1 → delivered 2 → read 3; failed 9). */
  statusRank?: number;
  /** ID da mensagem na FluxoAPI (msg_…). */
  remoteMessageId?: string;
  /** Motivo da falha, quando status === 'failed' (code/message/action vindos da FluxoAPI). */
  error?: { code?: string; message?: string; action?: string; request_id?: string; requestId?: string } | string;
  isAudio?: boolean;
  audioUrl?: string;
  audioDuration?: number;
  mediaType?: 'audio' | 'image' | 'document' | 'video';
  mediaUrl?: string;
  mediaName?: string;
  sentFromPhone?: boolean;
  replyToWamid?: string;
}

export interface QuickReply {
  id: string;
  salespersonId?: string | null;
  shortcut: string;
  title: string;
  type: 'text' | 'audio' | 'image' | 'document';
  content: string;
  mediaUrl?: string;
  createdAt?: string;
}

