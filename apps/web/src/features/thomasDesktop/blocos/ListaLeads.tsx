import { useState } from 'react';
import { MessageSquare, Globe, Search, Flame, User, RefreshCw, Filter, History } from 'lucide-react';
import { formatInstancePhone } from '@shared/lib/useRuntimeConfig';
import type { DesktopVM } from '../useThomasDesktop';

export function ListaLeads({ f }: { f: DesktopVM }) {
  // Celular: a busca no histórico de mensagens fica recolhida até o usuário pedir (desktop: sempre visível).
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const { activeSalesperson, setSelectedLeadId, setChatMobileAberto, chatMobileAberto, runtime, isAdminUser, searchQuery, setSearchQuery, filterType, setFilterType, loadingMessages, realtimeActive, inbox, inboxHasMore, inboxLoading, fetchInbox, formatarHorario, previaDaConversa, bumpConversationUnread, filteredLeads, totalNaoLidas, activeLead, messageSearch, setMessageSearch, messageResults, searchingMessages, fetchMessages } = f;
  return (
    <>
      {/* ========================================================================= */}
      {/* 1. LEFT COLUMN: Leads / Conversations List                                */}
      {/* ========================================================================= */}
      <div className={`w-full xl:w-[420px] 2xl:w-[460px] flex flex-col bg-white border-b xl:border-b-0 xl:border-r border-neutral-200 shrink-0 h-full ${chatMobileAberto ? 'max-md:hidden' : ''}`}>
        {/* User Identity & Real-time Indicator Header */}
        <div className="p-3 md:p-4 border-b border-neutral-200 bg-neutral-50/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-2xs">
                {activeSalesperson?.name?.substring(0, 2).toUpperCase() || 'TH'}
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-sm text-neutral-900 leading-tight">
                  {activeSalesperson?.name || 'Thomas'} (Mesa do Closer)
                </h3>
                {isAdminUser && (
                  <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-200">
                    Admin
                  </span>
                )}
              </div>
              {/* Dois estados separados e honestos: a conexão do navegador com o CRM,
                  e o estado REAL da instância na FluxoAPI (antes isto dizia "Meta Cloud API
                  Conectada" só porque o SSE do navegador estava aberto). */}
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${realtimeActive ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`} />
                  <span className="font-medium text-[11px]">{realtimeActive ? 'CRM em tempo real' : 'CRM offline'}</span>
                </span>
                <span className="text-neutral-300">•</span>
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${runtime.whatsappConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className="font-medium text-[11px]">
                    {runtime.whatsappConnected
                      ? `WhatsApp ${formatInstancePhone(runtime.instancePhone)}`
                      : `WhatsApp: ${runtime.instanceStatus === 'unconfigured' ? 'não configurado' : runtime.instanceStatus}`}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => activeLead?.id && fetchMessages(activeLead.id)}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/60 transition-colors"
            title="Atualizar mensagens"
          >
            <RefreshCw className={`w-4 h-4 ${loadingMessages ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-neutral-100 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome, telefone ou nicho..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 md:py-1.5 bg-neutral-100/80 hover:bg-neutral-100 focus:bg-white border border-transparent focus:border-neutral-300 rounded-xl text-xs text-neutral-800 placeholder-neutral-400 transition-all focus:outline-none"
            />
          </div>
          {/* Celular: botão para abrir a busca no histórico de mensagens */}
          <button
            type="button"
            onClick={() => setHistoricoAberto(v => !v)}
            aria-pressed={historicoAberto}
            aria-label="Buscar no histórico de mensagens"
            title="Buscar no histórico de mensagens"
            className={`md:hidden min-h-10 min-w-10 flex items-center justify-center rounded-xl border transition-colors ${
              historicoAberto ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-neutral-100 border-transparent text-neutral-600'
            }`}
          >
            <History className="w-4 h-4" />
          </button>
        </div>

        {/* Busca DENTRO das mensagens (antes não existia: achar uma conversa antiga era abrir uma a uma).
            No celular fica recolhida até o botão de histórico, ou aberta quando já há texto digitado. */}
        <div className={`px-3 pb-2 border-b border-neutral-100 ${historicoAberto || messageSearch ? '' : 'max-md:hidden'}`}>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Procurar no histórico de mensagens…"
              value={messageSearch}
              onChange={e => setMessageSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-amber-50/60 hover:bg-amber-50 focus:bg-white border border-amber-200/70 focus:border-amber-400 rounded-xl text-[11px] text-neutral-800 placeholder-neutral-400 transition-all focus:outline-none"
            />
          </div>
          {messageSearch.trim().length >= 2 && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100">
              {searchingMessages && <p className="p-2.5 text-[11px] text-neutral-500">Procurando…</p>}
              {!searchingMessages && messageResults.length === 0 && (
                <p className="p-2.5 text-[11px] text-neutral-500">Nada encontrado com esse texto.</p>
              )}
              {messageResults.map(r => (
                <button
                  key={r.messageId}
                  onClick={() => {
                    setSelectedLeadId(r.leadId);
                    setChatMobileAberto(true);
                    setMessageSearch('');
                  }}
                  className="w-full text-left p-2.5 hover:bg-neutral-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-neutral-900 truncate">{r.leadName}</span>
                    <span className="text-[10px] text-neutral-400 shrink-0">{formatarHorario(r.timestamp)}</span>
                  </div>
                  <p className="text-[11px] text-neutral-600 truncate">
                    {r.sender === 'lead' ? '' : '↩ '}{r.text}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filter Quick Pills */}
        <div className="px-3 py-2 border-b border-neutral-100 flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filterType === 'ALL'
                ? 'bg-neutral-900 text-white font-bold'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            Todos ({inbox.length}{inboxHasMore ? '+' : ''})
          </button>
          <button
            onClick={() => setFilterType('HOT')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1 ${
              filterType === 'HOT'
                ? 'bg-rose-600 text-white font-bold'
                : 'text-rose-700 bg-rose-50 hover:bg-rose-100'
            }`}
          >
            <Flame className="w-3 h-3 text-rose-500" />
            <span>Não lidas ({totalNaoLidas})</span>
          </button>
          <button
            onClick={() => setFilterType('WAITING')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filterType === 'WAITING'
                ? 'bg-neutral-900 text-white font-bold'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            Sem resposta
          </button>
          <button
            onClick={() => setFilterType('NEGOTIATION')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filterType === 'NEGOTIATION'
                ? 'bg-neutral-900 text-white font-bold'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            Negociação
          </button>
          <button
            onClick={() => setFilterType('RESOLVED')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filterType === 'RESOLVED'
                ? 'bg-neutral-900 text-white font-bold'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            Resolvidas
          </button>
        </div>

        {/* Leads Scroll List */}
        <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
          {filteredLeads.length === 0 ? (
            <div className="p-8 text-center text-neutral-400">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">Nenhum lead encontrado com esse filtro.</p>
            </div>
          ) : (
            filteredLeads.map(lead => {
              const isSelected = lead.id === activeLead?.id;
              const hasReplied = Boolean(
                (lead as any).hasWhatsAppReply ||
                (lead as any).whatsappReplied ||
                lead.subStatus?.toLowerCase().includes('whatsapp') ||
                lead.lastCallTag?.toLowerCase().includes('respondeu no whatsapp') ||
                lead.lastCallTag?.includes('🔥 Respondeu')
              );
              const hasNyroh = Boolean(lead.publicUrl);
              const naoLidas = Number((lead as any).unreadCount || 0);

              return (
                <div
                  key={lead.id}
                  onClick={() => {
                    setSelectedLeadId(lead.id);
                    setChatMobileAberto(true);
                    if (naoLidas > 0) bumpConversationUnread(lead.id, 0);
                  }}
                  className={`p-3.5 flex items-start gap-3 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-50/70 border-l-4 border-blue-600'
                      : 'hover:bg-neutral-50/80'
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-neutral-200 text-neutral-700 font-bold flex items-center justify-center text-xs">
                      {lead.name.substring(0, 2).toUpperCase()}
                    </div>
                    {naoLidas > 0 ? (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shadow-2xs font-bold">
                        {naoLidas > 99 ? '99+' : naoLidas}
                      </span>
                    ) : hasReplied ? (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px] shadow-2xs font-bold">
                        🔥
                      </span>
                    ) : null}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h4 className={`text-xs truncate ${naoLidas > 0 ? 'font-extrabold text-neutral-900' : 'font-bold text-neutral-900'}`}>
                        {lead.name}
                      </h4>
                      <span className="text-[10px] text-neutral-400 shrink-0 font-mono">
                        {formatarHorario((lead as any).lastMessageAt)}
                      </span>
                    </div>

                    {/* Prévia da ÚLTIMA mensagem, de qualquer lado — antes só mostrava o que o
                        cliente tinha mandado, nunca o que o vendedor respondeu. */}
                    <p className={`text-[11px] truncate mb-1.5 ${naoLidas > 0 ? 'text-neutral-800 font-semibold' : 'text-neutral-500'}`}>
                      {previaDaConversa(lead)}
                    </p>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {hasNyroh && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                          <Globe className="w-2.5 h-2.5" />
                          <span>Site Nyroh</span>
                        </span>
                      )}
                      {/* Conversa com lead que respondeu, mas a janela de 24h já fechou: só modelo aprovado */}
                      {'windowExpiresAt' in (lead as any) && (lead as any).whatsappReplied && (() => {
                        const exp = (lead as any).windowExpiresAt ? new Date((lead as any).windowExpiresAt).getTime() : 0;
                        return exp <= Date.now();
                      })() && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200"
                          title="Janela de 24h fechada. Só é possível enviar um modelo aprovado pela Meta."
                        >
                          Sem janela · modelo
                        </span>
                      )}
                      {lead.niche && (
                        <span className="text-[10px] text-neutral-600 bg-neutral-100 px-1.5 py-0.2 rounded truncate max-w-[120px]">
                          {lead.niche}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {inboxHasMore && (
            <button
              onClick={() => fetchInbox({ append: true })}
              disabled={inboxLoading}
              className="w-full py-3 text-xs font-bold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            >
              {inboxLoading ? 'Carregando…' : 'Carregar conversas anteriores'}
            </button>
          )}
        </div>
      </div>

    </>
  );
}
