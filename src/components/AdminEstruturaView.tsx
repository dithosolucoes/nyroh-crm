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
  { id: 'integracoes', label: 'Integrações' },
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
    <div className="w-full min-h-full flex flex-col bg-neutral-50">
      <header className="bg-white border-b border-neutral-200 px-6 pt-6">
        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">{secao === 'leads' ? 'Leads e disparos' : 'Sistema'}</p>
        <h1 className="text-2xl font-bold text-neutral-900 mt-1">{secao === 'leads' ? 'Leads' : 'Configurações'}</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {secao === 'leads'
            ? 'Central de leads, remessas, blocos salvos e pedidos de bloqueio.'
            : 'Marcas, números, regras de contato e integrações com a Meta e a FluxoAPI.'}
        </p>
        {secao === 'configuracoes' && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-neutral-900">Baixar backup completo</p>
              <p className="text-xs text-neutral-500">Arquivo .zip com todos os dados (leads, conversas, vendedores, marcas, regras) e todas as fotos e áudios. Segredos ficam omitidos. Contém dados pessoais: guarde com cuidado. Cada download fica na auditoria.</p>
            </div>
            <a
              href="/api/admin/backup/exportar"
              className="inline-flex items-center rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              Baixar backup
            </a>
          </div>
        )}
        <nav className="flex gap-6 mt-5 overflow-x-auto no-scrollbar">
          {tabsDaSecao.map(t => {
            const ativa = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setError(null); }}
                className={`pb-3 -mb-px text-sm whitespace-nowrap border-b-2 transition-colors ${ativa ? 'border-neutral-900 text-neutral-900 font-semibold' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="flex-1 p-6">
        {error && <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">{error}</div>}

        {tab === 'central' && <CentralLeads leads={leads} onShowToast={onShowToast} onError={setError} onOpenDetails={onOpenDetails} />}
        {tab === 'marcas' && <Marcas onShowToast={onShowToast} onError={setError} />}
        {tab === 'numeros' && <Numeros onShowToast={onShowToast} onError={setError} />}
        {tab === 'bloqueios' && <Bloqueios onShowToast={onShowToast} onError={setError} leads={leads} onOpenDetails={onOpenDetails} />}
        {tab === 'regras' && <RegrasContato onShowToast={onShowToast} onError={setError} />}
        {tab === 'integracoes' && <AdminWhatsAppFluxoView currentUser={currentUser} onShowToast={onShowToast} />}
      </div>
    </div>
  );
};

// ---------------- Central de leads ----------------
interface HistoricoEnvio { brandId: string | null; batchName: string | null; sentAt: string }
interface LeadAnalise { id: string; name: string; phone: string; blockedAt: string | null; history: HistoricoEnvio[] }
type FiltroCentral = 'todos' | 'elegiveis' | 'nunca' | 'marca' | 'outras' | 'bloqueados';
type Origem = { tipo: 'bloco' | 'remessa'; id: string; nome: string; tamanho?: number };

const TAMANHO_BLOCO_LABEL = (n: number) => n.toLocaleString('pt-BR');

function haQuanto(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diffMs / 3_600_000);
  if (h < 1) return 'agora há pouco';
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

const CentralLeads: React.FC<{ leads: Lead[]; onShowToast: (m: string) => void; onError: (m: string | null) => void; onOpenDetails: (l: Lead) => void }> = ({ leads, onShowToast, onError }) => {
  const [remessas, setRemessas] = useState<Remessa[]>([]);
  const [semRemessa, setSemRemessa] = useState(0);
  const [tamanhos, setTamanhos] = useState<number[]>([20, 50, 100, 300, 500, 1000, 5000, 10000, 50000, 100000]);
  const [tamanho, setTamanho] = useState<number>(100);
  const [nomeRemessa, setNomeRemessa] = useState('');
  const [blocos, setBlocos] = useState<Array<{ id: string; name: string; size: number; createdAt: string }>>([]);
  const [marcas, setMarcas] = useState<Array<{ id: string; name: string }>>([]);
  const [marcaDestino, setMarcaDestino] = useState('');
  const [origem, setOrigem] = useState<Origem | null>(null);
  const [analise, setAnalise] = useState<LeadAnalise[] | null>(null);
  const [carregandoAnalise, setCarregandoAnalise] = useState(false);
  const [filtro, setFiltro] = useState<FiltroCentral>('todos');
  const [busca, setBusca] = useState('');

  const disponiveis = useMemo(() => leads.filter(l => !(l as any).blockedAt), [leads]);

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

  const abrirAnalise = useCallback(async (o: Origem) => {
    setOrigem(o); setFiltro('todos'); setBusca(''); setCarregandoAnalise(true);
    try {
      const d = await jsonFetch<{ leads: LeadAnalise[] }>(`/api/central/analise?tipo=${o.tipo}&id=${encodeURIComponent(o.id)}`);
      setAnalise(d.leads); onError(null);
    } catch (e: any) { setAnalise(null); onError(e.message); }
    finally { setCarregandoAnalise(false); }
  }, [onError]);

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
      load();
    } catch (e: any) { onError(e.message); }
  };

  const direcionar = async (o: Origem) => {
    if (!marcaDestino) { onError('Cadastre uma marca antes de direcionar.'); return; }
    try {
      const rota = o.tipo === 'bloco' ? `/api/central/selections/${o.id}/direcionar` : `/api/central/remessas/${o.id}/direcionar`;
      const r = await jsonFetch<{ total: number; name: string }>(rota, { method: 'POST', body: JSON.stringify({ brandId: marcaDestino }) });
      onError(null);
      onShowToast(`"${o.nome}" direcionado: ${r.total} leads na safra "${r.name}".`);
      abrirAnalise(o);
    } catch (e: any) { onError(e.message); }
  };

  const marcaNome = (id: string | null) => (id && marcas.find(m => m.id === id)?.name) || 'Marca removida';

  // Classifica cada lead em relação à marca de destino escolhida.
  const classificado = useMemo(() => {
    if (!analise) return [];
    return analise.map(l => {
      const desta = l.history.filter(h => h.brandId === marcaDestino);
      const outras = l.history.filter(h => h.brandId !== marcaDestino);
      const ultimaDesta = desta[0]?.sentAt;
      let situacao: 'bloqueado' | 'marca' | 'outras' | 'nunca';
      if (l.blockedAt) situacao = 'bloqueado';
      else if (ultimaDesta) situacao = 'marca';
      else if (outras.length) situacao = 'outras';
      else situacao = 'nunca';
      return { ...l, desta, outras, ultimaDesta, situacao };
    });
  }, [analise, marcaDestino]);

  const contagens = useMemo(() => ({
    total: classificado.length,
    nunca: classificado.filter(l => l.situacao === 'nunca').length,
    marca: classificado.filter(l => l.situacao === 'marca').length,
    outras: classificado.filter(l => l.situacao === 'outras').length,
    bloqueados: classificado.filter(l => l.situacao === 'bloqueado').length,
    elegiveis: classificado.filter(l => l.situacao === 'nunca' || l.situacao === 'outras').length,
  }), [classificado]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return classificado.filter(l => {
      if (termo && !(l.name || '').toLowerCase().includes(termo) && !(l.phone || '').includes(termo)) return false;
      switch (filtro) {
        case 'elegiveis': return l.situacao === 'nunca' || l.situacao === 'outras';
        case 'nunca': return l.situacao === 'nunca';
        case 'marca': return l.situacao === 'marca';
        case 'outras': return l.situacao === 'outras';
        case 'bloqueados': return l.situacao === 'bloqueado';
        default: return true;
      }
    });
  }, [classificado, filtro, busca]);

  const LIMITE_TABELA = 300;

  return (
    <div className="flex flex-col gap-6">
      {/* Marca de destino: vale para toda a análise e para o direcionamento */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-5 flex flex-wrap items-center gap-4 justify-between">
        <div>
          <p className="text-sm font-bold text-neutral-900">Marca de destino</p>
          <p className="text-xs text-neutral-500">A análise mostra o histórico de cada lead em relação a esta marca.</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={marcaDestino} onChange={e => setMarcaDestino(e.target.value)} className="min-w-[220px] px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm">
            {marcas.length === 0 && <option value="">Nenhuma marca cadastrada</option>}
            {marcas.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <span className="text-xs text-neutral-500">{leads.length.toLocaleString('pt-BR')} leads na central · {semRemessa.toLocaleString('pt-BR')} sem remessa</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Blocos */}
        <section className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200">
            <h3 className="text-sm font-bold text-neutral-900">Blocos salvos por ID</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Guardam só os IDs dos leads. Escolha o tamanho e salve.</p>
          </div>
          <div className="px-5 py-4 border-b border-neutral-100 bg-neutral-50">
            <div className="flex flex-wrap gap-1.5 mb-3">
              {tamanhos.map(t => (
                <button key={t} onClick={() => setTamanho(t)} className={`px-2.5 py-1 rounded-lg text-xs font-mono border ${tamanho === t ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'}`}>{TAMANHO_BLOCO_LABEL(t)}</button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-neutral-500">Pega os primeiros {TAMANHO_BLOCO_LABEL(Math.min(tamanho, disponiveis.length))} leads disponíveis (sem bloqueados).</p>
              <button onClick={criarBloco} className="shrink-0 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold">Salvar bloco</button>
            </div>
          </div>
          {blocos.length === 0 ? (
            <p className="px-5 py-10 text-sm text-neutral-500 text-center">Nenhum bloco salvo ainda.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {blocos.map(b => {
                const ativo = origem?.tipo === 'bloco' && origem.id === b.id;
                return (
                  <li key={b.id} className={`px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 ${ativo ? 'bg-neutral-50' : ''}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900">{b.name}</p>
                      <p className="text-xs text-neutral-500">{TAMANHO_BLOCO_LABEL(b.size)} leads · criado em {new Date(b.createdAt).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => abrirAnalise({ tipo: 'bloco', id: b.id, nome: b.name, tamanho: b.size })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${ativo ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-300 hover:bg-neutral-50 text-neutral-800'}`}>Ver histórico</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Remessas */}
        <section className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200">
            <h3 className="text-sm font-bold text-neutral-900">Remessas (uploads)</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Cada upload de leads, com a origem. Crie uma remessa antes de importar.</p>
          </div>
          <div className="px-5 py-4 border-b border-neutral-100 bg-neutral-50 flex gap-2">
            <input value={nomeRemessa} onChange={e => setNomeRemessa(e.target.value)} placeholder="Nome da nova remessa" className="flex-1 px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm" />
            <button onClick={criarRemessa} disabled={!nomeRemessa.trim()} className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold disabled:opacity-40">Criar remessa</button>
          </div>
          {remessas.length === 0 ? (
            <p className="px-5 py-10 text-sm text-neutral-500 text-center">Nenhuma remessa cadastrada ainda.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {remessas.map(r => {
                const ativo = origem?.tipo === 'remessa' && origem.id === r.id;
                return (
                  <li key={r.id} className={`px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 ${ativo ? 'bg-neutral-50' : ''}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900">{r.name}</p>
                      <p className="text-xs text-neutral-500">
                        {r.leadCount.toLocaleString('pt-BR')} leads · {r.blockedCount.toLocaleString('pt-BR')} bloqueados
                        {(r.contatadosHoje || 0) > 0 && <span className="text-amber-700"> · {r.contatadosHoje} já contatados hoje</span>}
                      </p>
                    </div>
                    <button onClick={() => abrirAnalise({ tipo: 'remessa', id: r.id, nome: r.name })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${ativo ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-300 hover:bg-neutral-50 text-neutral-800'}`}>Ver histórico</button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Análise do grupo escolhido */}
      {origem && (
        <section className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">{origem.tipo === 'bloco' ? 'Bloco' : 'Remessa'}</p>
              <h3 className="text-lg font-bold text-neutral-900">{origem.nome}</h3>
              <p className="text-xs text-neutral-500 mt-0.5">Histórico em relação à marca <span className="font-semibold text-neutral-800">{marcaNome(marcaDestino)}</span></p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => abrirAnalise(origem)} className="px-3 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-sm font-semibold text-neutral-800">Atualizar</button>
              <button onClick={() => direcionar(origem)} disabled={!marcaDestino} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-40">Direcionar para {marcaNome(marcaDestino)}</button>
            </div>
          </div>

          {carregandoAnalise && <p className="px-5 py-10 text-sm text-neutral-500 text-center">Carregando histórico…</p>}

          {!carregandoAnalise && analise && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px bg-neutral-200 border-b border-neutral-200">
                {[
                  { label: 'Total', value: contagens.total, cls: 'text-neutral-900', f: 'todos' as FiltroCentral },
                  { label: 'Elegíveis agora', value: contagens.elegiveis, cls: 'text-emerald-700', f: 'elegiveis' as FiltroCentral },
                  { label: 'Nunca abordados', value: contagens.nunca, cls: 'text-neutral-900', f: 'nunca' as FiltroCentral },
                  { label: 'Já abordados por esta marca', value: contagens.marca, cls: 'text-amber-700', f: 'marca' as FiltroCentral },
                  { label: 'Abordados só por outras marcas', value: contagens.outras, cls: 'text-sky-700', f: 'outras' as FiltroCentral },
                  { label: 'Bloqueados', value: contagens.bloqueados, cls: 'text-rose-700', f: 'bloqueados' as FiltroCentral },
                ].map(c => (
                  <button key={c.label} onClick={() => setFiltro(c.f)} className={`bg-white text-left px-5 py-4 hover:bg-neutral-50 ${filtro === c.f ? 'ring-2 ring-inset ring-neutral-900' : ''}`}>
                    <p className="text-xs text-neutral-500">{c.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${c.cls}`}>{c.value.toLocaleString('pt-BR')}</p>
                  </button>
                ))}
              </div>

              {origem.tipo === 'bloco' && origem.tamanho !== undefined && origem.tamanho > analise.length && (
                <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-900">
                  Este bloco tem {origem.tamanho.toLocaleString('pt-BR')} IDs, mas só {analise.length.toLocaleString('pt-BR')} ainda existem na base. Os demais foram removidos ou importados de novo e não entram no disparo.
                </div>
              )}

              <div className="px-5 py-3 border-b border-neutral-100 flex flex-wrap items-center gap-3">
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone" className="w-full md:w-72 px-3 py-2 rounded-lg border border-neutral-300 text-sm" />
                <span className="text-xs text-neutral-500">Mostrando {Math.min(visiveis.length, LIMITE_TABELA).toLocaleString('pt-BR')} de {visiveis.length.toLocaleString('pt-BR')}</span>
              </div>

              {visiveis.length === 0 ? (
                <p className="px-5 py-12 text-sm text-neutral-500 text-center">Nenhum lead neste filtro.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                      <tr>
                        <th className="text-left px-5 py-3">Lead</th>
                        <th className="text-left px-3 py-3">Telefone</th>
                        <th className="text-left px-3 py-3">Situação com {marcaNome(marcaDestino)}</th>
                        <th className="text-left px-3 py-3">Outras marcas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {visiveis.slice(0, LIMITE_TABELA).map(l => (
                        <tr key={l.id} className="hover:bg-neutral-50">
                          <td className="px-5 py-3 font-semibold text-neutral-900">{l.name || 'Sem nome'}</td>
                          <td className="px-3 py-3 font-mono text-xs text-neutral-600">{l.phone}</td>
                          <td className="px-3 py-3">
                            {l.situacao === 'bloqueado' && <span className="inline-flex px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-xs font-semibold">Bloqueado</span>}
                            {l.situacao === 'marca' && <span className="inline-flex px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-xs font-semibold">Abordado {haQuanto(l.ultimaDesta!)}</span>}
                            {l.situacao === 'outras' && <span className="inline-flex px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold">Pode abordar</span>}
                            {l.situacao === 'nunca' && <span className="inline-flex px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold">Nunca abordado</span>}
                          </td>
                          <td className="px-3 py-3">
                            {l.outras.length === 0 ? <span className="text-xs text-neutral-400">—</span> : (
                              <div className="flex flex-wrap gap-1.5">
                                {l.outras.slice(0, 3).map((h, i) => (
                                  <span key={i} className="inline-flex px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700 text-xs">{marcaNome(h.brandId)} · {haQuanto(h.sentAt)}</span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
};

// ---------------- Componentes de apoio (layout) ----------------
const campoClasse = 'w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10';
const rotuloClasse = 'block text-xs font-semibold text-neutral-700 mb-1.5';
const botaoPrimario = 'px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed';
const botaoSecundario = 'px-3 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-sm font-semibold text-neutral-800';

const SubAbas: React.FC<{ opcoes: Array<{ id: string; label: string; count?: number }>; atual: string; onChange: (id: string) => void }> = ({ opcoes, atual, onChange }) => (
  <div className="flex gap-6 border-b border-neutral-200 mb-6 overflow-x-auto no-scrollbar">
    {opcoes.map(o => {
      const ativa = atual === o.id;
      return (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`pb-3 -mb-px text-sm whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${ativa ? 'border-neutral-900 text-neutral-900 font-semibold' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}
        >
          {o.label}
          {o.count !== undefined && <span className={`text-[11px] px-1.5 py-0.5 rounded-md ${ativa ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}>{o.count}</span>}
        </button>
      );
    })}
  </div>
);

const Vazio: React.FC<{ texto: string }> = ({ texto }) => (
  <div className="border border-dashed border-neutral-300 rounded-2xl py-12 px-6 text-center text-sm text-neutral-500 bg-white">{texto}</div>
);

// ---------------- Marcas ----------------
const Marcas: React.FC<{ onShowToast: (m: string) => void; onError: (m: string | null) => void }> = ({ onShowToast, onError }) => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subaba, setSubaba] = useState<'numeros' | 'dados'>('numeros');
  const [criando, setCriando] = useState(false);
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
      const r = await jsonFetch<{ id: string }>('/api/brands', { method: 'POST', body: JSON.stringify({ name, services }) });
      setName(''); setServices(''); setCriando(false);
      onShowToast('Marca criada. Agora vincule os números.');
      await load();
      setSubaba('numeros');
      setSelectedId(r.id);
    } catch (e: any) { onError(e.message); }
  };

  const alternarNumero = async (brand: Brand, numberId: string) => {
    const next = brand.numberIds.includes(numberId) ? brand.numberIds.filter(x => x !== numberId) : [...brand.numberIds, numberId];
    try {
      await jsonFetch(`/api/brands/${brand.id}/numbers`, { method: 'PUT', body: JSON.stringify({ phoneNumberIds: next }) });
      onError(null);
      await load();
    } catch (e: any) { onError(e.message); }
  };

  const marca = selectedId ? brands.find(b => b.id === selectedId) : undefined;

  if (marca) {
    return (
      <div>
        <button onClick={() => setSelectedId(null)} className="text-sm text-neutral-500 hover:text-neutral-900 mb-4">← Todas as marcas</button>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">{marca.name}</h2>
            <p className="text-sm text-neutral-500 mt-1">{marca.services || 'Sem serviços cadastrados'}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-neutral-500">Números vinculados</p>
            <p className="text-2xl font-bold text-neutral-900">{marca.numberIds.length}</p>
          </div>
        </div>

        <SubAbas
          atual={subaba}
          onChange={id => setSubaba(id as 'numeros' | 'dados')}
          opcoes={[{ id: 'numeros', label: 'Números', count: marca.numberIds.length }, { id: 'dados', label: 'Dados' }]}
        />

        {subaba === 'numeros' && (
          <>
            <p className="text-sm text-neutral-600 mb-4">Marque os números que enviam mensagens por esta marca. Um número pode servir a mais de uma marca.</p>
            {numbers.length === 0 ? (
              <Vazio texto="Nenhum número cadastrado. Cadastre em Configurações > Números primeiro." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {numbers.map(n => {
                  const on = marca.numberIds.includes(n.id);
                  return (
                    <button
                      key={n.id}
                      onClick={() => alternarNumero(marca, n.id)}
                      className={`text-left p-4 rounded-2xl border transition-colors ${on ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-neutral-200 hover:border-neutral-400'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-neutral-900 truncate">{n.label}</p>
                          <p className="text-xs text-neutral-500 mt-0.5">{n.phoneDisplay || 'Sem telefone cadastrado'}</p>
                        </div>
                        <span className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center text-xs font-bold ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-neutral-300 bg-white text-transparent'}`}>✓</span>
                      </div>
                      <p className="text-[11px] text-neutral-400 font-mono mt-3 truncate">ID Meta: {n.metaPhoneNumberId || '—'}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {subaba === 'dados' && (
          <EditorMarca key={marca.id} marca={marca} onSalvo={load} onShowToast={onShowToast} onError={onError} />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Marcas</h2>
          <p className="text-sm text-neutral-500">{brands.length} marca(s) cadastrada(s). Clique em uma para configurar seus números.</p>
        </div>
        <button onClick={() => setCriando(c => !c)} className={botaoPrimario}>{criando ? 'Cancelar' : 'Nova marca'}</button>
      </div>

      {criando && (
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 mb-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <label className="block">
            <span className={rotuloClasse}>Nome da marca</span>
            <input value={name} onChange={e => setName(e.target.value)} className={campoClasse} />
          </label>
          <label className="block">
            <span className={rotuloClasse}>Serviços</span>
            <input value={services} onChange={e => setServices(e.target.value)} placeholder="Ex.: site, tráfego, SEO" className={campoClasse} />
          </label>
          <div className="flex justify-end">
            <button onClick={criar} disabled={!name.trim()} className={botaoPrimario}>Criar marca</button>
          </div>
        </div>
      )}

      {brands.length === 0 ? (
        <Vazio texto="Nenhuma marca cadastrada ainda." />
      ) : (
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[2fr_3fr_1fr_auto] gap-4 px-5 py-3 bg-neutral-50 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            <span>Marca</span><span>Serviços</span><span>Números</span><span />
          </div>
          <ul className="divide-y divide-neutral-100">
            {brands.map(b => (
              <li key={b.id}>
                <button onClick={() => { setSelectedId(b.id); setSubaba('numeros'); }} className="w-full text-left grid grid-cols-1 md:grid-cols-[2fr_3fr_1fr_auto] gap-2 md:gap-4 items-center px-5 py-4 hover:bg-neutral-50">
                  <span className="text-sm font-semibold text-neutral-900">{b.name}</span>
                  <span className="text-sm text-neutral-600 truncate">{b.services || 'Sem serviços cadastrados'}</span>
                  <span className="text-sm text-neutral-900">{b.numberIds.length} número(s)</span>
                  <span className="text-neutral-400 text-lg">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// ---------------- Números ----------------
const Numeros: React.FC<{ onShowToast: (m: string) => void; onError: (m: string | null) => void }> = ({ onShowToast, onError }) => {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subaba, setSubaba] = useState<'marcas' | 'cadastro'>('marcas');
  const [criando, setCriando] = useState(false);
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
      const r = await jsonFetch<{ id: string }>('/api/phone-numbers', { method: 'POST', body: JSON.stringify({ label, phoneDisplay: phone, metaPhoneNumberId: metaId }) });
      setLabel(''); setPhone(''); setMetaId(''); setCriando(false);
      onShowToast('Número cadastrado. Agora vincule às marcas.');
      await load();
      setSubaba('marcas');
      setSelectedId(r.id);
    } catch (e: any) { onError(e.message); }
  };

  const alternarMarca = async (brand: Brand, numero: PhoneNumber) => {
    const tem = brand.numberIds.includes(numero.id);
    const next = tem ? brand.numberIds.filter(x => x !== numero.id) : [...brand.numberIds, numero.id];
    try {
      await jsonFetch(`/api/brands/${brand.id}/numbers`, { method: 'PUT', body: JSON.stringify({ phoneNumberIds: next }) });
      onError(null);
      await load();
    } catch (e: any) { onError(e.message); }
  };

  const numero = selectedId ? numbers.find(n => n.id === selectedId) : undefined;

  if (numero) {
    const marcasVinculadas = brands.filter(b => numero.brandIds.includes(b.id));
    return (
      <div>
        <button onClick={() => setSelectedId(null)} className="text-sm text-neutral-500 hover:text-neutral-900 mb-4">← Todos os números</button>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">{numero.label}</h2>
            <p className="text-sm text-neutral-500 mt-1">{numero.phoneDisplay || 'Sem telefone cadastrado'}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-neutral-500">Marcas que usam este número</p>
            <p className="text-2xl font-bold text-neutral-900">{marcasVinculadas.length}</p>
          </div>
        </div>

        <SubAbas
          atual={subaba}
          onChange={id => setSubaba(id as 'marcas' | 'cadastro')}
          opcoes={[{ id: 'marcas', label: 'Marcas', count: marcasVinculadas.length }, { id: 'cadastro', label: 'Cadastro' }]}
        />

        {subaba === 'marcas' && (
          <>
            <p className="text-sm text-neutral-600 mb-4">Escolha as marcas que podem enviar por este número. Um número pode ser usado por mais de uma marca.</p>
            {brands.length === 0 ? (
              <Vazio texto="Nenhuma marca cadastrada. Crie uma em Configurações > Marcas." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {brands.map(b => {
                  const on = b.numberIds.includes(numero.id);
                  return (
                    <button
                      key={b.id}
                      onClick={() => alternarMarca(b, numero)}
                      className={`text-left p-4 rounded-2xl border transition-colors ${on ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-neutral-200 hover:border-neutral-400'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-neutral-900 truncate">{b.name}</p>
                          <p className="text-xs text-neutral-500 mt-0.5 truncate">{b.services || 'Sem serviços cadastrados'}</p>
                        </div>
                        <span className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center text-xs font-bold ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-neutral-300 bg-white text-transparent'}`}>✓</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {subaba === 'cadastro' && (
          <EditorNumero key={numero.id} numero={numero} onSalvo={load} onShowToast={onShowToast} onError={onError} />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Números</h2>
          <p className="text-sm text-neutral-500">{numbers.length} número(s) cadastrado(s). Clique em um para vincular às marcas.</p>
        </div>
        <button onClick={() => setCriando(c => !c)} className={botaoPrimario}>{criando ? 'Cancelar' : 'Novo número'}</button>
      </div>

      {criando && (
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 mb-5 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <label className="block">
            <span className={rotuloClasse}>Nome interno</span>
            <input value={label} onChange={e => setLabel(e.target.value)} className={campoClasse} />
          </label>
          <label className="block">
            <span className={rotuloClasse}>Telefone</span>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+55 31 9…" className={campoClasse} />
          </label>
          <label className="block">
            <span className={rotuloClasse}>ID do número na Meta</span>
            <input value={metaId} onChange={e => setMetaId(e.target.value)} className={`${campoClasse} font-mono`} />
          </label>
          <div className="flex justify-end">
            <button onClick={criar} disabled={!label.trim()} className={botaoPrimario}>Cadastrar número</button>
          </div>
        </div>
      )}

      {numbers.length === 0 ? (
        <Vazio texto="Nenhum número cadastrado ainda." />
      ) : (
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[2fr_1.2fr_1.6fr_2fr_auto] gap-4 px-5 py-3 bg-neutral-50 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            <span>Nome</span><span>Telefone</span><span>ID na Meta</span><span>Marcas</span><span />
          </div>
          <ul className="divide-y divide-neutral-100">
            {numbers.map(n => (
              <li key={n.id}>
                <button onClick={() => { setSelectedId(n.id); setSubaba('marcas'); }} className="w-full text-left grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1.6fr_2fr_auto] gap-2 md:gap-4 items-center px-5 py-4 hover:bg-neutral-50">
                  <span className="text-sm font-semibold text-neutral-900">{n.label}</span>
                  <span className="text-sm text-neutral-600">{n.phoneDisplay || '—'}</span>
                  <span className="text-xs font-mono text-neutral-500 truncate">{n.metaPhoneNumberId || '—'}</span>
                  <span className="text-sm text-neutral-700 truncate">{n.brandIds.length === 0 ? <span className="text-amber-700">Nenhuma marca</span> : n.brandIds.map(id => brands.find(b => b.id === id)?.name || id).join(', ')}</span>
                  <span className="text-neutral-400 text-lg">›</span>
                </button>
              </li>
            ))}
          </ul>
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
  id: string; nome: string; tipo: 'limite_janela' | 'apos_resposta' | 'trava_entre_marcas'; escopo: 'global' | 'marca';
  marcaId: string | null; marcaNome?: string | null; maxContatos: number; janelaHoras: number | null; ativa: boolean;
}
type TipoRegra = RegraContato['tipo'];

const TIPOS_INFO: Record<TipoRegra, { titulo: string; quando: string; exemplo: string }> = {
  limite_janela: {
    titulo: 'Limite de contatos',
    quando: 'Controla quantas vezes o mesmo lead pode receber mensagem dentro de um período.',
    exemplo: 'Ex.: no máximo 1 contato por dia, para cada lead.',
  },
  apos_resposta: {
    titulo: 'Espera após resposta',
    quando: 'Quando o lead responde, ele fica fora de novos disparos por um período.',
    exemplo: 'Ex.: depois que o lead respondeu, não receber nada por 30 dias.',
  },
  trava_entre_marcas: {
    titulo: 'Trava entre marcas',
    quando: 'Se uma marca já abordou o lead, as outras marcas esperam antes de abordá-lo.',
    exemplo: 'Ex.: abordou com a Nyroh, outras marcas só depois de 30 dias.',
  },
};

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
const OPCOES_JANELA_TRAVA = [
  { v: '168', l: '7 dias' },
  { v: '720', l: '30 dias' },
  { v: '2160', l: '90 dias' },
  { v: 'sempre', l: 'Para sempre' },
];

const opcoesJanelaDo = (tipo: TipoRegra) =>
  tipo === 'apos_resposta' ? OPCOES_JANELA_APOS_RESPOSTA : tipo === 'trava_entre_marcas' ? OPCOES_JANELA_TRAVA : OPCOES_JANELA_LIMITE;

const janelaSelDo = (r: { tipo: TipoRegra; janelaHoras: number | null }) =>
  r.janelaHoras == null ? (r.tipo === 'limite_janela' ? '' : 'sempre') : String(r.janelaHoras);

const descreveRegra = (r: RegraContato) => {
  const escopo = r.escopo === 'marca' ? `só ${r.marcaNome || 'a marca escolhida'}` : 'todas as marcas juntas';
  if (r.tipo === 'limite_janela') {
    const janela = r.janelaHoras == null ? 'por dia (horário de São Paulo)' : `nas últimas ${r.janelaHoras} h`;
    return `No máximo ${r.maxContatos} contato(s) para cada lead ${janela}. Conta ${escopo}.`;
  }
  if (r.tipo === 'apos_resposta') {
    const janela = r.janelaHoras == null ? 'para sempre' : `por ${r.janelaHoras} h`;
    return `Depois que o lead responder, não recebe novo disparo ${janela}. Vale ${escopo}.`;
  }
  const dias = r.janelaHoras == null ? 'para sempre' : `por ${Math.round(r.janelaHoras / 24)} dias`;
  return `Depois que ${r.marcaNome || 'a marca de origem'} abordar o lead, as outras marcas não abordam ${dias}.`;
};

const RegrasContato: React.FC<{ onShowToast: (m: string) => void; onError: (m: string | null) => void }> = ({ onShowToast, onError }) => {
  const [regras, setRegras] = useState<RegraContato[]>([]);
  const [marcas, setMarcas] = useState<Array<{ id: string; name: string }>>([]);
  const [previa, setPrevia] = useState<{ emEspera: number; passariam: number; barrados: number } | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const rascunhoVazio = { nome: '', tipo: 'limite_janela' as TipoRegra, escopo: 'global' as 'global' | 'marca', marcaId: '', max: 1, janela: '' };
  const [novo, setNovo] = useState(rascunhoVazio);

  const carregar = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([
        jsonFetch<RegraContato[]>('/api/regras-contato'),
        jsonFetch<Array<{ id: string; name: string }>>('/api/brands'),
      ]);
      setRegras(r); setMarcas(m); onError(null);
    } catch (e: any) { onError(e.message); }
  }, [onError]);

  const atualizarPrevia = useCallback(async () => {
    try { setPrevia(await jsonFetch('/api/regras-contato/previa', { method: 'POST' })); }
    catch { setPrevia(null); }
  }, []);

  useEffect(() => { carregar(); atualizarPrevia(); }, [carregar, atualizarPrevia]);

  const salvar = async (id: string, mudancas: Partial<RegraContato>, mensagem = 'Regra salva.') => {
    try {
      await jsonFetch(`/api/regras-contato/${id}`, { method: 'PATCH', body: JSON.stringify(mudancas) });
      onShowToast(mensagem);
      await carregar(); await atualizarPrevia();
    } catch (e: any) { onError(e.message); }
  };

  const remover = async (r: RegraContato) => {
    if (!window.confirm(`Apagar a regra "${r.nome}"?`)) return;
    try {
      await jsonFetch(`/api/regras-contato/${r.id}`, { method: 'DELETE' });
      onShowToast('Regra apagada.');
      setExpandida(null);
      await carregar(); await atualizarPrevia();
    } catch (e: any) { onError(e.message); }
  };

  const criar = async () => {
    const janelaVal = novo.janela === 'sempre' || novo.janela === '' ? null : Number(novo.janela);
    const escopoFinal = novo.tipo === 'trava_entre_marcas' ? 'marca' : novo.escopo;
    try {
      await jsonFetch('/api/regras-contato', {
        method: 'POST',
        body: JSON.stringify({
          nome: novo.nome.trim(),
          tipo: novo.tipo,
          escopo: escopoFinal,
          marcaId: escopoFinal === 'marca' ? novo.marcaId : null,
          maxContatos: novo.max,
          janelaHoras: janelaVal,
          ativa: true,
        }),
      });
      onShowToast('Regra criada.');
      setNovo(rascunhoVazio); setCriando(false);
      await carregar(); await atualizarPrevia();
    } catch (e: any) { onError(e.message); }
  };

  const nomeMarca = (id: string | null) => marcas.find(m => m.id === id)?.name || 'marca';
  const ativas = regras.filter(r => r.ativa).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Prévia */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-neutral-200 border border-neutral-200 rounded-2xl overflow-hidden">
        <div className="bg-white px-5 py-4 md:col-span-1">
          <p className="text-xs text-neutral-500">Regras ativas</p>
          <p className="text-2xl font-bold text-neutral-900 mt-1">{ativas} <span className="text-sm font-normal text-neutral-500">de {regras.length}</span></p>
        </div>
        <div className="bg-white px-5 py-4">
          <p className="text-xs text-neutral-500">Na fila de espera</p>
          <p className="text-2xl font-bold text-neutral-900 mt-1">{previa ? previa.emEspera.toLocaleString('pt-BR') : '—'}</p>
        </div>
        <div className="bg-white px-5 py-4">
          <p className="text-xs text-neutral-500">Podem sair no próximo disparo</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{previa ? previa.passariam.toLocaleString('pt-BR') : '—'}</p>
        </div>
        <div className="bg-white px-5 py-4">
          <p className="text-xs text-neutral-500">Barrados pelas regras</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{previa ? previa.barrados.toLocaleString('pt-BR') : '—'}</p>
        </div>
      </div>

      {/* Lista de regras */}
      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Regras de contato</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Todas são aplicadas antes de qualquer disparo. Um lead só sai se passar por todas as ativas.</p>
          </div>
          <button onClick={() => setCriando(c => !c)} className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold">{criando ? 'Cancelar' : 'Nova regra'}</button>
        </div>

        {/* Cadastro em etapas */}
        {criando && (
          <div className="px-5 py-5 bg-neutral-50 border-b border-neutral-200">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">1. Escolha o tipo</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
              {(Object.keys(TIPOS_INFO) as TipoRegra[]).map(t => {
                const sel = novo.tipo === t;
                return (
                  <button
                    key={t}
                    onClick={() => setNovo({ ...novo, tipo: t, janela: '', escopo: t === 'trava_entre_marcas' ? 'marca' : novo.escopo })}
                    className={`text-left p-4 rounded-xl border bg-white transition-colors ${sel ? 'border-neutral-900 ring-1 ring-neutral-900' : 'border-neutral-200 hover:border-neutral-400'}`}
                  >
                    <p className="text-sm font-bold text-neutral-900">{TIPOS_INFO[t].titulo}</p>
                    <p className="text-xs text-neutral-600 mt-1">{TIPOS_INFO[t].quando}</p>
                    <p className="text-xs text-neutral-400 mt-2 italic">{TIPOS_INFO[t].exemplo}</p>
                  </button>
                );
              })}
            </div>

            <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">2. Configure</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <label className="block">
                <span className="block text-xs font-semibold text-neutral-700 mb-1.5">Nome da regra</span>
                <input value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: Trava Nyroh 30 dias" className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm" />
              </label>
              {novo.tipo === 'trava_entre_marcas' ? (
                <label className="block">
                  <span className="block text-xs font-semibold text-neutral-700 mb-1.5">Marca que abordou primeiro</span>
                  <select value={novo.marcaId} onChange={e => setNovo({ ...novo, marcaId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm">
                    <option value="">Escolha a marca</option>
                    {marcas.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
              ) : (
                <label className="block">
                  <span className="block text-xs font-semibold text-neutral-700 mb-1.5">Vale para</span>
                  <select value={novo.escopo} onChange={e => setNovo({ ...novo, escopo: e.target.value as 'global' | 'marca', marcaId: '' })} className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm">
                    <option value="global">Todas as marcas juntas</option>
                    <option value="marca">Só uma marca</option>
                  </select>
                </label>
              )}
              {novo.tipo !== 'trava_entre_marcas' && novo.escopo === 'marca' && (
                <label className="block">
                  <span className="block text-xs font-semibold text-neutral-700 mb-1.5">Marca</span>
                  <select value={novo.marcaId} onChange={e => setNovo({ ...novo, marcaId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm">
                    <option value="">Escolha a marca</option>
                    {marcas.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
              )}
              {novo.tipo === 'limite_janela' && (
                <label className="block">
                  <span className="block text-xs font-semibold text-neutral-700 mb-1.5">Quantidade de contatos</span>
                  <input type="number" min={1} max={50} value={novo.max} onChange={e => setNovo({ ...novo, max: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm" />
                </label>
              )}
              <label className="block">
                <span className="block text-xs font-semibold text-neutral-700 mb-1.5">{novo.tipo === 'limite_janela' ? 'Período' : 'Por quanto tempo'}</span>
                <select value={novo.janela} onChange={e => setNovo({ ...novo, janela: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm">
                  {opcoesJanelaDo(novo.tipo).map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </label>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-neutral-500">Regra: {descreveRegra({ id: '', ativa: true, nome: '', tipo: novo.tipo, escopo: novo.tipo === 'trava_entre_marcas' ? 'marca' : novo.escopo, marcaId: novo.marcaId || null, marcaNome: nomeMarca(novo.marcaId || null), maxContatos: novo.max, janelaHoras: novo.janela === 'sempre' || novo.janela === '' ? null : Number(novo.janela) })}</p>
              <button
                onClick={criar}
                disabled={!novo.nome.trim() || ((novo.tipo === 'trava_entre_marcas' || novo.escopo === 'marca') && !novo.marcaId)}
                className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold disabled:opacity-40"
              >
                Criar regra
              </button>
            </div>
          </div>
        )}

        {regras.length === 0 && !criando ? (
          <p className="px-5 py-12 text-sm text-neutral-500 text-center">Nenhuma regra cadastrada. Sem regras, todos os leads elegíveis podem receber disparo.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {regras.map(r => {
              const aberta = expandida === r.id;
              return (
                <li key={r.id} className={r.ativa ? '' : 'bg-neutral-50'}>
                  <div className="px-5 py-4 flex flex-wrap items-center gap-4">
                    <button onClick={() => setExpandida(aberta ? null : r.id)} className="flex-1 min-w-[260px] text-left">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-neutral-900">{r.nome}</span>
                        <span className="px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700 text-[11px] font-semibold">{TIPOS_INFO[r.tipo].titulo}</span>
                        {!r.ativa && <span className="px-2 py-0.5 rounded-md bg-neutral-200 text-neutral-600 text-[11px] font-semibold">Desligada</span>}
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{descreveRegra(r)}</p>
                    </button>
                    <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 cursor-pointer">
                      <input type="checkbox" checked={r.ativa} onChange={e => salvar(r.id, { ativa: e.target.checked }, e.target.checked ? 'Regra ligada.' : 'Regra desligada.')} className="w-4 h-4" />
                      Ativa
                    </label>
                    <button onClick={() => setExpandida(aberta ? null : r.id)} className="text-xs font-semibold text-neutral-700 hover:text-neutral-900">{aberta ? 'Fechar' : 'Editar'}</button>
                  </div>
                  {aberta && <EditorRegra regra={r} marcas={marcas} onSalvar={(m) => salvar(r.id, m)} onRemover={() => remover(r)} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

const EditorRegra: React.FC<{
  regra: RegraContato;
  marcas: Array<{ id: string; name: string }>;
  onSalvar: (m: Partial<RegraContato>) => void;
  onRemover: () => void;
}> = ({ regra, marcas, onSalvar, onRemover }) => {
  const [nome, setNome] = useState(regra.nome);
  const [max, setMax] = useState(regra.maxContatos);
  const [janela, setJanela] = useState(janelaSelDo(regra));
  const [escopo, setEscopo] = useState<'global' | 'marca'>(regra.escopo);
  const [marcaId, setMarcaId] = useState(regra.marcaId || '');

  const mudancas: Partial<RegraContato> = {};
  if (nome.trim() && nome !== regra.nome) mudancas.nome = nome.trim();
  if (regra.tipo === 'limite_janela' && max !== regra.maxContatos) mudancas.maxContatos = max;
  if (janela !== janelaSelDo(regra)) mudancas.janelaHoras = janela === 'sempre' || janela === '' ? null : Number(janela);
  if (regra.tipo !== 'trava_entre_marcas') {
    if (escopo !== regra.escopo || (escopo === 'marca' && marcaId !== (regra.marcaId || ''))) {
      mudancas.escopo = escopo;
      mudancas.marcaId = escopo === 'marca' ? marcaId : null;
    }
  } else if (marcaId !== (regra.marcaId || '')) {
    mudancas.marcaId = marcaId;
  }
  const temMudanca = Object.keys(mudancas).length > 0;
  const invalido = (regra.tipo === 'trava_entre_marcas' || escopo === 'marca') && !marcaId;

  return (
    <div className="px-5 pb-5 pt-1 bg-neutral-50 border-t border-neutral-100">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <label className="block">
          <span className="block text-xs font-semibold text-neutral-700 mb-1.5">Nome</span>
          <input value={nome} onChange={e => setNome(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm" />
        </label>
        {regra.tipo === 'trava_entre_marcas' ? (
          <label className="block">
            <span className="block text-xs font-semibold text-neutral-700 mb-1.5">Marca que abordou primeiro</span>
            <select value={marcaId} onChange={e => setMarcaId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm">
              {marcas.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="block text-xs font-semibold text-neutral-700 mb-1.5">Vale para</span>
            <select value={escopo === 'marca' ? `marca:${marcaId}` : 'global'} onChange={e => {
              const v = e.target.value;
              if (v === 'global') { setEscopo('global'); setMarcaId(''); }
              else { setEscopo('marca'); setMarcaId(v.slice(6)); }
            }} className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm">
              <option value="global">Todas as marcas juntas</option>
              {marcas.map(m => <option key={m.id} value={`marca:${m.id}`}>Só {m.name}</option>)}
            </select>
          </label>
        )}
        {regra.tipo === 'limite_janela' && (
          <label className="block">
            <span className="block text-xs font-semibold text-neutral-700 mb-1.5">Quantidade de contatos</span>
            <input type="number" min={1} max={50} value={max} onChange={e => setMax(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm" />
          </label>
        )}
        <label className="block">
          <span className="block text-xs font-semibold text-neutral-700 mb-1.5">{regra.tipo === 'limite_janela' ? 'Período' : 'Por quanto tempo'}</span>
          <select value={janela} onChange={e => setJanela(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm">
            {opcoesJanelaDo(regra.tipo).map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
        <button onClick={onRemover} className="text-sm font-semibold text-rose-700 hover:underline">Apagar regra</button>
        <div className="flex items-center gap-2">
          {temMudanca && <span className="text-xs text-amber-700">Alterações não salvas</span>}
          <button onClick={() => onSalvar(mudancas)} disabled={!temMudanca || invalido} className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold disabled:opacity-40">Salvar alterações</button>
        </div>
      </div>
    </div>
  );
};


// ---------------- Edição de marca e número ----------------
const EditorMarca: React.FC<{ marca: Brand; onSalvo: () => void; onShowToast: (m: string) => void; onError: (m: string | null) => void }> = ({ marca, onSalvo, onShowToast, onError }) => {
  const [nome, setNome] = useState(marca.name);
  const [servicos, setServicos] = useState(marca.services || '');
  const [salvando, setSalvando] = useState(false);
  const mudou = nome.trim() !== marca.name || servicos !== (marca.services || '');

  const salvar = async () => {
    setSalvando(true);
    try {
      await jsonFetch(`/api/brands/${marca.id}`, { method: 'PATCH', body: JSON.stringify({ name: nome.trim(), services: servicos }) });
      onShowToast('Marca atualizada.');
      onError(null);
      onSalvo();
    } catch (e: any) { onError(e.message); }
    finally { setSalvando(false); }
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-6 max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className={rotuloClasse}>Nome da marca</span>
          <input value={nome} onChange={e => setNome(e.target.value)} className={campoClasse} />
        </label>
        <label className="block">
          <span className={rotuloClasse}>Serviços</span>
          <input value={servicos} onChange={e => setServicos(e.target.value)} placeholder="Ex.: site, tráfego, SEO" className={campoClasse} />
        </label>
      </div>
      <p className="text-[11px] text-neutral-400 font-mono mt-4">Identificador: {marca.id}</p>
      <div className="mt-6 flex items-center justify-end gap-3">
        {mudou && <span className="text-xs text-amber-700">Alterações não salvas</span>}
        <button onClick={salvar} disabled={!mudou || !nome.trim() || salvando} className={botaoPrimario}>{salvando ? 'Salvando…' : 'Salvar alterações'}</button>
      </div>
    </div>
  );
};

const EditorNumero: React.FC<{ numero: PhoneNumber; onSalvo: () => void; onShowToast: (m: string) => void; onError: (m: string | null) => void }> = ({ numero, onSalvo, onShowToast, onError }) => {
  const [label, setLabel] = useState(numero.label);
  const [telefone, setTelefone] = useState(numero.phoneDisplay || '');
  const [metaId, setMetaId] = useState(numero.metaPhoneNumberId || '');
  const [salvando, setSalvando] = useState(false);
  const mudou = label.trim() !== numero.label || telefone !== (numero.phoneDisplay || '') || metaId !== (numero.metaPhoneNumberId || '');

  const salvar = async () => {
    setSalvando(true);
    try {
      await jsonFetch(`/api/phone-numbers/${numero.id}`, { method: 'PATCH', body: JSON.stringify({ label: label.trim(), phoneDisplay: telefone, metaPhoneNumberId: metaId }) });
      onShowToast('Número atualizado.');
      onError(null);
      onSalvo();
    } catch (e: any) { onError(e.message); }
    finally { setSalvando(false); }
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-6 max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="block">
          <span className={rotuloClasse}>Nome interno</span>
          <input value={label} onChange={e => setLabel(e.target.value)} className={campoClasse} />
        </label>
        <label className="block">
          <span className={rotuloClasse}>Telefone</span>
          <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="+55 31 9…" className={campoClasse} />
        </label>
        <label className="block">
          <span className={rotuloClasse}>ID na Meta</span>
          <input value={metaId} onChange={e => setMetaId(e.target.value)} className={`${campoClasse} font-mono`} />
        </label>
      </div>
      <p className="text-[11px] text-neutral-400 font-mono mt-4">Instância FluxoAPI: {numero.fluxoInstanceId || '—'} · Identificador: {numero.id}</p>
      <div className="mt-6 flex items-center justify-end gap-3">
        {mudou && <span className="text-xs text-amber-700">Alterações não salvas</span>}
        <button onClick={salvar} disabled={!mudou || !label.trim() || salvando} className={botaoPrimario}>{salvando ? 'Salvando…' : 'Salvar alterações'}</button>
      </div>
    </div>
  );
};
