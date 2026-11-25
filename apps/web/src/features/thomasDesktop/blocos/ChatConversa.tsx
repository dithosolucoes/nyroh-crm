import { ArrowLeft, MessageSquare, Send, ExternalLink, Globe, Sparkles, Clock, CheckCheck, Check, ShieldCheck, RefreshCw, AlertCircle, Paperclip, Smile, Mic, Trash2, BadgeCheck, X, FileText, Download, Layers, Zap } from 'lucide-react';
import { Lead } from '@shared/types';
import { WhatsAppVoiceAudioPlayer } from '../../../components/WhatsAppVoiceAudioPlayer';
import { describeSendError, QUICK_EMOJIS } from '../base';
import type { DesktopVM } from '../useThomasDesktop';

export function ChatConversa({ f }: { f: DesktopVM }) {
  const { chatMobileAberto, setChatMobileAberto, messages, inputText, setInputText, loadingMessages, isSending, presenceUsers, isRecordingAudio, recordingDuration, liveAudioVolume, setIsTemplateModalOpen, isDossierOpen, setIsDossierOpen, showEmojiPicker, setShowEmojiPicker, attachmentPreview, setAttachmentPreview, setIsQuickRepliesModalOpen, selectedSlashIndex, setSelectedSlashIndex, showSlashDropdown, setShowSlashDropdown, setSlashQuery, messagesEndRef, fileInputRef, inputTextareaRef, activeLead, replaceLeadVariables, matchingSlashReplies, handleSelectQuickReply, windowStatus, hasOlderMessages, loadingOlder, loadOlderMessages, notifyTyping, handleSendMessage, handleRetryMessage, handleStartVoiceRecord, handleCancelVoiceRecord, handleSendVoiceRecord, handleFileSelect, handlePasteIntoInput, isDraggingFile, setIsDraggingFile, handleDropFile, formatSeconds } = f;
  return (
    <>
      {/* ========================================================================= */}
      {/* 2. MIDDLE COLUMN: Interactive Real-Time WhatsApp Chat Interface           */}
      {/* ========================================================================= */}
      <div
        className={`flex-1 flex flex-col bg-[#efeae2]/30 min-w-0 h-full relative ${chatMobileAberto ? '' : 'max-md:hidden'}`}
        onDragOver={e => {
          e.preventDefault();
          if (!isDraggingFile) setIsDraggingFile(true);
        }}
        onDragLeave={e => {
          if (e.currentTarget === e.target) setIsDraggingFile(false);
        }}
        onDrop={handleDropFile}
      >
        {isDraggingFile && (
          <div className="absolute inset-0 z-30 bg-emerald-50/90 border-4 border-dashed border-emerald-400 rounded-xl flex items-center justify-center pointer-events-none">
            <p className="text-sm font-bold text-emerald-800">Solte o arquivo para anexar</p>
          </div>
        )}
        {activeLead ? (
          <>
            {/* Chat Header Bar */}
            <div className="px-4 sm:px-5 py-3 bg-white border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs z-10">
              <div className="flex items-center gap-3 min-w-0">
                {/* Celular: volta para a lista de conversas */}
                <button
                  onClick={() => setChatMobileAberto(false)}
                  className="md:hidden -ml-2 min-h-11 min-w-11 flex items-center justify-center rounded-xl text-neutral-700 hover:bg-neutral-100"
                  aria-label="Voltar para a lista de conversas"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {activeLead.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm text-neutral-900 truncate">
                      {activeLead.name}
                    </h3>
                    <span className="text-xs text-neutral-500 font-mono">
                      {activeLead.phoneNumber}
                    </span>
                    {windowStatus.isOpen ? (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200" title="Janela de atendimento de 24h oficial aberta">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>{windowStatus.text}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200" title="Janela de 24h expirada. Envie um template pré-aprovado pela Meta para retomar.">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>{windowStatus.text}</span>
                      </span>
                    )}
                  </div>
                  {presenceUsers.length > 0 && (
                    <div
                      className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-300 px-2.5 py-0.5 rounded-full"
                      title="Outro vendedor está com esta conversa aberta agora. Combinem quem responde para o cliente não receber duas respostas."
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      {presenceUsers.some(u => u.typing)
                        ? `${presenceUsers.filter(u => u.typing).map(u => u.name).join(', ')} está digitando…`
                        : `${presenceUsers.map(u => u.name).join(', ')} também está nesta conversa`}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-neutral-500 mt-0.5">
                    <span>Nicho: <strong>{activeLead.niche || 'Geral'}</strong></span>
                    {activeLead.website && (
                      <span>• <a href={activeLead.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Ver Site Atual</a></span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons: Preview Nyroh Site, Quick Replies, Templates, Simulator, Dossier Toggle */}
              <div className="flex items-center gap-2 flex-wrap max-md:flex-nowrap max-md:w-full max-md:overflow-x-auto no-scrollbar">
                {/* Quick Replies Atalhos Modal Trigger */}
                <button
                  onClick={() => setIsQuickRepliesModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold transition-all border border-neutral-200 shadow-2xs cursor-pointer"
                  title="Gerenciar Respostas Rápidas e Atalhos com '/'"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Atalhos (/)</span>
                </button>
                {activeLead.publicUrl && (
                  <a
                    href={activeLead.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 transition-colors shadow-2xs"
                    title="Abrir prévia do novo site desenvolvido na Nyroh"
                  >
                    <Globe className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Site Nyroh</span>
                    <ExternalLink className="w-3 h-3 text-emerald-500" />
                  </a>
                )}

                {/* Templates Modal Trigger */}
                <button
                  onClick={() => setIsTemplateModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  title="Catálogo de templates aprovados pela Meta"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Templates Oficiais</span>
                </button>


                {/* Toggle Dossier Panel */}
                <button
                  onClick={() => setIsDossierOpen(!isDossierOpen)}
                  className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                    isDossierOpen
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-200'
                  }`}
                  title={isDossierOpen ? 'Fechar Dossiê do Lead' : 'Abrir Dossiê do Lead'}
                >
                  <Layers className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Chat Messages Stream */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-[#f0f2f5]/40">
              {/* Histórico: a conversa abre com as últimas mensagens e busca o resto sob demanda */}
              {hasOlderMessages && (
                <div className="flex justify-center mb-2">
                  <button
                    onClick={loadOlderMessages}
                    disabled={loadingOlder}
                    className="px-3 py-1.5 rounded-full bg-white border border-neutral-200 text-[11px] font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 shadow-2xs"
                  >
                    {loadingOlder ? 'Carregando…' : '↑ Carregar mensagens antigas'}
                  </button>
                </div>
              )}

              {/* WhatsApp Encryption & Official Template Notice */}
              <div className="flex justify-center mb-4">
                <div className="max-w-md bg-white/95 border border-neutral-200/90 rounded-xl px-4 py-2.5 text-center shadow-2xs">
                  <div className="flex items-center justify-center gap-1.5 text-neutral-800 font-bold text-xs mb-0.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Conexão Oficial Meta Cloud API (WABA)</span>
                  </div>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">
                    Mensagens criptografadas e entregues ponta a ponta na infraestrutura oficial da Meta.
                  </p>
                </div>
              </div>

              {loadingMessages ? (
                <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                  <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                  <span className="text-xs">Carregando conversa...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center max-w-sm mx-auto">
                  <div className="w-12 h-12 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center text-emerald-600 shadow-2xs mb-3">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-sm text-neutral-800 mb-1">
                    Nenhuma mensagem enviada ainda
                  </h4>
                  <p className="text-xs text-neutral-500 mb-4 leading-relaxed">
                    Para iniciar a conversa, a Meta exige um <strong>modelo aprovado</strong>. Escolha um dos modelos da sua conta.
                  </p>
                  <button
                    onClick={() => setIsTemplateModalOpen(true)}
                    disabled={isSending}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Escolher modelo aprovado</span>
                  </button>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isOut = msg.sender === 'salesperson';
                  const isAudio = msg.isAudio;
                  const isTemplate = Boolean(msg.templateName);
                  const hasMedia = Boolean(msg.mediaUrl);

                  return (
                    <div
                      key={`${msg.id || 'msg'}_${idx}`}
                      className={`flex ${isOut ? 'justify-end' : 'justify-start'} animate-in fade-in duration-100`}
                    >
                      <div
                        className={`max-w-[88%] sm:max-w-md rounded-2xl px-4 py-2.5 shadow-2xs relative ${
                          isOut
                            ? 'bg-[#d9fdd3] text-neutral-900 rounded-tr-none border border-emerald-200/60'
                            : 'bg-white text-neutral-900 rounded-tl-none border border-neutral-200'
                        }`}
                      >
                        {/* Header if template */}
                        {isTemplate && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1 pb-1 border-b border-emerald-300/40">
                            <BadgeCheck className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Template Oficial: {msg.templateName}</span>
                          </div>
                        )}

                        {/* Media presentation (Image or Document) */}
                        {hasMedia && msg.mediaType === 'image' && (
                          <div className="mb-2 rounded-xl overflow-hidden border border-neutral-200/80 max-w-xs">
                            <img
                              src={msg.mediaUrl}
                              alt="Anexo enviado"
                              className="w-full h-auto max-h-56 object-cover"
                            />
                          </div>
                        )}

                        {hasMedia && msg.mediaType === 'video' && (
                          <div className="mb-2 rounded-xl overflow-hidden border border-neutral-200/80 max-w-xs">
                            <video src={msg.mediaUrl} controls preload="metadata" className="w-full h-auto max-h-56" />
                          </div>
                        )}
                        {hasMedia && msg.mediaType === 'document' && (
                          <div className="mb-2 p-2.5 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between gap-2 max-w-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                              <span className="text-xs font-bold text-neutral-800 truncate">
                                {msg.mediaName || 'Documento.pdf'}
                              </span>
                            </div>
                            <a
                              href={msg.mediaUrl}
                              download={msg.mediaName || 'Documento'}
                              className="p-1 rounded-md hover:bg-neutral-200 text-neutral-600 transition-colors"
                              title="Baixar arquivo"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                        )}

                        {/* Voice Note Audio Player or Normal Text */}
                        {isAudio ? (
                          <WhatsAppVoiceAudioPlayer
                            audioUrl={msg.audioUrl}
                            durationSeconds={msg.audioDuration || 12}
                            isOut={isOut}
                            senderName={msg.senderName}
                          />
                        ) : (
                          <p className="text-xs leading-relaxed whitespace-pre-wrap">
                            {msg.text}
                          </p>
                        )}

                        {/* Timestamp & double checkmarks / status indicator */}
                        <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-neutral-400">
                          {(msg as any).sentFromPhone && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded mr-1" title="Mensagem enviada pelo celular do vendedor">
                              📱 Celular
                            </span>
                          )}
                          <span>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isOut && (
                            <>
                              {msg.status === 'read' ? (
                                <span title="Lida pelo lead">
                                  <CheckCheck className="w-3.5 h-3.5 text-blue-500 inline" />
                                </span>
                              ) : msg.status === 'delivered' ? (
                                <span title="Entregue no aparelho">
                                  <CheckCheck className="w-3.5 h-3.5 text-neutral-400 inline" />
                                </span>
                              ) : msg.status === 'sent' ? (
                                <span title="Enviado aos servidores do WhatsApp">
                                  <Check className="w-3.5 h-3.5 text-neutral-400 inline" />
                                </span>
                              ) : msg.status === 'queued' ? (
                                <span className="inline-flex items-center gap-0.5 text-amber-600" title="Aceita na fila da FluxoAPI — aguardando o envio à Meta (ainda NÃO entregue)">
                                  <Clock className="w-3 h-3 inline" />
                                  <span className="text-[9px] font-semibold">na fila</span>
                                </span>
                              ) : msg.status === 'failed' ? (
                                <span className="inline-flex items-center gap-0.5 text-rose-600 font-semibold text-[10px]" title={describeSendError(msg.error) || 'Falha no envio'}>
                                  <AlertCircle className="w-3.5 h-3.5 text-rose-500 inline" />
                                  <span>Não enviada</span>
                                </span>
                              ) : (
                                <span title="Enviando...">
                                  <Clock className="w-3 h-3 text-neutral-400 animate-pulse inline" />
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        {isOut && msg.status === 'failed' && (
                          <div className="mt-1.5 text-[10px] leading-snug text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5">
                            <div>{describeSendError(msg.error) || 'Falha no envio.'}</div>
                            <div className="flex items-center gap-3 mt-1">
                              <button
                                type="button"
                                onClick={() => handleRetryMessage(msg)}
                                disabled={isSending}
                                className="font-bold underline cursor-pointer disabled:opacity-50"
                              >
                                Tentar de novo
                              </button>
                              {(msg.error as any)?.code === 'window_closed' && (
                                <button type="button" onClick={() => setIsTemplateModalOpen(true)} className="font-bold underline cursor-pointer">
                                  Enviar modelo aprovado
                                </button>
                              )}
                            </div>
                          </div>
                        )}                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Template Short Bar */}
            <div className="px-4 py-2 bg-white/95 border-t border-neutral-200 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider hidden sm:inline">
                  Atalhos:
                </span>
                <button
                  onClick={() => setIsTemplateModalOpen(true)}
                  disabled={isSending}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold border border-emerald-200 transition-colors whitespace-nowrap cursor-pointer"
                  title="Enviar um modelo aprovado da sua conta (obrigatório fora da janela de 24h)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Enviar modelo aprovado</span>
                </button>              </div>

              {activeLead.publicUrl && (
                <span className="text-[11px] text-neutral-500 font-mono truncate max-w-xs hidden lg:inline">
                  Site: {activeLead.publicUrl}
                </span>
              )}
            </div>

            {/* Attachment preview if selected */}
            {attachmentPreview && (
              <div className="px-4 py-2 bg-neutral-100 border-t border-neutral-200 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-800 truncate">
                  <Paperclip className="w-4 h-4 text-neutral-500" />
                  <span className="truncate">Anexo pronto: {attachmentPreview.name}</span>
                </div>
                <button
                  onClick={() => setAttachmentPreview(null)}
                  className="p-1 hover:bg-neutral-200 rounded-md text-neutral-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Quick Emojis Bar (Collapsible) */}
            {showEmojiPicker && (
              <div className="px-4 py-2 bg-neutral-50 border-t border-neutral-200 flex items-center gap-2 overflow-x-auto no-scrollbar animate-in slide-in-from-bottom-2">
                {QUICK_EMOJIS.map(em => (
                  <button
                    key={em}
                    onClick={() => {
                      setInputText(prev => prev + em);
                    }}
                    className="p-1.5 hover:bg-white rounded-lg text-lg transition-transform hover:scale-125 cursor-pointer"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            {/* Hidden file input for attachments */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,.pdf,.doc,.docx,.txt"
              className="hidden"
            />

            {/* Message Composer Footer */}
            <div className="relative p-3 bg-white border-t border-neutral-200 shrink-0">
              {/* Floating Quick Replies (/) Autocomplete Popover */}
              {showSlashDropdown && matchingSlashReplies.length > 0 && (
                <div className="absolute bottom-full mb-2 left-4 right-4 max-h-64 overflow-y-auto bg-white border border-neutral-200 rounded-xl shadow-2xl z-50 p-1 divide-y divide-neutral-100 animate-in slide-in-from-bottom-2">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-500 uppercase tracking-wider flex items-center justify-between bg-neutral-50 rounded-t-lg">
                    <span className="flex items-center gap-1.5 text-emerald-800">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      Atalhos Rápidos ({matchingSlashReplies.length})
                    </span>
                    <span className="font-normal text-[10px] text-neutral-400">↑↓ navegar • Enter selecionar • Esc fechar</span>
                  </div>
                  <div className="max-h-52 overflow-y-auto py-1">
                    {matchingSlashReplies.map((r, idx) => (
                      <button
                        key={r.id}
                        type="button"
                        onMouseEnter={() => setSelectedSlashIndex(idx)}
                        onClick={() => handleSelectQuickReply(r)}
                        className={`w-full text-left p-2.5 rounded-lg transition-colors flex items-start justify-between gap-3 cursor-pointer ${
                          idx === selectedSlashIndex ? 'bg-emerald-50 text-emerald-950 border border-emerald-200' : 'hover:bg-neutral-50 text-neutral-800'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-100/70 px-1.5 py-0.5 rounded">
                              {r.shortcut.startsWith('/') ? r.shortcut : `/${r.shortcut}`}
                            </span>
                            <span className="text-xs font-bold truncate">{r.title}</span>
                          </div>
                          <p className="text-[11px] text-neutral-500 line-clamp-1 font-normal">
                            {replaceLeadVariables(r.content, activeLead)}
                          </p>
                        </div>
                        <span className="text-[10px] text-neutral-400 font-mono shrink-0 pt-0.5">↵ Inserir</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                {/* File Attachment Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-xl border border-neutral-200 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-colors cursor-pointer"
                  title="Anexar imagem ou documento PDF"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                {/* Emoji Button (no celular o teclado já tem emojis: some para abrir espaço para o texto) */}
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`max-md:hidden p-2.5 rounded-xl border transition-colors cursor-pointer ${
                    showEmojiPicker
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'border-neutral-200 bg-neutral-100 hover:bg-neutral-200 text-neutral-600'
                  }`}
                  title="Inserir emojis rápidos"
                >
                  <Smile className="w-4 h-4" />
                </button>

                {/* Voice Audio Recorder Trigger */}
                {!isRecordingAudio ? (
                  <button
                    type="button"
                    onClick={handleStartVoiceRecord}
                    className="p-2.5 rounded-xl border border-neutral-200 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-all cursor-pointer"
                    title="Gravar mensagem de áudio WhatsApp"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                ) : null}

                {/* Active Audio Recording Bar */}
                {isRecordingAudio ? (
                  <div className="flex-1 flex items-center justify-between px-4 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 animate-in fade-in">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping shrink-0" />
                      <span className="font-bold">Gravando áudio: {formatSeconds(recordingDuration)}</span>

                      {/* Live volume visualizer wave */}
                      <div className="hidden sm:flex items-center gap-0.5 h-4 ml-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(idx => (
                          <span
                            key={idx}
                            className="w-1 bg-rose-500 rounded-full transition-all duration-75"
                            style={{
                              height: `${Math.max(20, Math.min(100, (liveAudioVolume * (idx % 3 + 1)) / 2))}%`
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCancelVoiceRecord}
                        className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-100 transition-colors flex items-center gap-1 font-bold text-xs cursor-pointer"
                        title="Descartar gravação"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Descartar</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSendVoiceRecord}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                        title="Enviar áudio gravado"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Enviar Áudio</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Caixa de texto de VÁRIAS linhas: Shift+Enter quebra linha, Enter envia,
                     a altura cresce com o texto e dá para COLAR imagem direto (Ctrl+V). */
                  <textarea
                    ref={inputTextareaRef}
                    rows={1}
                    value={inputText}
                    onPaste={handlePasteIntoInput}
                    onChange={e => {
                      const val = e.target.value;
                      setInputText(val);
                      if (val.trim()) notifyTyping();
                      const slashMatch = val.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);
                      if (slashMatch) {
                        setSlashQuery(slashMatch[1]);
                        setShowSlashDropdown(true);
                        setSelectedSlashIndex(0);
                      } else {
                        setShowSlashDropdown(false);
                      }
                    }}
                    onKeyDown={e => {
                      if (showSlashDropdown && matchingSlashReplies.length > 0) {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setSelectedSlashIndex(prev => (prev + 1) % matchingSlashReplies.length);
                          return;
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setSelectedSlashIndex(prev => (prev - 1 + matchingSlashReplies.length) % matchingSlashReplies.length);
                          return;
                        }
                        if (e.key === 'Enter' || e.key === 'Tab') {
                          e.preventDefault();
                          const selected = matchingSlashReplies[selectedSlashIndex];
                          if (selected) {
                            handleSelectQuickReply(selected);
                          }
                          return;
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setShowSlashDropdown(false);
                          return;
                        }
                      }

                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={`Mensagem para ${activeLead.name}... (Shift+Enter quebra linha, / para atalhos)`}
                    className="flex-1 min-w-0 min-h-11 px-4 py-2.5 bg-neutral-100 focus:bg-white border border-transparent focus:border-neutral-300 rounded-xl text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none transition-all resize-none max-h-40 leading-relaxed"
                  />
                )}

                {/* Send Button */}
                {!isRecordingAudio && (
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={(!inputText.trim() && !attachmentPreview) || isSending}
                    className={`p-2.5 rounded-xl flex items-center justify-center font-bold text-white transition-all shadow-2xs ${
                      (inputText.trim() || attachmentPreview) && !isSending
                        ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
                        : 'bg-neutral-300 cursor-not-allowed'
                    }`}
                    title="Enviar mensagem (Enter)"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-neutral-400">
            <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
            <h4 className="font-bold text-sm text-neutral-700 mb-1">
              Selecione um lead para abrir a conversa
            </h4>
            <p className="text-xs text-neutral-500 max-w-sm">
              Gerencie a conversa com cada decisor via Meta Cloud API em tempo real com áudio, templates e fechamento direto no CRM.
            </p>
          </div>
        )}
      </div>

    </>
  );
}
