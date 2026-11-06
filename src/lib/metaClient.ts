// Cliente direto da WhatsApp Cloud API (Meta Graph API), sem BSP/FluxoAPI.
// Usa META_ACCESS_TOKEN, META_PHONE_NUMBER_ID, META_WABA_ID e META_APP_SECRET.
import crypto from 'node:crypto';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export function getMetaProvider(): 'meta' | 'fluxo' {
  return (process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase() === 'meta' ? 'meta' : 'fluxo';
}

export function getMetaCredentials() {
  return {
    accessToken: (process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || '').trim(),
    phoneNumberId: (process.env.META_PHONE_NUMBER_ID || '').trim(),
    wabaId: (process.env.META_WABA_ID || process.env.WHATSAPP_WABA_ID || '').trim(),
    appSecret: (process.env.META_APP_SECRET || '').trim()
  };
}

/** Valida X-Hub-Signature-256 (HMAC-SHA256 do corpo bruto com o App Secret). Falha fechada sem segredo. */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | undefined, appSecret = getMetaCredentials().appSecret): { isValid: boolean; reason?: string } {
  if (!appSecret) return { isValid: false, reason: 'META_APP_SECRET não configurado: webhook da Meta recusado.' };
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return { isValid: false, reason: 'Cabeçalho X-Hub-Signature-256 ausente.' };
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { isValid: false, reason: 'Assinatura da Meta não confere.' };
  return { isValid: true };
}

async function graphRequest(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, tokenOverride?: string): Promise<{ success: boolean; status: number; data: any; error?: string }> {
  const accessToken = tokenOverride || getMetaCredentials().accessToken;
  if (!accessToken) return { success: false, status: 0, data: null, error: 'META_ACCESS_TOKEN não configurado.' };
  try {
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      return { success: false, status: res.status, data, error: msg };
    }
    return { success: true, status: res.status, data };
  } catch (err: any) {
    return { success: false, status: 0, data: null, error: err?.message || 'Falha de rede ao falar com a Meta.' };
  }
}

/** Normaliza para E.164 sem '+' (formato que a Graph API aceita). */
function toMetaPhone(phone: string): string {
  return String(phone || '').replace(/\D/g, '');
}


// ============================================================================
// MULTI-BM / MULTI-NÚMERO
// ============================================================================
// Contas (BM/WABA) cadastradas no CRM ficam no banco com o token CRIPTOGRAFADO (AES-256-GCM).
// O servidor carrega esse registro em memória; cada número aponta para a conta dona, e assim
// envio, leitura e download de mídia usam o token certo para o número certo.
// Sem registro, tudo cai no conjunto META_* do ambiente (conta "env"), como antes.

export interface MetaAccountRecord {
  id: string;
  name: string;
  wabaId: string;
  businessId?: string | null;
  accessToken: string; // já em claro só na memória; no banco fica criptografado
}

export interface MetaNumberRecord {
  phoneNumberId: string;
  accountId: string;
  displayPhoneNumber: string;
  verifiedName?: string | null;
  qualityRating?: string | null;
  status?: string | null;
}

const metaAccountsById = new Map<string, MetaAccountRecord>();
const metaNumberRoute = new Map<string, MetaNumberRecord>();

export function setMetaRegistry(accounts: MetaAccountRecord[], numbers: MetaNumberRecord[]) {
  metaAccountsById.clear();
  metaNumberRoute.clear();
  for (const a of accounts) metaAccountsById.set(a.id, a);
  for (const n of numbers) metaNumberRoute.set(n.phoneNumberId, n);
}

export function listMetaRegistry() {
  return {
    accounts: Array.from(metaAccountsById.values()).map(a => ({ id: a.id, name: a.name, wabaId: a.wabaId, businessId: a.businessId || null })),
    numbers: Array.from(metaNumberRoute.values())
  };
}

