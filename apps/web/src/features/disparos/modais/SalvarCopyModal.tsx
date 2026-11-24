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


export function SalvarCopyModal({ d }: { d: DisparosVM }) {
  const { templateVar1, templateVar2, templateVar3, showSaveCopyModal, setShowSaveCopyModal, newCopyName, setNewCopyName, newCopyDesc, setNewCopyDesc, newCopyCategory, setNewCopyCategory, handleSaveCurrentAsCopyTemplate } = d;
  return (
    <>
      {/* ========================================================= */}
      {/* MODAL: SALVAR ATUAL COMO NOVO TEMPLATE DE COPY */}
      {/* ========================================================= */}
      {showSaveCopyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 max-w-lg w-full shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-sm text-neutral-900">Salvar Template de Mensagem (Copy)</h3>
              </div>
              <button
                onClick={() => setShowSaveCopyModal(false)}
                className="text-neutral-400 hover:text-neutral-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-neutral-500 leading-relaxed">
                Este modelo salvará o texto configurado nas 3 variáveis para você reutilizar em qualquer campanha de disparo com 1 clique.
              </p>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Nome do Template de Mensagem:
                </label>
                <input
                  type="text"
                  placeholder="Ex: Pitch Proativo - Site sem Pedir (Lucas)"
                  value={newCopyName}
                  onChange={e => setNewCopyName(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Categoria da Abordagem:
                </label>
                <select
                  value={newCopyCategory}
                  onChange={e => setNewCopyCategory(e.target.value as any)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 focus:outline-none cursor-pointer"
                >
                  <option value="prospeccao">Prospecção Fria / Primeiro Contato</option>
                  <option value="followup">Follow-up / Acompanhamento</option>
                  <option value="reativacao">Reativação de Base Antiga</option>
                  <option value="personalizado">Personalizado / Especial</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Descrição ou Objetivo (Opcional):
                </label>
                <input
                  type="text"
                  placeholder="Ex: Focado em quebrar padrão e pedir feedback sincero"
                  value={newCopyDesc}
                  onChange={e => setNewCopyDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Resumo das Variáveis */}
              <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200 space-y-2 text-[11px]">
                <div className="font-bold text-neutral-700 flex items-center justify-between">
                  <span>Conteúdo a ser salvo:</span>
                  <span className="text-blue-600 font-mono text-[10px]">3 Variáveis</span>
                </div>
                <div className="truncate text-neutral-600">
                  <strong>Var &#123;&#123;1&#125;&#125;:</strong> {templateVar1}
                </div>
                <div className="truncate text-neutral-600">
                  <strong>Var &#123;&#123;2&#125;&#125;:</strong> {templateVar2}
                </div>
                <div className="truncate text-neutral-600">
                  <strong>Var &#123;&#123;3&#125;&#125;:</strong> {templateVar3}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowSaveCopyModal(false)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 hover:text-neutral-900 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveCurrentAsCopyTemplate}
                  className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Salvar na Biblioteca</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
