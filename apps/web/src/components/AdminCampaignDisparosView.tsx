import { urlCampaignBatchesBrandId } from '../features/disparos/api';
import { apiFetch } from '../api/client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { RespostaUploadZip, RespostaErroApi } from '@shared/contracts/rotas';
import { parseTemplateBody, templateVarIndexes, renderTemplateBody } from '@shared/lib/templateSegments';
import { fillLeadTokens } from '@shared/lib/templateCopy';
import { distribuirQuantidade } from '@shared/lib/dispatchDistribuicao';
import { sanitizeTemplateVariable } from '@shared/lib/leadIntent';
import { resolveLeadTokens } from '@shared/lib/leadTokens';
import { useRuntimeConfig, formatInstancePhone } from '@shared/lib/useRuntimeConfig';
import { onRealtime } from '@shared/lib/realtime';
import {
  Send,
  Layers,
  Clock,
  Kanban,
  Share2,
  Upload,
  Play,
  CheckCircle2,
  AlertCircle,
  Phone,
  ExternalLink,
  Shield,
  Flame,
  Snowflake,
  UserCheck,
  RefreshCw,
  Sliders,
  Sparkles,
  Smartphone,
  Eye,
  FileArchive,
  Search,
  Filter,
  Check,
  ChevronRight,
  ChevronLeft,
  X,
  User,
  Users,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  MessageSquare,
  Lock,
  Download,
  Trash2,
  Plus,
  Globe,
  Zap,
  BookOpen,
  Bookmark,
  Edit,
  Copy,
  FileText,
  Save,
  MousePointerClick,
  Settings,
  Link2,
  Highlighter,
  CornerDownLeft,
  XOctagon,
  Pause,
  FastForward,
  Gauge,
  Activity,
  CheckCheck,
  RotateCcw
} from 'lucide-react';
import { CampaignBatch, CampaignLead, CampaignLeadStatus, CampaignCopyTemplate, Salesperson } from '@shared/types';
import { AdminDispatchTestSandbox } from './AdminDispatchTestSandbox';
import { ZipImportProgressModal, ImportProgressData } from './ZipImportProgressModal';
import { PaginaSubirZip, ZipUploadRegistro } from './PaginaSubirZip';
import { isUiFlagOn } from '@shared/lib/uiFlags';
import type { RespostaListaUploads, RespostaListaModelosFluxo, RespostaInstanciasFluxo, RespostaListaCopias, RespostaCopiaSalva, CopiaCampanha, RespostaListaLotes, RespostaVelocidadeDisparo, LoteCampanha, RespostaLiberacaoQuarentena, RespostaDevolucaoLeads } from '@shared/contracts/rotas';
import { AdminCampaignDisparosViewProps, CONFIRMA_ACIMA_DE, DispatchStateLine, MetaTemplateButton, MetaTemplateComponent, MetaTemplateFull, SHOW_SANDBOX, SHOW_SIMULATE, SubPageTab, formatDuration } from '../features/disparos/base';
import { useDisparos } from '../features/disparos/useDisparos';
import { BibliotecaCopyModal } from '../features/disparos/modais/BibliotecaCopyModal';
import { CriarCampanhaModal } from '../features/disparos/modais/CriarCampanhaModal';
import { DisparoMassaModal } from '../features/disparos/modais/DisparoMassaModal';
import { DistribuicaoTab } from '../features/disparos/abas/DistribuicaoTab';
import { KanbanTab } from '../features/disparos/abas/KanbanTab';
import { MontadorTab } from '../features/disparos/abas/MontadorTab';
import { QuarentenaTab } from '../features/disparos/abas/QuarentenaTab';
import { SafrasTab } from '../features/disparos/abas/SafrasTab';
import { SalvarCopyModal } from '../features/disparos/modais/SalvarCopyModal';
import { SincronizarWhatsAppModal } from '../features/disparos/modais/SincronizarWhatsAppModal';
import { TesteSandboxTab } from '../features/disparos/abas/TesteSandboxTab';
import { UploadZipModal } from '../features/disparos/modais/UploadZipModal';

