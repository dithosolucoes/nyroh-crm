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


export function QuarentenaTab({ d }: { d: DisparosVM }) {
  const { activeTab, leads, quarantineUnit, setQuarantineUnit, quarantineOnReplyAction, setQuarantineOnReplyAction, quarantineOnExpireAction, setQuarantineOnExpireAction, quarantineCustomHours, setQuarantineCustomHours, dispatchQuarantineHours, setDispatchQuarantineHours, quarantineRemainingTime, handleReleaseQuarantine, handleSaveQuarantineConfig, safraMetrics } = d;
  return (
    <>
        {/* ========================================================= */}
        {/* TAB 4: QUARENTENA & ACESSO EXCLUSIVO */}
        {/* ========================================================= */}
        {activeTab === 'quarentena' && (
          <div className="flex flex-col gap-6">
            {/* Header & Status Card */}
            <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-neutral-200">
                <div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-600" />
                    <h3 className="font-bold text-base text-neutral-900">
                      Central de Configuração da Quarentena Exclusiva
                    </h3>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Defina o período de retenção pós-disparo, regras de atendimento do Thomas e automação de repasse de leads frios.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-center shadow-2xs">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                      Tempo Ativo Restante
                    </div>
                    <div className="text-lg font-bold text-amber-900 font-mono">
                      {quarantineRemainingTime}
                    </div>
                  </div>

                  <button
                    onClick={handleReleaseQuarantine}
                    className="px-4 py-2.5 bg-neutral-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Liberar Leads Agora</span>
                  </button>
                </div>
              </div>

              {/* Status Metric Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
                <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-xl">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900 mb-1">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    <span>Acesso Blindado (Mesa Thomas)</span>
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Visualização restrita apenas ao Admin/Thomas. Bloqueado para discadores e closers juniores até o término da janela.
                  </p>
                </div>

                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                      <Flame className="w-4 h-4 text-emerald-600" />
                      <span>Respostas Quentes (WhatsApp)</span>
                    </div>
                    <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                      Prioritário
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-emerald-800 mt-2 font-mono">{safraMetrics.hot} leads</div>
                  <p className="text-[11px] text-emerald-700 mt-1">
                    Retidos permanentemente com Thomas para fechamento com alta comissão.
                  </p>
                </div>

                <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-700">
                      <Snowflake className="w-4 h-4 text-blue-500" />
                      <span>Leads Frios em Espera</span>
                    </div>
                    <span className="text-xs font-bold bg-neutral-200 text-neutral-700 px-2 py-0.5 rounded-full">
                      Fila Quarentena
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-neutral-900 mt-2 font-mono">{safraMetrics.cold + safraMetrics.quarantine} leads</div>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Aguardando expiração do tempo configurado para entrar na roleta de discagem.
                  </p>
                </div>
              </div>
            </div>

            {/* Painel de Configurações Avançadas da Quarentena */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Coluna Esquerda: Tempo e Regras de Bloqueio (7 Cols) */}
              <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl p-6 shadow-2xs space-y-5">
                <div className="flex items-center gap-2 pb-3 border-b border-neutral-200">
                  <Settings className="w-4 h-4 text-blue-600" />
                  <h4 className="font-bold text-sm text-neutral-900">
                    1. Parâmetros de Tempo da Quarentena
                  </h4>
                </div>

                {/* Seletor rápido de tempo */}
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-2">
                    Duração Padrão por Disparo:
                  </label>
                  <div className="grid grid-cols-4 gap-2.5">
                    {[
                      { val: 2, label: '2 horas', desc: 'Disparo Rápido' },
                      { val: 4, label: '4 horas', desc: 'Turno Comercial' },
                      { val: 8, label: '8 horas', desc: 'Dia Inteiro' },
                      { val: 24, label: '24 horas', desc: 'Janela Completa' }
                    ].map(item => (
                      <button
                        key={item.val}
                        type="button"
                        onClick={() => {
                          setDispatchQuarantineHours(item.val);
                          setQuarantineCustomHours(item.val);
                          setQuarantineUnit('hours');
                        }}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          dispatchQuarantineHours === item.val
                            ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                            : 'bg-white hover:bg-neutral-50 text-neutral-800 border-neutral-200'
                        }`}
                      >
                        <div className="font-bold text-xs">{item.label}</div>
                        <div className={`text-[10px] mt-0.5 ${dispatchQuarantineHours === item.val ? 'text-neutral-400' : 'text-neutral-500'}`}>
                          {item.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Time Control */}
                <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
                  <div className="text-xs font-bold text-neutral-800">
                    Definir Duração Personalizada:
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-600 font-semibold">Valor:</span>
                      <input
                        type="number"
                        min={1}
                        max={quarantineUnit === 'hours' ? 168 : 14}
                        value={quarantineCustomHours}
                        onChange={e => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          setQuarantineCustomHours(val);
                          setDispatchQuarantineHours(quarantineUnit === 'days' ? val * 24 : val);
                        }}
                        className="w-24 px-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs font-bold text-neutral-900 text-center focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-600 font-semibold">Unidade:</span>
                      <div className="flex items-center border border-neutral-300 rounded-lg overflow-hidden bg-white">
                        <button
                          type="button"
                          onClick={() => {
                            setQuarantineUnit('hours');
                            setDispatchQuarantineHours(quarantineCustomHours);
                          }}
                          className={`px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                            quarantineUnit === 'hours' ? 'bg-blue-600 text-white' : 'text-neutral-700 hover:bg-neutral-100'
                          }`}
                        >
                          Horas
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setQuarantineUnit('days');
                            setDispatchQuarantineHours(quarantineCustomHours * 24);
                          }}
                          className={`px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                            quarantineUnit === 'days' ? 'bg-blue-600 text-white' : 'text-neutral-700 hover:bg-neutral-100'
                          }`}
                        >
                          Dias
                        </button>
                      </div>
                    </div>

                    <span className="text-xs font-mono text-neutral-500">
                      (= <strong>{dispatchQuarantineHours} horas</strong> no total)
                    </span>
                  </div>
                </div>

                {/* Exclusividade e Permissões */}
                <div className="space-y-2 pt-2">
                  <label className="block text-xs font-bold text-neutral-700">
                    Controle de Acesso durante a Quarentena:
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 p-3 rounded-xl border border-neutral-200 bg-white cursor-pointer hover:bg-neutral-50">
                      <input type="checkbox" defaultChecked className="mt-0.5 rounded text-blue-600 cursor-pointer" />
                      <div>
                        <div className="text-xs font-bold text-neutral-900">Ocultar contatos dos vendedores</div>
                        <div className="text-[11px] text-neutral-500">Vendedores não veem nome, telefone nem link de site dos leads disparados nesta safra.</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 p-3 rounded-xl border border-neutral-200 bg-white cursor-pointer hover:bg-neutral-50">
                      <input type="checkbox" defaultChecked className="mt-0.5 rounded text-blue-600 cursor-pointer" />
                      <div>
                        <div className="text-xs font-bold text-neutral-900">Notificar Thomas no primeiro 'ping' de resposta</div>
                        <div className="text-[11px] text-neutral-500">Alerta instantâneo via webhook/push caso o cliente mande qualquer mensagem pelo WhatsApp.</div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Coluna Direita: Regras de Saída e Transição de Leads (5 Cols) */}
              <div className="lg:col-span-5 bg-white border border-neutral-200 rounded-xl p-6 shadow-2xs space-y-5">
                <div className="flex items-center gap-2 pb-3 border-b border-neutral-200">
                  <Sliders className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-bold text-sm text-neutral-900">
                    2. Automações de Saída da Quarentena
                  </h4>
                </div>

                {/* Quando o Lead Responde */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-neutral-700 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Quando o Lead Responder no WhatsApp:</span>
                  </label>
                  <select
                    value={quarantineOnReplyAction}
                    onChange={e => setQuarantineOnReplyAction(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-emerald-50/40 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="keep_thomas">🔒 Reter exclusivo na mesa do Thomas (Fechamento Próprio)</option>
                    <option value="distribute_immediate">⚡ Distribuir imediatamente ao próximo closer da roleta</option>
                  </select>
                  <span className="text-[11px] text-neutral-500 block leading-relaxed">
                    Lead entra em <strong>RESPOSTA_QUENTE</strong> e ganha prioridade máxima na fila.
                  </span>
                </div>

                {/* Quando a Quarentena Expira */}
                <div className="space-y-2 pt-2 border-t border-neutral-100">
                  <label className="block text-xs font-bold text-neutral-700 flex items-center gap-1.5">
                    <Snowflake className="w-3.5 h-3.5 text-blue-600" />
                    <span>Quando o Tempo de Quarentena Expirar:</span>
                  </label>
                  <select
                    value={quarantineOnExpireAction}
                    onChange={e => setQuarantineOnExpireAction(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-blue-50/40 border border-blue-300 rounded-xl text-xs font-bold text-blue-950 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="auto_distribute">🔄 Auto-distribuir leads frios para discagem da equipe</option>
                    <option value="hold_manual">⏸️ Reter na quarentena até liberação manual do gestor</option>
                  </select>
                  <span className="text-[11px] text-neutral-500 block leading-relaxed">
                    Leads que não responderam vão para <strong>LEAD_FRIO</strong> e ficam aptos para ligação telefônica.
                  </span>
                </div>

                {/* Resumo da Lógica */}
                <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-700 space-y-1.5">
                  <div className="font-bold text-neutral-900 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Por que usar Quarentena?</span>
                  </div>
                  <p className="text-[11px] text-neutral-600 leading-relaxed">
                    Evita que dois vendedores abordem a mesma empresa ao mesmo tempo ou que um vendedor ligue enquanto o cliente ainda está lendo a copy com o site recém-criado.
                  </p>
                </div>

                {/* Botão de Salvar Parâmetros */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSaveQuarantineConfig}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar Configurações de Quarentena</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </>
  );
}
