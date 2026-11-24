import { Send, Sparkles, RefreshCw, X } from 'lucide-react';
import type { DesktopVM } from '../useThomasDesktop';

export function ModalModelos({ f }: { f: DesktopVM }) {
  const { activeSalesperson, isSending, isTemplateModalOpen, setIsTemplateModalOpen, catalogTemplates, catalogError, catalogLoading, selectedTemplate, setSelectedTemplate, loadTemplateCatalog, activeLead, handleSendMetaTemplate } = f;
  return (
    <>
      {/* ========================================================================= */}
      {/* 4. MODAL: Meta Cloud API Official Templates Selector                      */}
      {/* ========================================================================= */}
      {isTemplateModalOpen && activeLead && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-neutral-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-neutral-900">
                  Templates Oficiais Meta Cloud API
                </h3>
              </div>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Modelos <strong>aprovados na sua conta</strong>. O sistema preenche {'{{1}}'} com o primeiro nome do cliente,
                  {' {{2}}'} com o link do site Nyroh e {' {{3}}'} com o seu nome. Fora da janela de 24h, modelo é o único caminho (e é cobrado pela Meta).
                </p>
                <button
                  type="button"
                  onClick={() => loadTemplateCatalog(true)}
                  className="shrink-0 p-1.5 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-100 cursor-pointer"
                  title="Recarregar modelos da Meta"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${catalogLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {catalogError && (
                <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-[11px] text-amber-900">{catalogError}</div>
              )}
              {!catalogLoading && !catalogError && catalogTemplates.length === 0 && (
                <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 text-[11px] text-neutral-600">
                  Nenhum modelo aprovado encontrado na sua conta. Crie e aprove um modelo no painel da FluxoAPI (ou na tela Admin → WhatsApp).
                </div>
              )}

              <div className="space-y-2.5">
                {catalogTemplates.map(tpl => {
                  const isSelected = selectedTemplate?.name === tpl.name;
                  return (
                    <div
                      key={`${tpl.name}_${tpl.language}`}
                      onClick={() => setSelectedTemplate(tpl)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                          : 'border-neutral-200 hover:border-neutral-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                          {tpl.category}
                        </span>
                        <span className="text-[10px] font-mono text-neutral-400">
                          {tpl.name}
                        </span>
                      </div>
                      <h4 className="font-bold text-xs text-neutral-900 mb-1">
                        {tpl.label}
                      </h4>
                      <p className="text-[11px] text-neutral-500 mb-2">
                        {tpl.description}
                      </p>
                      {!tpl.sendable && (
                        <p className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-1">
                          Este modelo exige campos que o chat não preenche ({tpl.extraRequired.join(', ') || 'bloqueado na Meta'}). Use-o pela tela de Disparos.
                        </p>
                      )}

                      {isSelected && (
                        <div className="mt-2.5 p-3 rounded-lg bg-white border border-emerald-200/80 text-[11px] text-neutral-800 whitespace-pre-wrap leading-relaxed">
                          {tpl.getText(activeLead, activeSalesperson?.name || 'Thomas')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between">
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-600 hover:bg-neutral-200/60 transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                onClick={() => handleSendMetaTemplate(selectedTemplate)}
                disabled={isSending || !selectedTemplate || !selectedTemplate.sendable}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSending ? 'Enviando...' : selectedTemplate ? `Enviar "${selectedTemplate.label}"` : 'Escolha um modelo'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
