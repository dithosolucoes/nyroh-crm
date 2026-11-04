import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lead } from '../types';

type Tab = 'central' | 'marcas' | 'numeros' | 'bloqueios';

interface Remessa { id: string; name: string; createdAt: string; leadCount: number; blockedCount: number }
interface Brand { id: string; name: string; services: string; numberIds: string[] }
interface PhoneNumber { id: string; label: string; phoneDisplay?: string; metaPhoneNumberId?: string; fluxoInstanceId?: string; brandIds: string[] }
interface BlockRequest { id: string; leadId: string; requestedBy?: string; reasonCode: string; reasonText?: string; requestedAt: string }

const MOTIVOS: Record<string, string> = {
  sem_whatsapp: 'Sem WhatsApp / número inválido',
  pediu_remocao: 'Pediu para não ser contatado',
  numero_errado: 'Número errado ou de outra pessoa',
  ja_atendido: 'Já atendido por outra marca hoje',
  outro: 'Outro',
};

interface Props {
  leads: Lead[];
  onShowToast: (msg: string) => void;
  onOpenDetails: (lead: Lead) => void;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data as T;
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'central', label: 'Central de leads' },
  { id: 'marcas', label: 'Marcas' },
  { id: 'numeros', label: 'Números' },
  { id: 'bloqueios', label: 'Bloqueios pendentes' },
];

export const AdminEstruturaView: React.FC<Props> = ({ leads, onShowToast, onOpenDetails }) => {
  const [tab, setTab] = useState<Tab>('central');
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-neutral-900">Estrutura</h2>
        <p className="text-sm text-neutral-500">Leads, marcas, números e bloqueios. Cada marca tem seus serviços, números e modelos de mensagem.</p>
      </div>

      <nav className="flex gap-1.5 overflow-x-auto no-scrollbar bg-neutral-100 p-1 rounded-xl border border-neutral-200 w-fit max-w-full">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ${tab === t.id ? 'bg-white text-neutral-900 font-bold shadow-2xs' : 'text-neutral-600 font-medium hover:text-neutral-900'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">{error}</div>}

      {tab === 'central' && <CentralLeads leads={leads} onShowToast={onShowToast} onError={setError} onOpenDetails={onOpenDetails} />}
      {tab === 'marcas' && <Marcas onShowToast={onShowToast} onError={setError} />}
      {tab === 'numeros' && <Numeros onShowToast={onShowToast} onError={setError} />}
      {tab === 'bloqueios' && <Bloqueios onShowToast={onShowToast} onError={setError} leads={leads} onOpenDetails={onOpenDetails} />}
    </div>
  );
};

