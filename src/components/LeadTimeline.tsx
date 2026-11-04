import React, { useEffect, useMemo, useState } from 'react';
import { Phone, MessageSquare, Ban, CheckCircle2, XCircle } from 'lucide-react';

/** Ligação já registrada no lead (vem de /api/leads/:id/calls). */
export interface TimelineCall {
  id: string;
  tag?: string;
  comment?: string;
  durationSeconds?: number;
  createdAt: string;
}

interface BlockItem {
  id: string;
  reasonCode: string;
  reasonText?: string;
  status: string;
  requestedAt: string;
  decidedAt?: string;
}

interface MessageItem {
  id: string;
  sender: string;
  text?: string;
  timestamp: string;
}

type Evento =
  | { tipo: 'ligacao'; quando: string; titulo: string; detalhe?: string }
  | { tipo: 'mensagem'; quando: string; titulo: string; detalhe?: string }
  | { tipo: 'bloqueio'; quando: string; titulo: string; detalhe?: string };

/** Quantos toques o vendedor já deu: ligações + mensagens enviadas por ele. Aviso ao chegar em 8. */
export const LIMITE_TOQUES = 8;

const LABEL_MOTIVO: Record<string, string> = {
  sem_whatsapp: 'Sem WhatsApp',
  pediu_remocao: 'Pediu para não ser contatado',
  numero_errado: 'Número errado',
  ja_atendido: 'Já atendido',
  outro: 'Outro',
};

const LABEL_STATUS: Record<string, string> = {
  pendente: 'aguardando admin',
  aprovado: 'bloqueado',
  recusado: 'recusado',
};

const dataCurta = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const LeadTimeline: React.FC<{ leadId: string; calls: TimelineCall[]; refreshKey?: number }> = ({ leadId, calls, refreshKey }) => {
  const [bloqueios, setBloqueios] = useState<BlockItem[]>([]);
  const [mensagens, setMensagens] = useState<MessageItem[]>([]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/leads/${leadId}/block-requests`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (vivo && Array.isArray(d)) setBloqueios(d); })
      .catch(() => {});
    fetch(`/api/leads/${leadId}/messages?limit=60`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const lista = Array.isArray(d) ? d : Array.isArray(d?.messages) ? d.messages : [];
        if (vivo) setMensagens(lista);
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [leadId, refreshKey]);

  const eventos = useMemo<Evento[]>(() => {
    const lista: Evento[] = [];
    for (const c of calls) {
      const dur = c.durationSeconds ? ` · ${Math.round(c.durationSeconds)}s` : '';
      lista.push({ tipo: 'ligacao', quando: c.createdAt, titulo: c.tag || 'Ligação', detalhe: (c.comment || '') + dur });
    }
    for (const b of bloqueios) {
      const motivo = LABEL_MOTIVO[b.reasonCode] || b.reasonCode;
      lista.push({ tipo: 'bloqueio', quando: b.requestedAt, titulo: `Bloqueio sugerido: ${motivo}`, detalhe: LABEL_STATUS[b.status] || b.status });
      if (b.decidedAt && b.status !== 'pendente') {
        lista.push({ tipo: 'bloqueio', quando: b.decidedAt, titulo: `Bloqueio ${b.status === 'aprovado' ? 'aprovado' : 'recusado'}`, detalhe: motivo });
      }
    }
    for (const m of mensagens) {
      if (m.sender !== 'salesperson') continue;
      lista.push({ tipo: 'mensagem', quando: m.timestamp, titulo: 'Mensagem enviada pelo vendedor', detalhe: (m.text || '').slice(0, 120) });
    }
    return lista.sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());
  }, [calls, bloqueios, mensagens]);

  const toques = calls.length + mensagens.filter(m => m.sender === 'salesperson').length;

  if (eventos.length === 0) {
    return (
      <div className="text-xs text-neutral-400 py-4 text-center border border-dashed border-neutral-200 rounded-xl bg-neutral-50">
        Ainda não há atividades neste lead.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-neutral-500">Toques do vendedor</span>
        <span className={`font-bold font-mono ${toques >= LIMITE_TOQUES ? 'text-amber-700' : 'text-neutral-800'}`}>
          {toques}/{LIMITE_TOQUES}
        </span>
      </div>
      {toques >= LIMITE_TOQUES && (
        <div className="text-[11px] p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
          Este lead já recebeu {toques} toques. Considere encerrar a cadência ou sugerir bloqueio.
        </div>
      )}
      <ol className="relative border-l border-neutral-200 ml-1.5 space-y-3">
        {eventos.slice(0, 40).map((e, i) => {
          const Icone = e.tipo === 'ligacao' ? Phone : e.tipo === 'mensagem' ? MessageSquare : e.titulo.includes('recusado') ? XCircle : e.titulo.includes('aprovado') ? CheckCircle2 : Ban;
          return (
            <li key={i} className="ml-4">
              <span className="absolute -left-[7px] mt-1 w-3 h-3 rounded-full bg-white border border-neutral-300 flex items-center justify-center">
                <Icone className="w-2 h-2 text-neutral-500" />
              </span>
              <div className="text-[11px] font-semibold text-neutral-800">{e.titulo}</div>
              {e.detalhe && <div className="text-[11px] text-neutral-500 break-words">{e.detalhe}</div>}
              <div className="text-[10px] font-mono text-neutral-400">{dataCurta(e.quando)}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
