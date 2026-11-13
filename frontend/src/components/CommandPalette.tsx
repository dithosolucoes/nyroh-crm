import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Kanban, Table2, MessageSquare, LayoutDashboard, Settings, ArrowRight } from 'lucide-react';
import { Lead } from '@shared/types';

export type PaletteTab = 'kanban' | 'table' | 'whatsapp' | 'dashboard' | 'admin';

interface CommandPaletteProps {
  leads: Lead[];
  onOpenLead: (lead: Lead) => void;
  onNavigate: (tab: PaletteTab) => void;
}

const NAV_ITEMS: Array<{ tab: PaletteTab; label: string; icon: React.ElementType }> = [
  { tab: 'kanban', label: 'Ir para o Kanban de leads', icon: Kanban },
  { tab: 'table', label: 'Ir para a tabela de leads', icon: Table2 },
  { tab: 'whatsapp', label: 'Ir para as conversas do WhatsApp', icon: MessageSquare },
  { tab: 'dashboard', label: 'Ir para o painel', icon: LayoutDashboard },
  { tab: 'admin', label: 'Ir para a administração', icon: Settings },
];

type Item =
  | { kind: 'lead'; key: string; lead: Lead }
  | { kind: 'nav'; key: string; tab: PaletteTab; label: string; icon: React.ElementType };

/**
 * Busca global (⌘K / Ctrl+K). Procura nos leads já carregados e leva às telas.
 * Não faz chamada ao servidor: usa a lista que a tela já tem.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ leads, onOpenLead, onNavigate }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const navMatches: Item[] = NAV_ITEMS
      .filter(n => !q || n.label.toLowerCase().includes(q))
      .map(n => ({ kind: 'nav', key: `nav-${n.tab}`, tab: n.tab, label: n.label, icon: n.icon }));
    if (!q) return navMatches;
    const leadMatches: Item[] = leads
      .filter(l => {
        const name = (l.name || '').toLowerCase();
        const phone = (l.phoneNumber || '').replace(/\D/g, '');
        return name.includes(q) || (digits.length >= 4 && phone.includes(digits));
      })
      .slice(0, 12)
      .map(l => ({ kind: 'lead', key: `lead-${l.id}`, lead: l }));
    return [...leadMatches, ...navMatches];
  }, [leads, query]);

  useEffect(() => { setCursor(0); }, [query]);

  if (!open) return null;

  const choose = (item: Item) => {
    setOpen(false);
    if (item.kind === 'lead') onOpenLead(item.lead);
    else onNavigate(item.tab);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-4 bg-neutral-900/40 backdrop-blur-[1px]" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-label="Busca global"
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-200">
          <Search className="w-4 h-4 text-neutral-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, items.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
              else if (e.key === 'Enter' && items[cursor]) { e.preventDefault(); choose(items[cursor]); }
            }}
            placeholder="Buscar lead por nome ou telefone, ou ir para uma tela..."
            className="flex-1 text-sm outline-none placeholder:text-neutral-400"
          />
          <kbd className="text-[10px] font-mono text-neutral-500 border border-neutral-200 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {items.length === 0 && (
            <li className="px-4 py-6 text-sm text-neutral-500 text-center">Nada encontrado para “{query}”.</li>
          )}
          {items.map((item, i) => {
            const active = i === cursor;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(item)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm ${active ? 'bg-neutral-100' : ''}`}
                >
                  {item.kind === 'lead' ? (
                    <>
                      <span className="w-7 h-7 rounded-full bg-neutral-200 text-neutral-700 text-[11px] font-bold flex items-center justify-center shrink-0">
                        {(item.lead.name || '?').charAt(0).toUpperCase()}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold text-neutral-900 truncate">{item.lead.name}</span>
                        <span className="block text-xs text-neutral-500 truncate">{item.lead.phoneNumber} · {item.lead.columnStatus}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <item.icon className="w-4 h-4 text-neutral-500" />
                      <span className="flex-1 text-neutral-800">{item.label}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="px-4 py-2 border-t border-neutral-200 text-[11px] text-neutral-500 flex gap-3">
          <span>↑↓ navegar</span><span>Enter abrir</span><span>⌘K / Ctrl+K alternar</span>
        </div>
      </div>
    </div>
  );
};
