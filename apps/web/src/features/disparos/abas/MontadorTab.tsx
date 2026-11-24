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


export function MontadorTab({ d }: { d: DisparosVM }) {
  const { currentUser, activeTab, setActiveTab, leads, montadorSubTab, setMontadorSubTab, activeVarField, setActiveVarField, buttonDestinationType, setButtonDestinationType, buttonCustomUrl, setButtonCustomUrl, buttonTextLabel, setButtonTextLabel, selectedTemplate, setSelectedTemplate, availableTemplates, loadingTemplates, simulatorLeadIndex, setSimulatorLeadIndex, activeMetaTemplate, activeVarIndexes, TAGS_FIXAS, camposTag, testPhone, setTestPhone, testSending, handleSendTestToPhone, META_BODY_MAX, measureBodyLength, copiesByIdx, setCopyAt, templateVar1, templateVar2, templateVar3, copyTemplates, selectedCopyTemplateId, setSelectedCopyTemplateId, setShowSaveCopyModal, fetchMetaTemplates, handleSelectCopyTemplate, handleUpdateCurrentCopyTemplate, handleResetToApprovedCopy, handleDeleteCopyTemplate, insertTagIntoActiveVar, showNotification, activeSimulatorLead } = d;
  return (
    <>
        {/* ========================================================= */}
        {/* TAB 2: MONTADOR DO DISPARO (Template, Copys & Smartphone Simulator) */}
        {/* ========================================================= */}
        {activeTab === 'montador' && (
          <div className="flex flex-col gap-5">
            {/* SUB-ABAS DO MONTADOR DE DISPARO */}
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-2 p-1 bg-neutral-100 rounded-xl border border-neutral-200">
                <button
                  type="button"
                  onClick={() => setMontadorSubTab('editor')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    montadorSubTab === 'editor'
                      ? 'bg-white text-neutral-900 shadow-2xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <Edit className="w-3.5 h-3.5 text-blue-600" />
                  <span>Criar & Configurar Disparo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMontadorSubTab('biblioteca')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    montadorSubTab === 'biblioteca'
                      ? 'bg-white text-neutral-900 shadow-2xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Biblioteca de Templates & Copys ({copyTemplates.length})</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSaveCopyModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer shadow-2xs"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>Salvar Copy Atual</span>
                </button>

                <button
                  onClick={fetchMetaTemplates}
                  disabled={loadingTemplates}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition cursor-pointer"
                  title="Recarregar modelos aprovados na Meta"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingTemplates ? 'animate-spin' : ''}`} />
                  <span>Atualizar Meta</span>
                </button>
              </div>
            </div>

            {/* CONTEÚDO DA SUB-ABA: BIBLIOTECA DE TEMPLATES */}
            {montadorSubTab === 'biblioteca' && (
              <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-2xs">
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-neutral-200">
                  <div>
                    <h3 className="font-bold text-sm text-neutral-900 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-emerald-600" />
                      Biblioteca de Templates & Copys de Vendas
                    </h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Modelos prontos e copies de alta conversão. Selecione um para carregar imediatamente no montador.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSaveCopyModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-neutral-900 text-white rounded-lg hover:bg-black transition cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Novo Template</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {copyTemplates.map(copy => (
                    <div
                      key={copy.id}
                      className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                        selectedCopyTemplateId === copy.id
                          ? 'border-blue-500 bg-blue-50/20 shadow-2xs'
                          : 'border-neutral-200 bg-white hover:border-neutral-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-xs text-neutral-900">{copy.name}</span>
                              {copy.isDefault && (
                                <span className="text-[9px] bg-neutral-100 text-neutral-600 font-bold px-1.5 py-0.2 rounded border border-neutral-200">
                                  PADRÃO
                                </span>
                              )}
                              <span className="text-[9px] uppercase bg-blue-100 text-blue-800 font-bold px-1.5 py-0.2 rounded">
                                {copy.category || 'prospeccao'}
                              </span>
                            </div>
                            {copy.description && (
                              <p className="text-[11px] text-neutral-500 mt-1">{copy.description}</p>
                            )}
                          </div>

                          {!copy.isDefault && (
                            <button
                              type="button"
                              onClick={() => handleDeleteCopyTemplate(copy.id, copy.name)}
                              className="p-1 text-neutral-400 hover:text-red-600 rounded cursor-pointer"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Prévia das variáveis */}
                        <div className="space-y-1.5 my-3 bg-neutral-50 p-2.5 rounded-lg border border-neutral-100 text-[11px] text-neutral-700">
                          <div>
                            <span className="font-bold text-neutral-500">Var 1: </span>
                            <span className="line-clamp-1">{copy.var1}</span>
                          </div>
                          <div>
                            <span className="font-bold text-neutral-500">Var 2: </span>
                            <span className="line-clamp-2">{copy.var2}</span>
                          </div>
                          <div>
                            <span className="font-bold text-neutral-500">Var 3: </span>
                            <span className="line-clamp-2">{copy.var3}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          handleSelectCopyTemplate(copy.id);
                          setMontadorSubTab('editor');
                          showNotification('success', `Template "${copy.name}" carregado no editor.`);
                        }}
                        className={`w-full py-2 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                          selectedCopyTemplateId === copy.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{selectedCopyTemplateId === copy.id ? 'Ativo no Montador' : 'Usar no Montador'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CONTEÚDO DA SUB-ABA: EDITOR & SIMULADOR SMARTPHONE */}
            {montadorSubTab === 'editor' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Controls & Parameters (7 Cols) */}
                <div className="lg:col-span-7 flex flex-col gap-6">
                  <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-2xs">
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-neutral-200">
                      <div className="flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-blue-600" />
                        <h3 className="font-bold text-sm text-neutral-900">
                          Montador do Disparo Oficial (Meta Cloud API)
                        </h3>
                      </div>
                      <span className="text-[11px] font-mono text-neutral-500">
                        {copyTemplates.find(c => c.id === selectedCopyTemplateId)?.name || 'Copy Personalizada'}
                      </span>
                    </div>

                    <div className="space-y-5">
                      {/* NÍVEL 1: Template Oficial Aprovado na Meta */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-bold text-neutral-700">
                            1. Template Aprovado pela Meta (Esqueleto Oficial):
                          </label>
                          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            Tarifa Reduzida Utility (~R$ 0,08)
                          </span>
                        </div>

                        <select
                          value={selectedTemplate}
                          onChange={e => {
                            const novo = e.target.value;
                            setSelectedTemplate(novo);
                            // Se a copy escolhida era de outro modelo, ela sai da seleção (o texto de cada modelo fica separado)
                            const copiaAtual = copyTemplates.find(c => c.id === selectedCopyTemplateId);
                            if (copiaAtual && copiaAtual.metaTemplateName && copiaAtual.metaTemplateName !== novo) {
                              setSelectedCopyTemplateId('');
                            }
                          }}
                          className="w-full px-3 py-2.5 bg-white border border-neutral-300 rounded-xl text-xs font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                        >
                          <option value="" disabled>Escolha um modelo aprovado…</option>
                          {availableTemplates.length > 0 ? (
                            availableTemplates.map(tpl => (
                              <option key={tpl.name || tpl.id} value={tpl.name}>
                                {tpl.name} ({tpl.category || 'UTILITY'}) — Status: {tpl.status || 'APPROVED'}
                              </option>
                            ))
                          ) : (
                            <option value="" disabled>
                              Nenhum modelo aprovado encontrado na conta
                            </option>
                          )}
                        </select>

                        <p className="text-[11px] text-neutral-500 mt-1.5 leading-relaxed">
                          💡 <strong>Esqueleto da Meta:</strong> <code className="bg-neutral-100 px-1 py-0.5 rounded text-neutral-800">Ei, &#123;&#123;1&#125;&#125; &#123;&#123;2&#125;&#125; &#123;&#123;3&#125;&#125; Clique no botão abaixo para acessar:</code>
                        </p>
                      </div>

                      {/* BARRA DE VARIÁVEIS DISPONÍVEIS (PILLS / TAGS DE 1 CLIQUE) */}
                      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-xs font-bold text-neutral-800">
                              Variáveis Disponíveis (Clique para Inserir)
                            </span>
                          </div>
                          <span className="text-[10px] text-neutral-500">
                            Inserindo na: <strong className="text-blue-600 uppercase">Variável &#123;&#123;{activeVarField}&#125;&#125;</strong>
                          </span>
                        </div>

                        {/* Pills de variáveis principais */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {[...TAGS_FIXAS, ...camposTag].map(v => (
                            <button
                              key={v.tag}
                              type="button"
                              onClick={() => insertTagIntoActiveVar(v.tag)}
                              title={`${v.desc} — Clique para inserir no campo ativo`}
                              className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 hover:text-blue-900 border border-neutral-300 hover:border-blue-400 rounded-lg text-xs font-mono font-bold transition shadow-2xs cursor-pointer flex items-center gap-1"
                            >
                              <span>+</span>
                              <span>{v.tag}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* NÍVEL 2: Variáveis de Conteúdo (O Texto Real de Vendas do CRM) */}
                      <div className="border border-blue-100 bg-blue-50/30 rounded-xl p-4 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-100 pb-3">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-blue-600" />
                              <h4 className="text-xs font-bold text-blue-950">
                                2. Template de Copy de Vendas (Mensagem Real)
                              </h4>
                            </div>
                            <p className="text-[11px] text-neutral-500 mt-0.5">
                              Escolha uma copy da sua biblioteca ou personalize as variáveis abaixo:
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setMontadorSubTab('biblioteca')}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-white text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition cursor-pointer shadow-2xs"
                              title="Ver todos os templates de copy na biblioteca"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>Ver Biblioteca</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setShowSaveCopyModal(true)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer shadow-2xs"
                              title="Salvar o texto atual como um novo template na biblioteca"
                            >
                              <Bookmark className="w-3.5 h-3.5" />
                              <span>Salvar Modelo</span>
                            </button>
                          </div>
                        </div>

                        {/* Seletor de Template de Copy da Biblioteca */}
                        <div className="bg-white p-3 rounded-lg border border-blue-100 flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="flex-1">
                            <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                              Selecionar Copy Salva:
                            </label>
                            {(() => {
                              // Só aparecem copies do modelo escolhido (ou antigas, sem modelo). Sem modelo, nada aparece.
                              const copiasDoModelo = selectedTemplate
                                ? copyTemplates.filter(c => !c.metaTemplateName || c.metaTemplateName === selectedTemplate)
                                : [];
                              const valorSelect = copiasDoModelo.some(c => c.id === selectedCopyTemplateId) ? selectedCopyTemplateId : '';
                              return (
                                <select
                                  value={valorSelect}
                                  disabled={!selectedTemplate}
                                  onChange={e => { if (e.target.value) handleSelectCopyTemplate(e.target.value); }}
                                  className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-bold text-neutral-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <option value="" disabled>
                                    {selectedTemplate ? 'Escolha uma copy para este modelo…' : 'Escolha o modelo da Meta primeiro'}
                                  </option>
                                  {copiasDoModelo.map(c => (
                                    <option key={c.id} value={c.id}>
                                      {c.name} {c.isDefault ? '(Padrão)' : ''}
                                    </option>
                                  ))}
                                </select>
                              );
                            })()}
                          </div>

                          <div className="text-[10px] text-neutral-500 sm:text-right shrink-0">
                            <span>Variáveis aplicadas no simulador:</span>
                            <div className="font-mono text-blue-600 font-bold mt-0.5 space-x-1">
                              <span>&#123;nome&#125;</span>
                              <span>&#123;empresa&#125;</span>
                              <span>&#123;site_novo&#125;</span>
                              <span>&#123;vendedor&#125;</span>
                            </div>
                          </div>
                        </div>

                        {/* MODELO DA META: mostra o que é texto fixo e o que é variável, com a visualização em tempo real */}
                        {activeMetaTemplate?.bodyText && (() => {
                          const samples: Record<string, string> = { nome: 'Roberto', empresa: 'Padaria Estrela', vendedor: 'Thomas', site_novo: 'https://nyroh.app/preview' };
                          const fill = (v: string) => (v || '').replace(/\{(nome|empresa|vendedor|site_novo)\}/gi, (_m, k) => samples[k.toLowerCase()] || _m);
                          const values: Record<number, string> = { 1: fill(templateVar1), 2: fill(templateVar2), 3: fill(templateVar3) };
                          const indexes = templateVarIndexes(activeMetaTemplate.bodyText || '');
                          const preview = renderTemplateBody(activeMetaTemplate.bodyText || '', values);
                          const totalAgora = measureBodyLength();
                          const pctAgora = Math.min(100, Math.round((totalAgora / META_BODY_MAX) * 100));
                          const acimaDoLimite = totalAgora > META_BODY_MAX;
                          return (
                            <div className="p-4 bg-white border border-neutral-200 rounded-xl space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-bold text-neutral-900">Modelo da Meta: {activeMetaTemplate.name}</p>
                                <div className="flex items-center gap-3 text-[11px]">
                                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-neutral-200 inline-block" /> texto fixo (não muda)</span>
                                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-400 inline-block" /> variável (você escreve)</span>
                                </div>
                              </div>
                              <div className="text-xs leading-relaxed text-neutral-800 whitespace-pre-wrap">
                                {parseTemplateBody(activeMetaTemplate.bodyText || '').map((seg, i) =>
                                  seg.kind === 'text' ? (
                                    <span key={i} className="bg-neutral-100 rounded px-0.5">{seg.text}</span>
                                  ) : (
                                    <span key={i} className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-300 rounded px-1">{`{{${seg.index}}}`}</span>
                                  )
                                )}
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-bold text-neutral-600">Limite total da Meta (texto final)</span>
                                  <span className={`font-mono font-bold ${acimaDoLimite ? 'text-red-600' : totalAgora > META_BODY_MAX * 0.9 ? 'text-amber-600' : 'text-emerald-700'}`}>
                                    {totalAgora} / {META_BODY_MAX} {acimaDoLimite ? '· passou do limite' : ''}
                                  </span>
                                </div>
                                <div className="h-1.5 w-full rounded bg-neutral-200 overflow-hidden">
                                  <div className={`h-full ${acimaDoLimite ? 'bg-red-500' : totalAgora > META_BODY_MAX * 0.9 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pctAgora}%` }} />
                                </div>
                              </div>
                              <div>
                                <p className="text-[11px] font-bold text-neutral-500 mb-1">Como o cliente vai ver (exemplo: Roberto, Padaria Estrela)</p>
                                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 whitespace-pre-wrap">
                                  {preview.text}
                                </div>
                                {preview.missing.length > 0 && (
                                  <p className="text-[11px] text-amber-700 mt-1">Falta preencher: {preview.missing.map(n => `{{${n}}}`).join(', ')}</p>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Banner Informativo de Conformidade com a Meta */}
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="text-xs font-bold text-emerald-950">
                              Travamento Físico de Segurança da Meta Cloud API:
                            </span>
                            <span className="text-[11px] text-emerald-800 hidden sm:inline">
                              Limites aplicados diretamente nos campos para prevenir erro #132005.
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-200">
                            100% Compatível
                          </span>
                        </div>

                        {!selectedTemplate && (
                          <p className="text-xs text-neutral-500">Escolha um modelo acima para escrever a copy em cima dele.</p>
                        )}
                        {selectedTemplate && activeVarIndexes.length === 0 && (
                          <p className="text-xs text-neutral-500">Este modelo não tem variáveis no corpo, então não há copy para escrever.</p>
                        )}
                        {/* Uma caixa por {{n}} do modelo escolhido */}
                        {activeVarIndexes.map(n => {
                          const value = copiesByIdx[n] ?? '';
                          const isActive = activeVarField === n;
                          const ratio = value.length / META_BODY_MAX;
                          const badge = ratio >= 1 ? 'bg-rose-50 text-rose-700 border-rose-200' : ratio >= 0.85 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
                          const bar = ratio >= 1 ? 'bg-rose-500' : ratio >= 0.85 ? 'bg-amber-500' : 'bg-emerald-500';
                          return (
                            <div
                              key={n}
                              onClick={() => setActiveVarField(n)}
                              className={`p-3 rounded-xl border transition-all ${
                                isActive ? 'bg-white border-blue-500 shadow-2xs ring-1 ring-blue-500/20' : 'bg-white/70 border-neutral-200'
                              }`}
                            >
                              <div className="flex items-center justify-between text-xs font-bold text-neutral-700 mb-1.5">
                                <label className="flex items-center gap-1.5">
                                  <span className={`w-4 h-4 rounded-full text-white flex items-center justify-center text-[10px] ${
                                    isActive ? 'bg-blue-600' : 'bg-neutral-400'
                                  }`}>{n}</span>
                                  <span>Variável &#123;&#123;{n}&#125;&#125;</span>
                                </label>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border transition-colors ${badge}`}>
                                    {value.length} / {META_BODY_MAX} chars
                                  </span>
                                </div>
                              </div>

                              <div className="w-full bg-neutral-100 rounded-full h-1 mb-2 overflow-hidden">
                                <div className={`h-full transition-all duration-300 ${bar}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                              </div>

                              <textarea
                                value={value}
                                maxLength={META_BODY_MAX}
                                onFocus={() => setActiveVarField(n)}
                                onChange={e => setCopyAt(n, e.target.value)}
                                rows={3}
                                className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                                placeholder={`Texto da Variável {{${n}}}. Use {nome}, {empresa}, {vendedor} ou {site_novo} para puxar os dados do lead.`}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* CONFIGURAÇÃO DO BOTÃO DO TEMPLATE (CALL TO ACTION) */}
                      <div className="border border-neutral-200 bg-neutral-50 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                            <MousePointerClick className="w-4 h-4 text-emerald-600" />
                            <span>Configuração do Botão CTA do Template Oficial:</span>
                          </label>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            Botão Dinâmico Meta
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                              Destino do Botão (Para onde leva o clique):
                            </label>
                            <select
                              value={buttonDestinationType}
                              onChange={e => setButtonDestinationType(e.target.value as any)}
                              className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs font-bold text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                            >
                              <option value="site_novo">🌐 Site Novo do Cliente ({'{site_novo}'}) - Recomendado</option>
                              <option value="site_antigo">🏛️ Site do cliente ({'{site_antigo}'})</option>
                              <option value="custom">🔗 URL Personalizada Externa</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                              Texto do Botão:
                            </label>
                            <input
                              type="text"
                              value={buttonTextLabel}
                              onChange={e => setButtonTextLabel(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs font-bold text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Ex: Acessar Link"
                            />
                          </div>
                        </div>

                        {buttonDestinationType === 'custom' && (
                          <div>
                            <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                              Link de Destino Customizado:
                            </label>
                            <input
                              type="url"
                              value={buttonCustomUrl}
                              onChange={e => setButtonCustomUrl(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs font-mono text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="https://sua-pagina.com.br"
                            />
                          </div>
                        )}

                        <div className="text-[11px] text-neutral-500 flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span>
                            Link resolvido no simulador:{' '}
                            <strong className="text-emerald-700 font-mono">
                              {buttonDestinationType === 'site_novo'
                                ? activeSimulatorLead?.publicUrl || 'https://empresa.nyroh.com.br'
                                : buttonDestinationType === 'site_antigo'
                                ? activeSimulatorLead?.website || 'https://empresa.com.br'
                                : buttonCustomUrl}
                            </strong>
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-500 break-all">
                          Endereço do botão no modelo aprovado na Meta:{' '}
                          <strong className="font-mono text-neutral-800">
                            {(activeMetaTemplate?.buttons || []).find((b: any) => b.type === 'URL')?.url
                              || 'não veio na resposta da Meta (o modelo pode não ter botão de link)'}
                          </strong>
                        </div>
                      </div>

                      {/* PAINEL DE AÇÕES EXCLUSIVO DO CRIADOR DE COPY */}
                      <div className="border border-neutral-200 bg-white rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                            <Bookmark className="w-4 h-4 text-blue-600" />
                            <span>Ações do Criador de Copy & Biblioteca</span>
                          </span>
                          <span className="text-[10px] text-neutral-500 font-medium">
                            Salva e sincroniza com o banco
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setShowSaveCopyModal(true)}
                            className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                          >
                            <Bookmark className="w-3.5 h-3.5" />
                            <span>Salvar Nova Copy</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleUpdateCurrentCopyTemplate}
                            className="py-2.5 px-3 bg-white hover:bg-neutral-50 border border-neutral-300 text-neutral-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Salvar Alterações</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleResetToApprovedCopy}
                            className="py-2.5 px-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-neutral-500" />
                            <span>Limpar variáveis</span>
                          </button>
                        </div>
                      </div>

                      {/* CARD GUIA: ORIENTAÇÃO PARA DISPARO NO KANBAN */}
                      <div className="p-4 bg-gradient-to-r from-blue-50/80 to-indigo-50/60 border border-blue-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
                      <div>
                        <p className="text-xs font-bold text-neutral-900">Testar o envio deste modelo</p>
                        <p className="text-[11px] text-neutral-500 mt-0.5">Manda o modelo <strong>{selectedTemplate}</strong> com a copy que você montou para o número abaixo. Use só o seu número.</p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={testPhone}
                          onChange={e => setTestPhone(e.target.value.replace(/\D/g, ''))}
                          placeholder="5511988216073"
                          className="flex-1 px-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={handleSendTestToPhone}
                          disabled={testSending || !testPhone}
                          className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold disabled:opacity-50"
                        >
                          {testSending ? 'Enviando...' : 'Enviar teste para este número'}
                        </button>
                      </div>
                    </div>

                    <div className="font-bold text-xs text-blue-950 flex items-center gap-1.5">
                            <Send className="w-3.5 h-3.5 text-blue-600" />
                            <span>Pronto para disparar para os leads?</span>
                          </div>
                          <p className="text-[11px] text-blue-800 leading-relaxed">
                            O Criador de Copy é dedicado à elaboração e validação técnica das mensagens. Para enviar para seus contatos, acesse o <strong>Kanban de Disparos</strong> e clique em <strong>Iniciar Disparo</strong> na Etapa 1.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('kanban')}
                          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shrink-0 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                        >
                          <span>Ir para o Kanban</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Smartphone Clean Light Preview (5 Cols) */}
                <div className="lg:col-span-5 flex flex-col items-center">
                  <div className="w-full max-w-sm bg-white border border-neutral-300 rounded-[36px] p-3 shadow-xl relative">
                    {/* Speaker notch */}
                    <div className="w-24 h-4 bg-neutral-200 rounded-full mx-auto mb-3" />

                    {/* Smartphone Screen Canvas */}
                    <div className="bg-[#efeae2]/60 rounded-[28px] overflow-hidden border border-neutral-200 flex flex-col h-[560px]">
                      {/* WhatsApp Header */}
                      <div className="bg-[#008069] text-white p-3 flex items-center gap-3 shrink-0 shadow-2xs">
                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
                          NY
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs truncate">
                            {activeSimulatorLead?.name || 'Cliente Potencial'}
                          </div>
                          <div className="text-[10px] text-white/80">online</div>
                        </div>
                      </div>

                      {/* Message Bubble Body */}
                      <div className="flex-1 p-3 overflow-y-auto space-y-3">
                        <div className="flex justify-center my-1">
                          <span className="bg-white/80 text-[10px] font-semibold text-neutral-500 px-2 py-0.5 rounded-full shadow-2xs border border-neutral-200">
                            HOJE
                          </span>
                        </div>

                        {/* Official Template Render Mesclando Variáveis */}
                        {(() => {
                          const leadName = activeSimulatorLead?.name || 'Cliente';
                          const firstName = leadName.split(' ')[0];
                          const companyName = activeSimulatorLead?.name || 'Sua Empresa';
                          const siteUrl = activeSimulatorLead?.publicUrl || 'https://sua-empresa.nyroh.com.br';
                          const sellerName = currentUser?.name || 'Thomas';

                          const tokenCtx = {
                            leadName: activeSimulatorLead?.name || '',
                            phoneNumber: (activeSimulatorLead as any)?.phoneNumber || '',
                            publicUrl: activeSimulatorLead?.publicUrl || '',
                            website: (activeSimulatorLead as any)?.website || '',
                            niche: (activeSimulatorLead as any)?.niche || '',
                            sellerName
                          };
                          const resolvedVar1 = resolveLeadTokens(templateVar1, tokenCtx).text;
                          const resolvedVar2 = resolveLeadTokens(templateVar2, tokenCtx).text;
                          const resolvedVar3 = resolveLeadTokens(templateVar3, tokenCtx).text;

                          const resolvedButtonUrl =
                            buttonDestinationType === 'site_novo'
                              ? siteUrl
                              : buttonDestinationType === 'site_antigo'
                              ? activeSimulatorLead?.website || 'https://empresa.com.br'
                              : buttonCustomUrl;

                          return (
                            <div className="bg-[#d9fdd3] text-neutral-900 rounded-2xl rounded-tr-none p-3 shadow-2xs text-xs border border-emerald-200/60 leading-relaxed space-y-2">
                              <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider border-b border-emerald-200 pb-0.5 flex items-center justify-between">
                                <span>Template: {selectedTemplate}</span>
                                <span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.2 rounded font-mono">UTILITY</span>
                              </div>

                              {/* Bloco 1 */}
                              <p className="whitespace-pre-line font-medium text-neutral-900">
                                Ei, {resolvedVar1}
                              </p>

                              {/* Bloco 2 */}
                              <p className="whitespace-pre-line text-neutral-800">
                                {resolvedVar2}
                              </p>

                              {/* Bloco 3 */}
                              <p className="whitespace-pre-line text-neutral-800">
                                {resolvedVar3}
                              </p>

                              {/* Chamada do Botão */}
                              <p className="text-[11px] font-semibold text-neutral-600 pt-1">
                                Clique no botão abaixo para acessar:
                              </p>

                              {/* Botões Oficiais da Meta */}
                              <div className="pt-2 border-t border-emerald-200/80 space-y-1.5">
                                <a
                                  href={resolvedButtonUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-full py-2 bg-white hover:bg-emerald-50 text-emerald-700 font-bold text-center rounded-lg shadow-2xs border border-emerald-200 flex items-center justify-center gap-1.5 cursor-pointer no-underline transition"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  <span>{buttonTextLabel || 'Acessar Link'}</span>
                                </a>
                                <div className="w-full py-1 bg-white/70 text-neutral-500 font-semibold text-center rounded-lg text-[10px] border border-neutral-200">
                                  Parar Mensagens
                                </div>
                              </div>

                              <div className="text-right text-[10px] text-neutral-400 mt-1 flex items-center justify-end gap-1">
                                <span>12:00</span>
                                <Check className="w-3 h-3 text-emerald-600 inline" />
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Smartphone Input Bar */}
                      <div className="p-2 bg-white border-t border-neutral-200 flex items-center gap-2 shrink-0">
                        <div className="flex-1 bg-neutral-100 rounded-full px-3 py-1.5 text-[11px] text-neutral-400">
                          Mensagem...
                        </div>
                        <div className="w-7 h-7 rounded-full bg-[#008069] text-white flex items-center justify-center">
                          <Send className="w-3 h-3" />
                        </div>
                      </div>
                    </div>

                    {/* Simulator Lead Stepper */}
                    <div className="mt-3 flex items-center justify-between text-xs text-neutral-600 px-2">
                      <button
                        onClick={() => setSimulatorLeadIndex(prev => Math.max(0, prev - 1))}
                        disabled={simulatorLeadIndex === 0}
                        className="p-1 rounded-lg hover:bg-neutral-100 disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="font-semibold text-[11px]">
                        Lead {leads.length > 0 ? (simulatorLeadIndex % leads.length) + 1 : 0} de {leads.length} ({activeSimulatorLead?.name?.slice(0, 18) || 'Exemplo'}...)
                      </span>
                      <button
                        onClick={() => setSimulatorLeadIndex(prev => prev + 1)}
                        disabled={leads.length <= 1}
                        className="p-1 rounded-lg hover:bg-neutral-100 disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
    </>
  );
}
