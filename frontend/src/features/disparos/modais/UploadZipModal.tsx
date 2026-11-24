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


export function UploadZipModal({ d }: { d: DisparosVM }) {
  const { leads, isUploading, showUploadZipModal, setShowUploadZipModal, fileInputRef, setShowSyncWhatsAppModal, handleUploadZip } = d;
  return (
    <>
      {/* ========================================================= */}
      {/* MODAL: UPLOAD ZIP PARA STAGING */}
      {/* ========================================================= */}
      {showUploadZipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-sm text-neutral-900">Subir ZIP para Staging</h3>
              </div>
              <button
                onClick={() => setShowUploadZipModal(false)}
                className="text-neutral-400 hover:text-neutral-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl flex items-center justify-between gap-2">
                <div className="text-xs text-teal-900">
                  <span className="font-bold block">Quer subir o arquivo JSON do WhatsApp?</span>
                  <span className="text-[11px] text-teal-700">Para cruzar com o WhatsApp Web e reciclar a safra, use o sincronizador.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadZipModal(false);
                    setShowSyncWhatsAppModal(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shrink-0 cursor-pointer shadow-2xs"
                >
                  Abrir Sincronizador
                </button>
              </div>

              <p className="text-xs text-neutral-500 leading-relaxed">
                Selecione o arquivo .ZIP ou .JSON com os leads da Nyroh. O sistema extrairá automaticamente os dados, validará os telefones celulares e isolará os leads em Staging.
              </p>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-neutral-300 hover:border-neutral-400 rounded-xl p-8 text-center cursor-pointer bg-neutral-50 transition"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.json,application/zip,application/json,application/x-zip-compressed,*/*"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      handleUploadZip(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
                <FileArchive className="w-10 h-10 text-neutral-400 mx-auto mb-2" />
                <span className="text-xs font-bold text-neutral-800 block">
                  {isUploading ? 'Processando e enviando arquivo...' : 'Clique para selecionar o arquivo .ZIP ou .JSON'}
                </span>
                <span className="text-[11px] text-neutral-400 mt-1 block">
                  Os leads não serão distribuídos para os vendedores imediatamente.
                </span>
              </div>

              {isUploading && (
                <div className="flex items-center justify-center gap-2 text-xs text-blue-600 font-bold">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Extraindo leads e validando contatos...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
