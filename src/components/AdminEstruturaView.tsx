import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lead, User } from '../types';
import { AdminWhatsAppFluxoView } from './AdminWhatsAppFluxoView';

type Tab = 'central' | 'marcas' | 'numeros' | 'bloqueios' | 'regras' | 'integracoes';

interface Remessa { id: string; name: string; createdAt: string; leadCount: number; blockedCount: number; contatadosHoje?: number }
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
  currentUser: User;
  onShowToast: (msg: string) => void;
  onOpenDetails: (lead: Lead) => void;
  /** 'leads': central e bloqueios. 'configuracoes': marcas e números. */
  secao?: 'leads' | 'configuracoes';
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  const data = await res.json().catch(() => ({}));
  if (res.status === 503) {
    throw new Error('Esta tela ainda não está liberada neste servidor (migração de UX desligada). Peça ao administrador para ativar NYROH_APLICAR_MIGRACOES_UX.');
  }
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data as T;
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'central', label: 'Central de leads' },
  { id: 'marcas', label: 'Marcas' },
  { id: 'numeros', label: 'Números' },
  { id: 'bloqueios', label: 'Bloqueios pendentes' },
  { id: 'regras', label: 'Regras de contato' },
  { id: 'integracoes', label: 'Integrações (FluxoAPI e Meta)' },
];

const TABS_POR_SECAO: Record<'leads' | 'configuracoes', Tab[]> = {
  leads: ['central', 'bloqueios'],
  configuracoes: ['marcas', 'numeros', 'regras', 'integracoes'],
};