/** Token + número usados para um phone_number_id: o registro cadastrado, ou o do ambiente. */
export function resolveMetaSender(phoneNumberId?: string | null): { accessToken: string; phoneNumberId: string; wabaId: string; accountId: string } {
  const env = getMetaCredentials();
  const pid = String(phoneNumberId || '').trim();
  if (pid) {
    const route = metaNumberRoute.get(pid);
    if (route) {
      const acc = metaAccountsById.get(route.accountId);
      if (acc) return { accessToken: acc.accessToken, phoneNumberId: pid, wabaId: acc.wabaId, accountId: acc.id };
    }
  }
  // Sem número escolhido nem número no ambiente: usa o primeiro número cadastrado no CRM
  if (!pid && !env.phoneNumberId) {
    const first = Array.from(metaNumberRoute.values())[0];
    if (first) {
      const acc = metaAccountsById.get(first.accountId);
      if (acc) return { accessToken: acc.accessToken, phoneNumberId: first.phoneNumberId, wabaId: acc.wabaId, accountId: acc.id };
    }
  }
  return { accessToken: env.accessToken, phoneNumberId: pid || env.phoneNumberId, wabaId: env.wabaId, accountId: 'env' };
}

/** Criptografia do token no banco. Chave: META_TOKEN_ENCRYPTION_KEY (qualquer texto longo, guardado no Railway). */
function encryptionKey(): Buffer {
  const raw = (process.env.META_TOKEN_ENCRYPTION_KEY || '').trim();
  if (!raw) throw new Error('META_TOKEN_ENCRYPTION_KEY não configurada: não dá para guardar token de outra BM.');
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptMetaToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

export function decryptMetaToken(payload: string): string {
  const [v, ivB64, tagB64, dataB64] = String(payload).split(':');
  if (v !== 'v1' || !ivB64 || !tagB64 || !dataB64) throw new Error('Token criptografado em formato desconhecido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/** Baixa uma mídia recebida: pega a URL temporária na Graph API e baixa com o token da conta dona do número. */
export async function metaDownloadMedia(mediaId: string, phoneNumberId?: string | null): Promise<{ success: boolean; buffer?: Buffer; contentType?: string; error?: string; status?: number }> {
  const sender = resolveMetaSender(phoneNumberId);
  if (!sender.accessToken) return { success: false, error: 'Token da Meta não configurado.', status: 0 };
  const meta = await graphRequest('GET', `/${encodeURIComponent(mediaId)}`, undefined, sender.accessToken);
  if (!meta.success || !meta.data?.url) return { success: false, error: meta.error || 'Meta não devolveu a URL da mídia.', status: meta.status };
  try {
    const res = await fetch(meta.data.url, { headers: { Authorization: `Bearer ${sender.accessToken}` } });
    if (!res.ok) return { success: false, error: `Download da mídia falhou (HTTP ${res.status}).`, status: res.status };
    const buffer = Buffer.from(await res.arrayBuffer());
    return { success: true, buffer, contentType: meta.data.mime_type || res.headers.get('content-type') || undefined };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha de rede no download da mídia.', status: 0 };
  }
}

/** Token + WABA de uma conta: 'env' (ou vazio) = variáveis do ambiente; outro id = BM cadastrada no CRM. */
export function resolveMetaAccount(accountId?: string | null): { accountId: string; name: string; accessToken: string; wabaId: string } | null {
  const id = String(accountId || '').trim();
  if (!id || id === 'env') {
    const env = getMetaCredentials();
    return { accountId: 'env', name: 'Ambiente (padrão)', accessToken: env.accessToken, wabaId: env.wabaId };
  }
  const acc = metaAccountsById.get(id);
  return acc ? { accountId: acc.id, name: acc.name, accessToken: acc.accessToken, wabaId: acc.wabaId } : null;
}

/** Busca os números e modelos de UMA conta (BM) direto da Meta, para sincronizar. */
export async function metaSyncAccount(account: MetaAccountRecord) {
  const [phones, templates] = await Promise.all([
    graphRequest('GET', `/${account.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status,name_status&limit=100`, undefined, account.accessToken),
    graphRequest('GET', `/${account.wabaId}/message_templates?fields=id,name,language,status,category,components,quality_score,rejected_reason&limit=200`, undefined, account.accessToken)
  ]);
  return { phones, templates };
}

/** Valida um token antes de cadastrar: a Meta responde com o nome da conta. */
export async function metaValidateToken(accessToken: string) {
  return graphRequest('GET', '/me?fields=id,name', undefined, accessToken);
}

export async function metaSendText(to: string, body: string, phoneNumberId?: string) {
  const sender = resolveMetaSender(phoneNumberId);
  if (!sender.phoneNumberId) return { success: false, status: 0, data: null, error: 'META_PHONE_NUMBER_ID não configurado.' };
  return graphRequest('POST', `/${sender.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to: toMetaPhone(to),
    type: 'text',
    text: { body }
  }, sender.accessToken);
}

/**
 * Envia um modelo aprovado. Variáveis posicionais: as chaves numéricas ("1","2",...) viram parâmetros do corpo, em ordem.
 * Link de imagem do cabeçalho vira componente de header.
 */
export async function metaSendTemplate(opts: {
  to: string;
  name: string;
  language?: string;
  variables?: Record<string, string>;
  headerImageUrl?: string;
  phoneNumberId?: string;
  /** Valores dos botões de URL dinâmica (índice do botão no modelo -> sufixo do link). */
  urlButtonValues?: Array<{ index: number; value: string }>;
}) {
  const sender = resolveMetaSender(opts.phoneNumberId);
  if (!sender.phoneNumberId) return { success: false, status: 0, data: null, error: 'META_PHONE_NUMBER_ID não configurado.' };

  const components: any[] = [];
  if (opts.headerImageUrl) {
    components.push({ type: 'header', parameters: [{ type: 'image', image: { link: opts.headerImageUrl } }] });
  }
  const vars = opts.variables || {};
  const rawKeys = Object.keys(vars);
  const allNumeric = rawKeys.length > 0 && rawKeys.every(k => /^\d+$/.test(k));
  const keys = allNumeric ? rawKeys.sort((a, b) => Number(a) - Number(b)) : rawKeys;
  if (keys.length) {
    components.push({ type: 'body', parameters: keys.map(k => ({ type: 'text', text: String(vars[k] ?? '') })) });
  }
  for (const b of opts.urlButtonValues || []) {
    if (!Number.isInteger(b.index) || b.index < 0 || !String(b.value || '').trim()) continue;
    components.push({ type: 'button', sub_type: 'url', index: String(b.index), parameters: [{ type: 'text', text: String(b.value).trim() }] });
  }

  return graphRequest('POST', `/${sender.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to: toMetaPhone(opts.to),
    type: 'template',
    template: {
      name: opts.name,
      language: { code: opts.language || 'pt_BR' },
      ...(components.length ? { components } : {})
    }
  }, sender.accessToken);
}

/** Lista os números da conta WABA (para o CRM mostrar o que já está na Meta). */
export async function metaListPhoneNumbers() {
  const { wabaId } = getMetaCredentials();
  if (!wabaId) return { success: false, status: 0, data: null, error: 'META_WABA_ID não configurado.' };
  return graphRequest('GET', `/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status,name_status&limit=100`);
}

/** Lista os modelos de mensagem da conta WABA com o status de aprovação. */
export async function metaListTemplates(accountId?: string) {
  const acc = resolveMetaAccount(accountId);
  if (!acc) return { success: false, status: 0, data: null, error: 'Conta da Meta não encontrada.' };
  if (!acc.wabaId) return { success: false, status: 0, data: null, error: 'META_WABA_ID não configurado.' };
  return graphRequest('GET', `/${acc.wabaId}/message_templates?fields=id,name,language,status,category,components,quality_score,rejected_reason&limit=200`, undefined, acc.accessToken);
}

/** Envia mídia por link HTTPS (imagem, vídeo, áudio ou documento). */
export async function metaSendMedia(opts: {
  to: string;
  kind: 'image' | 'video' | 'audio' | 'document';
  link: string;
  caption?: string;
  filename?: string;
  phoneNumberId?: string;
}) {
  const sender = resolveMetaSender(opts.phoneNumberId);
  if (!sender.phoneNumberId) return { success: false, status: 0, data: null, error: 'META_PHONE_NUMBER_ID não configurado.' };
  const media: Record<string, string> = { link: opts.link };
  if (opts.caption && opts.kind !== 'audio') media.caption = opts.caption;
  if (opts.filename && opts.kind === 'document') media.filename = opts.filename;
  return graphRequest('POST', `/${sender.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to: toMetaPhone(opts.to),
    type: opts.kind,
    [opts.kind]: media
  }, sender.accessToken);
}

/** Marca uma mensagem recebida como lida (aparece o "visto azul" para o cliente). */
export async function metaMarkRead(messageId: string, phoneNumberId?: string) {
  const sender = resolveMetaSender(phoneNumberId);
  if (!sender.phoneNumberId) return { success: false, status: 0, data: null, error: 'META_PHONE_NUMBER_ID não configurado.' };
  return graphRequest('POST', `/${sender.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId
  }, sender.accessToken);
}

/** Cria um modelo na conta WABA. O status inicial é PENDING até a Meta revisar. */
export async function metaCreateTemplate(payload: {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  components: any[];
}, accountId?: string) {
  const acc = resolveMetaAccount(accountId);
  if (!acc) return { success: false, status: 0, data: null, error: 'Conta da Meta não encontrada.' };
  if (!acc.wabaId) return { success: false, status: 0, data: null, error: 'META_WABA_ID não configurado.' };
  return graphRequest('POST', `/${acc.wabaId}/message_templates`, payload, acc.accessToken);
}

/** Apaga um modelo pelo nome (apaga todas as versões de idioma com esse nome). */
export async function metaDeleteTemplate(name: string, accountId?: string) {
  const acc = resolveMetaAccount(accountId);
  if (!acc) return { success: false, status: 0, data: null, error: 'Conta da Meta não encontrada.' };
  if (!acc.wabaId) return { success: false, status: 0, data: null, error: 'META_WABA_ID não configurado.' };
  return graphRequest('DELETE', `/${acc.wabaId}/message_templates?name=${encodeURIComponent(name)}`, undefined, acc.accessToken);
}

/** Número que recebeu a mensagem, segundo o evento do webhook (metadata.phone_number_id). */
export function receivingPhoneNumberId(event: any): string | undefined {
  for (const entry of event?.entry || []) {
    for (const change of entry?.changes || []) {
      const pid = change?.value?.metadata?.phone_number_id;
      if (pid) return String(pid).trim();
    }
  }
  return undefined;
}

/**
 * Coexistência: converte o campo smb_message_echoes do webhook em mensagens "enviadas pelo celular".
 * Mídia vira um rótulo de texto (o arquivo em si não vem nesse evento).
 */
export function parseCoexistenceEchoes(value: any): Array<{ phone: string; text: string; messageId?: string; eventTimestamp?: string }> {
  const echoes: any[] = Array.isArray(value?.message_echoes) ? value.message_echoes : [];
  const LABEL: Record<string, string> = { image: 'Imagem', video: 'Vídeo', audio: 'Áudio', document: 'Documento' };
  return echoes.map(echo => {
    const type = String(echo?.type || 'text');
    const text = echo?.text?.body
      || (type !== 'text' ? `[${LABEL[type] || 'Mídia'} enviada pelo celular]` : '');
    return {
      phone: String(echo?.to || echo?.recipient_id || '').replace(/\D/g, ''),
      text,
      messageId: echo?.id,
      eventTimestamp: echo?.timestamp ? new Date(Number(echo.timestamp) * 1000).toISOString() : undefined
    };
  });
}
