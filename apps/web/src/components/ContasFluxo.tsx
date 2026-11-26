import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';

/**
 * Contas da FluxoAPI: cadastro, descoberta dos números e vínculo de cada número a uma marca.
 * Segredos são enviados uma vez e nunca voltam para a tela (o servidor só informa "tem/não tem").
 */

interface NumeroVinculado {
  id: string;
  instanceId: string | null;
  metaPhoneNumberId: string | null;
  numero: string | null;
  marcaId: string | null;
  ignorado: boolean;
  ultimoEventoEm: string | null;
}

interface ContaListada {
  id: string;
  nome: string;
  bmId: string | null;
  temApiKey: boolean;
  temApiSecret: boolean;
  temWebhookSecret: boolean;
  temMetaToken: boolean;
  numeros: NumeroVinculado[];
}

interface CandidatoNumero {
  metaPhoneNumberId: string | null;
  instanceId: string | null;
  numero: string | null;
  nomeVerificado: string | null;
  bmId: string | null;
  bmName: string | null;
  wabaId: string | null;
  statusFluxo: string | null;
  qualidadeMeta: string | null;
  conferido: boolean;
}

type Decisao = { tipo: 'pendente' } | { tipo: 'marca'; marcaId: string } | { tipo: 'ignorar' };

interface Props {
  onShowToast: (msg: string) => void;
}

const FORM_VAZIO = { nome: '', bmId: '', apiKey: '', apiSecret: '', webhookSecret: '', metaToken: '' };

