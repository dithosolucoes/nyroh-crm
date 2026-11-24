import { CheckCircle2, AlertCircle, RefreshCw, Send, ShieldCheck, Smartphone, CheckCheck, Clock, Info, FileText, Sparkles, Trash2, Play, LayoutGrid, List, Search, Code2, Edit3, X, BookmarkPlus } from 'lucide-react';
import type { FluxoVM } from '../useFluxo';

export function ModelosTab({ f }: { f: FluxoVM }) {
  const { setActiveSubTab, syncingWithMeta, metaSyncNotice, setMetaSyncNotice, templates, loadingTemplates, submittingTemplate, savingAsDraft, templateSubView, setTemplateSubView, templateSearchTerm, setTemplateSearchTerm, templateAccountFilter, setTemplateAccountFilter, visibleTemplates, templateCategoryFilter, setTemplateCategoryFilter, showJsonImportModal, setShowJsonImportModal, jsonInputText, setJsonInputText, jsonImportError, setJsonImportError, tplName, setTplName, tplCategory, setTplCategory, tplAccountId, setTplAccountId, bmAccounts, tplHeader, setTplHeader, tplBody, setTplBody, tplFooter, setTplFooter, tplButtons, tplExamples, setTplExamples, tplVariableMappings, setTplVariableMappings, previewSimulationMode, setPreviewSimulationMode, newButtonInput, setNewButtonInput, setTestMode, setSelectedTemplateForTest, syncWithMetaRealtime, fetchTemplates, handleAddButton, handleRemoveButton, handleSubmitTemplateToMeta, handleSaveDraftTemplate, handleUpdateTemplateStatus, handleDeleteTemplate, handleLoadTemplateIntoCreator, handleParseAndImportJson, loadPresetTemplate, onShowToast } = f;
  return (
    <>
        <div className="space-y-6">
          {/* Sub-menu interno de Templates & Ações Globais */}
          <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Filtro de BM: vale para Kanban e lista */}
            <div className="flex items-center gap-2 order-first md:order-last">
              <span className="text-xs font-semibold text-neutral-600">BM:</span>
              <select
                value={templateAccountFilter}
                onChange={(e) => setTemplateAccountFilter(e.target.value)}
                className="text-xs border border-neutral-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">Todas</option>
                <option value="env">Ambiente (padrão)</option>
                {bmAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            {/* Abas internas */}
            <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-xl">
              <button
                onClick={() => setTemplateSubView('kanban')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  templateSubView === 'kanban'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5 text-emerald-600" />
                <span>Quadro Kanban de Status</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-mono">
                  {templates.length}
                </span>
              </button>

              <button
                onClick={() => setTemplateSubView('list')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  templateSubView === 'list'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <List className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tabela & Métricas de Saúde</span>
              </button>

              <button
                onClick={() => setTemplateSubView('creator')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  templateSubView === 'creator'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Criador & Editor</span>
              </button>
            </div>

            {/* Ações rápidas */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setJsonInputText('');
                  setJsonImportError(null);
                  setShowJsonImportModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold border border-purple-200 transition-colors cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Importar JSON da Meta</span>
              </button>

              <button
                onClick={() => {
                  loadPresetTemplate('confirmacao_utilitaria');
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Modelo Utilitário Recomendado</span>
              </button>

              <button
                onClick={syncWithMetaRealtime}
                disabled={syncingWithMeta || loadingTemplates}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                title="Sincroniza todos os templates diretamente da Meta Graph API em tempo real"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingWithMeta ? 'animate-spin' : ''}`} />
                <span>{syncingWithMeta ? 'Sincronizando Meta...' : 'Puxar do Meta em Tempo Real'}</span>
              </button>

              <button
                onClick={fetchTemplates}
                disabled={loadingTemplates}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium cursor-pointer"
                title="Recarregar lista de templates"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingTemplates ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Atualizar</span>
              </button>
            </div>
          </div>

          {/* Feedback de Sincronização em Tempo Real com a Meta */}
          {metaSyncNotice && (
            <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="font-medium">{metaSyncNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setMetaSyncNotice(null)}
                className="text-blue-500 hover:text-blue-800 text-xs font-bold"
              >
                Fechar
              </button>
            </div>
          )}

          {/* Banner Informativo sobre Janela de 24h & Categoria Utilitária */}
          <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-amber-900">
                Estratégia de Disparo Oficial da Meta • Janela de 24h e Templates Utilitários
              </h4>
              <p className="text-xs text-amber-800 leading-relaxed">
                Pela política oficial da Meta, para iniciar conversa com um lead frio que ainda não falou com sua empresa, é <strong>obrigatório</strong> utilizar um template aprovado. Modelos da categoria <strong>UTILITY (Utilitário)</strong> possuem a <strong>menor tarifa por disparo</strong> e alta taxa de entrega. Assim que o lead responde (ex: clicando em "Sim"), a <strong>janela de 24 horas gratuitas</strong> se abre e seu atendente pode conversar livremente por texto, áudio e anexos!
              </p>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* VISÃO 1: QUADRO KANBAN DE STATUS (RASCUNHOS, ANÁLISE, APROVADOS, ETC) */}
          {/* ===================================================================== */}
          {templateSubView === 'kanban' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* COLUNA 1: RASCUNHOS (DRAFT) */}
                <div className="bg-neutral-50/80 rounded-2xl p-3.5 border border-neutral-200/80 flex flex-col min-h-[500px]">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-200 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-neutral-400" />
                      <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                        Rascunhos
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-700">
                      {visibleTemplates.filter((t) => t.status === 'DRAFT').length}
                    </span>
                  </div>

                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {visibleTemplates.filter((t) => t.status === 'DRAFT').length === 0 ? (
                      <div className="text-center py-10 px-4 text-neutral-400 text-xs border-2 border-dashed border-neutral-200 rounded-xl">
                        Nenhum rascunho local pendente.
                      </div>
                    ) : (
                      templates
                        .filter((t) => t.status === 'DRAFT')
                        .map((tpl) => (
                          <div
                            key={tpl.id || tpl.name}
                            className="bg-white p-3.5 rounded-xl border border-neutral-200 shadow-2xs hover:border-neutral-300 transition-all space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-neutral-900 break-all">
                                {tpl.name}{tpl.accountName ? <span className="ml-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 rounded px-1">{tpl.accountName}</span> : null}
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 uppercase shrink-0">
                                {tpl.category}
                              </span>
                            </div>

                            <div className="text-[11px] text-neutral-600 line-clamp-3 bg-neutral-50 p-2 rounded-lg border border-neutral-100 font-sans">
                              {tpl.components?.find((c) => c.type === 'BODY')?.text || 'Sem texto'}
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-2 border-t border-neutral-100">
                              <span>Local</span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleLoadTemplateIntoCreator(tpl)}
                                  className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium cursor-pointer"
                                  title="Carregar no Criador"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleUpdateTemplateStatus(tpl.name, 'PENDING')}
                                  className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold cursor-pointer"
                                  title="Mover para Em Análise"
                                >
                                  Enviar
                                </button>
                                <button
                                  onClick={() => handleDeleteTemplate(tpl.name, tpl.accountId)}
                                  className="p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* COLUNA 2: EM ANÁLISE NA META (PENDING) */}
                <div className="bg-amber-50/40 rounded-2xl p-3.5 border border-amber-200/80 flex flex-col min-h-[500px]">
                  <div className="flex items-center justify-between pb-3 border-b border-amber-200 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                        Em Análise (Meta)
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      {visibleTemplates.filter((t) => t.status === 'PENDING').length}
                    </span>
                  </div>

                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {visibleTemplates.filter((t) => t.status === 'PENDING').length === 0 ? (
                      <div className="text-center py-10 px-4 text-amber-700/60 text-xs border-2 border-dashed border-amber-200 rounded-xl">
                        Nenhum template em análise no momento.
                      </div>
                    ) : (
                      templates
                        .filter((t) => t.status === 'PENDING')
                        .map((tpl) => (
                          <div
                            key={tpl.id || tpl.name}
                            className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-2xs hover:border-amber-300 transition-all space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-neutral-900 break-all">
                                {tpl.name}{tpl.accountName ? <span className="ml-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 rounded px-1">{tpl.accountName}</span> : null}
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0">
                                Aguardando
                              </span>
                            </div>

                            <div className="text-[11px] text-neutral-600 line-clamp-3 bg-neutral-50 p-2 rounded-lg border border-neutral-100">
                              {tpl.components?.find((c) => c.type === 'BODY')?.text || 'Template Meta'}
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-2 border-t border-neutral-100">
                              <span className="flex items-center gap-1 text-amber-700 font-medium">
                                <Clock className="w-3 h-3" /> Fila Meta
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleUpdateTemplateStatus(tpl.name, 'APPROVED')}
                                  className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold cursor-pointer"
                                  title="Forçar Aprovação Local"
                                >
                                  Aprovar
                                </button>
                                <button
                                  onClick={() => handleUpdateTemplateStatus(tpl.name, 'REJECTED')}
                                  className="px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700 font-medium cursor-pointer"
                                >
                                  Rejeitar
                                </button>
                                <button
                                  onClick={() => handleDeleteTemplate(tpl.name, tpl.accountId)}
                                  className="p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* COLUNA 3: APROVADOS (APPROVED) */}
                <div className="bg-emerald-50/40 rounded-2xl p-3.5 border border-emerald-200/80 flex flex-col min-h-[500px]">
                  <div className="flex items-center justify-between pb-3 border-b border-emerald-200 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                        Aprovados (Ativos)
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {visibleTemplates.filter((t) => t.status === 'APPROVED').length}
                    </span>
                  </div>

                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {visibleTemplates.filter((t) => t.status === 'APPROVED').length === 0 ? (
                      <div className="text-center py-10 px-4 text-emerald-800/60 text-xs border-2 border-dashed border-emerald-200 rounded-xl">
                        Nenhum template aprovado ainda. Crie um novo ou importe via JSON!
                      </div>
                    ) : (
                      templates
                        .filter((t) => t.status === 'APPROVED')
                        .map((tpl) => {
                          const buttons = tpl.components?.find((c) => c.type === 'BUTTONS')?.buttons || [];
                          return (
                            <div
                              key={tpl.id || tpl.name}
                              className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-2xs hover:border-emerald-300 transition-all space-y-2.5"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-mono text-xs font-bold text-neutral-900 break-all">
                                  {tpl.name}{tpl.accountName ? <span className="ml-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 rounded px-1">{tpl.accountName}</span> : null}
                                </span>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                    tpl.category === 'UTILITY'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-purple-100 text-purple-800'
                                  }`}
                                >
                                  {tpl.category}
                                </span>
                              </div>

                              {/* Indicadores de Saúde e Métricas */}
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                    tpl.qualityScore === 'GREEN' || !tpl.qualityScore
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : tpl.qualityScore === 'YELLOW'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                      : 'bg-red-50 text-red-700 border border-red-200'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      tpl.qualityScore === 'GREEN' || !tpl.qualityScore
                                        ? 'bg-emerald-500'
                                        : tpl.qualityScore === 'YELLOW'
                                        ? 'bg-amber-500'
                                        : 'bg-red-500'
                                    }`}
                                  />
                                  Saúde: {tpl.qualityScore === 'YELLOW' ? 'Atenção' : tpl.qualityScore === 'RED' ? 'Baixa' : 'Alta'}
                                </span>

                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 flex items-center gap-1">
                                  <Send className="w-2.5 h-2.5 text-neutral-500" />
                                  {tpl.usageCount || 0} envios
                                </span>
                              </div>

                              <div className="text-[11px] text-neutral-600 line-clamp-3 bg-neutral-50 p-2 rounded-lg border border-neutral-100">
                                {tpl.components?.find((c) => c.type === 'BODY')?.text || 'Template Meta Oficial'}
                              </div>

                              {/* Botões do template */}
                              {buttons.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {buttons.map((b: any, bIdx: number) => (
                                    <span
                                      key={bIdx}
                                      className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium"
                                    >
                                      🔘 {b.text || b}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-2 border-t border-neutral-100">
                                <button
                                  onClick={() => {
                                    setSelectedTemplateForTest(tpl.name);
                                    setActiveSubTab('sandbox');
                                    setTestMode('template');
                                    onShowToast(`Template ${tpl.name} carregado no laboratório!`);
                                  }}
                                  className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Play className="w-3 h-3" /> Testar
                                </button>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleLoadTemplateIntoCreator(tpl)}
                                    className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium cursor-pointer"
                                    title="Abrir no Criador"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTemplate(tpl.name, tpl.accountId)}
                                    className="p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                    title="Excluir"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>

                {/* COLUNA 4: REJEITADOS (REJECTED) */}
                <div className="bg-red-50/40 rounded-2xl p-3.5 border border-red-200/80 flex flex-col min-h-[500px]">
                  <div className="flex items-center justify-between pb-3 border-b border-red-200 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <h4 className="text-xs font-bold text-red-900 uppercase tracking-wider">
                        Rejeitados (Meta)
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                      {visibleTemplates.filter((t) => t.status === 'REJECTED').length}
                    </span>
                  </div>

                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {visibleTemplates.filter((t) => t.status === 'REJECTED').length === 0 ? (
                      <div className="text-center py-10 px-4 text-red-700/60 text-xs border-2 border-dashed border-red-200 rounded-xl">
                        Nenhum template rejeitado pela Meta!
                      </div>
                    ) : (
                      templates
                        .filter((t) => t.status === 'REJECTED')
                        .map((tpl) => (
                          <div
                            key={tpl.id || tpl.name}
                            className="bg-white p-3.5 rounded-xl border border-red-200 shadow-2xs hover:border-red-300 transition-all space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-neutral-900 break-all">
                                {tpl.name}{tpl.accountName ? <span className="ml-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 rounded px-1">{tpl.accountName}</span> : null}
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800 shrink-0">
                                Rejeitado
                              </span>
                            </div>

                            <div className="text-[11px] text-neutral-600 line-clamp-3 bg-neutral-50 p-2 rounded-lg border border-neutral-100">
                              {tpl.components?.find((c) => c.type === 'BODY')?.text || 'Template'}
                            </div>

                            {tpl.rejectedReason && (
                              <div className="text-[10px] text-red-700 bg-red-50 p-1.5 rounded border border-red-200">
                                <strong>Motivo:</strong> {tpl.rejectedReason}
                              </div>
                            )}

                            <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-2 border-t border-neutral-100">
                              <button
                                onClick={() => handleLoadTemplateIntoCreator(tpl)}
                                className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium cursor-pointer"
                              >
                                Corrigir no Criador
                              </button>
                              <button
                                onClick={() => handleDeleteTemplate(tpl.name, tpl.accountId)}
                                className="p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* VISÃO 2: TABELA DE TEMPLATES & MÉTRICAS DETALHADAS DE SAÚDE            */}
          {/* ===================================================================== */}
          {templateSubView === 'list' && (
            <div className="space-y-4">
              {/* Cards de Métricas Consolidadas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs">
                  <span className="text-[11px] text-neutral-500 font-semibold block">
                    Total Cadastrados
                  </span>
                  <span className="text-xl font-bold text-neutral-900 mt-1 block">
                    {templates.length}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs">
                  <span className="text-[11px] text-emerald-700 font-semibold block">
                    Aprovados & Prontos
                  </span>
                  <span className="text-xl font-bold text-emerald-800 mt-1 block">
                    {visibleTemplates.filter((t) => t.status === 'APPROVED').length}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs">
                  <span className="text-[11px] text-amber-700 font-semibold block">
                    Em Análise / Rascunhos
                  </span>
                  <span className="text-xl font-bold text-amber-800 mt-1 block">
                    {visibleTemplates.filter((t) => t.status === 'PENDING' || t.status === 'DRAFT').length}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs">
                  <span className="text-[11px] text-purple-700 font-semibold block">
                    Total de Disparos
                  </span>
                  <span className="text-xl font-bold text-purple-800 mt-1 block">
                    {templates.reduce((acc, t) => acc + (t.usageCount || 0), 0)}
                  </span>
                </div>
              </div>

              {/* Filtros e Busca */}
              <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={templateSearchTerm}
                    onChange={(e) => setTemplateSearchTerm(e.target.value)}
                    placeholder="Buscar por nome do template..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-neutral-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-xs font-semibold text-neutral-600">Categoria:</span>
                  <select
                    value={templateCategoryFilter}
                    onChange={(e) => setTemplateCategoryFilter(e.target.value as any)}
                    className="text-xs border border-neutral-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="ALL">Todas as Categorias</option>
                    <option value="UTILITY">UTILITY (Utilitários)</option>
                    <option value="MARKETING">MARKETING (Comercial)</option>
                  </select>
                </div>
              </div>

              {/* Tabela de Templates */}
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50/80 border-b border-neutral-200 text-neutral-600 font-bold">
                      <tr>
                        <th className="py-3 px-4">Identificador</th>
                        <th className="py-3 px-4">Categoria</th>
                        <th className="py-3 px-4">Status Meta</th>
                        <th className="py-3 px-4">Saúde da Meta</th>
                        <th className="py-3 px-4">Disparos Realizados</th>
                        <th className="py-3 px-4">Ações Rápidas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {templates
                        .filter((t) => {
                          const matchesSearch = t.name.toLowerCase().includes(templateSearchTerm.toLowerCase());
                          const matchesCategory =
                            templateCategoryFilter === 'ALL' || t.category === templateCategoryFilter;
                          const matchesAccount = templateAccountFilter === 'ALL' || (t.accountId || 'env') === templateAccountFilter;
                          return matchesSearch && matchesCategory && matchesAccount;
                        })
                        .map((tpl) => (
                          <tr key={tpl.id || tpl.name} className="hover:bg-neutral-50/60 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-mono font-bold text-neutral-900">{tpl.name}</div>
                              <div className="text-[11px] text-neutral-500 line-clamp-1 max-w-xs mt-0.5">
                                {tpl.components?.find((c) => c.type === 'BODY')?.text || 'Sem texto'}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  tpl.category === 'UTILITY'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {tpl.category}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  tpl.status === 'APPROVED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : tpl.status === 'PENDING'
                                    ? 'bg-amber-100 text-amber-800'
                                    : tpl.status === 'DRAFT'
                                    ? 'bg-neutral-100 text-neutral-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {tpl.status === 'APPROVED'
                                  ? 'Aprovado'
                                  : tpl.status === 'PENDING'
                                  ? 'Em Análise'
                                  : tpl.status === 'DRAFT'
                                  ? 'Rascunho'
                                  : 'Rejeitado'}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                  tpl.qualityScore === 'GREEN' || !tpl.qualityScore
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : tpl.qualityScore === 'YELLOW'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-red-50 text-red-700 border border-red-200'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    tpl.qualityScore === 'GREEN' || !tpl.qualityScore
                                      ? 'bg-emerald-500'
                                      : tpl.qualityScore === 'YELLOW'
                                      ? 'bg-amber-500'
                                      : 'bg-red-500'
                                  }`}
                                />
                                {tpl.qualityScore === 'YELLOW'
                                  ? 'Atenção (Média)'
                                  : tpl.qualityScore === 'RED'
                                  ? 'Baixa'
                                  : 'Alta (Verde)'}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-neutral-800">
                              {tpl.usageCount || 0} envios
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setSelectedTemplateForTest(tpl.name);
                                    setActiveSubTab('sandbox');
                                    setTestMode('template');
                                    onShowToast(`Template ${tpl.name} selecionado para teste!`);
                                  }}
                                  className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Play className="w-3 h-3" /> Testar
                                </button>
                                <button
                                  onClick={() => handleLoadTemplateIntoCreator(tpl)}
                                  className="text-neutral-600 hover:text-neutral-900 font-medium cursor-pointer"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleDeleteTemplate(tpl.name, tpl.accountId)}
                                  className="text-neutral-400 hover:text-red-600 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* VISÃO 3: CRIADOR DE TEMPLATES COM PREVIEW EM TEMPO REAL               */}
          {/* ===================================================================== */}
          {templateSubView === 'creator' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Formulário do Criador */}
              <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900">
                        Criador & Editor de Templates da Meta
                      </h3>
                      <p className="text-[11px] text-neutral-500">
                        Configure o modelo, variáveis e botões para aprovação oficial
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setJsonInputText('');
                        setJsonImportError(null);
                        setShowJsonImportModal(true);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold border border-purple-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span>Colar JSON</span>
                    </button>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                      pt_BR Oficial
                    </span>
                  </div>
                </div>

                {/* Presets Rápidos */}
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 space-y-1.5">
                  <span className="text-[11px] font-bold text-neutral-700 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    Atalhos Estratégicos:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => loadPresetTemplate('video_estrategia')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all border border-emerald-700"
                    >
                      <Sparkles className="w-3 h-3 text-amber-300" />
                      <span>⭐ Estratégia do Vídeo (Camuflado 8x Mais Barato)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => loadPresetTemplate('confirmacao_utilitaria')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 hover:text-emerald-800 text-neutral-700 text-xs font-medium border border-neutral-200 transition-colors cursor-pointer"
                    >
                      🛡️ Utilitário Confirmação (Sim/Não)
                    </button>
                    <button
                      type="button"
                      onClick={() => loadPresetTemplate('apresentacao')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 hover:text-emerald-800 text-neutral-700 text-xs font-medium border border-neutral-200 transition-colors cursor-pointer"
                    >
                      🎯 Comercial Closer (Marketing)
                    </button>
                    <button
                      type="button"
                      onClick={() => loadPresetTemplate('followup')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 hover:text-emerald-800 text-neutral-700 text-xs font-medium border border-neutral-200 transition-colors cursor-pointer"
                    >
                      📄 Follow-up
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSubmitTemplateToMeta} className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        Identificador do Template (snake_case):
                      </label>
                      <input
                        type="text"
                        value={tplName}
                        onChange={(e) => setTplName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                        placeholder="ex: notificacao_pedido_atendimento"
                        className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        Categoria na Meta:
                      </label>
                      <select
                        value={tplCategory}
                        onChange={(e) => setTplCategory(e.target.value as any)}
                        className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-medium"
                      >
                        <option value="UTILITY">UTILITY (Menor custo • R$ ~0,08 • Confirmações & Rastreios)</option>
                        <option value="MARKETING">MARKETING (Tarifa cheia • R$ ~0,65 • Prospecção comercial)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        BM onde criar o modelo:
                      </label>
                      <select
                        value={tplAccountId}
                        onChange={(e) => setTplAccountId(e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-medium"
                      >
                        <option value="env">Ambiente (padrão)</option>
                        {bmAccounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Cabeçalho (Opcional - Negrito no topo):
                    </label>
                    <input
                      type="text"
                      value={tplHeader}
                      onChange={(e) => setTplHeader(e.target.value)}
                      placeholder="Deixe em branco ou informe o cabeçalho"
                      className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  {/* Corpo da Mensagem com Toolbar de Formatação e + Variável */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-neutral-700">
                        Corpo da Mensagem (Body):
                      </label>
                      <span className="text-[10px] text-neutral-500">
                        Insira as variáveis numéricas como {'{{1}}'}, {'{{2}}'}, etc.
                      </span>
                    </div>

                    <textarea
                      rows={5}
                      value={tplBody}
                      onChange={(e) => setTplBody(e.target.value)}
                      placeholder="Escreva o texto do template..."
                      className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-t-xl border-b-0 focus:ring-0 focus:outline-none leading-relaxed"
                    />

                    {/* Barra de Ferramentas / Formatação estilo GoHighLevel */}
                    <div className="flex items-center justify-between bg-neutral-50 border border-neutral-300 rounded-b-xl px-2.5 py-1.5 text-neutral-600">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setTplBody((b) => b + '*negrito*')}
                          className="px-2 py-0.5 rounded hover:bg-neutral-200 text-xs font-bold font-serif"
                          title="Negrito (*texto*)"
                        >
                          B
                        </button>
                        <button
                          type="button"
                          onClick={() => setTplBody((b) => b + '_itálico_')}
                          className="px-2 py-0.5 rounded hover:bg-neutral-200 text-xs italic font-serif"
                          title="Itálico (_texto_)"
                        >
                          I
                        </button>
                        <button
                          type="button"
                          onClick={() => setTplBody((b) => b + '~tachado~')}
                          className="px-2 py-0.5 rounded hover:bg-neutral-200 text-xs line-through"
                          title="Tachado (~texto~)"
                        >
                          S
                        </button>
                        <button
                          type="button"
                          onClick={() => setTplBody((b) => b + '```código```')}
                          className="px-2 py-0.5 rounded hover:bg-neutral-200 text-[10px] font-mono"
                          title="Monospace (```texto```)"
                        >
                          &lt;/&gt;
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const existingVars = Array.from(
                            new Set((tplBody.match(/\{\{(\d+)\}\}/g) || []).map((m) => Number(m.replace(/[{}]/g, ''))))
                          );
                          let nextNum = 1;
                          while (existingVars.includes(nextNum)) nextNum++;
                          setTplBody((b) => (b.endsWith(' ') || b.endsWith('\n') || b === '' ? b : b + ' ') + `{{${nextNum}}}`);
                          
                          // Preenche um fallback amigável de utility
                          setTplExamples((prev) => {
                            const updated = [...prev];
                            if (!updated[nextNum - 1]) {
                              const fallbacks = [
                                'Caio',
                                'Seu pedido foi confirmado com sucesso e em breve estará no seu destino.',
                                'O link para rastreio da viagem já está disponível para acesso, conforme solicitado.',
                                'Código de rastreio #883921',
                                'Central de Atendimento ao Cliente'
                              ];
                              updated[nextNum - 1] = fallbacks[nextNum - 1] || `Amostra ${nextNum}`;
                            }
                            return updated;
                          });
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                        <span>+ Adicionar Variável</span>
                      </button>
                    </div>
                  </div>

                  {/* Tabela Dinâmica de Variáveis & Mapeamento (Inspirado no GoHighLevel) */}
                  {(() => {
                    const varsInBody = Array.from(
                      new Set((tplBody.match(/\{\{(\d+)\}\}/g) || []).map((m) => m.replace(/[{}]/g, '')))
                    ).sort((a, b) => Number(a) - Number(b));

                    if (varsInBody.length === 0) return null;

                    return (
                      <div className="p-3.5 bg-gradient-to-br from-emerald-50/70 via-teal-50/40 to-amber-50/40 border border-emerald-200/80 rounded-2xl space-y-3 shadow-2xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-2">
                          <div>
                            <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-emerald-700" />
                              Camuflagem de Variáveis para Utility (Pague 8x Menos):
                            </span>
                            <p className="text-[11px] text-emerald-800/80 mt-0.5 leading-snug">
                              A Meta avalia a amostra da direita. Use textos burocráticos para aprovar como UTILITY. No envio real, o sistema injeta o campo da esquerda.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setTplExamples([
                                'Caio',
                                'Seu pedido foi confirmado com sucesso e em breve estará no seu destino.',
                                'O link para rastreio da viagem já está disponível para acesso, conforme solicitado.',
                                'Código de rastreio #883921',
                                'Central de Atendimento ao Cliente'
                              ]);
                              onShowToast('🛡️ Amostras de camuflagem Utility aplicadas com sucesso!');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-2xs flex items-center gap-1 cursor-pointer shrink-0"
                          >
                            <Sparkles className="w-3 h-3 text-amber-300" />
                            <span>Preencher Camuflagem Utility</span>
                          </button>
                        </div>

                        <div className="space-y-2">
                          {varsInBody.map((vNum, idx) => (
                            <div
                              key={vNum}
                              className="p-2.5 bg-white border border-neutral-200 rounded-xl shadow-2xs flex flex-col sm:flex-row sm:items-center gap-2"
                            >
                              {/* Tag da Variável */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-900 font-mono font-bold text-xs">
                                  {'{{' + vNum + '}}*'}
                                </span>
                              </div>

                              {/* Mapeamento no CRM (Disparo Real) */}
                              <div className="flex-1 sm:max-w-[200px]">
                                <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                                  Disparo Real (CRM):
                                </label>
                                <select
                                  value={
                                    tplVariableMappings[vNum] ||
                                    (idx === 0
                                      ? 'contact.name'
                                      : idx === 1
                                      ? 'lead.custom_pitch'
                                      : idx === 2
                                      ? 'lead.website_url'
                                      : 'contact.name')
                                  }
                                  onChange={(e) =>
                                    setTplVariableMappings((prev) => ({
                                      ...prev,
                                      [vNum]: e.target.value
                                    }))
                                  }
                                  className="w-full text-xs px-2 py-1.5 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-1 focus:ring-emerald-500 font-medium text-neutral-800"
                                >
                                  <option value="contact.name">👤 Nome do Lead (contact.name)</option>
                                  <option value="lead.custom_pitch">💬 Pitch / Mensagem (lead.pitch)</option>
                                  <option value="lead.website_url">🌐 Link do Site (lead.website)</option>
                                  <option value="lead.company">🏢 Empresa (lead.company)</option>
                                  <option value="contact.phone">📞 WhatsApp (contact.phone)</option>
                                  <option value="custom">⚙️ Campo Personalizado</option>
                                </select>
                              </div>

                              {/* Exemplo de Amostra para a Meta */}
                              <div className="flex-1">
                                <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                                  Amostra para Meta (Enter sample content):
                                </label>
                                <input
                                  type="text"
                                  value={tplExamples[idx] ?? ''}
                                  onChange={(e) => {
                                    const updated = [...tplExamples];
                                    updated[idx] = e.target.value;
                                    setTplExamples(updated);
                                  }}
                                  placeholder={
                                    idx === 0
                                      ? 'Ex: Caio'
                                      : idx === 1
                                      ? 'Ex: Seu pedido foi confirmado...'
                                      : idx === 2
                                      ? 'Ex: O link para rastreio já está...'
                                      : `Amostra para {{${vNum}}}`
                                  }
                                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg focus:ring-1 focus:ring-emerald-500 font-sans"
                                />
                              </div>

                              {/* Remover Variável */}
                              <button
                                type="button"
                                onClick={() => {
                                  setTplBody((b) =>
                                    b.replace(new RegExp(`\\{\\{${vNum}\\}\\}`, 'g'), '').replace(/\s+/g, ' ').trim()
                                  );
                                }}
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors self-end sm:self-center cursor-pointer"
                                title="Remover esta variável do corpo do texto"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Rodapé (Texto discreto de opt-out):
                    </label>
                    <input
                      type="text"
                      value={tplFooter}
                      onChange={(e) => setTplFooter(e.target.value)}
                      placeholder="ex: Responda PARAR para sair"
                      className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  {/* Gerenciador Dinâmico de Botões Rápidos */}
                  <div className="space-y-2 pt-1 border-t border-neutral-100">
                    <label className="block text-xs font-semibold text-neutral-700">
                      Botões de Resposta Rápida (Até 3 botões):
                    </label>

                    {tplButtons.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {tplButtons.map((btn, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-200"
                          >
                            <span>🔘 {btn}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveButton(idx)}
                              className="text-emerald-600 hover:text-red-600 transition-colors cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {tplButtons.length < 3 && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newButtonInput}
                          onChange={(e) => setNewButtonInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddButton();
                            }
                          }}
                          placeholder="Texto do botão (ex: Acessar Link, Parar Mensagens)"
                          className="flex-1 text-xs px-3 py-1.5 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleAddButton}
                          className="px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold cursor-pointer"
                        >
                          + Adicionar Botão
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Ações de Submissão */}
                  <div className="flex items-center gap-3 pt-3">
                    <button
                      type="button"
                      onClick={handleSaveDraftTemplate}
                      disabled={savingAsDraft}
                      className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5 text-neutral-600" />
                      <span>{savingAsDraft ? 'Salvando...' : 'Salvar como Rascunho'}</span>
                    </button>

                    <button
                      type="submit"
                      disabled={submittingTemplate}
                      className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{submittingTemplate ? 'Submetendo à Meta...' : 'Submeter para Aprovação da Meta'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Preview do Template no WhatsApp (Com Toggle de Visão Meta vs Lead) */}
              <div className="lg:col-span-5 bg-neutral-900 p-5 rounded-2xl border border-neutral-800 text-white flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                    <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-emerald-400" />
                      Simulação em Tempo Real
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        tplCategory === 'UTILITY'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-purple-950 text-purple-400 border border-purple-800'
                      }`}
                    >
                      {tplCategory === 'UTILITY' ? 'UTILITY (~8x Mais Barato)' : 'MARKETING (Tarifa Cheia)'}
                    </span>
                  </div>

                  {/* Toggle de Simulação (Meta vs Lead) */}
                  <div className="flex items-center gap-1 bg-neutral-800 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setPreviewSimulationMode('meta_evaluation')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        previewSimulationMode === 'meta_evaluation'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Visão da Meta (Camuflagem)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewSimulationMode('lead_real')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        previewSimulationMode === 'lead_real'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Visão do Lead (Disparo Real)</span>
                    </button>
                  </div>

                  {/* Status Informativo do Modo */}
                  <div
                    className={`p-2 rounded-xl text-[11px] border leading-relaxed ${
                      previewSimulationMode === 'meta_evaluation'
                        ? 'bg-emerald-950/50 border-emerald-800/80 text-emerald-300'
                        : 'bg-indigo-950/50 border-indigo-800/80 text-indigo-300'
                    }`}
                  >
                    {previewSimulationMode === 'meta_evaluation' ? (
                      <span>
                        🤖 <strong>O robô da Meta lê isto:</strong> Amostra burocrática de confirmação de pedido e rastreio. Como não há menção comercial, aprova com o selo verde de <strong>UTILITY</strong>.
                      </span>
                    ) : (
                      <span>
                        🎯 <strong>O Lead recebe isto:</strong> No disparo da campanha, as variáveis são trocadas pelo nome do contato, pitch de vendas e link do site criado.
                      </span>
                    )}
                  </div>

                  {/* Balão do WhatsApp */}
                  <div className="bg-[#0b141a] p-4 rounded-xl border border-neutral-800 space-y-2">
                    <div className="p-3.5 rounded-2xl rounded-tl-none bg-[#005c4b] text-white text-xs space-y-2 shadow-sm">
                      {tplHeader && (
                        <div className="font-bold text-emerald-200 border-b border-emerald-700/50 pb-1">
                          {tplHeader}
                        </div>
                      )}

                      <div className="text-neutral-100 whitespace-pre-line leading-relaxed font-sans">
                        {(() => {
                          let rendered = tplBody;
                          const vars = Array.from(
                            new Set((tplBody.match(/\{\{(\d+)\}\}/g) || []).map((m) => m.replace(/[{}]/g, '')))
                          );

                          vars.forEach((vNum) => {
                            const idx = Number(vNum) - 1;
                            if (previewSimulationMode === 'meta_evaluation') {
                              const sample =
                                tplExamples[idx] ||
                                (idx === 0
                                  ? 'Caio'
                                  : idx === 1
                                  ? 'Seu pedido foi confirmado com sucesso e em breve estará no seu destino.'
                                  : idx === 2
                                  ? 'O link para rastreio da viagem já está disponível para acesso, conforme solicitado.'
                                  : `[Amostra ${vNum}]`);
                              rendered = rendered.replace(new RegExp(`\\{\\{${vNum}\\}\\}`, 'g'), sample);
                            } else {
                              const mapping =
                                tplVariableMappings[vNum] ||
                                (idx === 0
                                  ? 'contact.name'
                                  : idx === 1
                                  ? 'lead.custom_pitch'
                                  : idx === 2
                                  ? 'lead.website_url'
                                  : 'contact.name');

                              let realVal = 'Marcelo';
                              if (mapping === 'contact.name') realVal = 'Marcelo';
                              else if (mapping === 'lead.custom_pitch')
                                realVal =
                                  'Criei uma versão moderna e exclusiva para a Marcenaria Oliveira ver como pode dobrar seus orçamentos no Google:';
                              else if (mapping === 'lead.website_url')
                                realVal = 'https://nyroh.com.br/marcenaria-oliveira';
                              else if (mapping === 'lead.company') realVal = 'Marcenaria Oliveira';
                              else if (mapping === 'contact.phone') realVal = '(11) 98765-4321';
                              else realVal = `[Dado do Lead {{${vNum}}}]`;

                              rendered = rendered.replace(new RegExp(`\\{\\{${vNum}\\}\\}`, 'g'), realVal);
                            }
                          });

                          return rendered;
                        })()}
                      </div>

                      {tplFooter && (
                        <div className="text-[10px] text-emerald-300/70 pt-1">
                          {tplFooter}
                        </div>
                      )}

                      <div className="text-[9px] text-emerald-200/60 text-right flex items-center justify-end gap-1">
                        <span>12:00</span>
                        <CheckCheck className="w-3 h-3 text-emerald-300" />
                      </div>
                    </div>

                    {/* Botões Interativos (Quick Replies) */}
                    {tplButtons.length > 0 && (
                      <div className="space-y-1.5 mt-2">
                        {tplButtons.map((btnText, bIdx) => (
                          <div
                            key={bIdx}
                            className="w-full py-2 px-3 rounded-xl bg-[#202c33] text-emerald-400 text-xs font-semibold text-center border border-neutral-700 hover:bg-[#2a3942] transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                          >
                            <span>{btnText}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-neutral-800/80 rounded-xl text-[11px] text-neutral-300 mt-4 border border-neutral-700 space-y-1">
                  <div className="font-bold text-emerald-300 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Dica Estratégica de Utilidade:
                  </div>
                  <p className="text-neutral-300 leading-relaxed">
                    Templates utilitários camuflados com 3 variáveis e botões "Acessar Link" e "Parar Mensagens" pagam a menor tarifa de todas (~R$ 0,08) e protegem seu número de bloqueios de spam via opt-out transparente.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* MODAL / DIALOG DE IMPORTAÇÃO DE JSON OFICIAL DA META                   */}
          {/* ===================================================================== */}
          {showJsonImportModal && (
            <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl max-w-2xl w-full p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                      <Code2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900">
                        Importar Template via JSON da Meta / Graph API
                      </h3>
                      <p className="text-xs text-neutral-500">
                        Cole a estrutura JSON do template. O sistema preenche nome, textos e botões automaticamente.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowJsonImportModal(false)}
                    className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Exemplos Prontos de 1-Clique */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-neutral-700">
                    Carregar Exemplo Pré-Configurado:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const example = {
                          name: "confirmacao_atendimento_v1",
                          category: "UTILITY",
                          language: "pt_BR",
                          body: {
                            text: "Olá {{1}}, confirmamos o seu agendamento para hoje. Tudo certo para conversarmos?",
                            examples: ["Marcelo"]
                          },
                          footer: "Responda PARAR para sair",
                          buttons: [
                            { type: "QUICK_REPLY", text: "Sim, confirmado" },
                            { type: "QUICK_REPLY", text: "Reagendar" }
                          ]
                        };
                        setJsonInputText(JSON.stringify(example, null, 2));
                        setJsonImportError(null);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 text-xs font-bold border border-blue-200 hover:bg-blue-100 cursor-pointer"
                    >
                      ⚡ 1 Variável (Confirmação Simples)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const example = {
                          name: "notificacao_pedido_atendimento",
                          category: "UTILITY",
                          language: "pt_BR",
                          body: {
                            text: "Ei, {{1}}\n\n{{2}}\n\n{{3}}\n\nClique no botão abaixo para acessar:",
                            examples: [
                              "Caio",
                              "Seu pedido foi confirmado com sucesso e em breve estará no seu destino.",
                              "O link para rastreio da viagem já está disponível para acesso, conforme solicitado."
                            ]
                          },
                          footer: "Responda PARAR para sair",
                          buttons: [
                            { type: "QUICK_REPLY", text: "Acessar Link" },
                            { type: "QUICK_REPLY", text: "Parar Mensagens" }
                          ]
                        };
                        setJsonInputText(JSON.stringify(example, null, 2));
                        setJsonImportError(null);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                    >
                      ⭐ Estratégia do Vídeo (3 Variáveis Camufladas • 8x Mais Barato)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const example = {
                          name: "apresentacao_comercial_closer",
                          category: "MARKETING",
                          language: "pt_BR",
                          body: {
                            text: "Olá {{1}}, tudo bem? Analisei o momento da {{2}} e preparamos uma demonstração exclusiva.",
                            examples: [
                              "Marcelo",
                              "sua empresa"
                            ]
                          },
                          footer: "Responda PARAR para cancelar",
                          buttons: [
                            { type: "QUICK_REPLY", text: "Quero Agendar Reunião" }
                          ]
                        };
                        setJsonInputText(JSON.stringify(example, null, 2));
                        setJsonImportError(null);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 text-xs font-bold border border-purple-200 hover:bg-purple-100 cursor-pointer"
                    >
                      🎯 Comercial Prospecção (MARKETING)
                    </button>
                  </div>
                </div>

                {/* Textarea do JSON */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Cole o código JSON abaixo:
                  </label>
                  <textarea
                    rows={10}
                    value={jsonInputText}
                    onChange={(e) => {
                      setJsonInputText(e.target.value);
                      if (jsonImportError) setJsonImportError(null);
                    }}
                    placeholder={`{\n  "name": "meu_template",\n  "category": "UTILITY",\n  "components": [...]\n}`}
                    className="w-full text-xs font-mono p-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-neutral-900 text-emerald-300 leading-relaxed"
                  />
                </div>

                {jsonImportError && (
                  <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{jsonImportError}</span>
                  </div>
                )}

                {/* Ações do Modal */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setShowJsonImportModal(false)}
                    className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleParseAndImportJson(jsonInputText)}
                    className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold cursor-pointer shadow-sm"
                  >
                    Processar e Preencher Criador
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
    </>
  );
}
