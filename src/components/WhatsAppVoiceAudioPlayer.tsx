import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Mic, AlertCircle, Loader2 } from 'lucide-react';

interface WhatsAppVoiceAudioPlayerProps {
  audioUrl?: string;
  durationSeconds?: number;
  isOut?: boolean;
  senderName?: string;
}

const BAR_COUNT = 24;

/**
 * Player de mensagem de voz.
 *
 * Regra: só toca o áudio REAL e só desenha a onda REAL do arquivo.
 * Se o áudio não carregar, a mensagem diz isso — nunca inventa som nem onda.
 * (A versão anterior sintetizava voz falsa com oscilador quando o arquivo falhava,
 * e desenhava sempre a mesma onda fixa para qualquer áudio.)
 */
export const WhatsAppVoiceAudioPlayer: React.FC<WhatsAppVoiceAudioPlayerProps> = ({
  audioUrl,
  durationSeconds,
  isOut = true,
  senderName
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [duration, setDuration] = useState<number>(durationSeconds && durationSeconds > 0 ? durationSeconds : 0);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(audioUrl ? 'loading' : 'error');

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 1) Elemento de áudio: fonte da verdade para tocar e para a duração
  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
    setPeaks(null);

    if (!audioUrl) {
      audioRef.current = null;
      setLoadState('error');
      return;
    }

    setLoadState('loading');
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = audioUrl;
    audioRef.current = audio;

    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
      setLoadState('ready');
    };
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onError = () => {
      setLoadState('error');
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.pause();
      audioRef.current = null;
    };
  }, [audioUrl]);

  // 2) Onda real: lê o arquivo e extrai os picos de verdade (nada de onda fixa)
  useEffect(() => {
    if (!audioUrl) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(audioUrl);
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtxClass) return;
        const ctx = new AudioCtxClass();
        const decoded = await ctx.decodeAudioData(buf.slice(0));
        ctx.close().catch(() => {});
        if (cancelled) return;

        const channel = decoded.getChannelData(0);
        const block = Math.floor(channel.length / BAR_COUNT) || 1;
        const computed: number[] = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          let sum = 0;
          const start = i * block;
          const end = Math.min(start + block, channel.length);
          for (let j = start; j < end; j++) sum += channel[j] * channel[j];
          computed.push(Math.sqrt(sum / Math.max(1, end - start)));
        }
        const max = Math.max(...computed, 0.0001);
        setPeaks(computed.map(v => Math.max(8, Math.round((v / max) * 100))));
        if (Number.isFinite(decoded.duration) && decoded.duration > 0) {
          setDuration(prev => (prev > 0 ? prev : decoded.duration));
        }
      } catch {
        // Sem onda real: fica a barra neutra. Nunca inventamos um desenho.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || loadState === 'error') return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }
    audio.playbackRate = playbackSpeed;
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => {
        // Não conseguiu tocar o áudio real → diz isso, não simula som.
        setLoadState('error');
        setIsPlaying(false);
      });
  }, [isPlaying, loadState, playbackSpeed]);

  const handleToggleSpeed = () => {
    const nextSpeed = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
  };

  const handleSeek = (fraction: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const target = fraction * duration;
    audio.currentTime = target;
    setCurrentTime(target);
  };

  const formatTime = (secs: number) => {
    if (!Number.isFinite(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressFraction = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const bars = peaks ?? new Array(BAR_COUNT).fill(22);
  const isLoading = loadState === 'loading';

  if (loadState === 'error') {
    return (
      <div className="flex items-center gap-2 py-2 px-1 min-w-[220px] text-[12px] text-red-700">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>Não foi possível carregar este áudio.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 py-1 min-w-[240px] max-w-xs sm:max-w-sm">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleTogglePlay}
          disabled={isLoading}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-wait text-white"
          title={isPlaying ? 'Pausar áudio' : 'Ouvir mensagem de voz'}
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-5 h-5 fill-current" />
          ) : (
            <Play className="w-5 h-5 fill-current ml-0.5" />
          )}
        </button>

        <div className="flex-1 flex flex-col justify-center gap-1">
          <div
            className="flex items-center gap-[2.5px] h-7 cursor-pointer py-1 select-none"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              handleSeek(Math.max(0, Math.min(1, clickX / rect.width)));
            }}
          >
            {bars.map((height, idx) => {
              const isPassed = idx / bars.length <= progressFraction;
              return (
                <span
                  key={idx}
                  className={`w-[3px] rounded-full transition-all duration-75 ${
                    isPassed ? 'bg-emerald-600' : 'bg-neutral-300'
                  }`}
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-neutral-600">
            <span>{isPlaying || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}</span>
            <button
              type="button"
              onClick={handleToggleSpeed}
              className="px-1.5 py-0.2 rounded-md bg-black/5 hover:bg-black/10 font-bold text-[10px] text-neutral-700 transition-colors"
              title="Velocidade de reprodução"
            >
              {playbackSpeed}x
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
