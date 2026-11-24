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


export function SafrasTab({ d }: { d: DisparosVM }) {
  const { activeTab, setActiveTab, batches, setSelectedBatchId, leads, isUploading, searchQuery, setSearchQuery, statusFilter, setStatusFilter, setShowNewBatchModal, paginaSubirZip, setPaginaSubirZip, zipUploads, zipUploadsCarregando, carregarHistoricoZips, importProgressData, fetchLeads, currentBatch, handleDeleteBatch, handleUploadZip, handleSimulateLeadReply, safraMetrics } = d;
  return (
    <>
        {/* ========================================================= */}
        {/* TAB 1: SAFRAS & CAMPANHAS (Staging de Importação) */}
        {/* ========================================================= */}
        {activeTab === 'safras' && paginaSubirZip && (
          <PaginaSubirZip
            onVoltar={() => setPaginaSubirZip(false)}
            onEscolherArquivo={(f) => handleUploadZip(f)}
            progresso={importProgressData}
            enviando={isUploading}
            historico={zipUploads}
            carregandoHistorico={zipUploadsCarregando}
            onAtualizarHistorico={carregarHistoricoZips}
            onAbrirSafra={(bId) => { setSelectedBatchId(bId); setPaginaSubirZip(false); fetchLeads(); }}
          />
        )}
        {activeTab === 'safras' && !paginaSubirZip && (
          <div className="flex flex-col gap-6">
            {/* KPI Metrics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between text-neutral-500 mb-1">
                  <span className="text-xs font-semibold">Total de Campanhas</span>
                  <Layers className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-neutral-900">{batches.length}</div>
                <div className="text-[11px] text-neutral-400 mt-1">Safras cadastradas</div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between text-neutral-500 mb-1">
                  <span className="text-xs font-semibold">Leads em Staging</span>
                  <FileArchive className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-2xl font-bold text-amber-700">{safraMetrics.staging}</div>
                <div className="text-[11px] text-neutral-400 mt-1">Aguardando disparo</div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between text-neutral-500 mb-1">
                  <span className="text-xs font-semibold">Contatos Aptos (WhatsApp)</span>
                  <Phone className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold text-emerald-700">{safraMetrics.staging}</div>
                <div className="text-[11px] text-neutral-500 mt-1">{safraMetrics.validMobiles} celulares • {safraMetrics.landlines} fixos/comerciais</div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between text-neutral-500 mb-1">
                  <span className="text-xs font-semibold">Com Site Novo Nyroh</span>
                  <Globe className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-blue-700">{safraMetrics.withNyroh}</div>
                <div className="text-[11px] text-neutral-400 mt-1">Prévia pronta para envio</div>
              </div>
            </div>

            {/* If zero batches, show clean empty state */}
            {batches.length === 0 ? (
              <div className="bg-white border border-neutral-200 rounded-2xl p-12 text-center max-w-xl mx-auto shadow-2xs">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 border border-blue-200">
                  <FileArchive className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-neutral-900 mb-1">
                  Nenhuma campanha criada ainda
                </h3>
                <p className="text-xs text-neutral-500 mb-6 leading-relaxed">
                  Crie sua primeira campanha para carregar leads via ZIP, filtrar celulares válidos e efetuar disparos oficiais via Meta Cloud API com quarentena automática.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setShowNewBatchModal(true)}
                    className="px-4 py-2 bg-neutral-900 hover:bg-black text-white text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer"
                  >
                    + Criar Primeira Campanha
                  </button>
                  <button
                    onClick={() => setPaginaSubirZip(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Subir Arquivo ZIP</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Active Campaign Info Header */}
                {currentBatch && (
                  <div className="bg-white border border-neutral-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-neutral-900">
                          {currentBatch.name}
                        </h2>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          currentBatch.status === 'draft'
                            ? 'bg-neutral-100 text-neutral-700 border-neutral-300'
                            : currentBatch.status === 'quarantine'
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        }`}>
                          {currentBatch.status === 'draft' ? 'Em Preparação (Staging)' : currentBatch.status === 'quarantine' ? 'Em Quarentena' : 'Concluída'}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        Template: <strong>{currentBatch.templateName}</strong> • Quarentena configurada: <strong>{currentBatch.quarantineHours} horas</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveTab('montador')}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Configurar & Disparar Safra</span>
                      </button>

                      <button
                        onClick={() => handleDeleteBatch(currentBatch.id)}
                        className="p-2 rounded-xl border border-neutral-200 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title="Excluir esta safra"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Leads Filter & Search Bar */}
                <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                  <div className="relative flex-1 min-w-[240px]">
                    <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Filtrar por nome, telefone ou nicho..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-800 focus:outline-none focus:border-neutral-400"
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-neutral-500 font-semibold">Status:</span>
                    <select
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value)}
                      className="bg-neutral-50 border border-neutral-200 text-neutral-800 text-xs font-medium rounded-xl px-2.5 py-1.5 focus:outline-none cursor-pointer"
                    >
                      <option value="ALL">Todos os Leads ({leads.length})</option>
                      <option value="STAGING">Aguardando disparo</option>
                      <option value="DISPARADO">Disparados</option>
                      <option value="QUARENTENA">Em Quarentena</option>
                      <option value="ERRO_VARIAVEL">⚠️ Não enviados (dado faltando na copy)</option>
                      <option value="INTERESSADO">🔥 Interessados (Responderam)</option>
                      <option value="FRIO">❄️ Frios (Sem Resposta)</option>
                      <option value="DESCARTADO">🛑 Descartados (Opt-out / Inválidos)</option>
                    </select>

                    <button
                      onClick={fetchLeads}
                      className="p-1.5 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-50 transition"
                      title="Atualizar lista"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Staging Leads Table */}
                <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-neutral-50/80 border-b border-neutral-200 text-neutral-600 font-bold uppercase tracking-wider text-[11px]">
                          <th className="py-3 px-4">Empresa / Lead</th>
                          <th className="py-3 px-4">Telefone</th>
                          <th className="py-3 px-4">Tipo</th>
                          <th className="py-3 px-4">Site Nyroh Novo</th>
                          <th className="py-3 px-4">Site do cliente</th>
                          <th className="py-3 px-4">Status da Campanha</th>
                          <th className="py-3 px-4 text-right">Ações Rápidas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {leads.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-neutral-400">
                              Nenhum lead encontrado nesta safra. Faça o upload de um arquivo ZIP acima.
                            </td>
                          </tr>
                        ) : (
                          leads.map(lead => (
                            <tr key={lead.id} className="hover:bg-neutral-50/60 transition-colors">
                              <td className="py-3 px-4 font-bold text-neutral-900">
                                {lead.name}
                                {lead.niche && (
                                  <span className="block text-[11px] text-neutral-400 font-normal">
                                    {lead.niche}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono text-neutral-700">
                                {lead.phoneNumber}
                              </td>
                              <td className="py-3 px-4">
                                {lead.isMobile ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                    <Smartphone className="w-3 h-3" />
                                    <span>Celular WhatsApp</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                                    <Phone className="w-3 h-3" />
                                    <span>Fixo WhatsApp Business</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                {lead.publicUrl ? (
                                  <a
                                    href={lead.publicUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold"
                                  >
                                    <Globe className="w-3 h-3" />
                                    <span>Ver Prévia</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                ) : (
                                  <span className="text-neutral-400 text-[11px]">-</span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                {lead.website ? (
                                  <a
                                    href={lead.website}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-neutral-600 hover:text-neutral-900 truncate max-w-[140px] block"
                                  >
                                    {lead.website.replace(/^https?:\/\//, '')}
                                  </a>
                                ) : (
                                  <span className="text-neutral-400 text-[11px]">-</span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`inline-block px-2 py-0.5 rounded-md font-bold text-[10px] border ${
                                  lead.status === 'STAGING'
                                    ? 'bg-neutral-100 text-neutral-700 border-neutral-300'
                                    : lead.status === 'QUARENTENA'
                                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                                    : lead.status === 'INTERESSADO'
                                    ? 'bg-rose-50 text-rose-700 border-rose-300 font-black'
                                    : lead.status === 'FRIO'
                                    ? 'bg-sky-50 text-sky-700 border-sky-300'
                                    : 'bg-neutral-100 text-neutral-500 border-neutral-200'
                                }`}>
                                  {lead.status === 'STAGING'
                                    ? '📦 Staging'
                                    : lead.status === 'QUARENTENA'
                                    ? '⏳ Quarentena'
                                    : lead.status === 'INTERESSADO'
                                    ? '🔥 Interessado'
                                    : lead.status === 'FRIO'
                                    ? '❄️ Frio'
                                    : lead.status}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleSimulateLeadReply(lead.id, true)}
                                    className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold rounded-lg border border-amber-300 transition cursor-pointer"
                                    title="Simular que este lead respondeu com interesse"
                                  >
                                    Simular 🔥
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
    </>
  );
}
