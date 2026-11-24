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


export function BibliotecaCopyModal({ d }: { d: DisparosVM }) {
  const { copyTemplates, selectedCopyTemplateId, showLibraryModal, setShowLibraryModal, handleSelectCopyTemplate, handleDeleteCopyTemplate } = d;
  return (
    <>
      {/* ========================================================= */}
      {/* MODAL: BIBLIOTECA COMPLETA DE TEMPLATES DE COPY */}
      {/* ========================================================= */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 max-w-2xl w-full shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-sm text-neutral-900">
                  Biblioteca de Templates de Mensagem ({copyTemplates.length})
                </h3>
              </div>
              <button
                onClick={() => setShowLibraryModal(false)}
                className="text-neutral-400 hover:text-neutral-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-500 mb-4 leading-relaxed shrink-0">
              Aqui estão todos os seus templates de copy e abordagens comerciais. Clique em <strong>Usar Este Template</strong> para carregar as variáveis no montador de disparo oficial.
            </p>

            <div className="overflow-y-auto space-y-3 flex-1 pr-1">
              {copyTemplates.map(copy => (
                <div
                  key={copy.id}
                  className={`p-4 rounded-xl border transition-all ${
                    selectedCopyTemplateId === copy.id
                      ? 'border-blue-500 bg-blue-50/20 shadow-2xs'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-neutral-900">{copy.name}</span>
                        {copy.isDefault && (
                          <span className="text-[9px] bg-neutral-100 text-neutral-600 font-bold px-1.5 py-0.5 rounded border border-neutral-200">
                            PADRÃO
                          </span>
                        )}
                        <span className="text-[9px] uppercase bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">
                          {copy.category || 'prospeccao'}
                        </span>
                      </div>
                      {copy.description && (
                        <p className="text-[11px] text-neutral-500 mt-0.5">{copy.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectCopyTemplate(copy.id);
                          setShowLibraryModal(false);
                        }}
                        className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition cursor-pointer shadow-2xs"
                      >
                        Usar Este Template
                      </button>

                      {!copy.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCopyTemplate(copy.id, copy.name)}
                          className="p-1.5 text-neutral-400 hover:text-red-600 transition cursor-pointer rounded-lg hover:bg-neutral-100"
                          title="Excluir este template da biblioteca"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Visualização Rápida das 3 Variáveis */}
                  <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-100 text-[11px] space-y-1 text-neutral-700">
                    <div className="truncate">
                      <strong className="text-neutral-500">Var 1:</strong> {copy.var1}
                    </div>
                    <div className="truncate">
                      <strong className="text-neutral-500">Var 2:</strong> {copy.var2}
                    </div>
                    <div className="truncate">
                      <strong className="text-neutral-500">Var 3:</strong> {copy.var3}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-neutral-100 flex items-center justify-between mt-4 shrink-0">
              <span className="text-xs text-neutral-400">
                Total de {copyTemplates.length} modelo(s) salvos
              </span>
              <button
                type="button"
                onClick={() => setShowLibraryModal(false)}
                className="px-4 py-1.5 text-xs font-bold bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition cursor-pointer"
              >
                Fechar Biblioteca
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
