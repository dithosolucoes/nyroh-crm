import { executeFluxoRequest, fluxoInstancePath } from './fluxoClient.js';

/**
 * Monta o bloco `media` de um envio de áudio para a FluxoAPI (por link).
 * ATENÇÃO: por link a Meta recebe como arquivo de áudio, NÃO como nota de voz.
 */
export function buildFluxoAudioMedia(url: string, _voiceEnabled: boolean): { url: string } {
  return { url };
}

/**
 * Sobe o áudio em /media da FluxoAPI (ela converte para OGG/Opus) e devolve o id.
 * Enviar com { id, voice: true } é o caminho de nota de voz (onda + microfone).
 * Retorna null se falhar; quem chama faz fallback para o envio por link.
 */
export async function uploadFluxoAudioMedia(
  dataUri: string,
  instanceId: string,
  apiKey: string,
  apiSecret: string
): Promise<string | null> {
  const sep = dataUri.indexOf(';base64,');
  if (!dataUri.startsWith('data:') || sep === -1) return null;
  const mime = dataUri.slice(5, sep).trim() || 'audio/webm';
  const data = dataUri.slice(sep + 8);
  if (!data) return null;
  const r = await executeFluxoRequest({
    method: 'POST',
    path: fluxoInstancePath('/media', instanceId),
    body: { mime, data },
    apiKey,
    apiSecret
  });
  const id = r.data?.data?.id ?? r.data?.id;
  return r.success && id ? String(id) : null;
}

export function isFluxoAudioVoiceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  // Ligado por padrão: só desliga se FLUXO_AUDIO_VOICE=false
  return String(env.FLUXO_AUDIO_VOICE || '').trim().toLowerCase() !== 'false';
}
