import React, { useEffect, useState } from 'react';
import { X, Ban } from 'lucide-react';

export const MOTIVOS_BLOQUEIO_UI: Array<{ code: string; label: string }> = [
  { code: 'sem_whatsapp', label: 'Sem WhatsApp / número inválido' },
  { code: 'pediu_remocao', label: 'Pediu para não ser contatado' },
  { code: 'numero_errado', label: 'Número errado ou de outra pessoa' },
  { code: 'ja_atendido', label: 'Já atendido por outra marca hoje' },
  { code: 'outro', label: 'Outro (descrever)' },
];

interface Props {
  leadId: string;
  leadName: string;
  onClose: () => void;
  onSent: (msg: string) => void;
}

/** Vendedor sugere o bloqueio com motivo. Quem aprova é o admin, na aba Bloqueios pendentes. */
export const BlockRequestDialog: React.FC<Props> = ({ leadId, leadName, onClose, onSent }) => {
  const [code, setCode] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const enviar = async () => {
    if (!code) { setError('Escolha um motivo.'); return; }
    if (code === 'outro' && !text.trim()) { setError('Descreva o motivo em "Outro".'); return; }
    setSending(true); setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/block-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reasonCode: code, reasonText: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Não foi possível enviar.'); return; }
      onSent('Pedido de bloqueio enviado para aprovação do admin.');
      onClose();
    } catch {
      setError('Erro de conexão.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-neutral-900/40 px-4" onMouseDown={onClose}>
      <div role="dialog" aria-label="Sugerir bloqueio" className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-neutral-200 p-5" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Sugerir bloqueio</h3>
            <p className="text-xs text-neutral-500">{leadName}. O lead só sai da base depois que o admin aprovar.</p>
          </div>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-neutral-700" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-col gap-1.5 mb-3">
          {MOTIVOS_BLOQUEIO_UI.map(m => (
            <label key={m.code} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${code === m.code ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:bg-neutral-50'}`}>
              <input type="radio" name="motivo" checked={code === m.code} onChange={() => setCode(m.code)} />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
        {code === 'outro' && (
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Descreva o motivo" className="w-full text-sm px-3 py-2 border border-neutral-300 rounded-lg mb-3" />
        )}
        {error && <p className="text-xs text-rose-700 mb-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-neutral-300 hover:bg-neutral-50">Cancelar</button>
          <button onClick={enviar} disabled={sending} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-neutral-900 text-white disabled:opacity-50">{sending ? 'Enviando…' : 'Enviar para aprovação'}</button>
        </div>
      </div>
    </div>
  );
};

interface BlockHistoryItem { id: string; reasonCode: string; reasonText?: string; status: string; decisionNote?: string; requestedAt: string; decidedAt?: string }
const STATUS_LABEL: Record<string, string> = { pendente: 'aguardando admin', aprovado: 'bloqueado', recusado: 'recusado' };

/** Histórico de pedidos de bloqueio do lead. Vazio = não aparece. */
export const BlockHistory: React.FC<{ leadId: string; refreshKey?: number }> = ({ leadId, refreshKey }) => {
  const [items, setItems] = useState<BlockHistoryItem[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`/api/leads/${leadId}/block-requests`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (alive && Array.isArray(d)) setItems(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [leadId, refreshKey]);
  if (items.length === 0) return null;
  return (
    <div className="mx-4 mt-2 p-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-xs text-neutral-700">
      <p className="font-bold mb-1 flex items-center gap-1"><Ban className="w-3 h-3" /> Histórico de bloqueio</p>
      <ul className="space-y-1">
        {items.map(i => (
          <li key={i.id}>
            <span className="font-semibold">{MOTIVOS_BLOQUEIO_UI.find(m => m.code === i.reasonCode)?.label || i.reasonCode}</span>
            {i.reasonText ? ` — ${i.reasonText}` : ''}
            <span className="text-neutral-500"> · {STATUS_LABEL[i.status] || i.status} · {new Date(i.requestedAt).toLocaleDateString('pt-BR')}</span>
            {i.decisionNote ? <span className="text-neutral-500"> · {i.decisionNote}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
};