export const AdminCampaignDisparosView: React.FC<AdminCampaignDisparosViewProps> = (props) => {
  const d = useDisparos(props);
  const { salespeople, currentUser, onLeadsUpdated, onNavigateToKanban, onNavigateToWhatsApp, runtime, instanceLabel, activeTab, setActiveTab, batches, setBatches, checkedBatchIds, setCheckedBatchIds, brandOptions, setBrandOptions, selectedBatchId, setSelectedBatchId, leads, setLeads, loading, setLoading, isUploading, setIsUploading, searchQuery, setSearchQuery, statusFilter, setStatusFilter, actionNotification, setActionNotification, isBatchDispatchModalOpen, setIsBatchDispatchModalOpen, dispatchQuantityOption, setDispatchQuantityOption, customDispatchQuantity, setCustomDispatchQuantity, distribuicaoManual, setDistribuicaoManual, linhasDisparo, desejadoDisparo, planoDisparo, totalPlanoDisparo, dispatchSelectedCloser, setDispatchSelectedCloser, dispatchSelectedClosers, setDispatchSelectedClosers, dispatchModalStep, setDispatchModalStep, dispatchInfo, setDispatchInfo, batchDispatchStats, setBatchDispatchStats, dispatchSpeed, setDispatchSpeed, dispatchPhoneNumberId, setDispatchPhoneNumberId, dispatchNumbers, setDispatchNumbers, speedLimits, setSpeedLimits, speedPresets, setSpeedPresets, liveBatchProgress, setLiveBatchProgress, isUpdatingSpeed, setIsUpdatingSpeed, isDragOverStaging, setIsDragOverStaging, stagingSelectedLeadIds, setStagingSelectedLeadIds, visibleStagingCount, setVisibleStagingCount, visibleColdCount, setVisibleColdCount, stagingZipInputRef, montadorSubTab, setMontadorSubTab, activeVarField, setActiveVarField, buttonDestinationType, setButtonDestinationType, buttonCustomUrl, setButtonCustomUrl, buttonTextLabel, setButtonTextLabel, quarantineUnit, setQuarantineUnit, quarantineOnReplyAction, setQuarantineOnReplyAction, quarantineOnExpireAction, setQuarantineOnExpireAction, quarantineCustomHours, setQuarantineCustomHours, selectedTemplate, setSelectedTemplate, dispatchSelectedTemplate, setDispatchSelectedTemplate, availableTemplates, setAvailableTemplates, loadingTemplates, setLoadingTemplates, simulatorLeadIndex, setSimulatorLeadIndex, dispatchQuarantineHours, setDispatchQuarantineHours, isDispatching, setIsDispatching, dispatchProgress, setDispatchProgress, highlightVariables, setHighlightVariables, metaTemplatesList, activeMetaTemplate, activeVarIndexes, TAGS_FIXAS, camposLead, setCamposLead, camposTag, valoresParaSalvar, erroCopyParaDisparo, testPhone, setTestPhone, testSending, setTestSending, handleSendTestToPhone, copiesByIndexForClient, META_BODY_MAX, META_CHAR_LIMITS, bodyMeasureSample, measureBodyLength, copiesMapByTemplate, setCopiesMapByTemplate, copiesByIdx, setCopyAt, templateVar1, templateVar2, templateVar3, setTemplateVar1, setTemplateVar2, setTemplateVar3, copyTemplates, setCopyTemplates, selectedCopyTemplateId, setSelectedCopyTemplateId, loadingCopies, setLoadingCopies, showSaveCopyModal, setShowSaveCopyModal, showLibraryModal, setShowLibraryModal, newCopyName, setNewCopyName, newCopyDesc, setNewCopyDesc, newCopyCategory, setNewCopyCategory, fetchMetaTemplates, fetchCopyTemplates, handleSelectCopyTemplate, handleUpdateCurrentCopyTemplate, handleResetToApprovedCopy, handleSaveCurrentAsCopyTemplate, handleDeleteCopyTemplate, insertTagIntoActiveVar, quarantineRemainingTime, setQuarantineRemainingTime, retainHotForAdmin, setRetainHotForAdmin, onlyColdLeads, setOnlyColdLeads, sellerQuotas, setSellerQuotas, isDistributing, setIsDistributing, showNewBatchModal, setShowNewBatchModal, newBatchName, setNewBatchName, newBatchHours, setNewBatchHours, showUploadZipModal, setShowUploadZipModal, paginaSubirZip, setPaginaSubirZip, zipUploads, setZipUploads, zipUploadsCarregando, setZipUploadsCarregando, carregarHistoricoZips, showImportProgressModal, setShowImportProgressModal, importProgressData, setImportProgressData, importAbortRef, fileInputRef, showSyncWhatsAppModal, setShowSyncWhatsAppModal, syncWhatsAppInput, setSyncWhatsAppInput, isSyncingWhatsApp, setIsSyncingWhatsApp, syncWhatsAppResult, setSyncWhatsAppResult, syncJsonFileInputRef, fetchBatches, fetchLeads, currentBatch, fetchDispatchSpeed, handleUpdateGlobalSpeed, handlePauseBatch, handleResumeBatch, handleCancelBatch, showNotification, handleCreateBatch, handleDeleteBatch, handleUploadZip, handleCancelImport, handleTriggerDispatch, handleSimulateLeadReply, handleOpenDispatchModal, carregarInfoDisparo, handleDispatchCheckedBatches, handleExecuteBatchDispatch, handleMoveLeadStatus, handleDistributeToClosers, handleReleaseQuarantine, handleSaveQuarantineConfig, handleReturnUnsent, handleResetBatchToStaging, handleSyncWhatsAppWeb, handleSyncFileSelect, activeSimulatorLead, safraMetrics } = d;

  return (
    <div id="campaign-disparos-fullview" className="w-full flex-1 flex flex-col bg-[#f8f9fa] text-neutral-900 min-h-0 overflow-y-auto">
      {/* Toast Notification */}
      {actionNotification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 border text-xs font-semibold animate-in fade-in slide-in-from-top-2 ${
            actionNotification.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          {actionNotification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{actionNotification.message}</span>
          <button onClick={() => setActionNotification(null)} className="ml-2 text-neutral-500 hover:text-neutral-900 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TOP HEADER: Full Width Command Bar - Design System Compliant */}
      <header className="w-full bg-white border-b border-neutral-200 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-2xs">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-neutral-900">
                Disparos & Campanhas em Massa
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                Staging & Quarentena
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              Isolamento de leads: Novas safras entram em Staging e só são distribuídas após a quarentena.
            </p>
          </div>
        </div>

        {/* Safra Picker & Actions */}
        <div className="flex items-center flex-wrap gap-2.5">
          {currentBatch && (
            <div className="flex items-center gap-2 bg-neutral-100 border border-neutral-200 rounded-xl px-3 py-1.5">
              <span className="text-xs text-neutral-500 font-semibold">Marca:</span>
              <select
                value={(currentBatch as any).brandId || ''}
                onChange={async (e) => {
                  const brandId = e.target.value || null;
                  try {
                    const res = await apiFetch(urlCampaignBatchesBrandId(currentBatch.id), {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ brandId }),
                    });
                    if (!res.ok) throw new Error();
                    setBatches(prev => prev.map(b => (b.id === currentBatch.id ? ({ ...b, brandId } as any) : b)));
                  } catch {
                    setActionNotification({ type: 'error', message: 'Não foi possível ligar a safra à marca.' });
                  }
                }}
                className="bg-transparent text-neutral-900 text-xs font-bold focus:outline-none cursor-pointer max-w-[180px]"
              >
                <option value="" className="bg-white">Sem marca</option>
                {brandOptions.map(b => (
                  <option key={b.id} value={b.id} className="bg-white">{b.name}</option>
                ))}
              </select>
            </div>
          )}
          <details className="relative">
            <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-neutral-50 border border-neutral-300 text-neutral-800 text-xs font-bold select-none">
              <span>Safras para disparo ({checkedBatchIds.length || 0} marcada{checkedBatchIds.length === 1 ? '' : 's'})</span>
              <span className="text-neutral-400">▾</span>
            </summary>
            <div className="absolute left-0 mt-2 w-80 bg-white border border-neutral-200 rounded-xl shadow-xl p-2 z-30 space-y-1">
              <div className="flex items-center justify-between px-2 pb-1">
                <button
                  type="button"
                  onClick={() => setCheckedBatchIds(batches.map(b => b.id))}
                  className="text-[11px] font-bold text-emerald-700 hover:underline"
                >
                  Marcar todas
                </button>
                <button
                  type="button"
                  onClick={() => setCheckedBatchIds([])}
                  className="text-[11px] font-bold text-neutral-500 hover:underline"
                >
                  Limpar
                </button>
              </div>
              {batches.length === 0 && (
                <p className="px-2 py-2 text-[11px] text-neutral-500">Nenhuma safra criada ainda.</p>
              )}
              {batches.map(b => (
                <label key={b.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-neutral-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkedBatchIds.includes(b.id)}
                    onChange={e => setCheckedBatchIds(prev => e.target.checked ? [...prev, b.id] : prev.filter(x => x !== b.id))}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span className="text-xs text-neutral-900 flex-1 truncate">{b.name}</span>
                  <span className="text-[11px] text-neutral-500">{b.totalLeads} leads</span>
                </label>
              ))}
            </div>
          </details>
          <div className="flex items-center gap-2 bg-neutral-100 border border-neutral-200 rounded-xl px-3 py-1.5">
            <span className="text-xs text-neutral-500 font-semibold">Campanha:</span>
            <select
              value={selectedBatchId}
              onChange={e => setSelectedBatchId(e.target.value)}
              className="bg-transparent text-neutral-900 text-xs font-bold focus:outline-none cursor-pointer"
            >
              {batches.map(b => (
                <option key={b.id} value={b.id} className="bg-white text-neutral-900">
                  {b.name} ({b.totalLeads} leads)
                </option>
              ))}
              {batches.length === 0 && (
                <option value="" className="bg-white text-neutral-500">
                  Nenhuma safra criada ainda
                </option>
              )}
            </select>
          </div>

          <button
            onClick={() => setShowNewBatchModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold transition shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Campanha</span>
          </button>

          <button
            onClick={() => setPaginaSubirZip(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Subir ZIP</span>
          </button>

          {/* Ações de manutenção da safra: ficam num menu para não poluir o cabeçalho */}
          {selectedBatchId && (
            <details className="relative">
              <summary className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-neutral-50 border border-neutral-300 text-neutral-800 text-xs font-bold select-none">
                <span>Mais ações</span>
                <span className="text-neutral-400">▾</span>
              </summary>
              <div className="absolute right-0 mt-2 w-80 bg-white border border-neutral-200 rounded-xl shadow-xl p-2 z-30 space-y-1">
                <button
                  onClick={handleReturnUnsent}
                  className="w-full text-left p-2.5 rounded-lg hover:bg-emerald-50"
                >
                  <p className="text-xs font-bold text-emerald-900">Devolver não enviados</p>
                  <p className="text-[11px] text-neutral-500">Devolve para Novos Leads quem não saiu de fato e tira as mensagens pendentes da fila.</p>
                </button>
                <button
                  onClick={handleResetBatchToStaging}
                  className="w-full text-left p-2.5 rounded-lg hover:bg-amber-50"
                >
                  <p className="text-xs font-bold text-amber-900">Zerar / resetar safra</p>
                  <p className="text-[11px] text-neutral-500">Zera os disparos e volta todos os leads da safra para a Etapa 1.</p>
                </button>
              </div>
            </details>
          )}

          {/* Botão de Sincronizar com WhatsApp Web & Reciclar Não Disparados */}
          {selectedBatchId && (
            <button
              onClick={() => {
                setSyncWhatsAppResult(null);
                setShowSyncWhatsAppModal(true);
              }}
              title="Cruzar com chats do WhatsApp Web: confirma disparos reais, separa fixos e recicla não disparados para Etapa 1"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-white" />
              <span>Sincronizar WhatsApp Web</span>
            </button>
          )}

          {/* Indicador de Velocidade da Fila (BullMQ) */}
          <div
            onClick={() => handleOpenDispatchModal()}
            title="Clique para configurar velocidade e disparar"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-neutral-700 text-xs font-semibold cursor-pointer transition"
          >
            <Gauge className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="text-neutral-500">Vazão:</span>
            <span className="font-mono font-bold text-neutral-900">{Math.round(dispatchSpeed * 60)} msgs/min</span>
            <span className="text-[10px] text-neutral-400 font-mono">(teto {speedLimits.maxPerMinute}/min)</span>
          </div>

          <button
            onClick={() => handleOpenDispatchModal()}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Fazer Disparo ({leads.filter(l => l.status === 'STAGING').length})</span>
          </button>
        </div>
      </header>

      {/* PASSOS DO DISPARO: 1 Subir, 2 Montar, 3 Disparar. As telas internas continuam as mesmas. */}
      {/* Navegação do disparo: uma só barra. Cada etapa agrupa as telas dela. */}
      {(() => {
        const ETAPAS: Array<{ id: string; numero: string; titulo: string; views: Array<{ v: SubPageTab; label: string }> }> = [
          { id: 'subir', numero: '1', titulo: 'Subir', views: [{ v: 'safras', label: 'Safras' }] },
          { id: 'montar', numero: '2', titulo: 'Montar', views: [{ v: 'kanban', label: 'Kanban de disparos' }, { v: 'montador', label: 'Montador de copy' }] },
          {
            id: 'disparar',
            numero: '3',
            titulo: 'Disparar',
            views: [
              { v: 'quarentena', label: 'Quarentena' },
              { v: 'distribuicao', label: 'Distribuição' },
              ...(SHOW_SANDBOX ? [{ v: 'teste_sandbox' as SubPageTab, label: 'Teste Sandbox' }] : []),
            ],
          },
        ];
        return (
          <div className="w-full bg-white border-b border-neutral-200 px-4 sm:px-6 shrink-0">
            <nav className="flex flex-wrap items-stretch gap-x-6 gap-y-2">
              {ETAPAS.map((etapa, idx) => {
                const etapaAtiva = etapa.views.some(v => v.v === activeTab);
                return (
                  <div key={etapa.id} className={`flex items-stretch gap-1 ${idx > 0 ? 'pl-6 border-l border-neutral-200' : ''}`}>
                    <span className={`self-center mr-1 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap ${etapaAtiva ? 'text-emerald-700' : 'text-neutral-400'}`}>
                      {etapa.numero}. {etapa.titulo}
                    </span>
                    {etapa.views.map(view => {
                      const ativa = activeTab === view.v;
                      return (
                        <button
                          key={view.v}
                          onClick={() => setActiveTab(view.v)}
                          className={`pt-3 pb-3 -mb-px px-1 text-sm whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                            ativa ? 'border-neutral-900 text-neutral-900 font-semibold' : 'border-transparent text-neutral-500 hover:text-neutral-800'
                          }`}
                        >
                          {view.label}
                          {view.v === 'quarentena' && currentBatch?.status === 'quarantine' && (
                            <span className="inline-block w-2 h-2 ml-1.5 rounded-full bg-amber-500 animate-ping" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </div>
        );
      })()}

      {/* Barra de detalhes da safra atual */}
      {currentBatch && (
        <div className="w-full bg-white border-b border-neutral-200 px-4 sm:px-6 py-1.5 flex items-center justify-between gap-2 shrink-0">
          <div className="hidden lg:flex items-center gap-3 text-xs text-neutral-600">
            <span>Criada em: <strong>{new Date(currentBatch.createdAt).toLocaleDateString('pt-BR')}</strong></span>
            <span>• Total: <strong>{currentBatch.totalLeads} leads</strong></span>
            <span>• Aceitos pela API: <strong className="text-blue-700">{currentBatch.acceptedCount ?? currentBatch.dispatchedCount}</strong></span>
            <span>• Entregues: <strong className="text-emerald-700">{currentBatch.deliveredCount ?? 0}</strong></span>
            <span>• Falhas (sem WhatsApp, etc.): <strong className="text-red-700">{currentBatch.failedCount ?? 0}</strong></span>
          </div>
        </div>
      )}

      {/* MAIN VIEW CONTENT (Aproveita toda a tela) */}
      <div className="w-full flex-1 p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        <SafrasTab d={d} />

        <MontadorTab d={d} />

        <TesteSandboxTab d={d} />

        <QuarentenaTab d={d} />

        <KanbanTab d={d} />

        <DisparoMassaModal d={d} />

        <DistribuicaoTab d={d} />
      </div>

      <CriarCampanhaModal d={d} />

      <SincronizarWhatsAppModal d={d} />

      <UploadZipModal d={d} />

      <SalvarCopyModal d={d} />

      <BibliotecaCopyModal d={d} />

      {/* MODAL DE ACOMPANHAMENTO EM TEMPO REAL (STREAM DISCO + POSTGRESQL + RAILWAY SAFE) */}
      <ZipImportProgressModal
        isOpen={showImportProgressModal}
        onClose={() => {
          setShowImportProgressModal(false);
          setImportProgressData(null);
        }}
        progressData={importProgressData}
        onCancelUpload={handleCancelImport}
        onViewBatch={(bId) => {
          setSelectedBatchId(bId);
          setShowImportProgressModal(false);
          fetchLeads();
        }}
      />
    </div>
  );
};
