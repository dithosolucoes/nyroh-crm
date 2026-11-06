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
  /** Números já carregados pela tela (cada um com accountId). */
  numbers: any[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenModels: (id: string) => void;
}

type DetailTab = 'numbers' | 'config';

/** Lista de BMs (uma tabela) + detalhe da BM selecionada com sub-abas Números e Configuração. */
export default function MetaAccountsPanel({ onShowToast, onAccountsChanged, numbers, selectedId, onSelect, onOpenModels }: Props) {
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('numbers');
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
      onSelect(data.account?.id || null);
    } catch (err: any) {
      setError(err?.message || 'Falha de conexão ao cadastrar.');
    } finally {
      setBusy(null);
    }
  };

  // ---- Conectar número pela Meta (Embedded Signup) ----
  const signupRef = React.useRef<{ code?: string; wabaId?: string; phoneNumberId?: string }>({});

  const finishSignup = async () => {
    const s = signupRef.current;
    if (!s.code || !s.wabaId) return;
    const payload = { code: s.code, wabaId: s.wabaId, phoneNumberId: s.phoneNumberId || '' };
    signupRef.current = {};
    setBusy('signup');
    try {
      const res = await fetch('/api/admin/meta/embedded-signup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onShowToast(data.error || 'Não foi possível concluir a conexão com a Meta.');
        return;
      }
      onShowToast(data.warning ? data.warning : `Número conectado: ${data.numbers} número(s) na conta.`);
      await load();
      onAccountsChanged?.();
      if (data.accountId) onSelect(data.accountId);
    } catch (err: any) {
      onShowToast(err?.message || 'Falha de conexão ao concluir.');
    } finally {
      setBusy(null);
    }
  };

  const loadFacebookSdk = (appId: string) => new Promise<void>((resolve, reject) => {
    const w = window as any;
    if (w.FB) { w.FB.init({ appId, cookie: true, xfbml: false, version: 'v21.0' }); return resolve(); }
    w.fbAsyncInit = () => { w.FB.init({ appId, cookie: true, xfbml: false, version: 'v21.0' }); resolve(); };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    script.async = true;
    script.onerror = () => reject(new Error('Não consegui carregar o login da Meta. Verifique a conexão.'));
    document.body.appendChild(script);
  });

  // Recebe a conta e o número escolhidos dentro do fluxo da Meta
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!String(event.origin || '').endsWith('facebook.com')) return;
      let data: any = event.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP' || !data?.data) return;
      const info = data.data;
      if (info.waba_id) signupRef.current.wabaId = String(info.waba_id);
      if (info.phone_number_id) signupRef.current.phoneNumberId = String(info.phone_number_id);
      finishSignup();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectWithMeta = async () => {
    setError(null);
    setBusy('signup');
    try {
      const cfgRes = await fetch('/api/admin/meta/embedded-signup/config');
      const cfg = await cfgRes.json();
      if (!cfg.ready) {
        onShowToast('Falta configurar o login da Meta no servidor (META_APP_ID, META_CONFIG_ID e META_APP_SECRET).');
        return;
      }
      await loadFacebookSdk(cfg.appId);
      const w = window as any;
      w.FB.login((resp: any) => {
        const code = resp?.authResponse?.code;
        if (!code) {
          setBusy(null);
          onShowToast('Login cancelado ou não concluído.');
          return;
        }
        signupRef.current.code = code;
        setBusy(null);
        finishSignup();
      }, {
        config_id: cfg.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' }
      });
    } catch (err: any) {
      setBusy(null);
      onShowToast(err?.message || 'Não foi possível abrir o login da Meta.');
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
      onSelect(null);
      await load();
      onAccountsChanged?.();
    } finally {
      setBusy(null);
    }
  };

  const selected = accounts.find(a => a.id === selectedId) || null;
  const selectedNumbers = selectedId ? numbers.filter(n => (n.accountId || 'env') === selectedId) : [];

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
  const labelCls = 'block text-xs font-semibold text-neutral-300 mb-1';

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 text-neutral-100 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-800">
          <div>
            <h3 className="text-sm font-bold text-white">Contas da Meta (BMs)</h3>
            <p className="text-[11px] text-neutral-400">Clique numa BM para ver os números e configurações dela.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} className="text-xs px-2.5 py-1.5 rounded-lg border border-neutral-700 text-neutral-200 flex items-center gap-1.5" aria-label="Atualizar lista">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={connectWithMeta} disabled={busy === 'signup'} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-neutral-950 font-semibold flex items-center gap-1.5 disabled:opacity-60">
              {busy === 'signup' ? 'Conectando...' : 'Conectar número pela Meta'}
            </button>
            <button onClick={() => { setError(null); setOpen(true); }} className="text-xs px-3 py-1.5 rounded-lg bg-white text-neutral-900 font-semibold flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Cadastrar BM
            </button>
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-neutral-400">
            Nenhuma BM cadastrada. Clique em "Cadastrar BM" para começar.
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
              {accounts.map(a => {
                const isSel = a.id === selectedId;
                return (
                  <tr
                    key={a.id}
                    onClick={() => { onSelect(isSel ? null : a.id); setDetailTab('numbers'); }}
                    className={`border-b border-neutral-800/60 last:border-0 cursor-pointer ${isSel ? 'bg-emerald-950/50' : 'hover:bg-neutral-800/50'}`}
                  >
                    <td className="px-4 py-2.5 font-semibold text-white">{a.name}</td>
                    <td className="px-4 py-2.5 font-mono text-neutral-400">{a.wabaId}</td>
                    <td className="px-4 py-2.5 text-neutral-300">{a.numbers}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                        <button onClick={() => syncAccount(a.id)} disabled={busy === a.id} className="px-2.5 py-1 rounded-md bg-emerald-600 text-white font-semibold disabled:opacity-50">
                          Sincronizar
                        </button>
                        <button onClick={() => removeAccount(a.id, a.name)} disabled={busy === a.id} className="px-2 py-1 rounded-md border border-red-800 text-red-400 disabled:opacity-50" aria-label="Remover BM">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {selected && (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 text-neutral-100 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-neutral-800">
            <div>
              <h4 className="text-sm font-bold text-white">{selected.name}</h4>
              <p className="text-[11px] text-neutral-400 font-mono">WABA {selected.wabaId}</p>
            </div>
            <div className="flex gap-1 p-1 bg-neutral-950 rounded-lg">
              {([['numbers', 'Números'], ['config', 'Configuração']] as Array<[DetailTab, string]>).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setDetailTab(id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold ${detailTab === id ? 'bg-white text-neutral-900' : 'text-neutral-300 hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {detailTab === 'numbers' && (
            <div>
              {selectedNumbers.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-neutral-400 space-y-2">
                  <p>Nenhum número sincronizado nesta BM.</p>
                  <button onClick={() => syncAccount(selected.id)} disabled={busy === selected.id} className="px-3 py-1.5 rounded-md bg-emerald-600 text-white font-semibold disabled:opacity-50">
                    Sincronizar agora
                  </button>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-neutral-400 text-left">
                    <tr className="border-b border-neutral-800">
                      <th className="px-4 py-2 font-medium">Número</th>
                      <th className="px-4 py-2 font-medium">Nome verificado</th>
                      <th className="px-4 py-2 font-medium">Qualidade</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedNumbers.map(n => (
                      <tr key={n.id} className="border-b border-neutral-800/60 last:border-0">
                        <td className="px-4 py-2.5 font-mono text-white">{n.phone || n.id}</td>
                        <td className="px-4 py-2.5 text-neutral-300">{n.name || '—'}</td>
                        <td className="px-4 py-2.5 text-neutral-300">{n.quality || '—'}</td>
                        <td className="px-4 py-2.5 text-neutral-300">{n.status || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="px-4 py-3 border-t border-neutral-800">
                <button onClick={() => onOpenModels(selected.id)} className="text-xs px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-200 hover:bg-neutral-800">
                  Ver modelos desta BM
                </button>
              </div>
            </div>
          )}

          {detailTab === 'config' && (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-neutral-400 mb-1">Nome</div>
                <div className="text-white font-semibold">{selected.name}</div>
              </div>
              <div>
                <div className="text-neutral-400 mb-1">ID da conta do WhatsApp (WABA)</div>
                <div className="text-white font-mono">{selected.wabaId}</div>
              </div>
              <div>
                <div className="text-neutral-400 mb-1">ID do Business Manager</div>
                <div className="text-white font-mono">{selected.businessId || '—'}</div>
              </div>
              <div>
                <div className="text-neutral-400 mb-1">Token</div>
                <div className="text-neutral-300">Guardado criptografado. Para trocar, remova a BM e cadastre de novo com o novo token.</div>
              </div>
              <div className="sm:col-span-2 flex flex-wrap gap-2 pt-2 border-t border-neutral-800">
                <button onClick={() => syncAccount(selected.id)} disabled={busy === selected.id} className="px-3 py-1.5 rounded-md bg-emerald-600 text-white font-semibold disabled:opacity-50">
                  Sincronizar com a Meta
                </button>
                <button onClick={() => removeAccount(selected.id, selected.name)} disabled={busy === selected.id} className="px-3 py-1.5 rounded-md border border-red-800 text-red-400 disabled:opacity-50">
                  Remover BM do CRM
                </button>
              </div>
            </div>
          )}
        </section>
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
    </div>
  );
}
