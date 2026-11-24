/**
 * Guarda os últimos logs do servidor em memória para o painel "Logs" do admin.
 * Não substitui os logs da Railway: é a visão rápida, dentro do próprio CRM.
 * Não grava segredos de propósito: quem chama o log é responsável pelo que escreve.
 */
export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  at: string;
  level: LogLevel;
  category: string;
  message: string;
}

const MAX_ENTRIES = 3000;
let seq = 0;
const entries: LogEntry[] = [];
let installed = false;

function categoryOf(text: string): string {
  const m = text.match(/^\[([^\]]+)\]/);
  return m ? m[1] : 'geral';
}

function formatArgs(args: unknown[]): string {
  return args
    .map(a => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

export function pushLog(level: LogLevel, message: string): void {
  seq += 1;
  entries.push({ id: seq, at: new Date().toISOString(), level, category: categoryOf(message), message: message.slice(0, 2000) });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

/** Liga a captura do console (mantém a saída normal também). Chamar uma vez na subida. */
export function installLogBuffer(): void {
  if (installed) return;
  installed = true;
  const orig = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  console.log = (...args: unknown[]) => { pushLog('info', formatArgs(args)); orig.log(...args); };
  console.info = (...args: unknown[]) => { pushLog('info', formatArgs(args)); orig.info(...args); };
  console.warn = (...args: unknown[]) => { pushLog('warn', formatArgs(args)); orig.warn(...args); };
  console.error = (...args: unknown[]) => { pushLog('error', formatArgs(args)); orig.error(...args); };
}

export function readLogs(opts: { level?: string; category?: string; q?: string; afterId?: number; limit?: number } = {}): LogEntry[] {
  const limit = Math.min(Math.max(Number(opts.limit) || 500, 1), 2000);
  const q = (opts.q || '').toLowerCase();
  const cat = (opts.category || '').toLowerCase();
  const out: LogEntry[] = [];
  for (let i = entries.length - 1; i >= 0 && out.length < limit; i--) {
    const e = entries[i];
    if (opts.afterId && e.id <= opts.afterId) break;
    if (opts.level && opts.level !== 'todos' && e.level !== opts.level) continue;
    if (cat && e.category.toLowerCase() !== cat) continue;
    if (q && !e.message.toLowerCase().includes(q)) continue;
    out.push(e);
  }
  return out.reverse();
}

export function logCategories(): string[] {
  return Array.from(new Set(entries.map(e => e.category))).sort();
}
