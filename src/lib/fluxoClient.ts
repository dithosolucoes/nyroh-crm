import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { saveMediaBuffer, publicBaseUrl, MEDIA_LIMITS } from './mediaStorage.js';
export { formatAndValidateE164Phone, type PhoneValidationResult } from './phone.js';
export { verifyFluxoWebhook } from './webhookAuth.js';

const execFileAsync = promisify(execFile);

export interface FluxoRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string; // e.g. '/v1/instances' or '/v1/instances/inst_123/messages'
  body?: any;
  apiKey?: string;
  apiSecret?: string;
}

export interface FluxoApiResult<T = any> {
  success: boolean;
  status: number;
  data?: T;
  error?: {
    code: string;
    message: string;
    request_id?: string;
    hint?: string;
    required_scope?: string;
    window_expired_at?: string | null;
    meta_code?: number | null;
  };
  raw?: any;
  latencyMs?: number;
  /** Segundos pedidos pela API no cabeçalho Retry-After (429). */
  retryAfterSec?: number;
  /** true quando a API respondeu com `replayed: true` (idempotência). */
  replayed?: boolean;
}

const EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** Base da API. Sobrescrevível por FLUXO_BASE_URL (usado pelo mock local nos testes E2E). */
export function fluxoBaseUrl(): string {
  return (process.env.FLUXO_BASE_URL || 'https://api.fluxoapi.com.br').trim().replace(/\/+$/, '');
}

/**
 * Cria a assinatura HMAC-SHA256 padrão oficial exigida pela FluxoAPI
 */
export function buildFluxoAuthHeaders(
  method: string,
  pathWithQuery: string,
  bodyString: string,
  apiKey: string,
  apiSecret: string
) {
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const bodyHash = bodyString
    ? crypto.createHash('sha256').update(bodyString).digest('hex')
    : EMPTY_BODY_SHA256;

  const signedString = [
    'v1',
    ts,
    nonce,
    method.toUpperCase(),
    pathWithQuery,
    bodyHash
  ].join('\n');

  const signature = 'v1=' + crypto
    .createHmac('sha256', apiSecret)
    .update(signedString)
    .digest('hex');

  return {
    headers: {
      'Content-Type': 'application/json',
      'X-Fluxo-Key': apiKey,
      'X-Fluxo-Timestamp': ts,
      'X-Fluxo-Nonce': nonce,
      'X-Fluxo-Signature': signature
    },
    debug: {
      ts,
      nonce,
      bodyHash,
      signedStringPreview: signedString.replace(/\n/g, ' \\n ')
    }
  };
}

/**
 * Executa uma chamada autenticada à FluxoAPI
 */
export async function executeFluxoRequest<T = any>(
  options: FluxoRequestOptions
): Promise<FluxoApiResult<T>> {
  const apiKey = (options.apiKey || process.env.FLUXO_KEY || '').trim();
  const apiSecret = (options.apiSecret || process.env.FLUXO_SECRET || '').trim();

  if (!apiKey || !apiSecret) {
    return {
      success: false,
      status: 401,
      error: {
        code: 'missing_credentials',
        message: 'Chave pública (FLUXO_KEY) ou Segredo (FLUXO_SECRET) não foram fornecidos.'
      }
    };
  }

  const method = (options.method || 'GET').toUpperCase();
  const path = options.path.startsWith('/') ? options.path : `/${options.path}`;
  const normalizedPath = path.startsWith('/v1') ? path : `/v1${path}`;
  const bodyString = options.body ? JSON.stringify(options.body) : '';

  const { headers } = buildFluxoAuthHeaders(
    method,
    normalizedPath,
    bodyString,
    apiKey,
    apiSecret
  );

  const url = `${fluxoBaseUrl()}${normalizedPath}`;
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: bodyString || undefined,
      signal: AbortSignal.timeout(30000)
    });

    const latencyMs = Date.now() - startTime;
    const text = await response.text();
    let json: any = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { rawResponse: text };
    }

    const retryAfterRaw = Number(response.headers.get('retry-after'));
    const retryAfterSec = Number.isFinite(retryAfterRaw) && retryAfterRaw > 0 ? retryAfterRaw : undefined;

    if (response.ok) {
      return {
        success: true,
        status: response.status,
        data: json?.data !== undefined ? json.data : json,
        raw: json,
        latencyMs,
        replayed: json?.replayed === true || response.headers.get('x-fluxo-idempotent-replay') === 'true'
      };
    } else {
      return {
        success: false,
        status: response.status,
        error: json?.error || {
          code: `http_${response.status}`,
          message: json?.message || text || 'Erro na resposta da FluxoAPI.'
        },
        raw: json,
        latencyMs,
        retryAfterSec
      };
    }
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      status: 500,
      error: {
        code: 'network_error',
        message: err.message || 'Falha de rede ao conectar à FluxoAPI.'
      },
      latencyMs
    };
  }
}