// ---------------- Central de leads ----------------
const CentralLeads: React.FC<{ leads: Lead[]; onShowToast: (m: string) => void; onError: (m: string | null) => void; onOpenDetails: (l: Lead) => void }> = ({ leads, onShowToast, onError, onOpenDetails }) => {
  const [remessas, setRemessas] = useState<Remessa[]>([]);
  const [semRemessa, setSemRemessa] = useState(0);
  const [tamanhos, setTamanhos] = useState<number[]>([20, 50, 100, 300, 500, 1000, 5000, 10000, 50000, 100000]);
  const [tamanho, setTamanho] = useState<number>(100);
  const [nomeRemessa, setNomeRemessa] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await jsonFetch<{ remessas: Remessa[]; semRemessa: number; tamanhosBloco: number[] }>('/api/central/remessas');
      setRemessas(d.remessas); setSemRemessa(d.semRemessa); setTamanhos(d.tamanhosBloco);
      onError(null);
    } catch (e: any) { onError(e.message); }
  }, [onError]);

  useEffect(() => { load(); }, [load]);

  const disponiveis = useMemo(() => leads.filter(l => !(l as any).blockedAt), [leads]);

  const criarRemessa = async () => {
    if (!nomeRemessa.trim()) return;
    try {
      await jsonFetch('/api/central/remessas', { method: 'POST', body: JSON.stringify({ name: nomeRemessa.trim() }) });
      setNomeRemessa(''); onShowToast('Remessa criada.'); load();
    } catch (e: any) { onError(e.message); }
  };

  const criarBloco = async () => {
    const ids = disponiveis.slice(0, tamanho).map(l => l.id);
    if (ids.length === 0) { onError('Não há leads disponíveis para este bloco.'); return; }
    try {
      await jsonFetch('/api/central/selections', { method: 'POST', body: JSON.stringify({ leadIds: ids, size: tamanho, name: `Bloco de ${ids.length}` }) });
      onShowToast(`Bloco de ${ids.length} leads salvo por ID.`);
    } catch (e: any) { onError(e.message); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border border-neutral-200 rounded-2xl p-4">
          <p className="text-xs text-neutral-500">Leads na central</p>
          <p className="text-2xl font-bold text-neutral-900">{leads.length}</p>
          <p className="text-xs text-neutral-500 mt-1">{semRemessa} sem remessa de origem</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-2xl p-4 md:col-span-2">
          <p className="text-xs font-bold text-neutral-700 mb-2">Montar bloco por ID</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tamanhos.map(t => (
              <button key={t} onClick={() => setTamanho(t)} className={`px-2.5 py-1 rounded-lg text-xs font-mono border ${tamanho === t ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'}`}>{t.toLocaleString('pt-BR')}</button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-neutral-500">Pega os primeiros {Math.min(tamanho, disponiveis.length)} leads disponíveis. Não copia os leads: guarda só os IDs.</p>
            <button onClick={criarBloco} className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">Salvar bloco</button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-neutral-100">
          <h3 className="text-sm font-bold text-neutral-900 mr-auto">Remessas (uploads)</h3>
          <input value={nomeRemessa} onChange={e => setNomeRemessa(e.target.value)} placeholder="Nome da nova remessa" className="text-xs px-2.5 py-1.5 border border-neutral-300 rounded-lg" />
          <button onClick={criarRemessa} className="text-xs px-3 py-1.5 rounded-lg bg-neutral-900 text-white font-bold">Criar remessa</button>
        </div>
        {remessas.length === 0 ? (
          <p className="px-4 py-8 text-sm text-neutral-500 text-center">Nenhuma remessa cadastrada ainda. Cada upload de leads vai aparecer aqui com a origem.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {remessas.map(r => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-semibold text-neutral-900">{r.name}</span>
                <span className="text-xs text-neutral-500 font-mono">{r.leadCount} leads · {r.blockedCount} bloqueados · {new Date(r.createdAt).toLocaleDateString('pt-BR')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// ---------------- Marcas ----------------
const Marcas: React.FC<{ onShowToast: (m: string) => void; onError: (m: string | null) => void }> = ({ onShowToast, onError }) => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [name, setName] = useState('');
  const [services, setServices] = useState('');

  const load = useCallback(async () => {
    try {
      const [b, n] = await Promise.all([jsonFetch<Brand[]>('/api/brands'), jsonFetch<PhoneNumber[]>('/api/phone-numbers')]);
      setBrands(b); setNumbers(n); onError(null);
    } catch (e: any) { onError(e.message); }
  }, [onError]);
  useEffect(() => { load(); }, [load]);

  const criar = async () => {
    if (!name.trim()) return;
    try {
      await jsonFetch('/api/brands', { method: 'POST', body: JSON.stringify({ name, services }) });
      setName(''); setServices(''); onShowToast('Marca criada.'); load();
    } catch (e: any) { onError(e.message); }
  };

  const alternarNumero = async (brand: Brand, numberId: string) => {
    const next = brand.numberIds.includes(numberId) ? brand.numberIds.filter(x => x !== numberId) : [...brand.numberIds, numberId];
    try {
      await jsonFetch(`/api/brands/${brand.id}/numbers`, { method: 'PUT', body: JSON.stringify({ phoneNumberIds: next }) });
      load();
    } catch (e: any) { onError(e.message); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white border border-neutral-200 rounded-2xl p-4 flex flex-wrap gap-2 items-end">
        <label className="flex flex-col text-xs font-semibold text-neutral-700 gap-1">Nome da marca
          <input value={name} onChange={e => setName(e.target.value)} className="px-2.5 py-1.5 border border-neutral-300 rounded-lg text-sm font-normal" />
        </label>
        <label className="flex flex-col text-xs font-semibold text-neutral-700 gap-1 flex-1 min-w-[200px]">Serviços
          <input value={services} onChange={e => setServices(e.target.value)} placeholder="Ex.: site, tráfego, SEO" className="px-2.5 py-1.5 border border-neutral-300 rounded-lg text-sm font-normal" />
        </label>
        <button onClick={criar} className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-bold">Criar marca</button>
      </div>

      {brands.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-8">Nenhuma marca cadastrada.</p>
      ) : brands.map(b => (
        <div key={b.id} className="bg-white border border-neutral-200 rounded-2xl p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-neutral-900">{b.name}</h3>
            <span className="text-xs text-neutral-500">{b.services || 'sem serviços cadastrados'}</span>
          </div>
          <p className="text-xs text-neutral-500 mt-2 mb-1.5">Números que enviam por esta marca:</p>
          {numbers.length === 0 ? (
            <p className="text-xs text-neutral-400">Cadastre um número primeiro, na aba Números.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {numbers.map(n => {
                const on = b.numberIds.includes(n.id);
                return (
                  <button key={n.id} onClick={() => alternarNumero(b, n.id)} className={`px-2.5 py-1 rounded-lg text-xs border ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'}`}>
                    {on ? '✓ ' : ''}{n.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ---------------- Números ----------------
const Numeros: React.FC<{ onShowToast: (m: string) => void; onError: (m: string | null) => void }> = ({ onShowToast, onError }) => {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [label, setLabel] = useState('');
  const [phone, setPhone] = useState('');
  const [metaId, setMetaId] = useState('');

  const load = useCallback(async () => {
    try {
      const [n, b] = await Promise.all([jsonFetch<PhoneNumber[]>('/api/phone-numbers'), jsonFetch<Brand[]>('/api/brands')]);
      setNumbers(n); setBrands(b); onError(null);
    } catch (e: any) { onError(e.message); }
  }, [onError]);
  useEffect(() => { load(); }, [load]);

  const criar = async () => {
    if (!label.trim()) return;
    try {
      await jsonFetch('/api/phone-numbers', { method: 'POST', body: JSON.stringify({ label, phoneDisplay: phone, metaPhoneNumberId: metaId }) });
      setLabel(''); setPhone(''); setMetaId(''); onShowToast('Número cadastrado.'); load();
    } catch (e: any) { onError(e.message); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white border border-neutral-200 rounded-2xl p-4 flex flex-wrap gap-2 items-end">
        <label className="flex flex-col text-xs font-semibold text-neutral-700 gap-1">Nome interno
          <input value={label} onChange={e => setLabel(e.target.value)} className="px-2.5 py-1.5 border border-neutral-300 rounded-lg text-sm font-normal" />
        </label>
        <label className="flex flex-col text-xs font-semibold text-neutral-700 gap-1">Telefone
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+55 31 9…" className="px-2.5 py-1.5 border border-neutral-300 rounded-lg text-sm font-normal" />
        </label>
        <label className="flex flex-col text-xs font-semibold text-neutral-700 gap-1">ID do número na Meta
          <input value={metaId} onChange={e => setMetaId(e.target.value)} className="px-2.5 py-1.5 border border-neutral-300 rounded-lg text-sm font-normal font-mono" />
        </label>
        <button onClick={criar} className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-bold">Cadastrar número</button>
      </div>
      {numbers.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-8">Nenhum número cadastrado.</p>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-2xl divide-y divide-neutral-100">
          {numbers.map(n => (
            <div key={n.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-neutral-900">{n.label} <span className="text-xs font-normal text-neutral-500">{n.phoneDisplay || ''}</span></p>
                <p className="text-[11px] text-neutral-500 font-mono">Meta: {n.metaPhoneNumberId || '—'}</p>
              </div>
              <p className="text-xs text-neutral-600">Usado por: {n.brandIds.length === 0 ? 'nenhuma marca' : n.brandIds.map(id => brands.find(b => b.id === id)?.name || id).join(', ')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------- Bloqueios ----------------
const Bloqueios: React.FC<{ onShowToast: (m: string) => void; onError: (m: string | null) => void; leads: Lead[]; onOpenDetails: (l: Lead) => void }> = ({ onShowToast, onError, leads, onOpenDetails }) => {
  const [pedidos, setPedidos] = useState<BlockRequest[]>([]);

  const load = useCallback(async () => {
    try { setPedidos(await jsonFetch<BlockRequest[]>('/api/block-requests?status=pendente')); onError(null); }
    catch (e: any) { onError(e.message); }
  }, [onError]);
  useEffect(() => { load(); }, [load]);

  const decidir = async (id: string, decision: 'aprovar' | 'recusar') => {
    try {
      await jsonFetch(`/api/block-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ decision }) });
      onShowToast(decision === 'aprovar' ? 'Bloqueio aprovado: o lead saiu da base principal.' : 'Pedido recusado.');
      load();
    } catch (e: any) { onError(e.message); }
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
      {pedidos.length === 0 ? (
        <p className="px-4 py-10 text-sm text-neutral-500 text-center">Nenhum pedido de bloqueio aguardando decisão.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {pedidos.map(p => {
            const lead = leads.find(l => l.id === p.leadId);
            return (
              <li key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <button className="text-sm font-semibold text-neutral-900 hover:underline text-left" onClick={() => lead && onOpenDetails(lead)}>{lead?.name || p.leadId}</button>
                  <p className="text-xs text-neutral-600">{MOTIVOS[p.reasonCode] || p.reasonCode}{p.reasonText ? ` — ${p.reasonText}` : ''}</p>
                  <p className="text-[11px] text-neutral-400">Sugerido em {new Date(p.requestedAt).toLocaleString('pt-BR')}</p>
                </div>
                <button onClick={() => decidir(p.id, 'recusar')} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-neutral-300 hover:bg-neutral-50">Recusar</button>
                <button onClick={() => decidir(p.id, 'aprovar')} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white">Aprovar bloqueio</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
