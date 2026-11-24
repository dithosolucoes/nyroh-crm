import { apiFetch } from '../../../api/client';
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
import { AdminDispatchTestSandbox } from '../../../components/AdminDispatchTestSandbox';
import { ZipImportProgressModal, ImportProgressData } from '../../../components/ZipImportProgressModal';
import { PaginaSubirZip, ZipUploadRegistro } from '../../../components/PaginaSubirZip';
import { isUiFlagOn } from '@shared/lib/uiFlags';
import type { RespostaListaUploads, RespostaListaModelosFluxo, RespostaInstanciasFluxo, RespostaListaCopias, RespostaCopiaSalva, CopiaCampanha, RespostaListaLotes, RespostaVelocidadeDisparo, LoteCampanha, RespostaLiberacaoQuarentena, RespostaDevolucaoLeads } from '@shared/contracts/rotas';
import type { DisparosVM } from '../useDisparos';
import { DispatchStateLine, SHOW_SIMULATE } from '../base';

export function KanbanTab({ d }: { d: DisparosVM }) {
  const { onNavigateToWhatsApp, activeTab, batches, checkedBatchIds, setSelectedBatchId, leads, isDragOverStaging, setIsDragOverStaging, setStagingSelectedLeadIds, visibleStagingCount, setVisibleStagingCount, visibleColdCount, setVisibleColdCount, stagingZipInputRef, setShowSyncWhatsAppModal, setSyncWhatsAppResult, showNotification, handleUploadZip, handleSimulateLeadReply, handleOpenDispatchModal, handleMoveLeadStatus } = d;
  return (
    <>
        {/* ========================================================= */}
        {/* TAB 1: KANBAN DA CAMPANHA (FLUXO OFICIAL DE DISPAROS) */}
        {/* ========================================================= */}
        {activeTab === 'kanban' && (
          <div className="space-y-4">
            {/* Top Kanban Workflow Banner */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <Kanban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                    Fluxo de Disparo em Massa & Quarentena
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      Oficial Meta
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Etapa 1: Novos Leads do ZIP ➔ Clique em Disparar ➔ Escolha a quantidade e a copy ➔ Etapa 2: Em Espera ➔ Respostas vão para Etapa 3.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center flex-wrap gap-2 w-full md:w-auto">
                <input
                  type="file"
                  ref={stagingZipInputRef}
                  accept=".zip"
                  multiple
                  onChange={async e => {
                    // Vários ZIPs de uma vez: sobe um por vez, na ordem escolhida
                    const files = Array.from(e.target.files || []);
                    e.target.value = '';
                    for (const f of files) await handleUploadZip(f);
                  }}
                  className="hidden"
                />

              </div>
            </div>

            {/* Kanban Columns Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
              {/* ========================================================= */}
              {/* COLUNA 1: NOVOS LEADS (AGUARDANDO DISPARO) */}
              {/* ========================================================= */}
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragOverStaging(true);
                }}
                onDragLeave={() => setIsDragOverStaging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragOverStaging(false);
                  const zips = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.zip'));
                  if (zips.length > 0) {
                    (async () => { for (const f of zips) await handleUploadZip(f); })();
                  } else {
                    showNotification('error', 'Por favor, solte um arquivo .ZIP válido.');
                  }
                }}
                className={`border rounded-2xl p-3 flex flex-col gap-2 min-h-[550px] transition-all ${
                  isDragOverStaging
                    ? 'bg-emerald-50/90 border-emerald-400 ring-2 ring-emerald-500'
                    : 'bg-neutral-100/80 border-neutral-200'
                }`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="font-bold text-xs text-neutral-800">1. Novos Leads (Aguardando)</span>
                  </div>
                  <span className="bg-blue-100 text-blue-800 text-[11px] px-2 py-0.5 rounded-full font-mono font-bold">
                    {leads.filter(l => l.status === 'STAGING').length}
                  </span>
                </div>

                {/* Quick Column Action Button */}
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    onClick={() => handleOpenDispatchModal()}
                    disabled={leads.filter(l => l.status === 'STAGING').length === 0}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-300 text-white rounded-lg text-[11px] font-bold shadow-2xs transition cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    <span>⚡ Disparar Esta Etapa</span>
                  </button>

                  <button
                    onClick={() => stagingZipInputRef.current?.click()}
                    title="Adicionar mais leads via ZIP"
                    className="p-1.5 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-200 rounded-lg text-xs cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Dropzone Hint */}
                {isDragOverStaging && (
                  <div className="p-4 bg-emerald-100/80 border-2 border-dashed border-emerald-500 rounded-xl text-center text-xs font-bold text-emerald-800">
                    Solte o arquivo ZIP aqui para carregar os leads!
                  </div>
                )}

                {/* Staging Leads List */}
                <div className="flex-1 overflow-y-auto space-y-2 max-h-[600px] pr-1">
                  {leads.filter(l => l.status === 'STAGING').length === 0 ? (
                    <div className="text-center py-12 px-4 border-2 border-dashed border-neutral-200 rounded-xl bg-white/50">
                      <FileArchive className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-neutral-700">Nenhum lead aguardando</p>
                      <p className="text-[11px] text-neutral-500 mt-1">
                        Suba um arquivo ZIP ou arraste aqui para adicionar leads a esta etapa.
                      </p>
                      <button
                        onClick={() => stagingZipInputRef.current?.click()}
                        className="mt-3 px-3 py-1 bg-neutral-900 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                      >
                        + Subir ZIP de Leads
                      </button>
                    </div>
                  ) : (
                    <>
                      {leads.filter(l => l.status === 'STAGING').slice(0, visibleStagingCount).map(lead => (
                        <div
                          key={lead.id}
                          className="bg-white p-3 rounded-xl border border-neutral-200 hover:border-blue-300 hover:shadow-xs transition text-xs space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-bold text-neutral-900 truncate">{lead.name || 'Empresa / Lead'}</div>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              lead.isMobile ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-600'
                            }`}>
                              {lead.isMobile ? 'Celular' : 'Fixo'}
                            </span>
                            {checkedBatchIds.length > 0 && (
                              <span className="block text-[9px] text-neutral-500 truncate">{batches.find(b => b.id === lead.batchId)?.name || ''}</span>
                            )}
                          </div>

                          <div className="text-[11px] text-neutral-600 font-mono flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-neutral-400" />
                            <span>{lead.phoneNumber}</span>
                          </div>

                          {lead.niche && (
                            <div className="text-[10px] text-neutral-500 bg-neutral-50 px-2 py-0.5 rounded inline-block">
                              🏷️ {lead.niche}
                            </div>
                          )}

                          {lead.publicUrl && (
                            <a
                              href={lead.publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-semibold truncate block"
                            >
                              <Globe className="w-3 h-3 shrink-0" />
                              <span className="truncate">{lead.publicUrl}</span>
                            </a>
                          )}

                          <div className="pt-1.5 border-t border-neutral-100 flex items-center justify-between">
                            <span className="text-[10px] text-neutral-400">Pronto p/ disparo</span>
                            <button
                              onClick={() => {
                                setSelectedBatchId(lead.batchId);
                                setStagingSelectedLeadIds([lead.id]);
                                handleOpenDispatchModal(1);
                              }}
                              className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                            >
                              Disparar este lead ➔
                            </button>
                          </div>
                        </div>
                      ))}

                      {leads.filter(l => l.status === 'STAGING').length > visibleStagingCount && (
                        <div className="pt-2 pb-1 flex flex-col items-center gap-1.5 sticky bottom-0 bg-white/95 backdrop-blur-xs p-2 rounded-xl border border-neutral-200 shadow-2xs">
                          <button
                            onClick={() => setVisibleStagingCount(prev => prev + 250)}
                            className="w-full py-2 px-3 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>Exibindo {Math.min(visibleStagingCount, leads.filter(l => l.status === 'STAGING').length).toLocaleString('pt-BR')} de {leads.filter(l => l.status === 'STAGING').length.toLocaleString('pt-BR')} leads • Carregar +250 cards</span>
                          </button>
                          <button
                            onClick={() => setVisibleStagingCount(leads.filter(l => l.status === 'STAGING').length)}
                            className="text-[11px] text-blue-600 hover:underline font-semibold cursor-pointer"
                          >
                            Mostrar todos os {leads.filter(l => l.status === 'STAGING').length.toLocaleString('pt-BR')} cards
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* ========================================================= */}
              {/* COLUNA 2: DISPARADOS (EM ESPERA / QUARENTENA) */}
              {/* ========================================================= */}
              <div className="bg-amber-50/40 border border-amber-200/80 rounded-2xl p-3 flex flex-col gap-2 min-h-[550px]">
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 border-b border-amber-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="font-bold text-xs text-amber-900">2. Disparados (Em Espera)</span>
                  </div>
                  <span className="bg-amber-100 text-amber-900 text-[11px] px-2 py-0.5 rounded-full font-mono font-bold">
                    {leads.filter(l => l.status === 'QUARENTENA' || l.status === 'DISPARADO').length}
                  </span>
                </div>

                <p className="text-[11px] text-amber-800/80 leading-tight">
                  Mensagens enviadas via Meta. Aguardando interação do cliente na janela de 24h.
                </p>

                {/* Botão de Sincronização / Reciclagem WhatsApp Web */}
                <button
                  onClick={() => {
                    setSyncWhatsAppResult(null);
                    setShowSyncWhatsAppModal(true);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 bg-white hover:bg-teal-50 border border-teal-300 text-teal-800 rounded-xl text-[11px] font-bold shadow-2xs transition cursor-pointer"
                  title="Cruzar com chats reais do WhatsApp Web: confirma enviados, isola fixos e recicla não disparados"
                >
                  <RefreshCw className="w-3 h-3 text-teal-600" />
                  <span>Sincronizar com WhatsApp Web</span>
                </button>

                {/* Dispatched Leads List */}
                <div className="flex-1 overflow-y-auto space-y-2 max-h-[600px] pr-1">
                  {leads.filter(l => l.status === 'QUARENTENA' || l.status === 'DISPARADO').length === 0 ? (
                    <div className="text-center py-12 px-4 border-2 border-dashed border-amber-200 rounded-xl bg-white/60">
                      <Clock className="w-8 h-8 text-amber-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-amber-900">Nenhum disparo em espera</p>
                      <p className="text-[11px] text-amber-700 mt-1">
                        Dispare leads da Etapa 1 para que entrem neste processo de espera.
                      </p>
                    </div>
                  ) : (
                    leads.filter(l => l.status === 'QUARENTENA' || l.status === 'DISPARADO').map(lead => (
                      <div
                        key={lead.id}
                        className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs text-xs space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-bold text-neutral-900 truncate">{lead.name || 'Lead'}</div>
                          <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            Em Espera
                          </span>
                        </div>

                        <div className="text-[11px] text-neutral-600 font-mono">{lead.phoneNumber}</div>

                        <DispatchStateLine lead={lead} />

                        <div className="pt-1 border-t border-neutral-100 flex items-center justify-between">
                                                    {SHOW_SIMULATE && (
<button
                            onClick={() => handleSimulateLeadReply(lead.id, true)}
                            className="text-[10px] font-bold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Flame className="w-3 h-3" />
                            Simular Resposta 🔥
                          </button>
                          )}

                          <button
                            onClick={() => handleMoveLeadStatus(lead.id, 'FRIO', 'Sem resposta no prazo.')}
                            className="text-[10px] font-medium text-neutral-400 hover:text-neutral-600 cursor-pointer"
                          >
                            Expirar ➔
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ========================================================= */}
              {/* COLUNA 3: RESPONDEU NO WHATSAPP (INTERESSADOS 🔥) */}
              {/* ========================================================= */}
              <div className="bg-rose-50/40 border border-rose-200/80 rounded-2xl p-3 flex flex-col gap-2 min-h-[550px]">
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 border-b border-rose-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    <span className="font-bold text-xs text-rose-900">3. Respondeu no WhatsApp 🔥</span>
                  </div>
                  <span className="bg-rose-100 text-rose-900 text-[11px] px-2 py-0.5 rounded-full font-mono font-bold">
                    {leads.filter(l => l.status === 'INTERESSADO').length}
                  </span>
                </div>

                <p className="text-[11px] text-rose-800/80 leading-tight">
                  Clientes que responderam à copy enviada! Retidos com Thomas para fechamento.
                </p>

                {/* Hot Leads List */}
                <div className="flex-1 overflow-y-auto space-y-2 max-h-[600px] pr-1">
                  {leads.filter(l => l.status === 'INTERESSADO').length === 0 ? (
                    <div className="text-center py-12 px-4 border-2 border-dashed border-rose-200 rounded-xl bg-white/60">
                      <Flame className="w-8 h-8 text-rose-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-rose-900">Aguardando primeiras respostas</p>
                      <p className="text-[11px] text-rose-700 mt-1">
                        Assim que o lead responder no WhatsApp oficial, o card aparecerá aqui em tempo real.
                      </p>
                    </div>
                  ) : (
                    leads.filter(l => l.status === 'INTERESSADO').map(lead => (
                      <div
                        key={lead.id}
                        className="bg-white p-3 rounded-xl border border-rose-300 shadow-xs text-xs space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-bold text-neutral-900 truncate">{lead.name || 'Lead Interessado'}</div>
                          <span className="text-[9px] bg-rose-600 text-white font-bold px-1.5 py-0.5 rounded">
                            Quente
                          </span>
                        </div>

                        <div className="text-[11px] text-neutral-600 font-mono">{lead.phoneNumber}</div>

                        {/* Speech bubble with lead's reply */}
                        <div className="p-2.5 bg-rose-50/90 rounded-xl border border-rose-200 text-[11px] text-neutral-800 italic relative">
                          <span className="font-bold text-rose-900 not-italic block text-[10px] mb-0.5">
                            Resposta do Lead:
                          </span>
                          "{lead.responsePreview || 'Olá! Gostei da proposta do site. Como funciona para ativarmos?'}"
                        </div>

                        <div className="pt-1 flex flex-col gap-1.5">
                          <button
                            onClick={() => onNavigateToWhatsApp?.(lead.id, 'seller-thomas')}
                            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Atender no WhatsApp do Thomas</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ========================================================= */}
              {/* COLUNA 4: SEM RESPOSTA / FRIO */}
              {/* ========================================================= */}
              <div className="bg-sky-50/40 border border-sky-200/80 rounded-2xl p-3 flex flex-col gap-2 min-h-[550px]">
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 border-b border-sky-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-500" />
                    <span className="font-bold text-xs text-sky-900">4. Sem Resposta (Frio)</span>
                  </div>
                  <span className="bg-sky-100 text-sky-900 text-[11px] px-2 py-0.5 rounded-full font-mono font-bold">
                    {leads.filter(l => l.status === 'FRIO' || l.status === 'DESCARTADO').length}
                  </span>
                </div>

                <p className="text-[11px] text-sky-800/80 leading-tight">
                  Não responderam no WhatsApp dentro da quarentena. Liberados para ligação.
                </p>

                {/* Cold Leads List */}
                <div className="flex-1 overflow-y-auto space-y-2 max-h-[600px] pr-1">
                  {leads.filter(l => l.status === 'FRIO' || l.status === 'DESCARTADO').length === 0 ? (
                    <div className="text-center py-12 px-4 border-2 border-dashed border-sky-200 rounded-xl bg-white/60">
                      <Snowflake className="w-8 h-8 text-sky-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-sky-900">Nenhum lead expirado</p>
                      <p className="text-[11px] text-sky-700 mt-1">
                        Leads que não responderem no prazo aparecerão aqui para discagem da equipe.
                      </p>
                    </div>
                  ) : (
                    <>
                      {leads.filter(l => l.status === 'FRIO' || l.status === 'DESCARTADO').slice(0, visibleColdCount).map(lead => (
                        <div
                          key={lead.id}
                          className="bg-white p-3 rounded-xl border border-sky-200 shadow-2xs text-xs space-y-2"
                        >
                          <div className="font-bold text-neutral-900 truncate">{lead.name}</div>
                          <div className="text-[11px] text-neutral-500 font-mono">{lead.phoneNumber}</div>
                          <div className="text-[10px] text-sky-700 bg-sky-50 px-2 py-1 rounded font-medium">
                            📞 Disponível para Ligação Telefônica
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-neutral-100">
                            <button
                              onClick={() => handleMoveLeadStatus(lead.id, 'STAGING')}
                              className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                            >
                              ↩️ Voltar para Etapa 1
                            </button>
                          </div>
                        </div>
                      ))}

                      {leads.filter(l => l.status === 'FRIO' || l.status === 'DESCARTADO').length > visibleColdCount && (
                        <div className="pt-2 pb-1 flex flex-col items-center gap-1.5 sticky bottom-0 bg-white/95 backdrop-blur-xs p-2 rounded-xl border border-sky-200 shadow-2xs">
                          <button
                            onClick={() => setVisibleColdCount(prev => prev + 250)}
                            className="w-full py-2 px-3 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>Exibindo {Math.min(visibleColdCount, leads.filter(l => l.status === 'FRIO' || l.status === 'DESCARTADO').length).toLocaleString('pt-BR')} de {leads.filter(l => l.status === 'FRIO' || l.status === 'DESCARTADO').length.toLocaleString('pt-BR')} leads • Carregar +250</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
    </>
  );
}