/**
 * Retorna o caminho oficial com a instância incluída (/v1/instances/{instanceId}{suffix}).
 * Lança erro explícito se a instância não estiver configurada (§A3, §A4, T10).
 */
export function fluxoInstancePath(suffix: string, customInstanceId?: string): string {
  const instanceId = (
    customInstanceId ||
    process.env.FLUXO_INSTANCE_ID ||
    ''
  ).trim();

  if (!instanceId) {
    throw new Error('Instância da FluxoAPI não configurada. Defina FLUXO_INSTANCE_ID ou configure a instância no painel.');
  }

  const cleanSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `/v1/instances/${instanceId}${cleanSuffix}`;
}

/**
 * Baixa mídia binária (áudio, imagem, documento) via FluxoAPI/Meta usando o download_path oficial (§A6, T11)
 * A spec exige usar o download_path literal fornecido no evento (ex.: /v1/messages/{message_id}/media).
 * A Meta apaga a mídia em 30 dias (410 media_expired): baixe ao receber o evento.
 */
export async function downloadFluxoMediaBinary(
  downloadPath: string,
  apiKey?: string,
  apiSecret?: string
): Promise<{ success: boolean; buffer?: Buffer; contentType?: string; status?: number; error?: string }> {
  const key = (apiKey || process.env.FLUXO_KEY || '').trim();
  const secret = (apiSecret || process.env.FLUXO_SECRET || '').trim();

  if (!key || !secret) {
    return { success: false, error: 'Credenciais da FluxoAPI não fornecidas.' };
  }

  // Aceita o caminho puro (/v1/messages/{id}/media) ou uma URL absoluta da própria FluxoAPI.
  let cleanPath = String(downloadPath || '').trim();
  const abs = /^https?:\/\/[^/]+(\/.*)$/i.exec(cleanPath);
  if (abs) cleanPath = abs[1];
  if (!cleanPath) return { success: false, error: 'download_path vazio.' };
  if (!cleanPath.startsWith('/')) cleanPath = `/${cleanPath}`;
  const normalizedPath = cleanPath.startsWith('/v1') ? cleanPath : `/v1${cleanPath}`;

  const { headers } = buildFluxoAuthHeaders('GET', normalizedPath, '', key, secret);
  const url = `${fluxoBaseUrl()}${normalizedPath}`;

  try {
    const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(60000) });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, status: res.status, error: `HTTP ${res.status}: ${errText}` };
    }

    const contentType = res.headers.get('x-media-mime-type') || res.headers.get('content-type') || 'application/octet-stream';
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    return { success: true, buffer, contentType, status: res.status };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================================
// ÁUDIO: formato aceito pelo WhatsApp (OGG/Opus para mensagem de voz)
// ============================================================================

let ffmpegChecked: boolean | null = null;

/** Verifica (uma vez) se o ffmpeg existe no PATH. */
export async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegChecked !== null) return ffmpegChecked;
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    ffmpegChecked = true;
  } catch {
    ffmpegChecked = false;
  }
  return ffmpegChecked;
}

/** Formatos de áudio que a Meta aceita como estão (§A3 / Cloud API). */
function isMetaNativeAudio(mime: string): boolean {
  const m = mime.toLowerCase();
  if (m.includes('ogg') || m.includes('opus')) return m.includes('opus') || m === 'audio/ogg';
  return m.includes('mpeg') || m.includes('mp3') || m.includes('mp4') || m.includes('aac') || m.includes('amr');
}

export interface TranscodeResult {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  /** true se de fato converteu com o ffmpeg. */
  converted: boolean;
  /** Preenchido quando o áudio não pôde ser deixado num formato que a Meta aceita. */
  error?: string;
}

/**
 * Transcodifica áudio do navegador (WebM, WAV, etc.) para OGG/Opus 48kHz mono (voz do WhatsApp).
 * ASSÍNCRONO: não bloqueia o event loop (a versão antiga usava execSync e travava o servidor).
 */
