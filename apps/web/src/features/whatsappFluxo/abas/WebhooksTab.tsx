import { MessageSquare, RefreshCw, Zap, Clock, Radio, Copy, Trash2 } from 'lucide-react';
import type { FluxoVM } from '../useFluxo';

export function WebhooksTab({ f }: { f: FluxoVM }) {
  const { webhookEvents, loadingWebhooks, webhookUrl, fetchWebhookEvents, handleSimulateWebhook, handleSimulateIncomingMessage, handleClearWebhookLogs, copyToClipboard } = f;
  return (
    <>
        <div className="space-y-6">
          {/* Card de Configuração do Webhook */}
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  URL Oficial do Webhook de Entrada
                </h3>
                <p className="text-xs text-neutral-500">
                  Cadastre esta URL na aba "Webhooks" do painel da FluxoAPI para receber mensagens e confirmações de leitura.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleSimulateIncomingMessage}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Simular Mensagem de Lead</span>
                </button>
                <button
                  onClick={() => handleSimulateWebhook('delivered')}
                  className="px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium cursor-pointer"
                >
                  Simular "Delivered"
                </button>
                <button
                  onClick={() => handleSimulateWebhook('read')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-medium border border-emerald-200 cursor-pointer"
                >
                  Simular "Read" (2 Tiques)
                </button>
              </div>
            </div>

            <div className="p-3 bg-neutral-900 rounded-xl flex items-center justify-between gap-3">
              <span className="text-xs font-mono text-emerald-400 truncate select-all">
                {webhookUrl}
              </span>
              <button
                onClick={() => copyToClipboard(webhookUrl, 'URL do Webhook')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold cursor-pointer shrink-0 transition-colors"
              >
                <Copy className="w-3 h-3" />
                <span>Copiar URL</span>
              </button>
            </div>
          </div>

          {/* Feed de Eventos Recebidos */}
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  Histórico de Eventos Recebidos da Meta
                </h3>
                <p className="text-xs text-neutral-500">
                  Transparência de entrega (sent, delivered, read) e mensagens recebidas dos leads.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchWebhookEvents}
                  disabled={loadingWebhooks}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingWebhooks ? 'animate-spin' : ''}`} />
                  <span>Atualizar</span>
                </button>
                <button
                  onClick={handleClearWebhookLogs}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpar</span>
                </button>
              </div>
            </div>

            {webhookEvents.length === 0 ? (
              <div className="text-center py-10 text-neutral-400 space-y-2">
                <Radio className="w-8 h-8 mx-auto text-neutral-300" />
                <p className="text-xs">Nenhum evento registrado ainda.</p>
                <p className="text-[11px] text-neutral-400">
                  Os eventos chegarão automaticamente assim que mensagens forem enviadas ou recebidas.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {webhookEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/60 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-neutral-900">{evt.summary}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700 font-mono">
                          {evt.type}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-500 font-mono truncate max-w-xl">
                        {JSON.stringify(evt.payload)}
                      </div>
                    </div>

                    <span className="text-[10px] font-mono text-neutral-400 shrink-0">
                      {evt.receivedAt}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
    </>
  );
}
