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


export function SincronizarWhatsAppModal({ d }: { d: DisparosVM }) {
  const { showSyncWhatsAppModal, setShowSyncWhatsAppModal, syncWhatsAppInput, setSyncWhatsAppInput, isSyncingWhatsApp, syncWhatsAppResult, setSyncWhatsAppResult, syncJsonFileInputRef, handleSyncWhatsAppWeb, handleSyncFileSelect } = d;
  return (
    <>
      {/* ========================================================= */}
      {/* MODAL: SINCRONIZAR WHATSAPP WEB & RECICLAR NÃO DISPARADOS */}
      {/* ========================================================= */}
      {showSyncWhatsAppModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-teal-600" />
                <div>
                  <h3 className="font-bold text-sm text-neutral-900">Sincronizar Safra com WhatsApp Web</h3>
                  <p className="text-[11px] text-neutral-500">Cruza chats reais: confirma disparos, isola fixos e recicla não disparados para a 1ª Etapa</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowSyncWhatsAppModal(false);
                  setSyncWhatsAppResult(null);
                }}
                className="text-neutral-400 hover:text-neutral-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {syncWhatsAppResult ? (
              <div className="space-y-4">
                <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl">
                  <div className="flex items-center gap-2 text-teal-900 font-bold text-sm mb-2">
                    <CheckCircle2 className="w-5 h-5 text-teal-600" />
                    <span>Sincronização e Reciclagem Realizadas com Sucesso!</span>
                  </div>
                  <p className="text-xs text-teal-800 leading-relaxed">
                    O sistema analisou todos os contatos da safra contra o WhatsApp Web e realizou a distribuição inteligente:
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
                    <div className="bg-white p-3 rounded-xl border border-teal-200 text-center shadow-2xs">
                      <span className="text-[10px] text-neutral-500 uppercase font-bold block">Confirmados</span>
                      <span className="text-xl font-black text-teal-700">{syncWhatsAppResult.confirmedDispatched}</span>
                      <span className="text-[10px] text-neutral-400 block">Mantidos em Espera</span>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-emerald-200 text-center shadow-2xs">
                      <span className="text-[10px] text-emerald-600 uppercase font-bold block">Reciclados (Etapa 1)</span>
                      <span className="text-xl font-black text-emerald-700">{syncWhatsAppResult.recycledToStaging}</span>
                      <span className="text-[10px] text-emerald-600 font-medium block">Prontos para Disparar</span>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-amber-200 text-center shadow-2xs">
                      <span className="text-[10px] text-amber-700 uppercase font-bold block">Fixos (Etapa 4)</span>
                      <span className="text-xl font-black text-amber-800">{syncWhatsAppResult.movedToLandlines}</span>
                      <span className="text-[10px] text-neutral-400 block">Para Ligação Ativa</span>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-purple-200 text-center shadow-2xs">
                      <span className="text-[10px] text-purple-700 uppercase font-bold block">Já Responderam</span>
                      <span className="text-xl font-black text-purple-800">{syncWhatsAppResult.alreadyResponded}</span>
                      <span className="text-[10px] text-purple-600 font-medium block">Interessados Salvos</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      setShowSyncWhatsAppModal(false);
                      setSyncWhatsAppResult(null);
                    }}
                    className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                  >
                    OK, Fechar e Ver Kanban Atualizado
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-600 leading-relaxed">
                  <strong className="text-neutral-900 block mb-1">Como funciona a Reciclagem Inteligente:</strong>
                  Cole abaixo o JSON capturado pelo seu script no WhatsApp Web (ou selecione um arquivo <code className="bg-neutral-200 px-1 py-0.5 rounded text-[11px]">.json</code>).
                  O sistema vai:
                  <ul className="list-disc pl-4 mt-1.5 space-y-0.5 text-neutral-600 text-[11px]">
                    <li><strong className="text-teal-700">Manter intactos</strong> os contatos que constam no WhatsApp Web (sem duplicar mensagem).</li>
                    <li><strong className="text-emerald-700">Devolver à 1ª Etapa (Novos Leads / Aguardando)</strong> todos os celulares que NÃO receberam mensagem.</li>
                    <li><strong className="text-amber-700">Mover para Ligação Telefônica</strong> todos os 640 telefones comerciais fixos (que não usam WhatsApp).</li>
                  </ul>
                </div>

                <div>
                  {/* Botão Dropzone Destacado para Selecionar o Arquivo JSON */}
                  <div
                    onClick={() => syncJsonFileInputRef.current?.click()}
                    className="border-2 border-dashed border-teal-300 hover:border-teal-500 rounded-2xl p-5 text-center cursor-pointer bg-teal-50/60 hover:bg-teal-50 transition group mb-3 shadow-2xs"
                  >
                    <FileText className="w-8 h-8 text-teal-600 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-teal-950 block">
                      📁 Clique aqui para selecionar o arquivo .JSON do seu computador
                    </span>
                    <span className="text-[11px] text-teal-700 mt-1 block">
                      Aceita arquivos .json, .txt ou lista de contatos do WhatsApp (Sem restrição de pasta)
                    </span>
                  </div>

                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-neutral-700 flex items-center gap-1.5">
                      <span>Ou cole o texto do JSON diretamente abaixo:</span>
                      {syncWhatsAppInput.trim() && (
                        <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                          {(() => {
                            try {
                              const parsed = JSON.parse(syncWhatsAppInput.trim());
                              return Array.isArray(parsed) ? `${parsed.length} itens detectados` : 'JSON válido';
                            } catch {
                              return `${syncWhatsAppInput.trim().split('\n').length} linhas`;
                            }
                          })()}
                        </span>
                      )}
                    </label>

                    <div className="flex items-center gap-2">
                      <input
                        ref={syncJsonFileInputRef}
                        type="file"
                        accept=".json,.txt,application/json,text/plain,*/*"
                        onChange={handleSyncFileSelect}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => syncJsonFileInputRef.current?.click()}
                        className="text-[11px] font-bold text-teal-700 hover:text-teal-900 bg-teal-100/70 hover:bg-teal-100 px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition"
                      >
                        <Upload className="w-3 h-3" />
                        <span>Escolher Arquivo .JSON</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={7}
                    placeholder={'Cole o JSON aqui, exemplo:\n[\n  { "nome": "+55 11 98349-3189" },\n  { "nome": "Deline Pisos" },\n  { "nome": "Chez Home" }\n]'}
                    value={syncWhatsAppInput}
                    onChange={e => setSyncWhatsAppInput(e.target.value)}
                    className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono text-neutral-800 focus:outline-none focus:border-teal-500 focus:bg-white resize-y"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setSyncWhatsAppInput('')}
                    className="text-xs text-neutral-400 hover:text-neutral-600 cursor-pointer font-medium"
                  >
                    Limpar texto
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSyncWhatsAppModal(false)}
                      className="px-3.5 py-1.5 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-50 text-xs font-bold transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={isSyncingWhatsApp || !syncWhatsAppInput.trim()}
                      onClick={handleSyncWhatsAppWeb}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                    >
                      {isSyncingWhatsApp ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Processando cruzamento...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Executar Sincronização & Reciclagem</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
