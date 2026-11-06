/**
 * Monta o bloco `media` de um envio de áudio para a FluxoAPI.
 * Nota de voz (microfone no WhatsApp) exige `voice: true` junto do OGG/Opus.
 * O envio como nota de voz fica atrás da variável FLUXO_AUDIO_VOICE=true,
 * até confirmar que a FluxoAPI aceita o campo sem recusar o envio.
 */
export function buildFluxoAudioMedia(url: string, voiceEnabled: boolean): { url: string; voice?: true } {
  return voiceEnabled ? { url, voice: true } : { url };
}

export function isFluxoAudioVoiceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.FLUXO_AUDIO_VOICE || '').trim().toLowerCase() === 'true';
}
