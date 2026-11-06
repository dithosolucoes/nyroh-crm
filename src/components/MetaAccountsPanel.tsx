import React, { useEffect, useState } from 'react';
import { RefreshCw, Trash2, Plus, Building2 } from 'lucide-react';

interface MetaAccount {
  id: string;
  name: string;
  wabaId: string;
  businessId?: string | null;
  numbers: number;
}

interface Props {
  onShowToast: (msg: string) => void;
  onAccountsChanged?: () => void;
}

/** Contas da Meta (BMs) cadastradas no CRM: cada uma com seu token guardado criptografado. */
export default function MetaAccountsPanel({ onShowToast, onAccountsChanged }: Props) {
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/meta/accounts');
      const data = await res.json();
      if (res.ok && data.success) setAccounts(data.accounts || []);
    } catch (err) {
      console.error('Erro ao carregar contas da Meta:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy('add');
    try {
      const res = await fetch('/api/admin/meta/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, wabaId, businessId, accessToken: token })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Não foi possível cadastrar a conta.');
        return;
      }
      setName(''); setWabaId(''); setBusinessId(''); setToken('');
      onShowToast(`Conta cadastrada: ${data.sync?.numbers ?? 0} número(s) sincronizado(s).`);
      await load();
      onAccountsChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Falha de conexão ao cadastrar.');
    } finally {
      setBusy(null);
    }
  };

  const syncAccount = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/meta/accounts/${encodeURIComponent(id)}/sync`, { method: 'POST' });
      const data = await res.json();
      onShowToast(data.success ? `Sincronizado: ${data.numbers} número(s), ${data.templates} modelo(s).` : (data.error || 'Falha ao sincronizar.'));
      await load();
      onAccountsChanged?.();
    } finally {
      setBusy(null);
    }
  };

  const removeAccount = async (id: string, label: string) => {
    if (!window.confirm(`Remover a conta "${label}" do CRM? O token guardado será apagado.`)) return;
    setBusy(id);
    try {
      await fetch(`/api/admin/meta/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      onShowToast('Conta removida do CRM.');
      await load();
      onAccountsChanged?.();
    } finally {
      setBusy(null);
    }
  };

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <section className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5 space-y-4 text-neutral-100">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Building2 className="w-5 h-5 text-emerald-500" /> Contas da Meta (BMs)
        </h3>
        <button onClick={load} disabled={loading} className="text-xs px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-200 flex items-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar lista
        </button>
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-neutral-400">Nenhuma conta cadastrada aqui ainda. Os números do ambiente (META_*) continuam funcionando.</p>
      ) : (
        <ul className="divide-y divide-neutral-800">
          {accounts.map(a => (
            <li key={a.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-sm text-white">{a.name}</div>
                <div className="text-xs text-neutral-400 font-mono">WABA {a.wabaId} • {a.numbers} número(s)</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => syncAccount(a.id)} disabled={busy === a.id} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50">
                  Sincronizar com a Meta
                </button>
                <button onClick={() => removeAccount(a.id, a.name)} disabled={busy === a.id} className="text-xs px-2 py-1.5 rounded-lg border border-red-700 text-red-400 disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addAccount} className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-neutral-800">
        <input className={inputCls} placeholder="Nome da BM (ex.: Nyroh - Comercial)" value={name} onChange={e => setName(e.target.value)} required />
        <input className={inputCls} placeholder="ID da conta do WhatsApp (WABA)" value={wabaId} onChange={e => setWabaId(e.target.value)} required />
        <input className={inputCls} placeholder="ID do Business Manager (opcional)" value={businessId} onChange={e => setBusinessId(e.target.value)} />
        <input className={inputCls} type="password" placeholder="Token de acesso da BM" value={token} onChange={e => setToken(e.target.value)} required autoComplete="off" />
        {error && <p className="md:col-span-2 text-sm text-red-400">{error}</p>}
        <div className="md:col-span-2">
          <button type="submit" disabled={busy === 'add'} className="text-sm px-4 py-2 rounded-lg bg-white text-neutral-900 font-semibold flex items-center gap-2 disabled:opacity-50">
            <Plus className="w-4 h-4" /> {busy === 'add' ? 'Validando na Meta...' : 'Cadastrar BM'}
          </button>
        </div>
      </form>
    </section>
  );
}
