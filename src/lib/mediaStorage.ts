/**
 * Armazenamento PRÓPRIO e durável de mídia (substitui litterbox/uguu/tmpfiles).
 *
 * Por quê:
 *  - A Meta baixa a mídia de saída pela `media.url` NO MOMENTO do envio (§A3): precisa ser uma
 *    URL HTTPS pública, estável e com resposta 200 direta.
 *  - A mídia de entrada some da Meta em 30 dias (§A6): é preciso guardar uma cópia nossa.
 *  - O navegador NÃO consegue abrir `api.fluxoapi.com.br/...` (exige assinatura HMAC → 401).
 *
 * Onde fica o arquivo (nesta ordem):
 *   1. UPLOADS_DIR (env)
 *   2. <RAILWAY_VOLUME_MOUNT_PATH>/uploads  → monte um Volume da Railway para NÃO perder a mídia no deploy
 *   3. ./uploads (efêmero na Railway sem volume — o app avisa no boot)
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let cachedDir: string | null = null;

export function getUploadsDir(): string {
  if (cachedDir) return cachedDir;
  const envDir = (process.env.UPLOADS_DIR || '').trim();
  const volume = (process.env.RAILWAY_VOLUME_MOUNT_PATH || '').trim();
  const dir = envDir
    ? path.resolve(envDir)
    : volume
    ? path.join(volume, 'uploads')
    : path.join(process.cwd(), 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  cachedDir = dir;
  return dir;
}

/** true quando o diretório de mídia é persistente (volume/dir explícito); false = some no deploy. */
export function isUploadsDirDurable(): boolean {
  return Boolean((process.env.UPLOADS_DIR || '').trim() || (process.env.RAILWAY_VOLUME_MOUNT_PATH || '').trim());
}

/** Base pública do Nyroh (sem barra final). Vazia se não configurada. */
export function publicBaseUrl(): string {
  const explicit = (process.env.APP_PUBLIC_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const railwayDomain = (process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  if (railwayDomain) return `https://${railwayDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  return '';
}

const MIME_EXT: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt'
};

/** Extensões permitidas em /uploads. Qualquer outra vira `.bin` (impede servir .html/.svg/.js na origem do CRM). */
const SAFE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif',
  'mp4', '3gp', 'mov',
  'mp3', 'm4a', 'aac', 'amr', 'ogg', 'opus', 'webm', 'wav',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip'
]);

/** Extensão segura a partir do mime (ignora parâmetros como `; codecs=opus`) ou do nome do arquivo. */
export function extensionFor(mime?: string | null, filename?: string | null, fallback = 'bin'): string {
  const baseMime = String(mime || '').split(';')[0].trim().toLowerCase();
  if (baseMime && MIME_EXT[baseMime]) return MIME_EXT[baseMime];
  const m = /\.([a-zA-Z0-9]{1,8})$/.exec(String(filename || ''));
  const fromName = m ? m[1].toLowerCase() : '';
  if (fromName && SAFE_EXTENSIONS.has(fromName)) return fromName;
  return SAFE_EXTENSIONS.has(fallback) ? fallback : 'bin';
}

export interface SavedMedia {
  fileName: string;
  /** Caminho servido pelo Nyroh: /uploads/<arquivo> (público) ou /media/inbox/<arquivo> (com login). */
  relativeUrl: string;
  /** URL absoluta (HTTPS) quando APP_PUBLIC_URL/domínio da Railway está configurado; senão ''. */
  publicUrl: string;
  bytes: number;
}

/** Pasta das mídias RECEBIDAS dos clientes (servida só para quem está logado). */
export const INBOX_SUBDIR = 'inbox';

export function getInboxDir(): string {
  const dir = path.join(getUploadsDir(), INBOX_SUBDIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Grava o arquivo com nome ALEATÓRIO.
 *
 * `scope`:
 *  - 'outbound' (padrão): mídia que NÓS enviamos. Fica em /uploads, público por necessidade —
 *    a Meta baixa esse arquivo pela URL no momento do envio.
 *  - 'inbound': mídia que o CLIENTE mandou (foto, áudio, documento). Vai para uma pasta
 *    separada, servida só para quem está logado. Antes caía no mesmo /uploads público:
 *    qualquer pessoa com o link abria o documento de um cliente.
 */
export async function saveMediaBuffer(
  buffer: Buffer,
  opts: { mime?: string | null; filename?: string | null; fallbackExt?: string; scope?: 'inbound' | 'outbound' } = {}
): Promise<SavedMedia> {
  const ext = extensionFor(opts.mime, opts.filename, opts.fallbackExt || 'bin');
  const fileName = `${crypto.randomUUID().replace(/-/g, '')}.${ext}`;
  const isInbound = opts.scope === 'inbound';
  const targetDir = isInbound ? getInboxDir() : getUploadsDir();
  await fs.promises.writeFile(path.join(targetDir, fileName), buffer);
  const relativeUrl = isInbound ? `/media/inbox/${fileName}` : `/uploads/${fileName}`;
  const base = publicBaseUrl();
  return {
    fileName,
    relativeUrl,
    // Mídia de entrada não tem URL pública: ela não deve ser aberta sem login.
    publicUrl: !isInbound && base ? `${base}${relativeUrl}` : '',
    bytes: buffer.length
  };
}

/** Limites de tamanho da Meta por tipo de mídia (§A3), em bytes. */
export const MEDIA_LIMITS: Record<'image' | 'audio' | 'video' | 'document', number> = {
  image: 5 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024
};
