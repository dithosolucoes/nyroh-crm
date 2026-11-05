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

async function graphRequest(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ success: boolean; status: number; data: any; error?: string }> {
  const { accessToken } = getMetaCredentials();
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

export async function metaSendText(to: string, body: string) {
  const { phoneNumberId } = getMetaCredentials();
  if (!phoneNumberId) return { success: false, status: 0, data: null, error: 'META_PHONE_NUMBER_ID não configurado.' };
  return graphRequest('POST', `/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to: toMetaPhone(to),
    type: 'text',
    text: { body }
  });
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
}) {
  const { phoneNumberId } = getMetaCredentials();
  if (!phoneNumberId) return { success: false, status: 0, data: null, error: 'META_PHONE_NUMBER_ID não configurado.' };

  const components: any[] = [];
  if (opts.headerImageUrl) {
    components.push({ type: 'header', parameters: [{ type: 'image', image: { link: opts.headerImageUrl } }] });
  }
  const vars = opts.variables || {};
  const keys = Object.keys(vars).sort((a, b) => Number(a) - Number(b));
  if (keys.length) {
    components.push({ type: 'body', parameters: keys.map(k => ({ type: 'text', text: String(vars[k] ?? '') })) });
  }

  return graphRequest('POST', `/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to: toMetaPhone(opts.to),
    type: 'template',
    template: {
      name: opts.name,
      language: { code: opts.language || 'pt_BR' },
      ...(components.length ? { components } : {})
    }
  });
}

/** Lista os números da conta WABA (para o CRM mostrar o que já está na Meta). */
export async function metaListPhoneNumbers() {
  const { wabaId } = getMetaCredentials();
  if (!wabaId) return { success: false, status: 0, data: null, error: 'META_WABA_ID não configurado.' };
  return graphRequest('GET', `/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status,name_status&limit=100`);
}

/** Lista os modelos de mensagem da conta WABA com o status de aprovação. */
export async function metaListTemplates() {
  const { wabaId } = getMetaCredentials();
  if (!wabaId) return { success: false, status: 0, data: null, error: 'META_WABA_ID não configurado.' };
  return graphRequest('GET', `/${wabaId}/message_templates?fields=name,language,status,category,components&limit=200`);
}
