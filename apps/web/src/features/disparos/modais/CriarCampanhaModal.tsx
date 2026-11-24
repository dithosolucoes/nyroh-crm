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


export function CriarCampanhaModal({ d }: { d: DisparosVM }) {
  const { showNewBatchModal, setShowNewBatchModal, newBatchName, setNewBatchName, newBatchHours, setNewBatchHours, handleCreateBatch } = d;
  return (
    <>
      {/* ========================================================= */}
      {/* MODAL: CRIAR NOVA CAMPANHA */}
      {/* ========================================================= */}
      {showNewBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-sm text-neutral-900">Criar Nova Campanha de Disparo</h3>
              </div>
              <button
                onClick={() => setShowNewBatchModal(false)}
                className="text-neutral-400 hover:text-neutral-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Nome da Campanha / Safra:
                </label>
                <input
                  type="text"
                  placeholder="Ex: Safra Restaurantes Jardins - 17/09"
                  value={newBatchName}
                  onChange={e => setNewBatchName(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-400 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Tempo Padrão de Quarentena:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[2, 4, 8, 24].map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setNewBatchHours(h)}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer ${
                        newBatchHours === h
                          ? 'bg-neutral-900 text-white border-neutral-900'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowNewBatchModal(false)}
                  className="px-3 py-1.5 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-50 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateBatch}
                  disabled={!newBatchName.trim()}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition disabled:opacity-40 cursor-pointer"
                >
                  Criar Campanha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