export async function transcodeAudioToWhatsAppVoice(buf: Buffer, inputMime: string): Promise<TranscodeResult> {
  const mime = String(inputMime || 'audio/ogg');
  const baseMime = mime.split(';')[0].trim().toLowerCase();
  const alreadyVoice = baseMime === 'audio/ogg' && /opus/i.test(mime);

  // OGG/Opus já é o formato de voz: não mexe.
  if (alreadyVoice) {
    return { buffer: buf, mimeType: 'audio/ogg; codecs=opus', filename: 'voice_note.ogg', converted: false };
  }

  if (await hasFfmpeg()) {
    const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const inExt = baseMime.includes('webm') ? 'webm' : baseMime.includes('mp4') ? 'mp4' : baseMime.includes('wav') ? 'wav' : baseMime.includes('mpeg') ? 'mp3' : 'bin';
    const inPath = path.join(os.tmpdir(), `audio_in_${tmpId}.${inExt}`);
    const outPath = path.join(os.tmpdir(), `audio_out_${tmpId}.ogg`);
    try {
      await fs.promises.writeFile(inPath, buf);
      await execFileAsync('ffmpeg', ['-y', '-i', inPath, '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', outPath], { timeout: 30000 });
      const stat = await fs.promises.stat(outPath);
      if (stat.size > 100) {
        return { buffer: await fs.promises.readFile(outPath), mimeType: 'audio/ogg; codecs=opus', filename: 'voice_note.ogg', converted: true };
      }
    } catch (err: any) {
      console.warn('[transcodeAudioToWhatsAppVoice] ffmpeg falhou:', err?.message || err);
    } finally {
      fs.promises.unlink(inPath).catch(() => {});
      fs.promises.unlink(outPath).catch(() => {});
    }
  }

  // Sem conversão possível: só segue se a Meta aceitar o formato como está.
  if (isMetaNativeAudio(baseMime)) {
    const ext = baseMime.includes('mp4') ? 'm4a' : baseMime.includes('mpeg') ? 'mp3' : baseMime.includes('aac') ? 'aac' : baseMime.includes('amr') ? 'amr' : 'ogg';
    return { buffer: buf, mimeType: mime, filename: `voice_note.${ext}`, converted: false };
  }

  return {
    buffer: buf,
    mimeType: mime,
    filename: 'voice_note.bin',
    converted: false,
    error: `Formato de áudio "${baseMime}" não é aceito pelo WhatsApp e o ffmpeg não está disponível para converter. Instale o ffmpeg no servidor (nixpacks.toml) ou grave em OGG/Opus.`
  };
}

// ============================================================================
// MÍDIA DE SAÍDA: URL pública HTTPS estável (a Meta baixa no momento do envio — §A3)
// ============================================================================

/**
 * Upload de contingencia em hosts de terceiros. SÓ é usado quando o Nyroh não tem URL pública
 * própria configurada (APP_PUBLIC_URL). Os links expiram (72h) e os serviços caem — não é o caminho padrão.
 */
async function uploadThirdPartyPublicMedia(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  try {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('time', '72h');
    form.append('fileToUpload', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
    const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(8000)
    });
    const urlText = await res.text();
    if (res.ok && urlText.startsWith('http')) return urlText.trim();
  } catch (e: any) {
    console.warn('[uploadThirdPartyPublicMedia] Falha Litterbox:', e?.message || e);
  }
  try {
    const form = new FormData();
    form.append('files[]', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
    const res = await fetch('https://uguu.se/upload', { method: 'POST', body: form, signal: AbortSignal.timeout(8000) });
    const data: any = await res.json();
    if (res.ok && data?.files?.[0]?.url) return data.files[0].url;
  } catch (e: any) {
    console.warn('[uploadThirdPartyPublicMedia] Falha Uguu:', e?.message || e);
  }
  return '';
}

/**
 * Publica o arquivo e devolve a URL pública. Prioridade:
 *  1. Armazenamento próprio (/uploads) sob APP_PUBLIC_URL — durável e sob nosso controle.
 *  2. Contingencia em host de terceiros (com aviso).
 */
export async function uploadDirectPublicMedia(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  if (publicBaseUrl()) {
    const saved = await saveMediaBuffer(buffer, { mime: mimeType, filename });
    if (saved.publicUrl) return saved.publicUrl;
  }
  // Contingencia em servidor de TERCEIROS: manda o arquivo do cliente para um site público externo e o link expira.
  // Por privacidade e confiabilidade só com opt-in explícito (ALLOW_THIRD_PARTY_MEDIA_HOST=true). O normal é ter
  // APP_PUBLIC_URL (na Railway o domínio público é detectado sozinho por RAILWAY_PUBLIC_DOMAIN).
  if (process.env.ALLOW_THIRD_PARTY_MEDIA_HOST === 'true') {
    console.warn('[uploadDirectPublicMedia] APP_PUBLIC_URL ausente — usando host de terceiros (links expiram, arquivo fica público em outro site).');
    return uploadThirdPartyPublicMedia(buffer, filename, mimeType);
  }
  return '';
}

export interface PreparedMedia {
  /** URL HTTPS pública pronta para `media.url`; '' se não foi possível. */
  url: string;
  mimeType?: string;
  filename?: string;
  bytes?: number;
  error?: string;
}

function isPrivateHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'localhost' || host === '0.0.0.0' || host.endsWith('.localhost') || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === '[::1]';
  } catch {
    return false;
  }
}

function kindOfMime(mime: string, hint?: 'image' | 'audio' | 'video' | 'document'): 'image' | 'audio' | 'video' | 'document' {
  if (hint) return hint;
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  return 'document';
}

/**
 * Prepara a mídia de saída: aceita data URI (base64), caminho local (/uploads/...) ou URL http(s),
 * valida tamanho (§A3), converte áudio, e devolve SEMPRE uma URL pública ou um `error` claro.
 * (A versão antiga devolvia '' ou o próprio data URI — a Meta recusava com 131053.)
 */
export async function prepareOutboundMedia(
  input: string,
  fallbackFileName: string,
  kindHint?: 'image' | 'audio' | 'video' | 'document'
): Promise<PreparedMedia> {
  if (!input) return { url: '', error: 'Nenhum arquivo informado para envio.' };

  // 1) Caminho local servido pelo próprio Nyroh → vira URL absoluta
  if (input.startsWith('/uploads/')) {
    const base = publicBaseUrl();
    if (!base) {
      return { url: '', error: 'APP_PUBLIC_URL não configurada: a Meta não consegue baixar arquivos locais. Defina APP_PUBLIC_URL com a URL pública (https) do Nyroh.' };
    }
    return { url: `${base}${input}`, filename: fallbackFileName };
  }

  // 2) URL http(s)
  if (input.startsWith('http://') || input.startsWith('https://')) {
    if (isPrivateHost(input)) {
      return { url: '', error: 'A URL do arquivo aponta para um endereço local/privado; a Meta não consegue baixá-la. Use uma URL pública (https).' };
    }
    return { url: input, filename: fallbackFileName };
  }

  // 3) Data URI base64
  if (input.startsWith('data:')) {
    const sep = input.indexOf(';base64,');
    if (sep === -1) return { url: '', error: 'Arquivo inválido (data URI sem base64).' };
    let mimeType = input.slice(5, sep).trim() || 'application/octet-stream';
    let buf: Buffer;
    try {
      buf = Buffer.from(input.slice(sep + 8), 'base64');
    } catch {
      return { url: '', error: 'Arquivo inválido (base64 corrompido).' };
    }
    if (buf.length === 0) return { url: '', error: 'O arquivo está vazio.' };

    let filename = fallbackFileName || 'arquivo';
    const kind = kindOfMime(mimeType, kindHint);

    if (kind === 'audio') {
      const t = await transcodeAudioToWhatsAppVoice(buf, mimeType);
      if (t.error) return { url: '', error: t.error };
      buf = t.buffer;
      mimeType = t.mimeType;
      filename = t.filename;
    }

    const limit = MEDIA_LIMITS[kind];
    if (buf.length > limit) {
      return {
        url: '',
        error: `Arquivo grande demais para o WhatsApp (${(buf.length / 1048576).toFixed(1)} MB; limite de ${kind === 'image' ? 'imagem' : kind === 'audio' ? 'áudio' : kind === 'video' ? 'vídeo' : 'documento'}: ${(limit / 1048576).toFixed(0)} MB).`
      };
    }

    const url = await uploadDirectPublicMedia(buf, filename, mimeType);
    if (!url) {
      return { url: '', error: 'Não foi possível publicar o arquivo para envio. Configure APP_PUBLIC_URL e um volume de armazenamento (UPLOADS_DIR).' };
    }
    return { url, mimeType, filename, bytes: buf.length };
  }

  return { url: '', error: 'Formato de arquivo não reconhecido.' };
}

/**
 * Compatível com o nome antigo: devolve só a URL ('' se falhar).
 * Prefira `prepareOutboundMedia`, que informa o motivo da falha.
 */
export async function resolveFluxoMediaUrl(inputUrl: string, fallbackFileName: string): Promise<string> {
  const prepared = await prepareOutboundMedia(inputUrl, fallbackFileName);
  return prepared.url;
}

/**
 * Faz upload de mídia binária para envio via FluxoAPI / Meta Cloud
 * Retorna URL direta aceita pela Meta Cloud API
 */
export async function uploadFluxoMediaBinary(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  _apiKey?: string,
  _apiSecret?: string
): Promise<{ success: boolean; url?: string; id?: string; error?: string }> {
  try {
    const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;
    const prepared = await prepareOutboundMedia(dataUri, filename);
    if (!prepared.url) return { success: false, error: prepared.error || 'Falha ao publicar mídia.' };
    return { success: true, url: prepared.url };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