export const AdminEstruturaView: React.FC<Props> = ({ leads, currentUser, onShowToast, onOpenDetails, secao = 'leads' }) => {
  const tabsDaSecao = TABS.filter(t => TABS_POR_SECAO[secao].includes(t.id));
  const [tab, setTab] = useState<Tab>(TABS_POR_SECAO[secao][0]);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-neutral-900">{secao === 'leads' ? 'Leads' : 'Configurações'}</h2>
        <p className="text-sm text-neutral-500">
          {secao === 'leads'
            ? 'Central de leads, remessas, blocos salvos e bloqueios.'
            : 'Marcas, números, regras de contato e integrações com a Meta e a FluxoAPI.'}
        </p>
      </div>

      <nav className="flex gap-1.5 overflow-x-auto no-scrollbar bg-neutral-100 p-1 rounded-xl border border-neutral-200 w-fit max-w-full">
        {tabsDaSecao.map(t => (
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
      {tab === 'regras' && <RegrasContato onShowToast={onShowToast} onError={setError} />}
      {tab === 'integracoes' && <AdminWhatsAppFluxoView currentUser={currentUser} onShowToast={onShowToast} />}
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
  const [blocos, setBlocos] = useState<Array<{ id: string; name: string; size: number; createdAt: string }>>([]);
  const [marcas, setMarcas] = useState<Array<{ id: string; name: string }>>([]);
  const [marcaDestino, setMarcaDestino] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await jsonFetch<{ remessas: Remessa[]; semRemessa: number; tamanhosBloco: number[] }>('/api/central/remessas');
      setRemessas(d.remessas); setSemRemessa(d.semRemessa); setTamanhos(d.tamanhosBloco);
      const [b, m] = await Promise.all([
        jsonFetch<Array<{ id: string; name: string; size: number; createdAt: string }>>('/api/central/selections'),
        jsonFetch<Array<{ id: string; name: string }>>('/api/brands'),
      ]);
      setBlocos(b);
      setMarcas(m);
      setMarcaDestino(atual => atual || (m[0]?.id ?? ''));
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

  /** Cria uma safra ligada à marca escolhida com os leads do bloco ou da remessa. */
  const direcionar = async (tipo: 'selections' | 'remessas', id: string, nome: string) => {
    if (!marcaDestino) { onError('Cadastre uma marca antes de direcionar.'); return; }
    try {
      const r = await jsonFetch<{ total: number; name: string }>(`/api/central/${tipo}/${id}/direcionar`, {
        method: 'POST',
        body: JSON.stringify({ brandId: marcaDestino }),
      });
      onError(null);
      onShowToast(`"${nome}" direcionado: ${r.total} leads na safra "${r.name}".`);
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
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs text-neutral-500">Marca de destino:</span>
            <select value={marcaDestino} onChange={e => setMarcaDestino(e.target.value)} className="text-xs border border-neutral-300 rounded-lg px-2 py-1 bg-white">
              {marcas.length === 0 && <option value="">Nenhuma marca cadastrada</option>}
              {marcas.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-neutral-500">Pega os primeiros {Math.min(tamanho, disponiveis.length)} leads disponíveis. Não copia os leads: guarda só os IDs.</p>
            <button onClick={criarBloco} className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">Salvar bloco</button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100">
          <h3 className="text-sm font-bold text-neutral-900">Blocos salvos por ID</h3>
        </div>
        {blocos.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-500 text-center">Nenhum bloco salvo ainda.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {blocos.map(b => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="font-semibold text-neutral-900">{b.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500 font-mono">
                    {b.size} leads
                    {((b as any).contatadosHoje || 0) > 0 && <span className="text-amber-700"> · {(b as any).contatadosHoje} já contatados hoje</span>}
                    {' · '}{new Date(b.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                  <button onClick={() => direcionar('selections', b.id, b.name)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold">Direcionar para a marca</button>
                </span>
              </li>
            ))}
          </ul>
        )}
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
                <span className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500 font-mono">
                    {r.leadCount} leads · {r.blockedCount} bloqueados
                    {(r.contatadosHoje || 0) > 0 && <span className="text-amber-700"> · {r.contatadosHoje} já contatados hoje</span>}
                    {' · '}{new Date(r.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                  <button onClick={() => direcionar('remessas', r.id, r.name)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold">Direcionar para a marca</button>
                </span>
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


// ---------------- Regras de contato ----------------
interface RegraContato {
  id: string; nome: string; tipo: 'limite_janela' | 'apos_resposta'; escopo: 'global' | 'marca';
  marcaId: string | null; marcaNome?: string | null; maxContatos: number; janelaHoras: number | null; ativa: boolean;
}

const OPCOES_JANELA_LIMITE = [
  { v: '', l: 'Dia de calendário (fuso de São Paulo)' },
  { v: '24', l: 'Últimas 24 horas' },
  { v: '72', l: 'Últimas 72 horas' },
  { v: '168', l: 'Últimos 7 dias' },
  { v: '720', l: 'Últimos 30 dias' },
];
const OPCOES_JANELA_APOS_RESPOSTA = [
  { v: 'sempre', l: 'Para sempre' },
  { v: '24', l: '24 horas depois da resposta' },
  { v: '72', l: '72 horas depois da resposta' },
  { v: '168', l: '7 dias depois da resposta' },
  { v: '720', l: '30 dias depois da resposta' },
];

const descreveRegra = (r: RegraContato) => {
  const escopo = r.escopo === 'marca' ? `só marca ${r.marcaNome || ''}`.trim() : 'todas as marcas juntas';
  if (r.tipo === 'limite_janela') {
    const janela = r.janelaHoras == null ? 'por dia (SP)' : `nas últimas ${r.janelaHoras} h`;
    return `No máximo ${r.maxContatos} contato(s) ${janela}, ${escopo}.`;
  }
  const janela = r.janelaHoras == null ? 'para sempre' : `durante ${r.janelaHoras} h`;
  return `Depois que o lead responder, não recebe novo disparo ${janela}, ${escopo}.`;
};

const RegrasContato: React.FC<{ onShowToast: (m: string) => void; onError: (m: string | null) => void }> = ({ onShowToast, onError }) => {
  const [regras, setRegras] = useState<RegraContato[]>([]);
  const [marcas, setMarcas] = useState<Array<{ id: string; name: string }>>([]);
  const [previa, setPrevia] = useState<{ emEspera: number; passariam: number; barrados: number } | null>(null);
  const [novo, setNovo] = useState({ nome: '', tipo: 'limite_janela' as RegraContato['tipo'], escopo: 'global' as 'global' | 'marca', marcaId: '', max: 1, janela: '' });

  const carregar = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([
        jsonFetch<RegraContato[]>('/api/regras-contato'),
        jsonFetch<Array<{ id: string; name: string }>>('/api/brands'),
      ]);
      setRegras(r);
      setMarcas(m);
      onError(null);
    } catch (e: any) {
      onError(e.message);
    }
  }, [onError]);

  const atualizarPrevia = useCallback(async () => {
    try {
      setPrevia(await jsonFetch('/api/regras-contato/previa', { method: 'POST' }));
    } catch {
      setPrevia(null);
    }
  }, []);

  useEffect(() => { carregar(); atualizarPrevia(); }, [carregar, atualizarPrevia]);

  const salvar = async (r: RegraContato, mudancas: Partial<RegraContato>) => {
    try {
      await jsonFetch(`/api/regras-contato/${r.id}`, { method: 'PATCH', body: JSON.stringify(mudancas) });
      onShowToast('Regra salva.');
      await carregar();
      await atualizarPrevia();
    } catch (e: any) {
      onError(e.message);
    }
  };

  const remover = async (r: RegraContato) => {
    if (!window.confirm(`Apagar a regra "${r.nome}"?`)) return;
    try {
      await jsonFetch(`/api/regras-contato/${r.id}`, { method: 'DELETE' });
      onShowToast('Regra apagada.');
      await carregar();
      await atualizarPrevia();
    } catch (e: any) {
      onError(e.message);
    }
  };

  const criar = async () => {
    const janelaVal = novo.janela === 'sempre' ? null : novo.janela === '' ? null : Number(novo.janela);
    try {
      await jsonFetch('/api/regras-contato', {
        method: 'POST',
        body: JSON.stringify({
          nome: novo.nome,
          tipo: novo.tipo,
          escopo: novo.escopo,
          marcaId: novo.escopo === 'marca' ? novo.marcaId : null,
          maxContatos: novo.max,
          janelaHoras: janelaVal,
          ativa: true,
        }),
      });
      onShowToast('Regra criada.');
      setNovo({ nome: '', tipo: 'limite_janela', escopo: 'global', marcaId: '', max: 1, janela: '' });
      await carregar();
      await atualizarPrevia();
    } catch (e: any) {
      onError(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Prévia do próximo disparo</h3>
            <p className="text-xs text-neutral-500">Com as regras abaixo, quantos contatos em espera podem sair agora.</p>
          </div>
          {previa ? (
            <div className="text-xs font-mono text-neutral-700">
              {previa.emEspera} em espera · <span className="text-emerald-700 font-bold">{previa.passariam} passam</span> · <span className="text-amber-700 font-bold">{previa.barrados} barrados</span>
            </div>
          ) : (
            <span className="text-xs text-neutral-400">Sem prévia disponível</span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {regras.length === 0 && <div className="text-xs text-neutral-400 py-4 text-center border border-dashed border-neutral-200 rounded-xl">Nenhuma regra cadastrada.</div>}
        {regras.map(r => {
          const opcoesJanela = r.tipo === 'apos_resposta' ? OPCOES_JANELA_APOS_RESPOSTA : OPCOES_JANELA_LIMITE;
          const janelaSel = r.janelaHoras == null ? (r.tipo === 'apos_resposta' ? 'sempre' : '') : String(r.janelaHoras);
          return (
            <div key={r.id} className={`bg-white p-4 rounded-2xl border shadow-2xs ${r.ativa ? 'border-neutral-200' : 'border-neutral-200 opacity-60'}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-neutral-900">{r.nome}</div>
                  <div className="text-xs text-neutral-500">{descreveRegra(r)}</div>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 cursor-pointer">
                  <input type="checkbox" checked={r.ativa} onChange={e => salvar(r, { ativa: e.target.checked })} />
                  Ativa
                </label>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                {r.tipo === 'limite_janela' && (
                  <label className="text-[11px] font-semibold text-neutral-600">Quantidade
                    <input
                      type="number" min={1} max={50} defaultValue={r.maxContatos}
                      onBlur={e => { const v = Number(e.target.value); if (v !== r.maxContatos) salvar(r, { maxContatos: v }); }}
                      className="mt-1 w-full px-2 py-1.5 rounded-lg border border-neutral-300 text-xs"
                    />
                  </label>
                )}
                <label className="text-[11px] font-semibold text-neutral-600">Janela
                  <select
                    value={janelaSel}
                    onChange={e => {
                      const v = e.target.value;
                      salvar(r, { janelaHoras: v === 'sempre' || v === '' ? null : Number(v) });
                    }}
                    className="mt-1 w-full px-2 py-1.5 rounded-lg border border-neutral-300 text-xs bg-white"
                  >
                    {opcoesJanela.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </label>
                <label className="text-[11px] font-semibold text-neutral-600">Escopo
                  <select
                    value={r.escopo === 'marca' ? `marca:${r.marcaId}` : 'global'}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === 'global') salvar(r, { escopo: 'global', marcaId: null });
                      else salvar(r, { escopo: 'marca', marcaId: v.slice(6) });
                    }}
                    className="mt-1 w-full px-2 py-1.5 rounded-lg border border-neutral-300 text-xs bg-white"
                  >
                    <option value="global">Todas as marcas juntas</option>
                    {marcas.map(m => <option key={m.id} value={`marca:${m.id}`}>Só {m.name}</option>)}
                  </select>
                </label>
                <div className="flex justify-end">
                  <button onClick={() => remover(r)} className="text-xs font-semibold text-red-700 hover:underline cursor-pointer">Apagar regra</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200">
        <h3 className="text-sm font-bold text-neutral-900 mb-2">Nova regra</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} placeholder="Nome (ex.: Máximo 2 por semana)" className="px-2 py-1.5 rounded-lg border border-neutral-300 text-xs" />
          <select value={novo.tipo} onChange={e => setNovo({ ...novo, tipo: e.target.value as RegraContato['tipo'], janela: '' })} className="px-2 py-1.5 rounded-lg border border-neutral-300 text-xs bg-white">
            <option value="limite_janela">Limite de contatos numa janela</option>
            <option value="apos_resposta">Esperar depois da resposta</option>
          </select>
          <select value={novo.escopo} onChange={e => setNovo({ ...novo, escopo: e.target.value as 'global' | 'marca' })} className="px-2 py-1.5 rounded-lg border border-neutral-300 text-xs bg-white">
            <option value="global">Todas as marcas juntas</option>
            <option value="marca">Só uma marca</option>
          </select>
          {novo.escopo === 'marca' && (
            <select value={novo.marcaId} onChange={e => setNovo({ ...novo, marcaId: e.target.value })} className="px-2 py-1.5 rounded-lg border border-neutral-300 text-xs bg-white">
              <option value="">Escolha a marca</option>
              {marcas.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          {novo.tipo === 'limite_janela' && (
            <input type="number" min={1} max={50} value={novo.max} onChange={e => setNovo({ ...novo, max: Number(e.target.value) })} className="px-2 py-1.5 rounded-lg border border-neutral-300 text-xs" placeholder="Quantidade" />
          )}
          <select value={novo.janela} onChange={e => setNovo({ ...novo, janela: e.target.value })} className="px-2 py-1.5 rounded-lg border border-neutral-300 text-xs bg-white">
            {(novo.tipo === 'apos_resposta' ? OPCOES_JANELA_APOS_RESPOSTA : OPCOES_JANELA_LIMITE).map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={criar}
            disabled={!novo.nome.trim() || (novo.escopo === 'marca' && !novo.marcaId)}
            className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
          >
            Criar regra
          </button>
        </div>
      </div>
    </div>
  );
};
