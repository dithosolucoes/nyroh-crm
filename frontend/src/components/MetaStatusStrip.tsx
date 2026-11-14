import React, { useCallback, useEffect, useState } from 'react';
import type { RespostaStatusMeta, RespostaSincronizacaoTodas, RespostaStatusFluxo } from '@shared/contracts/rotas';
import { CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';



interface Props {
  onShowToast: (msg: string) => void;
  onChanged?: () => void;
}

/** Faixa do topo: uma linha com o estado real da integração e a próxima ação, se houver. */
export default function MetaStatusStrip({ onShowToast, onChanged }: Props) {
  const [status, setStatus] = useState<RespostaStatusMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [fluxo, setFluxo] = useState<RespostaStatusFluxo | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/meta/status');
      if (res.ok) setStatus((await res.json()) as RespostaStatusMeta);
    } catch { /* faixa é informativa */ }
    try {
      const res = await fetch('/api/admin/fluxo/status');
      if (res.ok) setFluxo((await res.json()) as RespostaStatusFluxo);
    } catch { /* faixa é informativa */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const testAll = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/meta/sync-all', { method: 'POST' });
      const data = (await res.json()) as RespostaSincronizacaoTodas;
      onShowToast(data.success ? 'Contas sincronizadas com a Meta.' : 'Alguma conta não respondeu. Veja a mensagem na lista de contas.');
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  const tokenOk = status.envToken || status.accounts > 0;
  let next: string | null = null;
  if (status.provider !== 'meta') {
    next = fluxo && fluxo.missing.length
      ? `Faltam no Railway: ${fluxo.missing.join(', ')}.`
      : fluxo && !fluxo.connected
        ? `FluxoAPI configurada, mas a instância não está No ar (${fluxo.instance.status}). Confira na FluxoAPI.`
        : null;
  } else if (!tokenOk) {
    next = 'Falta o token da Meta. Crie a variável META_ACCESS_TOKEN no Railway ou cadastre uma BM abaixo.';
  } else if (!status.appSecret) {
    next = 'Falta META_APP_SECRET no Railway. Sem ele, o webhook da Meta é recusado.';
  } else if (!status.verifyToken) {
    next = 'Falta o token de verificação do webhook (META_VERIFY_TOKEN no Railway).';
  }

  const Chip = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${ok ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-amber-950 text-amber-300 border-amber-800'}`}>
      {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
      {label}
    </span>
  );

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 space-y-3 text-neutral-100">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-white mr-1">WhatsApp Meta</span>
          <Chip ok={status.provider === 'meta'} label={status.provider === 'meta' ? 'Meta direta' : 'FluxoAPI ativa'} />
          {status.provider !== 'meta' && fluxo && (
            <>
              <Chip ok={fluxo.missing.length === 0} label={fluxo.missing.length === 0 ? 'Variáveis OK' : `Faltam ${fluxo.missing.length} variável(is)`} />
              <Chip ok={fluxo.connected} label={fluxo.connected ? 'Instância No ar' : `Instância: ${fluxo.instance.found ? fluxo.instance.status : 'não encontrada'}`} />
            </>
          )}
          <Chip ok={tokenOk} label={tokenOk ? 'Token OK' : 'Sem token'} />
          <Chip ok={status.accounts > 0 || status.envPhoneNumberId} label={`${status.numbers} número(s)`} />
          <Chip ok={status.accounts > 0} label={`${status.accounts} BM(s)`} />
          <Chip ok={status.webhookReady} label={status.webhookReady ? 'Webhook pronto' : 'Webhook incompleto'} />
        </div>
        <button
          onClick={testAll}
          disabled={busy}
          className="self-start md:self-auto flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
          {busy ? 'Testando...' : 'Testar conexão'}
        </button>
      </div>
      {next && (
        <p className="text-xs text-amber-200 bg-amber-950/60 border border-amber-900 rounded-lg px-3 py-2">{next}</p>
      )}
    </div>
  );
}
