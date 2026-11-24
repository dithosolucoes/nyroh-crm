import { CheckCircle2, AlertCircle, Send, Trash2, Play, CheckCheck as DualCheck } from 'lucide-react';
import type { FluxoVM } from '../useFluxo';

export function SandboxTab({ f }: { f: FluxoVM }) {
  const { instanceLabel, instances, templates, testMode, setTestMode, recipientPhone, setRecipientPhone, testPhoneNumberId, setTestPhoneNumberId, messageBody, setMessageBody, selectedTemplateForTest, setSelectedTemplateForTest, param1, setParam1, param2, setParam2, sendingTest, sendResult, testChatMessages, setTestChatMessages, chatInputText, setChatInputText, handleSendTestFreeMessage, handleSendTestTemplate, handleQuickChatSend } = f;
  return (
    <>
        <div className="space-y-6">
          {/* Seletor de Modo de Teste */}
          <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-neutral-200">
            <span className="text-xs font-bold text-neutral-700 ml-2">Modo do Laboratório:</span>
            <button
              onClick={() => setTestMode('free_text')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                testMode === 'free_text'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              💬 Mensagem Livre (Janela 24h Aberta)
            </button>
            <button
              onClick={() => setTestMode('template')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                testMode === 'template'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              🎯 Disparo de Template Oficial (Quebra de Janela)
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Coluna de Envio (7 cols) */}
            <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    {testMode === 'free_text' ? 'Envio de Mensagem de Teste' : 'Disparo de Template Oficial'}
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Disparo real através do número oficial da Nyroh ({instanceLabel})
                  </p>
                </div>
              </div>

              {testMode === 'free_text' ? (
                <form onSubmit={handleSendTestFreeMessage} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Número do Destinatário (WhatsApp com DDD):
                    </label>
                    <input
                      type="text"
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="+55 11 98821-6073"
                      className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-neutral-400 block mt-1">
                      O sistema garante automaticamente o formato E.164 com + e código do país.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Texto da Mensagem:
                    </label>
                    <textarea
                      rows={4}
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sendingTest}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingTest ? 'Disparando...' : 'Disparar Mensagem Oficial de Teste'}</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSendTestTemplate} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Número de envio:
                    </label>
                    <select
                      value={testPhoneNumberId}
                      onChange={(e) => setTestPhoneNumberId(e.target.value)}
                      className="w-full text-xs px-3 py-2 mb-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="">Padrão do ambiente</option>
                      {instances.map((inst: any) => (
                        <option key={inst.id} value={inst.id}>{inst.name} ({inst.phone})</option>
                      ))}
                    </select>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Número do Destinatário:
                    </label>
                    <input
                      type="text"
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="+55 11 98821-6073"
                      className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Selecionar Template Aprovado:
                    </label>
                    <select
                      value={selectedTemplateForTest}
                      onChange={(e) => setSelectedTemplateForTest(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-mono"
                    >
                      {templates.map((t) => (
                        <option key={t.id || t.name} value={t.name}>
                          {t.name} ({t.category} - {t.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        Variável {'{{1}}'} (Ex: Nome):
                      </label>
                      <input
                        type="text"
                        value={param1}
                        onChange={(e) => setParam1(e.target.value)}
                        placeholder="Thomas"
                        className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        Variável {'{{2}}'} (Ex: Empresa):
                      </label>
                      <input
                        type="text"
                        value={param2}
                        onChange={(e) => setParam2(e.target.value)}
                        placeholder="Ditho Soluções"
                        className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={sendingTest}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{sendingTest ? 'Disparando Template...' : 'Disparar Template Oficial de Teste'}</span>
                  </button>
                </form>
              )}

              {/* Auditoria do Retorno HTTP */}
              {sendResult && (
                <div
                  className={`p-4 rounded-xl border ${
                    sendResult.success
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                      : 'bg-red-50/70 border-red-200 text-red-950'
                  } space-y-1.5 text-xs`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1.5">
                      {sendResult.success ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Envio Aceito com Sucesso (HTTP 202/200)
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-red-600" /> Falha no Envio
                        </>
                      )}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">
                      {sendResult.sentAt} {sendResult.latencyMs ? `• ${sendResult.latencyMs}ms` : ''}
                    </span>
                  </div>

                  {sendResult.error && (
                    <div className="text-[11px] text-red-700 bg-white/80 p-2 rounded border border-red-200 font-mono space-y-0.5">
                      <div>Código: {sendResult.error.code}</div>
                      <div>Mensagem: {sendResult.error.message}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Chat de Teste Interativo (5 cols) */}
            <div className="lg:col-span-5 bg-neutral-900 rounded-2xl border border-neutral-800 text-white flex flex-col h-[520px] overflow-hidden shadow-md">
              {/* Header do Chat */}
              <div className="p-3.5 bg-neutral-850 border-b border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-xs text-white">
                    NT
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Simulador de Chat Teste</h4>
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Linha Oficial Nyroh ({instanceLabel})
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setTestChatMessages([])}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                  title="Limpar Conversa de Teste"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Body com as mensagens */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#0b141a]">
                <div className="text-center">
                  <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2.5 py-1 rounded-full">
                    Sessão Oficial com Coexistência
                  </span>
                </div>

                {testChatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === 'nyroh' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-3 rounded-2xl text-xs space-y-1 shadow-sm ${
                        msg.sender === 'nyroh'
                          ? 'bg-[#005c4b] text-white rounded-tr-none'
                          : 'bg-[#202c33] text-neutral-100 rounded-tl-none'
                      }`}
                    >
                      <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>
                      <div className="flex items-center justify-end gap-1 text-[9px] text-neutral-300/80">
                        <span>{msg.time}</span>
                        {msg.sender === 'nyroh' && (
                          <DualCheck className="w-3 h-3 text-emerald-300" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Input rápido do Chat */}
              <form onSubmit={handleQuickChatSend} className="p-2.5 bg-neutral-850 border-t border-neutral-800 flex items-center gap-2">
                <input
                  type="text"
                  value={chatInputText}
                  onChange={(e) => setChatInputText(e.target.value)}
                  placeholder="Enviar mensagem teste rápida..."
                  className="flex-1 text-xs bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        </div>
    </>
  );
}
