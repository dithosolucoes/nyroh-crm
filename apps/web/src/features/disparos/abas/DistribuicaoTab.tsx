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


export function DistribuicaoTab({ d }: { d: DisparosVM }) {
  const { salespeople, activeTab, leads, retainHotForAdmin, setRetainHotForAdmin, onlyColdLeads, setOnlyColdLeads, sellerQuotas, setSellerQuotas, isDistributing, handleDistributeToClosers, handleReleaseQuarantine } = d;
  return (
    <>
        {/* ========================================================= */}
        {/* TAB 5: DISTRIBUIÇÃO PARA EQUIPE */}
        {/* ========================================================= */}
        {activeTab === 'distribuicao' && (
          <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-2xs max-w-3xl">
            <div className="flex items-center gap-2 mb-2">
              <Share2 className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-sm text-neutral-900">
                Distribuição de Leads para os Vendedores
              </h3>
            </div>
            <p className="text-xs text-neutral-500 mb-4 leading-relaxed">
              Distribua os leads restantes desta safra entre os vendedores cadastrados para dar prosseguimento via ligação e discagem telefônica.
            </p>

            {/* Disponibilidade de Leads */}
            {(() => {
              const coldCount = leads.filter(l => l.isMobile && l.status === 'FRIO').length;
              const quarantineCount = leads.filter(l => l.isMobile && (l.status === 'QUARENTENA' || l.status === 'DISPARADO')).length;
              const totalQuotas = Object.values(sellerQuotas).reduce((a, b) => a + (Number(b) || 0), 0);

              return (
                <div className="mb-4 p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-blue-950">Status dos Leads da Safra:</span>
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold font-mono">
                        {coldCount} Frios (Sem Resposta)
                      </span>
                      {quarantineCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold font-mono">
                          {quarantineCount} em Quarentena
                        </span>
                      )}
                    </div>

                    <div className="font-bold text-neutral-800">
                      Total configurado nas cotas: <strong className="text-blue-700 font-mono">{totalQuotas} leads</strong>
                    </div>
                  </div>

                  {quarantineCount > 0 && coldCount === 0 && (
                    <div className="pt-2 border-t border-blue-200/60 flex items-center justify-between">
                      <span className="text-amber-800 text-[11px]">
                        💡 Há {quarantineCount} leads em espera. Deseja liberá-los agora para distribuição aos vendedores?
                      </span>
                      <button
                        type="button"
                        onClick={handleReleaseQuarantine}
                        className="px-3 py-1 bg-neutral-900 hover:bg-black text-white text-[11px] font-bold rounded-lg shadow-2xs transition cursor-pointer"
                      >
                        Liberar {quarantineCount} Leads Agora
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="space-y-4">
              {/* Hot Leads Retention Policy */}
              <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-bold text-xs text-rose-900 flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-rose-600" />
                    <span>Reter 100% dos Leads Quentes com o Thomas</span>
                  </div>
                  <div className="text-[11px] text-rose-700 mt-0.5">
                    Leads que responderam positivamente no WhatsApp são fechados diretamente pelo Super Closer.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={retainHotForAdmin}
                  onChange={e => setRetainHotForAdmin(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
                />
              </div>

              {/* Only Cold Leads Checkbox */}
              <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-bold text-xs text-neutral-900">
                    Distribuir Apenas Leads Frios (Sem Resposta)
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">
                    Repassa para a equipe apenas os contatos que não interagiram no WhatsApp para abordagem ativa por voz.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={onlyColdLeads}
                  onChange={e => setOnlyColdLeads(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
                />
              </div>

              {/* Salespeople Quota Allocator */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-2">
                  Cota de Leads por Vendedor:
                </label>
                <div className="space-y-2">
                  {salespeople.map(seller => (
                    <div
                      key={seller.id}
                      className="p-3 bg-white border border-neutral-200 rounded-xl flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: seller.color || '#0284c7' }}
                        />
                        <span className="font-bold text-xs text-neutral-900">{seller.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-neutral-500">Cota:</span>
                        <input
                          type="number"
                          min="0"
                          max="200"
                          value={sellerQuotas[seller.id] || 15}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 0;
                            setSellerQuotas(prev => ({ ...prev, [seller.id]: val }));
                          }}
                          className="w-16 px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-mono text-center font-bold focus:outline-none focus:border-neutral-400"
                        />
                        <span className="text-xs text-neutral-400">leads</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-3">
                <button
                  onClick={handleDistributeToClosers}
                  disabled={isDistributing}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>
                    {isDistributing ? 'Distribuindo Leads...' : 'Executar Distribuição para Pipeline Ativo'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
    </>
  );
}
