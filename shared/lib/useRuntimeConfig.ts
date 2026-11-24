import { useEffect, useState } from 'react';

export interface RuntimeConfig {
  simulatorsEnabled: boolean;
  isProduction: boolean;
  /** Número REAL da instância conectada na FluxoAPI (nunca chumbado no código). */
  instancePhone: string | null;
  instanceStatus: string;
  whatsappConnected: boolean;
}

const FALLBACK: RuntimeConfig = {
  simulatorsEnabled: false,
  isProduction: true,
  instancePhone: null,
  instanceStatus: 'unknown',
  whatsappConnected: false
};

let cached: RuntimeConfig | null = null;
let inFlight: Promise<RuntimeConfig> | null = null;

async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cached) return cached;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch('/api/runtime-config');
      if (!res.ok) return FALLBACK;
      const data = await res.json();
      cached = { ...FALLBACK, ...data };
      return cached!;
    } catch {
      return FALLBACK;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Estado real do servidor e da instância. Enquanto carrega, assume o modo mais restrito. */
export function useRuntimeConfig(): RuntimeConfig {
  const [config, setConfig] = useState<RuntimeConfig>(cached || FALLBACK);

  useEffect(() => {
    let alive = true;
    loadRuntimeConfig().then(c => {
      if (alive) setConfig(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  return config;
}

/** Exibe o número da instância, ou um aviso honesto quando o servidor ainda não sabe qual é. */
export function formatInstancePhone(phone: string | null): string {
  if (!phone) return 'número não identificado';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return phone.startsWith('+') ? phone : `+${digits}`;
}
