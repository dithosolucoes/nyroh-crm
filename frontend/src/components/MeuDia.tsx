import React, { useMemo, useState } from 'react';
import { Lead } from '@shared/types';
import { Phone, Sparkles, Star, CalendarClock, Ban } from 'lucide-react';
import { BlockRequestDialog } from './BlockRequestDialog';

interface MeuDiaProps {
  leads: Lead[];
  onToast?: (msg: string) => void;
  sellerId?: string;
  sellerName?: string;
  onOpenDetails: (lead: Lead) => void;
}

/** Visão do vendedor: só os leads atribuídos a ele, organizados pelo que fazer hoje. */
export const MeuDia: React.FC<MeuDiaProps> = ({ leads, sellerId, sellerName, onOpenDetails, onToast }) => {
  const [blockFor, setBlockFor] = useState<Lead | null>(null);
  const mine = useMemo(() => {
    if (!sellerId) return leads;
    return leads.filter(l => (l.salespersonId || '').toLowerCase() === sellerId.toLowerCase());
  }, [leads, sellerId]);

  const endOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, []);

  const ligarHoje = mine
    .filter(l => l.nextFollowUpAt && new Date(l.nextFollowUpAt).getTime() <= endOfToday && l.columnStatus !== 'Fechado' && l.columnStatus !== 'Recusado')
    .sort((a, b) => new Date(a.nextFollowUpAt!).getTime() - new Date(b.nextFollowUpAt!).getTime());
  const semContato = mine.filter(l => l.columnStatus === 'Leads' && (!l.callCount || l.callCount === 0));
  const interessados = mine.filter(l => l.columnStatus === 'Interessado');

  const Section = ({ title, hint, icon: Icon, list, empty }: { title: string; hint: string; icon: React.ElementType; list: Lead[]; empty: string }) => (
    <section className="bg-white border border-neutral-200 rounded-2xl shadow-2xs overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-neutral-500" />
          <div>
            <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
            <p className="text-xs text-neutral-500">{hint}</p>
          </div>
        </div>
        <span className="font-mono text-sm font-bold text-neutral-900">{list.length}</span>
      </header>
      {list.length === 0 ? (
        <p className="px-4 py-6 text-sm text-neutral-500 text-center">{empty}</p>
      ) : (
        <ul className="divide-y divide-neutral-100 max-h-[55vh] overflow-y-auto">
          {list.slice(0, 50).map(l => (
            <li key={l.id}>
              <button type="button" onClick={() => onOpenDetails(l)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-50">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-neutral-900 truncate">{l.name}</span>
                  <span className="block text-xs text-neutral-500 truncate">{l.phoneNumber} · {l.columnStatus}</span>
                </span>
                <Phone className="w-3.5 h-3.5 text-neutral-400" />
              </button>
              <div className="px-4 pb-2 -mt-1">
                <button type="button" onClick={() => setBlockFor(l)} className="text-[11px] text-neutral-500 hover:text-rose-700 inline-flex items-center gap-1">
                  <Ban className="w-3 h-3" /> Sugerir bloqueio
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-4">
      {blockFor && (
        <BlockRequestDialog leadId={blockFor.id} leadName={blockFor.name} onClose={() => setBlockFor(null)} onSent={(msg) => onToast?.(msg)} />
      )}
      <div>
        <h2 className="text-lg font-bold text-neutral-900">Meu dia{sellerName ? `, ${sellerName}` : ''}</h2>
        <p className="text-sm text-neutral-500">{mine.length} leads atribuídos a você. Comece pelo que está vencendo.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Section title="Ligar hoje" hint="Retornos vencidos ou marcados para hoje" icon={CalendarClock} list={ligarHoje} empty="Nenhum retorno para hoje." />
        <Section title="Sem contato ainda" hint="Leads novos que ninguém ligou" icon={Sparkles} list={semContato} empty="Nenhum lead novo sem contato." />
        <Section title="Interessados" hint="Negociação em andamento" icon={Star} list={interessados} empty="Nenhum interessado no momento." />
      </div>
    </div>
  );
};
