import { MessageSquare, Phone, ExternalLink, Globe, User, X, ChevronRight } from 'lucide-react';
import { Lead, PIPELINE_COLUMNS } from '@shared/types';
import type { DesktopVM } from '../useThomasDesktop';

export function DossieLead({ f }: { f: DesktopVM }) {
  const { onUpdateLeadColumn, isDossierOpen, setIsDossierOpen, formatarHorario, activeLead, salespeople, notes, noteDraft, setNoteDraft, savingNote, salvarNota, transferirConversa, alternarResolvida } = f;
  return (
    <>
      {/* ========================================================================= */}
      {/* 3. RIGHT COLUMN: Collapsible Lead Dossier & CRM Pipeline Actions           */}
      {/* ========================================================================= */}
      {isDossierOpen && activeLead && (
        <div className="w-full xl:w-[300px] 2xl:w-[340px] bg-white border-t xl:border-t-0 xl:border-l border-neutral-200 flex flex-col shrink-0 h-full overflow-y-auto animate-in slide-in-from-right-4 duration-150">
          {/* Header */}
          <div className="p-4 border-b border-neutral-200 bg-neutral-50/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-neutral-700" />
              <h3 className="font-bold text-xs text-neutral-900 uppercase tracking-wider">
                Dossiê & Fechamento
              </h3>
            </div>
            <button
              onClick={() => setIsDossierOpen(false)}
              className="p-1 text-neutral-400 hover:text-neutral-700 rounded-md cursor-pointer"
              title="Fechar painel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Transferir conversa e marcar como resolvida */}
          <div className="p-4 border-b border-neutral-100 space-y-2.5">
            <div>
              <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Passar a conversa para</label>
              <select
                value=""
                onChange={e => {
                  if (e.target.value) transferirConversa(e.target.value);
                  e.target.value = '';
                }}
                className="mt-1 w-full px-2.5 py-1.5 border border-neutral-300 rounded-lg text-[11px] text-neutral-800 bg-white focus:outline-none focus:border-neutral-500"
              >
                <option value="">Escolher vendedor…</option>
                {salespeople
                  .filter(v => v.id !== (activeLead as any).salespersonId)
                  .map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
              </select>
              <p className="mt-1 text-[10px] text-neutral-500">
                Agora com {(activeLead as any).salespersonName || 'ninguém'}.
              </p>
            </div>

            <button
              onClick={alternarResolvida}
              className={`w-full py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                (activeLead as any).resolvedAt
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              {(activeLead as any).resolvedAt ? '✓ Resolvida — reabrir' : 'Marcar como resolvida'}
            </button>
          </div>

          {/* Notas internas: a equipe vê, o cliente nunca */}
          <div className="p-4 border-b border-neutral-100">
            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
              Notas internas (o cliente não vê)
            </label>
            <div className="mt-1.5 flex gap-1.5">
              <input
                type="text"
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    salvarNota();
                  }
                }}
                placeholder="Ex.: pediu para ligar depois das 18h"
                className="flex-1 px-2.5 py-1.5 bg-amber-50/70 border border-amber-200 focus:border-amber-400 rounded-lg text-[11px] text-neutral-800 placeholder-neutral-400 focus:outline-none"
              />
              <button
                onClick={salvarNota}
                disabled={!noteDraft.trim() || savingNote}
                className="px-2.5 rounded-lg bg-neutral-900 text-white text-[11px] font-bold disabled:bg-neutral-300"
              >
                {savingNote ? '…' : 'Salvar'}
              </button>
            </div>
            {notes.length > 0 && (
              <ul className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                {notes.map(n => (
                  <li key={n.id} className="bg-amber-50/60 border border-amber-100 rounded-lg px-2.5 py-1.5">
                    <p className="text-[11px] text-neutral-800 whitespace-pre-wrap break-words">{n.text}</p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">
                      {n.authorName} · {formatarHorario(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Lead Summary */}
          <div className="p-4 border-b border-neutral-100 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-neutral-900 text-white flex items-center justify-center font-bold text-sm shadow-2xs">
                {activeLead.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-sm text-neutral-900 truncate">
                  {activeLead.name}
                </h4>
                <p className="text-xs text-neutral-500 font-mono">
                  {activeLead.phoneNumber}
                </p>
                <span className="inline-block mt-0.5 text-[10px] font-semibold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-full">
                  {activeLead.niche || 'Comércio & Serviços'}
                </span>
              </div>
            </div>

            {/* Pipeline Stage Quick Changer */}
            <div className="pt-2">
              <label className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                Etapa do Funil (Kanban):
              </label>
              <select
                value={activeLead.columnStatus}
                onChange={(e) => onUpdateLeadColumn?.(activeLead.id, e.target.value)}
                className="w-full px-3 py-2 bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-900 focus:outline-none focus:border-emerald-500"
              >
                {PIPELINE_COLUMNS.map(col => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Direct Actions */}
          <div className="p-4 border-b border-neutral-100 space-y-2">
            <label className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider mb-1">
              Canais Diretos:
            </label>

            {/* Open WhatsApp Web Native */}
            <a
              href={`https://api.whatsapp.com/send?phone=${activeLead.phoneNumber.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <span>Abrir no App WhatsApp</span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-emerald-500" />
            </a>

            {/* Phone Call */}
            <a
              href={`tel:${activeLead.phoneNumber.replace(/\D/g, '')}`}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold border border-neutral-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-neutral-600" />
                <span>Discar via Telefone</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
            </a>

            {/* Nyroh Generated Site Link */}
            {activeLead.publicUrl && (
              <a
                href={activeLead.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold border border-blue-200 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <span>Novo Site da Nyroh</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
              </a>
            )}
          </div>

          {/* Lead Information Attributes */}
          <div className="p-4 space-y-3 flex-1 text-xs">
            <h5 className="font-bold text-[11px] text-neutral-400 uppercase tracking-wider">
              Dados Cadastrais
            </h5>

            <div className="space-y-2 text-neutral-600">
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-400">ID do Lead:</span>
                <span className="font-mono text-neutral-800 text-[11px]">{activeLead.id}</span>
              </div>

              {activeLead.city && (
                <div className="flex justify-between py-1 border-b border-neutral-100">
                  <span className="text-neutral-400">Cidade:</span>
                  <span className="font-medium text-neutral-800">{activeLead.city}</span>
                </div>
              )}

              {activeLead.website && (
                <div className="py-1 border-b border-neutral-100">
                  <span className="text-neutral-400 block mb-0.5">Website Legado:</span>
                  <a href={activeLead.website} target="_blank" rel="noreferrer" className="text-blue-600 font-mono text-[11px] hover:underline truncate block">
                    {activeLead.website}
                  </a>
                </div>
              )}

              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-400">Total Ligações:</span>
                <span className="font-bold text-neutral-800">{activeLead.callCount || 0}</span>
              </div>

              {activeLead.lastCallTag && (
                <div className="py-1">
                  <span className="text-neutral-400 block mb-1">Última Tag:</span>
                  <span className="inline-block px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-800 font-semibold text-[11px]">
                    {activeLead.lastCallTag}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </>
  );
}
