import React, { useEffect, useState } from 'react';
import { RefreshCw, Trash2, Plus, X } from 'lucide-react';

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

/** Contas da Meta (BMs) em tabela. Cadastrar abre um modal, para a tela não ficar com formulário aberto. */
export default function MetaAccountsPanel({ onShowToast, onAccountsChanged }: Props) {
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      onShowToast(`BM cadastrada: ${data.sync?.numbers ?? 0} número(s) sincronizado(s).`);
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
    if (!window.confirm(`Remover a BM "${label}" do CRM? O token guardado será apagado.`)) return;
    setBusy(id);
    try {
      await fetch(`/api/admin/meta/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      onShowToast('BM removida do CRM.');
      await load();
      onAccountsChanged?.();
    } finally {
      setBusy(null);
    }
  };

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
  const labelCls = 'block text-xs font-semibold text-neutral-300 mb-1';

  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900 text-neutral-100 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-800">
        <div>
          <h3 className="text-sm font-bold text-white">Contas da Meta (BMs)</h3>
          <p className="text-[11px] text-neutral-400">Cada BM guarda o próprio token, criptografado. Os números herdam o token da BM.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="text-xs px-2.5 py-1.5 rounded-lg border border-neutral-700 text-neutral-200 flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => { setError(null); setOpen(true); }} className="text-xs px-3 py-1.5 rounded-lg bg-white text-neutral-900 font-semibold flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Cadastrar BM
          </button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-neutral-400">
          Nenhuma BM cadastrada. Os números do ambiente (META_*) continuam funcionando sem cadastro.
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-neutral-400 text-left">
            <tr className="border-b border-neutral-800">
              <th className="px-4 py-2 font-medium">BM</th>
              <th className="px-4 py-2 font-medium">WABA</th>
              <th className="px-4 py-2 font-medium">Números</th>
              <th className="px-4 py-2 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(a => (
              <tr key={a.id} className="border-b border-neutral-800/60 last:border-0">
                <td className="px-4 py-2.5 font-semibold text-white">{a.name}</td>
                <td className="px-4 py-2.5 font-mono text-neutral-400">{a.wabaId}</td>
                <td className="px-4 py-2.5 text-neutral-300">{a.numbers}</td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => syncAccount(a.id)} disabled={busy === a.id} className="px-2.5 py-1 rounded-md bg-emerald-600 text-white font-semibold disabled:opacity-50">
                      Sincronizar
                    </button>
                    <button onClick={() => removeAccount(a.id, a.name)} disabled={busy === a.id} className="px-2 py-1 rounded-md border border-red-800 text-red-400 disabled:opacity-50" aria-label="Remover BM">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <form
            onSubmit={addAccount}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-900 p-5 space-y-4 text-neutral-100"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-white">Cadastrar BM</h4>
                <p className="text-[11px] text-neutral-400">O token é validado na Meta antes de ser guardado.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-neutral-400 hover:text-white" aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className={labelCls}>Nome da BM</label>
                <input className={inputCls} placeholder="Ex.: Nyroh - Comercial" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>ID da conta do WhatsApp (WABA)</label>
                <input className={inputCls} value={wabaId} onChange={e => setWabaId(e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>ID do Business Manager <span className="text-neutral-500">(opcional)</span></label>
                <input className={inputCls} value={businessId} onChange={e => setBusinessId(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Token de acesso</label>
                <input className={inputCls} type="password" placeholder="EAAG..." value={token} onChange={e => setToken(e.target.value)} required autoComplete="off" />
              </div>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="text-xs px-3 py-2 rounded-lg border border-neutral-700 text-neutral-200">Cancelar</button>
              <button type="submit" disabled={busy === 'add'} className="text-xs px-4 py-2 rounded-lg bg-white text-neutral-900 font-semibold disabled:opacity-50">
                {busy === 'add' ? 'Validando na Meta...' : 'Cadastrar BM'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
