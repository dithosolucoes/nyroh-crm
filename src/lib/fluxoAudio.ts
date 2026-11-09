/**
 * Monta o bloco `media` de um envio de áudio para a FluxoAPI.
 * Nota de voz (microfone no WhatsApp) exige `voice: true` junto do OGG/Opus.
 * Por padrão o áudio sai como nota de voz (OGG/Opus, convertido pelo ffmpeg).
 * Para desligar, defina FLUXO_AUDIO_VOICE=false na Railway.
 */
export function buildFluxoAudioMedia(url: string, _voiceEnabled: boolean): { url: string } {
  // A FluxoAPI não documenta campo de nota de voz no envio: quem decide é o arquivo (.ogg com Opus).
  return { url };
}

export function isFluxoAudioVoiceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  // Ligado por padrão: só desliga se FLUXO_AUDIO_VOICE=false
  return String(env.FLUXO_AUDIO_VOICE || '').trim().toLowerCase() !== 'false';
}
