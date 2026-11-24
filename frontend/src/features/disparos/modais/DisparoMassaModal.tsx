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
import { CONFIRMA_ACIMA_DE, formatDuration } from '../base';

export function DisparoMassaModal({ d }: { d: DisparosVM }) {
  const { salespeople, instanceLabel, checkedBatchIds, selectedBatchId, leads, isBatchDispatchModalOpen, setIsBatchDispatchModalOpen, dispatchQuantityOption, setDispatchQuantityOption, customDispatchQuantity, setCustomDispatchQuantity, distribuicaoManual, setDistribuicaoManual, linhasDisparo, planoDisparo, totalPlanoDisparo, dispatchSelectedCloser, setDispatchSelectedCloser, dispatchSelectedClosers, setDispatchSelectedClosers, dispatchModalStep, setDispatchModalStep, dispatchInfo, batchDispatchStats, dispatchSpeed, dispatchPhoneNumberId, setDispatchPhoneNumberId, dispatchNumbers, speedLimits, speedPresets, liveBatchProgress, buttonTextLabel, dispatchSelectedTemplate, setDispatchSelectedTemplate, availableTemplates, isDispatching, dispatchProgress, activeMetaTemplate, activeVarIndexes, copiesByIdx, copyTemplates, selectedCopyTemplateId, handleSelectCopyTemplate, currentBatch, handleUpdateGlobalSpeed, handlePauseBatch, handleResumeBatch, handleCancelBatch, handleExecuteBatchDispatch } = d;
  return (
    <>
        {/* ========================================================= */}
        {/* MODAL DE DISPARO EM MASSA (QUANTIDADE + COPY FINAL) */}
        {/* ========================================================= */}
        {isBatchDispatchModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl border border-neutral-200 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="p-6 border-b border-neutral-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                    <Send className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-neutral-900">
                      {dispatchModalStep === 'config' && 'Novo Disparo de Campanha'}
                      {dispatchModalStep === 'processing' && 'Processando Disparos Oficiais'}
                      {dispatchModalStep === 'success' && 'Disparos Concluídos!'}
                    </h3>
                    <p className="text-xs text-neutral-500">
                      Campanha: <span className="font-semibold text-neutral-800">{currentBatch?.name || 'Safra Atual'}</span> • Total Disponível na Etapa 1: <span className="font-bold text-emerald-700">{leads.filter(l => l.status === 'STAGING').length.toLocaleString('pt-BR')} leads</span>
                    </p>
                  </div>
                </div>

                {dispatchModalStep !== 'processing' && (
                  <button
                    onClick={() => setIsBatchDispatchModalOpen(false)}
                    className="p-2 text-neutral-400 hover:text-neutral-700 rounded-xl hover:bg-neutral-100 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Step 1: Configuration Form */}
              {dispatchModalStep === 'config' && (
                <div className="p-6 space-y-6">
                  {/* Resumo: quem envia e o que as regras deixam passar */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-neutral-200 border border-neutral-200 rounded-xl overflow-hidden">
                    <div className="bg-white px-4 py-3">
                      <p className="text-[11px] text-neutral-500">Marca</p>
                      <p className={`text-sm font-bold truncate ${dispatchInfo?.marca === 'Sem marca' ? 'text-amber-700' : 'text-neutral-900'}`}>{dispatchInfo?.marca ?? '…'}</p>
                      {dispatchInfo?.marca === 'Sem marca' && <p className="text-[11px] text-amber-700 mt-0.5">Escolha a marca no seletor do topo</p>}
                    </div>
                    <div className="bg-white px-4 py-3">
                      <p className="text-[11px] text-neutral-500">Número(s) de envio</p>
                      <p className="text-sm font-bold text-neutral-900 truncate">
                        {dispatchPhoneNumberId
                          ? (dispatchNumbers.find(n => n.id === dispatchPhoneNumberId)?.name ?? dispatchPhoneNumberId)
                          : dispatchInfo ? (dispatchInfo.numeros.length ? dispatchInfo.numeros.join(', ') : 'Padrão do ambiente') : '…'}
                      </p>
                    </div>
                    <div className="bg-white px-4 py-3">
                      <p className="text-[11px] text-neutral-500">Passam nas regras</p>
                      <p className="text-sm font-bold text-emerald-700">{dispatchInfo?.previa ? dispatchInfo.previa.passariam.toLocaleString('pt-BR') : '—'}</p>
                    </div>
                    <div className="bg-white px-4 py-3">
                      <p className="text-[11px] text-neutral-500">Barrados pelas regras</p>
                      <p className="text-sm font-bold text-amber-700">{dispatchInfo?.previa ? dispatchInfo.previa.barrados.toLocaleString('pt-BR') : '—'}</p>
                    </div>
                  </div>
                  {dispatchInfo?.previa && (
                    <p className="text-xs text-neutral-500 -mt-3">
                      A prévia considera a fila inteira de espera. Regras de contato e lista de bloqueios são aplicadas de novo no envio.
                    </p>
                  )}

                  {/* Quantity Selection */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-emerald-600" />
                        <span>1. Selecionar a Quantidade de Leads</span>
                      </label>
                      <span className="text-xs text-neutral-500 font-medium">
                        {leads.filter(l => l.status === 'STAGING').length.toLocaleString('pt-BR')} leads prontos na Etapa 1
                      </span>
                    </div>

                    {/* Quick presets */}
                    <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                      {[50, 100, 250, 500, 1000, 2000].map(qty => (
                        <button
                          key={qty}
                          type="button"
                          onClick={() => {
                            setDispatchQuantityOption(qty);
                            setCustomDispatchQuantity(String(qty));
                          }}
                          className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                            dispatchQuantityOption === qty
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-800 border-neutral-200'
                          }`}
                        >
                          {qty.toLocaleString('pt-BR')}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => {
                          const total = leads.filter(l => l.status === 'STAGING').length;
                          setDispatchQuantityOption('ALL');
                          setCustomDispatchQuantity(String(total));
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          dispatchQuantityOption === 'ALL'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-800 border-neutral-200'
                        }`}
                      >
                        Todos ({leads.filter(l => l.status === 'STAGING').length.toLocaleString('pt-BR')})
                      </button>
                    </div>

                    {/* Custom input */}
                    <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-neutral-700">Quantidade exata a disparar:</span>
                        <input
                          type="number"
                          min="1"
                          max={Math.max(leads.filter(l => l.status === 'STAGING').length, 50000)}
                          value={customDispatchQuantity}
                          onChange={e => {
                            const val = e.target.value;
                            setCustomDispatchQuantity(val);
                            const num = Number(val);
                            if (num > 0) {
                              setDispatchQuantityOption(num);
                            }
                          }}
                          placeholder="Ex: 1000"
                          className="w-32 px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-sm font-bold text-neutral-900 focus:outline-emerald-500"
                        />
                        <span className="text-xs text-neutral-500">leads serão disparados</span>
                      </div>

                      <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          Garantia de Limite: Serão disparados <strong>{(checkedBatchIds.length > 0 ? totalPlanoDisparo : (dispatchQuantityOption === 'ALL' ? leads.filter(l => l.status === 'STAGING').length : (Number(customDispatchQuantity) || 100))).toLocaleString('pt-BR')} leads</strong> (o sistema respeita rigorosamente o limite).
                        </span>
                      </div>
                    </div>
                  </div>

                  {checkedBatchIds.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-neutral-900">Distribuição por safra</p>
                        {distribuicaoManual && (
                          <button type="button" onClick={() => setDistribuicaoManual(null)} className="text-xs text-emerald-700 font-bold hover:underline cursor-pointer">
                            Voltar à distribuição automática
                          </button>
                        )}
                      </div>
                      <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-200">
                        {linhasDisparo.map(l => (
                          <div key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                            <span className="truncate font-semibold text-neutral-800">{l.nome}</span>
                            <span className="text-neutral-500 shrink-0">disponíveis: {l.disponivel.toLocaleString('pt-BR')}</span>
                            <input
                              type="number"
                              min={0}
                              max={l.disponivel}
                              value={planoDisparo[l.id] ?? 0}
                              onChange={e => {
                                const v = Math.max(0, Math.min(l.disponivel, Math.floor(Number(e.target.value) || 0)));
                                setDistribuicaoManual({ ...planoDisparo, [l.id]: v });
                              }}
                              className="w-24 px-2 py-1 rounded-lg border border-neutral-300 text-right text-xs"
                            />
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-neutral-600">
                        Total: <strong>{totalPlanoDisparo.toLocaleString('pt-BR')}</strong> mensagens
                        {totalPlanoDisparo > CONFIRMA_ACIMA_DE && <span className="text-amber-700"> · acima de {CONFIRMA_ACIMA_DE}: vai pedir confirmação</span>}
                      </p>
                    </div>
                  )}

                  {/* Copy & Template Selection */}
                  <div className="space-y-3 pt-4 border-t border-neutral-200">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-blue-600" />
                        <span>2. Selecionar a Copy Criada & Template Meta Oficial</span>
                      </label>
                      {copyTemplates.length > 0 && (
                        <span className="text-[11px] text-blue-600 font-semibold">
                          {copyTemplates.length} templates de copy na biblioteca
                        </span>
                      )}
                    </div>

                    {/* Copy Selection from Library if available */}
                    {copyTemplates.length > 0 && (
                      <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 space-y-1.5">
                        <span className="text-[11px] font-bold text-blue-900 block">
                          Carregar Copy da Biblioteca:
                        </span>
                        <select
                          value={selectedCopyTemplateId || ''}
                          onChange={e => handleSelectCopyTemplate(e.target.value)}
                          className="w-full p-2.5 bg-white border border-blue-200 rounded-lg text-xs font-medium text-neutral-900 focus:outline-blue-500 cursor-pointer"
                        >
                          {copyTemplates.map(copy => (
                            <option key={copy.id} value={copy.id}>
                              {copy.name} {copy.category ? `(${copy.category})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Meta Template Select */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-neutral-700 block">
                        Template Aprovado na Meta Cloud API:
                      </span>
                      <select
                        value={dispatchSelectedTemplate}
                        onChange={e => setDispatchSelectedTemplate(e.target.value)}
                        className="w-full p-3 bg-neutral-50 border border-neutral-300 rounded-xl text-xs font-bold text-neutral-900 focus:outline-emerald-500 cursor-pointer"
                      >
                        <option value="" disabled>Escolha um modelo aprovado…</option>
                        {availableTemplates.length > 0 ? (
                          availableTemplates.map((t: any) => (
                            <option key={t.name} value={t.name}>
                              {t.name} — {t.category || 'MARKETING'} ({t.status || 'APPROVED'})
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="" disabled>
                              Nenhum modelo aprovado encontrado na conta
                            </option>
                          </>
                        )}
                      </select>
                    </div>

                    {/* WhatsApp Real Smartphone Preview */}
                    <div className="bg-[#EFEAE2] p-4 rounded-2xl border border-neutral-300 shadow-inner">
                      <div className="text-[10px] text-neutral-600 font-bold uppercase tracking-wider mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-neutral-500" />
                          <span>Pré-Visualização Real no WhatsApp do Lead</span>
                        </div>
                        <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100/80 px-2 py-0.5 rounded-full">
                          Template Oficial Meta
                        </span>
                      </div>

                      <div className="bg-[#d9fdd3] rounded-2xl rounded-tr-none p-3.5 max-w-md shadow-xs border border-emerald-200/60 text-xs space-y-2.5 relative">
                        <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider border-b border-emerald-200 pb-1 flex items-center justify-between">
                          <span>
                            {dispatchSelectedClosers.length > 1 
                              ? `Distribuição entre ${dispatchSelectedClosers.length} Vendedores`
                              : (salespeople.find(s => s.id === (dispatchSelectedClosers[0] || dispatchSelectedCloser))?.name || 'Thomas Gabriel')}
                          </span>
                          <span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.2 rounded font-mono">UTILITY</span>
                        </div>

                        {/* Corpo real do modelo escolhido, com as copies de cada variável (exemplo: Roberto, Padaria Estrela) */}
                        <div className="text-neutral-900 whitespace-pre-wrap">
                          {(() => {
                            const sample = { firstName: 'Roberto', company: 'Padaria Estrela', seller: 'Thomas', url: 'https://padariaestrela.nyroh.app' };
                            const values: Record<number, string> = {};
                            for (const n of activeVarIndexes) values[n] = fillLeadTokens(copiesByIdx[n] ?? '', sample);
                            return renderTemplateBody(activeMetaTemplate?.bodyText || '', values).text;
                          })()}
                        </div>

                        {/* Chamada do Botão */}
                        <p className="text-[11px] font-semibold text-neutral-600 pt-0.5">
                          Clique no link abaixo para saber mais:
                        </p>

                        {/* Interactive CTA Buttons Preview */}
                        <div className="pt-2 border-t border-emerald-200/80 space-y-1.5">
                          <div className="w-full py-2 bg-white hover:bg-emerald-50 text-emerald-700 font-bold text-center rounded-lg shadow-2xs border border-emerald-200 flex items-center justify-center gap-1.5">
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>{buttonTextLabel || 'Acessar Link'}</span>
                          </div>
                          <div className="w-full py-1 bg-white/70 text-neutral-500 font-semibold text-center rounded-lg text-[10px] border border-neutral-200">
                            Parar Mensagens
                          </div>
                        </div>

                        <div className="text-[10px] text-neutral-400 text-right pt-0.5">10:45 ✓✓</div>
                      </div>
                    </div>
                  </div>

                  {/* Closer selection / Multi-salesperson Distribution */}
                  <div className="space-y-3 pt-4 border-t border-neutral-200">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-emerald-600" />
                        <span>3. Vendedores / Atendentes Responsáveis</span>
                      </label>
                      <span className="text-[11px] text-neutral-500">
                        {dispatchSelectedClosers.length <= 1 
                          ? '1 vendedor selecionado' 
                          : `Divisão igualitária (${dispatchSelectedClosers.length} vendedores)`}
                      </span>
                    </div>

                    <p className="text-[11px] text-neutral-500">
                      Selecione 1 ou mais vendedores. Se mais de 1 for selecionado, o sistema distribui os leads igualmente em rodízio (round-robin) e adapta o nome do vendedor na copy de cada mensagem.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {salespeople && salespeople.length > 0 ? (
                        salespeople.map(sp => {
                          const isSelected = dispatchSelectedClosers.includes(sp.id) || (dispatchSelectedClosers.length === 0 && sp.id === (dispatchSelectedCloser || 'seller-thomas'));
                          return (
                            <button
                              key={sp.id}
                              type="button"
                              onClick={() => {
                                let updated: string[];
                                const current = dispatchSelectedClosers.length > 0 ? dispatchSelectedClosers : [dispatchSelectedCloser || 'seller-thomas'];
                                if (current.includes(sp.id)) {
                                  // Don't allow unchecking if it's the last one
                                  if (current.length > 1) {
                                    updated = current.filter(id => id !== sp.id);
                                  } else {
                                    updated = current;
                                  }
                                } else {
                                  updated = [...current, sp.id];
                                }
                                setDispatchSelectedClosers(updated);
                                setDispatchSelectedCloser(updated[0]);
                              }}
                              className={`p-3 rounded-xl border flex items-center gap-3 transition cursor-pointer text-left ${
                                isSelected
                                  ? 'bg-emerald-50/80 border-emerald-500 ring-1 ring-emerald-400'
                                  : 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200'
                              }`}
                            >
                              <div
                                className="w-8 h-8 rounded-full text-white font-bold flex items-center justify-center text-xs shrink-0"
                                style={{ backgroundColor: sp.color || '#0284c7' }}
                              >
                                {sp.name.substring(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="font-bold text-xs text-neutral-900 block truncate">
                                  {sp.name}
                                </span>
                                <span className="text-[11px] text-neutral-500 block truncate">
                                  {sp.email || 'Instância WhatsApp'}
                                </span>
                              </div>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                readOnly
                                className="w-4 h-4 text-emerald-600 rounded border-neutral-300 pointer-events-none"
                              />
                            </button>
                          );
                        })
                      ) : (
                        <div className="flex items-center gap-3 bg-neutral-50 p-3 rounded-xl border border-neutral-200 col-span-2">
                          <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
                            TG
                          </div>
                          <div className="flex-1 text-xs">
                            <span className="font-bold text-neutral-900">Thomas Gabriel</span>
                            <span className="text-neutral-500 block text-[11px]">
                              Instância WhatsApp Oficial: {instanceLabel}
                            </span>
                          </div>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                            Atendente Padrão
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 4. Velocidade de Disparo & Esteira Assíncrona (BullMQ + Redis) */}
                  <div className="space-y-3 pt-4 border-t border-neutral-200">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Gauge className="w-4 h-4 text-emerald-600" />
                        <span>4. Velocidade de Disparo (limite do seu plano FluxoAPI)</span>
                      </label>
                      <span className="text-xs font-mono font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                        {Math.round(dispatchSpeed * 60)} msgs / minuto
                      </span>
                    </div>

                    <p className="text-[11px] text-neutral-500">
                      O seu plano da FluxoAPI aceita <strong>{speedLimits.planRpm} requisições por minuto</strong> (somando disparo + atendimento).
                      O disparo usa no máximo <strong>{speedLimits.maxPerMinute}/min</strong> para sobrar fôlego para as respostas dos vendedores.
                      Acima disso a API devolve erro 429 e as mensagens atrasam. Para mais vazão, troque de plano e ajuste <code>FLUXO_PLAN_RPM</code>.
                    </p>

                    {/* Speed Presets */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {speedPresets.map(preset => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => handleUpdateGlobalSpeed(preset.speed)}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                            Math.abs(dispatchSpeed - preset.speed) < 1e-6
                              ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-400'
                              : 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-neutral-900">{Math.round(preset.speed * 60)} msgs/min</span>
                            {Math.abs(dispatchSpeed - preset.speed) < 1e-6 && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                          </div>
                          <span className="text-[10px] font-semibold text-neutral-600 block mt-0.5">{preset.label}</span>
                          <span className="text-[9px] text-neutral-400 block mt-0.5">{preset.description}</span>
                        </button>
                      ))}
                    </div>

                    {/* Slider & Custom Input */}
                    <div className="flex items-center gap-4 bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                      <div className="flex-1">
                        <div className="flex justify-between text-[11px] text-neutral-600 mb-1">
                          <span>Ajuste Fino de Vazão</span>
                          <span className="font-mono font-bold text-neutral-900">{Math.round(dispatchSpeed * 60)} msgs/min</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max={Math.max(1, speedLimits.maxPerMinute)}
                          step="1"
                          value={Math.max(1, Math.round(dispatchSpeed * 60))}
                          onChange={e => handleUpdateGlobalSpeed(Number(e.target.value) / 60)}
                          className="w-full accent-emerald-600 cursor-pointer h-2 bg-neutral-200 rounded-lg"
                        />
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-neutral-500 block">Tempo Estimado:</span>
                        <span className="text-xs font-mono font-bold text-emerald-700">
                          ~{formatDuration(Math.ceil((Number(customDispatchQuantity) || 100) / (dispatchSpeed || 0.8)))}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Submit Action */}
                  <div className="pt-4 border-t border-neutral-200 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setIsBatchDispatchModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl border border-neutral-200 text-neutral-600 hover:text-neutral-900 text-xs font-bold cursor-pointer"
                    >
                      Cancelar
                    </button>

                    <select
                      value={dispatchPhoneNumberId}
                      onChange={e => setDispatchPhoneNumberId(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-neutral-300 bg-white text-xs text-neutral-800"
                      title="Número que vai enviar o disparo"
                    >
                      <option value="">Número: padrão do ambiente</option>
                      {dispatchNumbers.map(n => (
                        <option key={n.id} value={n.id}>{n.name} ({n.phone})</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleExecuteBatchDispatch}
                      disabled={isDispatching || leads.filter(l => l.status === 'STAGING').length === 0}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-300 text-white text-xs font-bold shadow-md cursor-pointer transition"
                    >
                      <Send className="w-4 h-4" />
                      <span>
                        Iniciar Disparo Real para {customDispatchQuantity || '100'} Leads ({Math.round(dispatchSpeed * 60)} msgs/min)
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Live Processing Progress & Mission Control */}
              {dispatchModalStep === 'processing' && (
                <div className="p-8 space-y-6">
                  <div className="text-center space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      <span>Esteira BullMQ + Redis Ativa</span>
                    </div>

                    <h4 className="text-lg font-bold text-neutral-900">
                      Disparando Mensagens via Meta Cloud API Oficial
                    </h4>
                    <p className="text-xs text-neutral-500 max-w-md mx-auto">
                      Processando fila em background a <span className="font-bold text-emerald-700">{Math.round(dispatchSpeed * 60)} msgs/minuto</span>. Distribuindo igualmente entre a equipe comercial.
                    </p>
                  </div>

                  {/* Progress Bar & Percentage */}
                  <div className="space-y-2 bg-neutral-50 p-4 rounded-2xl border border-neutral-200">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-neutral-900 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-emerald-600 animate-pulse" />
                        <span>Progresso da Fila</span>
                      </span>
                      <span className="font-mono font-bold text-emerald-700 text-sm">
                        {dispatchProgress}%
                      </span>
                    </div>

                    <div className="w-full bg-neutral-200 rounded-full h-3.5 overflow-hidden p-0.5 border border-neutral-300/60">
                      <div
                        className="bg-emerald-600 h-full rounded-full transition-all duration-300 shadow-sm"
                        style={{ width: `${Math.max(4, dispatchProgress)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                      <span>Processados: {(liveBatchProgress?.sent || 0) + (liveBatchProgress?.failed || 0)} de {liveBatchProgress?.total || customDispatchQuantity || 100}</span>
                      <span>Restantes: {Math.max(0, (liveBatchProgress?.total || Number(customDispatchQuantity) || 100) - ((liveBatchProgress?.sent || 0) + (liveBatchProgress?.failed || 0)))}</span>
                    </div>
                  </div>

                  {/* Live Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl text-center">
                      <span className="text-[11px] text-emerald-800 font-semibold block">Enviados com Sucesso</span>
                      <span className="text-xl font-mono font-black text-emerald-700">
                        {liveBatchProgress?.sent || 0}
                      </span>
                    </div>
                    <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-xl text-center">
                      <span className="text-[11px] text-rose-800 font-semibold block">Falhas / Rejeitados</span>
                      <span className="text-xl font-mono font-black text-rose-700">
                        {liveBatchProgress?.failed || 0}
                      </span>
                    </div>
                    <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-center">
                      <span className="text-[11px] text-neutral-600 font-semibold block">Velocidade</span>
                      <span className="text-xl font-mono font-black text-neutral-800">
                        {Math.round(dispatchSpeed * 60)} <span className="text-xs font-normal">msg/min</span>
                      </span>
                    </div>
                    <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl text-center">
                      <span className="text-[11px] text-amber-800 font-semibold block">Tempo Restante</span>
                      <span className="text-xl font-mono font-black text-amber-700">
                        {formatDuration(Math.max(1, Math.ceil(((liveBatchProgress?.total || 100) - (liveBatchProgress?.sent || 0) - (liveBatchProgress?.failed || 0)) / (dispatchSpeed || 0.8))))}
                      </span>
                    </div>
                  </div>

                  {/* Prominent API Error Alert if messages fail */}
                  {(liveBatchProgress?.lastError || (liveBatchProgress?.failed || 0) > 0) && (
                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-xs text-rose-900 animate-in fade-in">
                      <XOctagon className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <span className="font-bold text-rose-950 block">
                          Alerta de Bloqueio da API ({liveBatchProgress?.failed || 0} envio(s) recusado(s)):
                        </span>
                        <p className="font-mono text-[11px] bg-rose-100/70 p-2 rounded-lg text-rose-800 border border-rose-200">
                          {liveBatchProgress?.lastError || 'Falha na resposta do servidor da API.'}
                        </p>
                        <p className="text-[11px] text-rose-700">
                          💡 <strong>O que fazer:</strong> Acesse o painel da <strong>FluxoAPI</strong> na aba <strong>Cobrança</strong> e ative a assinatura/créditos desta instância WhatsApp para liberar os envios.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Dynamic Speed Controller on the fly */}
                  <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-neutral-800 flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5 text-neutral-600" />
                        <span>Acelerar / Desacelerar Esteira em Tempo Real:</span>
                      </span>
                      <span className="font-mono font-bold text-emerald-700">{Math.round(dispatchSpeed * 60)} msgs/minuto</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max={Math.max(1, speedLimits.maxPerMinute)}
                      step="1"
                      value={Math.max(1, Math.round(dispatchSpeed * 60))}
                      onChange={e => handleUpdateGlobalSpeed(Number(e.target.value) / 60)}
                      className="w-full accent-emerald-600 cursor-pointer h-2 bg-neutral-200 rounded-lg"
                    />
                    <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
                      <span>1 msg/min (Ultra Seguro)</span>
                      <span>{speedLimits.maxPerMinute} msgs/min (teto do plano)</span>
                    </div>
                  </div>

                  {/* Pause / Resume / Cancel Controls */}
                  <div className="flex items-center justify-between pt-2 border-t border-neutral-200">
                    <div className="flex items-center gap-2">
                      {liveBatchProgress?.status === 'paused' ? (
                        <button
                          type="button"
                          onClick={() => handleResumeBatch(selectedBatchId)}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Retomar Fila</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handlePauseBatch(selectedBatchId)}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs cursor-pointer"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          <span>Pausar Esteira</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCancelBatch(selectedBatchId)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold cursor-pointer"
                      >
                        <XOctagon className="w-3.5 h-3.5" />
                        <span>Cancelar Restantes</span>
                      </button>
                    </div>

                    <span className="text-[11px] text-neutral-400 font-mono">
                      ID Safra: {selectedBatchId.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              )}

              {/* Step 3: Success Confirmation */}
              {dispatchModalStep === 'success' && (
                <div className="p-10 text-center space-y-6">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center animate-bounce">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-lg font-bold text-neutral-900">
                      Disparo Realizado com Sucesso!
                    </h4>
                    <p className="text-xs text-neutral-600 max-w-md mx-auto">
                      <span className="font-bold text-emerald-700">{batchDispatchStats.dispatched} leads</span> receberam a mensagem com a copy oficial via Meta Cloud API e entraram na <span className="font-bold">Etapa 2 (Em Espera / Quarentena)</span>.
                    </p>
                  </div>

                  <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 max-w-sm mx-auto text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Total disparado:</span>
                      <span className="font-bold text-neutral-900">{batchDispatchStats.dispatched} contatos</span>
                    </div>
                    {batchDispatchStats.failed > 0 && (
                      <div className="flex justify-between text-amber-700">
                        <span>Falhas/Números Inválidos:</span>
                        <span className="font-bold">{batchDispatchStats.failed}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Janela de espera:</span>
                      <span className="font-bold text-amber-700">4 horas</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Vendedores utilizados:</span>
                      <span className="font-bold text-emerald-700">
                        {batchDispatchStats.sellersUsed && batchDispatchStats.sellersUsed.length > 0 
                          ? batchDispatchStats.sellersUsed.join(', ')
                          : 'Thomas Gabriel'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsBatchDispatchModalOpen(false);
                      setDispatchModalStep('config');
                    }}
                    className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer"
                  >
                    Ver Leads no Kanban ➔
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
    </>
  );
}
