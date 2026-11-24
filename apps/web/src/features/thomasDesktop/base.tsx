import { Play } from 'lucide-react';
import { Lead, Salesperson } from '@shared/types';
import { isUiFlagOn } from '@shared/lib/uiFlags';


export const SHOW_SIMULATE = isUiFlagOn(import.meta.env.VITE_MOSTRAR_SIMULAR);

/** ID único por tentativa de envio: o servidor usa para NÃO enviar duas vezes (duplo clique / retry de rede). */
export function newClientMessageId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** Texto legível de um erro de envio (`{ message, action }` vindo do servidor). */
export function describeSendError(err: any): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  return [err.message, err.action].filter(Boolean).join(' — ');
}

export interface ThomasWhatsAppDesktopViewProps {
  leads: Lead[];
  onUpdateLeadColumn?: (leadId: string, newColumn: string) => void;
  onShowToast: (msg: string) => void;
  activeSalesperson?: Salesperson;
  initialLeadId?: string;
}

// Modelos aprovados: vêm do catálogo REAL da conta na FluxoAPI (GET /api/whatsapp/fluxo-templates).
// Antes eram 4 nomes fixos no código — se não existissem na sua Meta, todo envio de modelo pelo chat falhava.
export interface MetaTemplateOption {
  name: string;
  language: string;
  category: string;
  label: string;
  description: string;
  sendable: boolean;
  /** Campos que o chat não preenche sozinho (botão de URL variável, mídia de cabeçalho…). */
  extraRequired: string[];
  getText: (lead: Lead, closerName: string) => string;
}

export function humanizeTemplateName(name: string): string {
  const s = String(name || '').replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : name;
}

export function catalogToOption(t: any): MetaTemplateOption {
  const body = String(t.bodyText || '');
  return {
    name: t.name,
    language: t.language || 'pt_BR',
    category: t.category || 'MODELO',
    label: humanizeTemplateName(t.name),
    description: body ? body.slice(0, 140) + (body.length > 140 ? '…' : '') : 'Modelo aprovado pela Meta.',
    sendable: t.sendable !== false && (!t.extraRequired || t.extraRequired.length === 0),
    extraRequired: Array.isArray(t.extraRequired) ? t.extraRequired : [],
    // Prévia: mesmas variáveis que o servidor preenche por padrão ({{1}} nome, {{2}} link do site, {{3}} vendedor)
    getText: (lead, closerName) => {
      const values: Record<string, string> = {
        '1': (lead.name || 'Cliente').split(' ')[0] || 'Cliente',
        '2': lead.publicUrl || 'https://nyroh.com.br',
        '3': (closerName || 'Thomas').replace(/\(.*\)/, '').trim().split(/\s+/)[0] || 'Thomas'
      };
      return body ? body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, ref) => values[ref] ?? `{{${ref}}}`) : `[Modelo ${t.name}]`;
    }
  };
}
// Quick Emojis
export const QUICK_EMOJIS = ['👍', '🤝', '🔥', '📅', '✅', '🚀', '⭐', '💡', '👋', '🎉'];

// Play notification sound using Web Audio API
export function playNotificationChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(659.25, now); // E5
    osc2.frequency.setValueAtTime(880.0, now + 0.08); // A5

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.1);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.35);
  } catch {
    // Audio context may be restricted by browser policy
  }
}