async function lerJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export const ContasFluxo: React.FC<Props> = ({ onShowToast }) => {
  const [contas, setContas] = useState<ContaListada[]>([]);
  const [marcas, setMarcas] = useState<Array<{ id: string; name: string }>>([]);
  const [indisponivel, setIndisponivel] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [contaAberta, setContaAberta] = useState<string | null>(null);
  const [candidatos, setCandidatos] = useState<Record<string, CandidatoNumero[]>>({});
  const [avisos, setAvisos] = useState<Record<string, string[]>>({});
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({});
  const [buscando, setBuscando] = useState<string | null>(null);

  const carregar = async () => {
    try {
      const res = await apiFetch('/api/admin/fluxo/contas');
      if (res.status === 404) {
        setIndisponivel(true);
        return;
      }
      const data = await lerJson(res);
      if (!res.ok) throw new Error(data.error || 'Não foi possível carregar as contas.');
      setContas(data.contas || []);
      setIndisponivel(false);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar as contas.');
    }
  };

  useEffect(() => {
    carregar();
    apiFetch('/api/brands')
      .then(r => lerJson(r))
      .then(d => setMarcas(Array.isArray(d) ? d : []))
      .catch(() => setMarcas([]));
  }, []);

  const salvarConta = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const res = await apiFetch('/api/admin/fluxo/contas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome,
          bmId: form.bmId || null,
          apiKey: form.apiKey || undefined,
          apiSecret: form.apiSecret || undefined,
          webhookSecret: form.webhookSecret || undefined,
          metaToken: form.metaToken || undefined,
        }),
      });
      const data = await lerJson(res);
      if (!res.ok) throw new Error(data.error || 'Não foi possível salvar a conta.');
      setForm(FORM_VAZIO); // limpa os segredos da tela logo após enviar
      onShowToast('Conta salva.');
      await carregar();
    } catch (e: any) {
      setErro(e?.message || 'Erro ao salvar a conta.');
    } finally {
      setSalvando(false);
    }
  };

  const buscarNumeros = async (conta: ContaListada) => {
    setBuscando(conta.id);
    setErro(null);
    try {
      const res = await apiFetch(`/api/admin/fluxo/contas/${encodeURIComponent(conta.id)}/descobrir`, { method: 'POST' });
      const data = await lerJson(res);
      if (!res.ok) throw new Error(data.error || 'Não foi possível buscar os números.');
      const lista: CandidatoNumero[] = data.candidatos || [];
      setCandidatos(prev => ({ ...prev, [conta.id]: lista }));
      setAvisos(prev => ({ ...prev, [conta.id]: data.avisos || [] }));
      // Começa tudo como pendente: o operador escolhe. Nada é gravado sem a escolha.
      setDecisoes(prev => {
        const n = { ...prev };
        for (const c of lista) n[`${conta.id}|${c.metaPhoneNumberId || c.instanceId}`] = { tipo: 'pendente' };
        return n;
      });
      setContaAberta(conta.id);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao buscar os números.');
    } finally {
      setBuscando(null);
    }
  };

  const chaveDecisao = (contaId: string, c: CandidatoNumero) => `${contaId}|${c.metaPhoneNumberId || c.instanceId}`;

  const gravarVinculos = async (conta: ContaListada) => {
    const lista = candidatos[conta.id] || [];
    const vinculos = lista
      .map(c => ({ c, d: decisoes[chaveDecisao(conta.id, c)] }))
      .filter(({ d }) => d && d.tipo !== 'pendente')
      .map(({ c, d }) => ({
        instanceId: c.instanceId,
        metaPhoneNumberId: c.metaPhoneNumberId,
        numero: c.numero,
        wabaId: c.wabaId,
        bmId: c.bmId,
        marcaId: d!.tipo === 'marca' ? d!.marcaId : null,
        ignorado: d!.tipo === 'ignorar',
      }));
    if (!vinculos.length) {
      setErro('Escolha a marca de pelo menos um número (ou "Não usar") antes de salvar.');
      return;
    }
    try {
      const res = await apiFetch(`/api/admin/fluxo/contas/${encodeURIComponent(conta.id)}/vincular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vinculos }),
      });
      const data = await lerJson(res);
      if (!res.ok) throw new Error(data.error || 'Não foi possível salvar os vínculos.');
      onShowToast(`${data.gravados} número(s) salvos.`);
      setContaAberta(null);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || 'Erro ao salvar os vínculos.');
    }
  };

  const nomeMarca = (id: string | null) => (id ? marcas.find(m => m.id === id)?.name || id : 'Pendente');

  if (indisponivel) {
    return (
      <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900">
        Contas da FluxoAPI estão desligadas neste servidor. Ative <strong>NYROH_FLUXO_CONTAS</strong> e aplique a migração
        <code className="ml-1">2026-11-fluxo-contas.sql</code> depois de fazer o backup do banco.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {erro && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{erro}</div>}

      {/* Cadastro de conta */}
      <form onSubmit={salvarConta} className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-neutral-900">Nova conta da FluxoAPI</h3>
          <p className="text-[11px] text-neutral-500">Os segredos são guardados cifrados. Depois de salvar, a tela só mostra se estão configurados.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className="text-xs border border-neutral-300 rounded-lg px-3 py-2" placeholder="Nome (ex.: Conta Nyroh)" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required />
          <input className="text-xs border border-neutral-300 rounded-lg px-3 py-2" placeholder="BM (opcional)" value={form.bmId} onChange={e => setForm({ ...form, bmId: e.target.value })} />
          <input className="text-xs border border-neutral-300 rounded-lg px-3 py-2" type="password" autoComplete="off" placeholder="Chave da FluxoAPI" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} />
          <input className="text-xs border border-neutral-300 rounded-lg px-3 py-2" type="password" autoComplete="off" placeholder="Segredo da FluxoAPI" value={form.apiSecret} onChange={e => setForm({ ...form, apiSecret: e.target.value })} />
          <input className="text-xs border border-neutral-300 rounded-lg px-3 py-2" type="password" autoComplete="off" placeholder="Segredo do webhook" value={form.webhookSecret} onChange={e => setForm({ ...form, webhookSecret: e.target.value })} />
          <input className="text-xs border border-neutral-300 rounded-lg px-3 py-2" type="password" autoComplete="off" placeholder="Token da Meta (para ver a BM de cada número)" value={form.metaToken} onChange={e => setForm({ ...form, metaToken: e.target.value })} />
        </div>
        <button type="submit" disabled={salvando} className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-xs font-bold disabled:opacity-50">
          {salvando ? 'Salvando…' : 'Salvar conta'}
        </button>
      </form>

      {/* Contas */}
      {contas.map(conta => (
        <div key={conta.id} className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">{conta.nome}</h3>
              <div className="flex flex-wrap gap-1.5 mt-1 text-[10px] font-bold">
                <span className={`px-1.5 py-0.5 rounded ${conta.temApiKey ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>chave {conta.temApiKey ? 'ok' : 'falta'}</span>
                <span className={`px-1.5 py-0.5 rounded ${conta.temApiSecret ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>segredo {conta.temApiSecret ? 'ok' : 'falta'}</span>
                <span className={`px-1.5 py-0.5 rounded ${conta.temWebhookSecret ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>webhook {conta.temWebhookSecret ? 'ok' : 'falta'}</span>
                <span className={`px-1.5 py-0.5 rounded ${conta.temMetaToken ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>token Meta {conta.temMetaToken ? 'ok' : 'falta'}</span>
              </div>
            </div>
            <button onClick={() => buscarNumeros(conta)} disabled={buscando === conta.id} className="px-3 py-2 rounded-lg border border-neutral-300 text-xs font-bold hover:bg-neutral-50 disabled:opacity-50">
              {buscando === conta.id ? 'Buscando…' : 'Buscar números'}
            </button>
          </div>

          {/* Números já vinculados */}
          {conta.numeros.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-neutral-500"><th className="py-1 pr-3">Número</th><th className="py-1 pr-3">Marca</th><th className="py-1 pr-3">Último evento</th></tr></thead>
                <tbody>
                  {conta.numeros.map(n => (
                    <tr key={n.id} className="border-t border-neutral-100">
                      <td className="py-1.5 pr-3 font-mono">{n.numero || n.instanceId || n.metaPhoneNumberId}</td>
                      <td className="py-1.5 pr-3">{n.ignorado ? 'Não usar' : nomeMarca(n.marcaId)}</td>
                      <td className="py-1.5 pr-3 text-neutral-500">{n.ultimoEventoEm ? new Date(n.ultimoEventoEm).toLocaleString('pt-BR') : 'nenhum ainda'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Descoberta e escolha da marca */}
          {contaAberta === conta.id && (
            <div className="border-t border-neutral-200 pt-3 space-y-2">
              {(avisos[conta.id] || []).map((a, i) => (
                <p key={i} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">{a}</p>
              ))}
              {(candidatos[conta.id] || []).length === 0 && <p className="text-xs text-neutral-500">Nenhum número encontrado.</p>}
              {(candidatos[conta.id] || []).map(c => {
                const chave = chaveDecisao(conta.id, c);
                const d = decisoes[chave] || { tipo: 'pendente' };
                const valor = d.tipo === 'marca' ? d.marcaId : d.tipo === 'ignorar' ? '__ignorar' : '';
                return (
                  <div key={chave} className="flex flex-wrap items-center gap-2 text-xs border border-neutral-200 rounded-lg p-2">
                    <div className="flex-1 min-w-[180px]">
                      <div className="font-mono font-bold">{c.numero || '—'} <span className="font-normal text-neutral-500">{c.nomeVerificado || ''}</span></div>
                      <div className="text-[11px] text-neutral-500">
                        {c.bmName ? `BM: ${c.bmName}` : 'Sem BM (token da Meta ausente)'}
                        {' · '}{c.conferido ? 'conferido na FluxoAPI e na Meta' : c.instanceId ? 'só na FluxoAPI' : 'só na Meta'}
                        {c.statusFluxo ? ` · ${c.statusFluxo}` : ''}
                        {c.qualidadeMeta ? ` · qualidade ${c.qualidadeMeta}` : ''}
                      </div>
                    </div>
                    <select
                      className="text-xs border border-neutral-300 rounded-lg px-2 py-1.5"
                      value={valor}
                      onChange={e => {
                        const v = e.target.value;
                        const nova: Decisao = v === '' ? { tipo: 'pendente' } : v === '__ignorar' ? { tipo: 'ignorar' } : { tipo: 'marca', marcaId: v };
                        setDecisoes(prev => ({ ...prev, [chave]: nova }));
                      }}
                    >
                      <option value="">Escolher marca…</option>
                      {marcas.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      <option value="__ignorar">Não usar</option>
                    </select>
                  </div>
                );
              })}
              {(candidatos[conta.id] || []).length > 0 && (
                <button onClick={() => gravarVinculos(conta)} className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-xs font-bold">
                  Salvar escolhas
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {!contas.length && <p className="text-xs text-neutral-500">Nenhuma conta cadastrada ainda.</p>}
    </div>
  );
};
