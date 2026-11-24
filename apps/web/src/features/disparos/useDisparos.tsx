import { urlAdminFluxoInstances, urlAdminFluxoTemplates, urlBrands, urlCampaignBatches, urlCampaignBatchesCancelId, urlCampaignBatchesId, urlCampaignBatchesPauseId, urlCampaignBatchesProgressId, urlCampaignBatchesQuarantineConfigId, urlCampaignBatchesReleaseQuarantineId, urlCampaignBatchesResetStagingId, urlCampaignBatchesResumeId, urlCampaignBatchesReturnUnsentId, urlCampaignBatchesSyncWhatsappWebId, urlCampaignCopies, urlCampaignCopiesId, urlCampaignDispatch, urlCampaignDispatchSpeed, urlCampaignDistribute, urlCampaignImportProgressId, urlCampaignImportProgressInit, urlCampaignLeadFieldsId, urlCampaignLeadsSimulateReplyId, urlCampaignSimulateAction, urlCampaignTestDispatch, urlCampaignUploads, urlPhoneNumbers, urlRegrasContatoPrevia } from './api';
import { apiFetch } from '../../api/client';
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
import { AdminDispatchTestSandbox } from '../../components/AdminDispatchTestSandbox';
import { ZipImportProgressModal, ImportProgressData } from '../../components/ZipImportProgressModal';
import { PaginaSubirZip, ZipUploadRegistro } from '../../components/PaginaSubirZip';
import { isUiFlagOn } from '@shared/lib/uiFlags';
import type { RespostaListaUploads, RespostaListaModelosFluxo, RespostaInstanciasFluxo, RespostaListaCopias, RespostaCopiaSalva, CopiaCampanha, RespostaListaLotes, RespostaVelocidadeDisparo, LoteCampanha, RespostaLiberacaoQuarentena, RespostaDevolucaoLeads } from '@shared/contracts/rotas';
import { AdminCampaignDisparosViewProps, CONFIRMA_ACIMA_DE, DispatchStateLine, MetaTemplateButton, MetaTemplateComponent, MetaTemplateFull, SHOW_SANDBOX, SHOW_SIMULATE, SubPageTab, formatDuration } from './base';

export function useDisparos({ salespeople, currentUser, onLeadsUpdated, onNavigateToKanban, onNavigateToWhatsApp }: AdminCampaignDisparosViewProps) {
  // Número REAL da instância (antes estava chumbado no código)
  const runtime = useRuntimeConfig();
  const instanceLabel = formatInstancePhone(runtime.instancePhone);
  const [activeTab, setActiveTab] = useState<SubPageTab>('kanban');
  const [batches, setBatches] = useState<LoteCampanha[]>([]);
  // Safras marcadas para disparo (mais de uma = dispara todas marcadas com a mesma copy e quantidade)
  const [checkedBatchIds, setCheckedBatchIds] = useState<string[]>([]);
  const [brandOptions, setBrandOptions] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    apiFetch(urlBrands).then(r => (r.ok ? r.json() : [])).then(d => { if (Array.isArray(d)) setBrandOptions(d); }).catch(() => {});
  }, []);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [leads, setLeads] = useState<CampaignLead[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [actionNotification, setActionNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Kanban Batch Dispatch Modal State
  const [isBatchDispatchModalOpen, setIsBatchDispatchModalOpen] = useState<boolean>(false);
  const [dispatchQuantityOption, setDispatchQuantityOption] = useState<number | 'ALL'>(100);
  const [customDispatchQuantity, setCustomDispatchQuantity] = useState<string>('100');
  // Distribuição por safra: automática (proporcional) ou ajustada à mão na tabela.
  const [distribuicaoManual, setDistribuicaoManual] = useState<Record<string, number> | null>(null);
  const linhasDisparo = checkedBatchIds.map((id) => ({
    id,
    nome: batches.find((b) => b.id === id)?.name || id,
    disponivel: (batches.find((b) => b.id === id) as any)?.stagingCount ?? 0,
  }));
  const desejadoDisparo = dispatchQuantityOption === 'ALL'
    ? linhasDisparo.reduce((s, l) => s + l.disponivel, 0)
    : (Number(customDispatchQuantity) > 0 ? Number(customDispatchQuantity) : 100);
  const planoDisparo: Record<string, number> = distribuicaoManual ?? distribuirQuantidade(desejadoDisparo, linhasDisparo);
  const totalPlanoDisparo = linhasDisparo.reduce((s, l) => s + (planoDisparo[l.id] ?? 0), 0);
  useEffect(() => { setDistribuicaoManual(null); }, [desejadoDisparo, checkedBatchIds.join(',')]);
  const [dispatchSelectedCloser, setDispatchSelectedCloser] = useState<string>('seller-thomas');
  const [dispatchSelectedClosers, setDispatchSelectedClosers] = useState<string[]>([]);
  const [dispatchModalStep, setDispatchModalStep] = useState<'config' | 'processing' | 'success'>('config');
  const [dispatchInfo, setDispatchInfo] = useState<{ marca: string; numeros: string[]; previa: { emEspera: number; passariam: number; barrados: number } | null } | null>(null);
  const [batchDispatchStats, setBatchDispatchStats] = useState<{ total: number; dispatched: number; failed: number; sellersUsed?: string[] }>({ total: 0, dispatched: 0, failed: 0 });

  // Configuração da Velocidade de Disparo & Rastreamento em Tempo Real (BullMQ + Redis)
  // A vazão é limitada pelo plano da FluxoAPI, que mede por MINUTO (Starter 60/min, Pro 300, Escala 1.200...).
  // Os valores reais vêm do servidor (FLUXO_PLAN_RPM); aqui só guardamos o que ele devolve. Unidade interna: msgs/segundo.
  const [dispatchSpeed, setDispatchSpeed] = useState<number>(0.8);
  // Número de envio do disparo (vazio = marca da safra ou número geral). O servidor usa esta escolha primeiro.
  const [dispatchPhoneNumberId, setDispatchPhoneNumberId] = useState<string>('');
  const [dispatchNumbers, setDispatchNumbers] = useState<Array<{ id: string; name: string; phone: string }>>([]);
  useEffect(() => {
    apiFetch(urlAdminFluxoInstances)
      .then(r => r.json() as Promise<RespostaInstanciasFluxo>)
      .then(d => { if (d?.success && Array.isArray(d.instances)) setDispatchNumbers(d.instances); })
      .catch(() => { /* seletor é opcional */ });
  }, []);
  const [speedLimits, setSpeedLimits] = useState<{ maxSpeed: number; maxPerMinute: number; planRpm: number }>({ maxSpeed: 0.8, maxPerMinute: 48, planRpm: 60 });
  const [speedPresets, setSpeedPresets] = useState<Array<{ label: string; speed: number; description: string }>>([]);
  const [liveBatchProgress, setLiveBatchProgress] = useState<{
    batchId: string;
    total: number;
    enqueued: number;
    sent: number;
    delivered: number;
    failed: number;
    speed: number;
    status: 'idle' | 'running' | 'paused' | 'completed' | 'cancelled';
    estimatedSeconds: number;
    startedAt: number;
    lastError?: string;
  } | null>(null);
  const [isUpdatingSpeed, setIsUpdatingSpeed] = useState<boolean>(false);

  const [isDragOverStaging, setIsDragOverStaging] = useState<boolean>(false);
  const [stagingSelectedLeadIds, setStagingSelectedLeadIds] = useState<string[]>([]);
  const [visibleStagingCount, setVisibleStagingCount] = useState<number>(100);
  const [visibleColdCount, setVisibleColdCount] = useState<number>(100);
  const stagingZipInputRef = useRef<HTMLInputElement>(null);

  // Montador Sub-tabs: 'editor' (Criador / Editor de Disparo) | 'biblioteca' (Biblioteca de Templates & Copys)
  const [montadorSubTab, setMontadorSubTab] = useState<'editor' | 'biblioteca'>('editor');

  // Rastreio da variável ativa para inserção com 1 clique de tags
  const [activeVarField, setActiveVarField] = useState<number>(1);

  // Configuração do Botão do Template da Meta (Call to Action)
  const [buttonDestinationType, setButtonDestinationType] = useState<'site_novo' | 'site_antigo' | 'custom'>('site_novo');
  const [buttonCustomUrl, setButtonCustomUrl] = useState<string>('https://nyroh.com.br');
  const [buttonTextLabel, setButtonTextLabel] = useState<string>('Acessar Site Criado');

  // Configurações Avançadas da Quarentena Anti-Vazamento
  const [quarantineUnit, setQuarantineUnit] = useState<'hours' | 'days'>('hours');
  const [quarantineOnReplyAction, setQuarantineOnReplyAction] = useState<'lock_closer' | 'notify_admin' | 'move_hot_column'>('lock_closer');
  const [quarantineOnExpireAction, setQuarantineOnExpireAction] = useState<'roulette_closers' | 'manual_pool' | 'cold_call_list'>('manual_pool');
  const [quarantineCustomHours, setQuarantineCustomHours] = useState<number>(4);

  // Montador State - Templates & 2 Níveis de Variáveis
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  // Seletor ÚNICO: o modelo escolhido no montador é o que a prévia mostra e o que o disparo envia
  const dispatchSelectedTemplate = selectedTemplate;
  const setDispatchSelectedTemplate = setSelectedTemplate;
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState<boolean>(false);
  const [simulatorLeadIndex, setSimulatorLeadIndex] = useState<number>(0);
  const [dispatchQuarantineHours, setDispatchQuarantineHours] = useState<number>(4);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [dispatchProgress, setDispatchProgress] = useState<number>(0);
  const [highlightVariables, setHighlightVariables] = useState<boolean>(true);

  // Lista unificada e enriquecida de templates homologados da Meta
  const metaTemplatesList: MetaTemplateFull[] = useMemo(() => {
    const list: MetaTemplateFull[] = availableTemplates.map(t => {
      let btns: MetaTemplateButton[] = t.buttons || [];
      if ((!btns || btns.length === 0) && t.components && Array.isArray(t.components)) {
        const btnComp = t.components.find((c: any) => c.type === 'BUTTONS');
        if (btnComp && Array.isArray(btnComp.buttons)) {
          btns = btnComp.buttons;
        }
      }

      return {
        ...t,
        buttons: btns,
        footerText: t.footerText || (t.components?.find((c: any) => c.type === 'FOOTER')?.text || '')
      };
    });

    return list;
  }, [availableTemplates]);

  // Recuperar o template da Meta ativo
  const activeMetaTemplate: MetaTemplateFull = useMemo(() => {
    return (
      metaTemplatesList.find(t => t.name === selectedTemplate)
    );
  }, [metaTemplatesList, selectedTemplate]);


  // Índices {{n}} do modelo ativo (uma caixa para cada). Sem corpo lido, cai em 1..3.
  const activeVarIndexes: number[] = useMemo(() => {
    const idx = templateVarIndexes(activeMetaTemplate?.bodyText || '');
    return idx;
  }, [activeMetaTemplate]);

  // Tags fixas (dados do lead e do vendedor) + campos do arquivo importado das safras escolhidas
  const TAGS_FIXAS = [
    { tag: '{nome}', desc: 'Primeiro nome do responsável' },
    { tag: '{empresa}', desc: 'Razão social ou fantasia' },
    { tag: '{site_novo}', desc: 'Link do site criado no Nyroh' },
    { tag: '{vendedor}', desc: 'Nome do closer ou admin' },
    { tag: '{telefone}', desc: 'Telefone do lead' },
    { tag: '{site_antigo}', desc: 'Site antigo (se tiver)' },
    { tag: '{data}', desc: 'Data do disparo' },
    { tag: '{nicho}', desc: 'Nicho do lead' }
  ];
  const [camposLead, setCamposLead] = useState<string[]>([]);
  useEffect(() => {
    const qs = selectedBatchId ? `?batchId=${encodeURIComponent(selectedBatchId)}` : '';
    apiFetch(urlCampaignLeadFieldsId(qs))
      .then(r => (r.ok ? r.json() : null))
      .then(d => setCamposLead(Array.isArray(d?.fields) ? d.fields : []))
      .catch(() => setCamposLead([]));
  }, [selectedBatchId]);
  const camposTag = camposLead
    .filter(c => !TAGS_FIXAS.some(t => t.tag === `{${c}}`))
    .map(c => ({ tag: `{${c}}`, desc: 'Campo do arquivo importado' }));

  // Valores da copy do modelo escolhido: só os índices {{n}} DESTE modelo
  const valoresParaSalvar = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const n of activeVarIndexes) out[String(n)] = copiesByIdx[n] ?? '';
    return out;
  };
  // Nada sai sem modelo escolhido e sem todas as variáveis do modelo escritas
  const erroCopyParaDisparo = (): string | null => {
    if (!selectedTemplate) return 'Escolha um modelo aprovado antes de disparar.';
    const conhecidos = new Set<string>([...TAGS_FIXAS.map(t => t.tag.slice(1, -1)), ...camposLead]);
    for (const n of activeVarIndexes) {
      const texto = copiesByIdx[n] ?? '';
      if (!texto.trim()) return `Escreva a variável {{${n}}} da copy antes de disparar.`;
      for (const m of texto.matchAll(/\{([a-zA-Z_][^{}\n]{0,59})\}/g)) {
        const campo = m[1].trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_');
        if (selectedBatchId && !conhecidos.has(campo)) {
          return `A variável {{${n}}} usa {${m[1]}}, que não existe nas safras escolhidas. Use um campo da lista de tags.`;
        }
      }
    }
    return null;
  };

  // Teste de envio: manda o modelo escolhido, com a copy montada, para um número (com um lead de exemplo)
  const [testPhone, setTestPhone] = useState<string>('5511988216073');
  const [testSending, setTestSending] = useState<boolean>(false);
  const handleSendTestToPhone = async () => {
    const erroTeste = erroCopyParaDisparo();
    if (erroTeste) {
      setActionNotification({ type: 'error', message: erroTeste });
      return;
    }
    const sample = { firstName: 'Thomas', company: 'Teste', seller: 'Thomas', url: 'https://hf-retifica-de-motores-desde-1990-11940829913.nyroh.com.br' };
    const idx = activeVarIndexes;
    const vars: Record<string, string> = {};
    for (const n of idx) {
      const v = sanitizeTemplateVariable(fillLeadTokens(copiesByIdx[n] ?? '', sample));
      if (!v.trim()) {
        setActionNotification({ type: 'error', message: `Preencha a Variável {{${n}}} antes do teste.` });
        return;
      }
      vars[String(n)] = v;
    }
    const totalTeste = measureBodyLength(sample);
    if (totalTeste > META_BODY_MAX) {
      setActionNotification({ type: 'error', message: `O texto do modelo ficou com ${totalTeste} caracteres (limite da Meta: ${META_BODY_MAX}). Encurte as variáveis antes do teste.` });
      return;
    }
    setTestSending(true);
    try {
      const r = await apiFetch(urlCampaignTestDispatch, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: testPhone,
          leadName: 'Teste Thomas',
          metaTemplateName: selectedTemplate,
          variables: vars,
          publicUrl: sample.url,
          customNotes: 'Teste de envio pelo montador'
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.success === false) {
        setActionNotification({ type: 'error', message: d.error || 'O teste não saiu. Veja a mensagem de erro.' });
      } else {
        setActionNotification({ type: 'success', message: `Teste enviado para ${testPhone} com o modelo ${selectedTemplate}.` });
      }
    } catch {
      setActionNotification({ type: 'error', message: 'Falha de conexão ao enviar o teste.' });
    } finally {
      setTestSending(false);
    }
  };

  // Copies por índice do modelo ativo ({{n}} -> texto do montador). Sem modelo carregado, não envia (cai no padrão antigo).
  const copiesByIndexForClient = (): Record<string, string> | undefined => {
    const idx = templateVarIndexes(activeMetaTemplate?.bodyText || '');
    if (idx.length === 0) return undefined;
    const out: Record<string, string> = {};
    for (const n of idx) out[String(n)] = copiesByIdx[n] ?? '';
    return out;
  };

  // Limite oficial da Meta para o CORPO do template (texto fixo + variáveis somados): 1024 caracteres.
  // Cada variável pode ocupar o corpo inteiro; o que vale é o total renderizado.
  const META_BODY_MAX = 1024;
  const META_CHAR_LIMITS = {
    var1: META_BODY_MAX,
    var2: META_BODY_MAX,
    var3: META_BODY_MAX
  };
  // Tamanho do corpo já renderizado com as três variáveis
  // Mede o corpo FINAL que a Meta recebe: variáveis preenchidas com os campos do lead + texto fixo do modelo
  const bodyMeasureSample = { firstName: 'Roberto', company: 'Padaria Estrela', seller: 'Thomas', url: 'https://hf-retifica-de-motores-desde-1990-11940829913.nyroh.com.br' };
  const measureBodyLength = (ctx: { firstName: string; company: string; seller: string; url: string } = bodyMeasureSample): number => {
    const values: Record<number, string> = {};
    for (const n of activeVarIndexes) values[n] = sanitizeTemplateVariable(fillLeadTokens(copiesByIdx[n] ?? '', ctx));
    return renderTemplateBody(activeMetaTemplate?.bodyText || '', values).text.length;
  };

  // Variáveis de Conteúdo: uma caixa por {{n}} do modelo escolhido.
  // Cada modelo guarda o SEU rascunho. Nada vem pré-preenchido: a copy é escrita em cima do template.
  const [copiesMapByTemplate, setCopiesMapByTemplate] = useState<Record<string, Record<number, string>>>(() => {
    try {
      const saved = localStorage.getItem('nyroh_copies_by_template');
      if (saved) return JSON.parse(saved) || {};
    } catch {}
    return {};
  });
  const copiesByIdx: Record<number, string> = copiesMapByTemplate[selectedTemplate] || {};
  const setCopyAt = (n: number, value: string) =>
    setCopiesMapByTemplate(prev => ({ ...prev, [selectedTemplate]: { ...(prev[selectedTemplate] || {}), [n]: value } }));
  // Apelidos usados pelo disparo (var1..var3 seguem indo junto, para compatibilidade)
  const templateVar1 = copiesByIdx[1] ?? '';
  const templateVar2 = copiesByIdx[2] ?? '';
  const templateVar3 = copiesByIdx[3] ?? '';
  const setTemplateVar1 = (v: string) => setCopyAt(1, v);
  const setTemplateVar2 = (v: string) => setCopyAt(2, v);
  const setTemplateVar3 = (v: string) => setCopyAt(3, v);

  // Biblioteca de Templates de Copy (O que vai DENTRO das variáveis do template da Meta)
  const [copyTemplates, setCopyTemplates] = useState<CopiaCampanha[]>([]);
  const [selectedCopyTemplateId, setSelectedCopyTemplateId] = useState<string>(() => {
    try {
      return localStorage.getItem('nyroh_selected_copy_id') || 'tpl_prospeccao_proativo';
    } catch {
      return 'tpl_prospeccao_proativo';
    }
  });
  const [loadingCopies, setLoadingCopies] = useState<boolean>(false);
  const [showSaveCopyModal, setShowSaveCopyModal] = useState<boolean>(false);
  const [showLibraryModal, setShowLibraryModal] = useState<boolean>(false);
  const [newCopyName, setNewCopyName] = useState<string>('');
  const [newCopyDesc, setNewCopyDesc] = useState<string>('');
  const [newCopyCategory, setNewCopyCategory] = useState<'prospeccao' | 'followup' | 'reativacao' | 'personalizado'>('prospeccao');

  // Guarda os rascunhos por modelo para não perder ao dar F5
  useEffect(() => {
    try {
      localStorage.setItem('nyroh_copies_by_template', JSON.stringify(copiesMapByTemplate));
    } catch {}
  }, [copiesMapByTemplate]);

  useEffect(() => {
    try {
      if (selectedCopyTemplateId) {
        localStorage.setItem('nyroh_selected_copy_id', selectedCopyTemplateId);
      }
    } catch {}
  }, [selectedCopyTemplateId]);

  // Fetch approved Meta templates from server
  const fetchMetaTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const res = await apiFetch(urlAdminFluxoTemplates);
      if (res.ok) {
        const data = (await res.json()) as RespostaListaModelosFluxo;
        if (data.templates && Array.isArray(data.templates)) {
          const approved = data.templates.filter((t: any) => t.status === 'APPROVED' || t.status === 'active');
          const list = approved.length > 0 ? approved : data.templates;
          setAvailableTemplates(list);
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar templates para disparo:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Fetch Copy Templates Library
  const fetchCopyTemplates = async () => {
    try {
      setLoadingCopies(true);
      const res = await apiFetch(urlCampaignCopies);
      if (res.ok) {
        const data = (await res.json()) as RespostaListaCopias;
        if (Array.isArray(data)) {
          setCopyTemplates(data);
          // Manter a seleção salva no localStorage se existir
          const savedId = localStorage.getItem('nyroh_selected_copy_id') || selectedCopyTemplateId;
          const found = data.find(c => c.id === savedId);
          if (found) {
            setSelectedCopyTemplateId(found.id);
          } else if (data.length > 0 && !selectedCopyTemplateId) {
            setSelectedCopyTemplateId(data[0].id);
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao buscar biblioteca de templates de copy:', err);
    } finally {
      setLoadingCopies(false);
    }
  };

  // Handle selecting a copy template from library with strict character enforcement
  const handleSelectCopyTemplate = (copyId: string) => {
    setSelectedCopyTemplateId(copyId);
    try {
      localStorage.setItem('nyroh_selected_copy_id', copyId);
    } catch {}
    const found: any = copyTemplates.find(c => c.id === copyId);
    if (!found) return;
    const valores: Record<number, string> = {};
    for (const [k, v] of Object.entries(found.values || {})) valores[Number(k)] = String(v ?? '').slice(0, META_BODY_MAX);
    if (found.metaTemplateName) {
      const existe = availableTemplates.some((t: any) => t.name === found.metaTemplateName);
      if (!existe) {
        setActionNotification({ type: 'error', message: `A copy "${found.name}" foi feita para o modelo "${found.metaTemplateName}", que não está na sua conta. Escolha outro modelo ou edite a copy.` });
        return;
      }
      setSelectedTemplate(found.metaTemplateName);
      setCopiesMapByTemplate(prev => ({ ...prev, [found.metaTemplateName]: valores }));
      setActionNotification({ type: 'success', message: `Copy "${found.name}" carregada no modelo ${found.metaTemplateName}.` });
    } else {
      // Copy antiga, sem modelo: entra no modelo que estiver escolhido agora
      if (!selectedTemplate) {
        setActionNotification({ type: 'error', message: 'Escolha o modelo da Meta antes de usar esta copy.' });
        return;
      }
      setCopiesMapByTemplate(prev => ({ ...prev, [selectedTemplate]: valores }));
      setActionNotification({ type: 'success', message: `Copy "${found.name}" carregada. Ela não tinha modelo salvo: confira se as variáveis batem com ${selectedTemplate}.` });
    }
  };

  // Atualizar copy atual selecionada na biblioteca
  const handleUpdateCurrentCopyTemplate = async () => {
    const erroCopy = selectedTemplate ? erroCopyParaDisparo() : 'Escolha o modelo da Meta antes de salvar a copy.';
    if (erroCopy) {
      setActionNotification({ type: 'error', message: erroCopy });
      return;
    }
    if (!selectedCopyTemplateId) {
      setShowSaveCopyModal(true);
      return;
    }
    const current = copyTemplates.find(c => c.id === selectedCopyTemplateId);
    if (!current) {
      setShowSaveCopyModal(true);
      return;
    }

    try {
      const res = await apiFetch(urlCampaignCopiesId(selectedCopyTemplateId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: current.name,
          description: current.description,
          category: current.category,
          metaTemplateName: selectedTemplate,
          values: valoresParaSalvar(),
          var1: templateVar1.slice(0, META_CHAR_LIMITS.var1),
          var2: templateVar2.slice(0, META_CHAR_LIMITS.var2),
          var3: templateVar3.slice(0, META_CHAR_LIMITS.var3)
        })
      });
      if (res.ok) {
        const updated = (await res.json()) as RespostaCopiaSalva;
        setCopyTemplates(prev => prev.map(c => c.id === updated.id ? updated : c));
        setActionNotification({
          type: 'success',
          message: `Alterações salvas com sucesso na copy "${updated.name}"!`
        });
      } else {
        const err = (await res.json()) as RespostaErroApi;
        setActionNotification({
          type: 'error',
          message: err.error || 'Não foi possível atualizar o template de copy.'
        });
      }
    } catch {
      setActionNotification({
        type: 'error',
        message: 'Erro de conexão ao salvar alterações na copy.'
      });
    }
  };

  // Limpa as variáveis do modelo escolhido: a copy é escrita do zero, em cima do template
  const handleResetToApprovedCopy = () => {
    if (!selectedTemplate) return;
    setCopiesMapByTemplate(prev => ({ ...prev, [selectedTemplate]: {} }));
    setActionNotification({ type: 'success', message: 'Variáveis limpas. Escreva a copy deste modelo.' });
  };

  // Save current copy variables as a new copy template
  const handleSaveCurrentAsCopyTemplate = async () => {
    const erroCopy = selectedTemplate ? erroCopyParaDisparo() : 'Escolha o modelo da Meta antes de salvar a copy.';
    if (erroCopy) {
      alert(erroCopy);
      return;
    }
    if (!newCopyName.trim()) {
      alert('Por favor, informe o nome do seu template de mensagem.');
      return;
    }

    try {
      const res = await apiFetch(urlCampaignCopies, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCopyName.trim(),
          description: newCopyDesc.trim(),
          category: newCopyCategory,
          metaTemplateName: selectedTemplate,
          values: valoresParaSalvar(),
          var1: templateVar1,
          var2: templateVar2,
          var3: templateVar3
        })
      });

      if (res.ok) {
        const created = (await res.json()) as RespostaCopiaSalva;
        setCopyTemplates(prev => [created, ...prev]);
        setSelectedCopyTemplateId(created.id);
        try {
          localStorage.setItem('nyroh_selected_copy_id', created.id);
        } catch {}
        setShowSaveCopyModal(false);
        setNewCopyName('');
        setNewCopyDesc('');
        setActionNotification({
          type: 'success',
          message: `Novo template de mensagem "${created.name}" salvo com sucesso no banco de dados!`
        });
      } else {
        const errData = await res.json();
        alert(errData.error || 'Erro ao salvar template.');
      }
    } catch (err: any) {
      alert('Erro de conexão ao salvar template.');
    }
  };

  // Delete copy template
  const handleDeleteCopyTemplate = async (copyId: string, copyName: string) => {
    if (!confirm(`Deseja realmente excluir a copy "${copyName}" da biblioteca?`)) return;

    try {
      const res = await apiFetch(urlCampaignCopiesId(copyId), { method: 'DELETE' });
      if (res.ok) {
        setCopyTemplates(prev => prev.filter(c => c.id !== copyId));
        if (selectedCopyTemplateId === copyId) {
          const remaining = copyTemplates.filter(c => c.id !== copyId);
          if (remaining.length > 0) {
            handleSelectCopyTemplate(remaining[0].id);
          }
        }
        setActionNotification({
          type: 'success',
          message: `Template "${copyName}" removido com sucesso.`
        });
      } else {
        const err = await res.json();
        alert(err.error || 'Não foi possível excluir.');
      }
    } catch (err) {
      alert('Erro de conexão ao excluir template.');
    }
  };

  // Insert Tag Helper: insere a tag na caixa ativa respeitando o limite de caracteres do corpo da Meta
  const insertTagIntoActiveVar = (tag: string) => {
    const n = activeVarField;
    const next = `${copiesByIdx[n] ?? ''} ${tag}`.trim();
    const total = renderTemplateBody(activeMetaTemplate?.bodyText || '{{1}}{{2}}{{3}}', { ...copiesByIdx, [n]: next }).text.length;
    if (total > META_BODY_MAX) {
      setActionNotification({
        type: 'error',
        message: `Não foi possível inserir ${tag}: o corpo do template chegaria a ${total} caracteres (Limite Meta: ${META_BODY_MAX}).`
      });
      return;
    }
    setCopyAt(n, next);
    setActionNotification({
      type: 'success',
      message: `Tag ${tag} inserida na Variável {{${n}}}`
    });
  };

  useEffect(() => {
    fetchMetaTemplates();
    fetchCopyTemplates();
  }, []);



  // Quarentena State
  const [quarantineRemainingTime, setQuarantineRemainingTime] = useState<string>('04h 00m 00s');

  // Distribuição State
  const [retainHotForAdmin, setRetainHotForAdmin] = useState<boolean>(true);
  const [onlyColdLeads, setOnlyColdLeads] = useState<boolean>(true);
  const [sellerQuotas, setSellerQuotas] = useState<Record<string, number>>({});
  const [isDistributing, setIsDistributing] = useState<boolean>(false);

  // Modals
  const [showNewBatchModal, setShowNewBatchModal] = useState<boolean>(false);
  const [newBatchName, setNewBatchName] = useState<string>('');
  const [newBatchHours, setNewBatchHours] = useState<number>(4);
  const [showUploadZipModal, setShowUploadZipModal] = useState<boolean>(false);
  const [paginaSubirZip, setPaginaSubirZip] = useState<boolean>(false);
  const [zipUploads, setZipUploads] = useState<ZipUploadRegistro[]>([]);
  const [zipUploadsCarregando, setZipUploadsCarregando] = useState<boolean>(false);

  const carregarHistoricoZips = async () => {
    setZipUploadsCarregando(true);
    try {
      const r = await apiFetch(urlCampaignUploads);
      const d = (await r.json()) as RespostaListaUploads;
      setZipUploads(Array.isArray(d.uploads) ? d.uploads : []);
    } catch {
      setZipUploads([]);
    } finally {
      setZipUploadsCarregando(false);
    }
  };

  useEffect(() => {
    if (paginaSubirZip) carregarHistoricoZips();
  }, [paginaSubirZip]);
  const [showImportProgressModal, setShowImportProgressModal] = useState<boolean>(false);
  const [importProgressData, setImportProgressData] = useState<ImportProgressData | null>(null);
  const importAbortRef = useRef<XMLHttpRequest | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sincronização & Reciclagem com WhatsApp Web
  const [showSyncWhatsAppModal, setShowSyncWhatsAppModal] = useState<boolean>(false);
  const [syncWhatsAppInput, setSyncWhatsAppInput] = useState<string>('');
  const [isSyncingWhatsApp, setIsSyncingWhatsApp] = useState<boolean>(false);
  const [syncWhatsAppResult, setSyncWhatsAppResult] = useState<{
    totalBatchLeads: number;
    whatsappChatsProvided: number;
    confirmedDispatched: number;
    recycledToStaging: number;
    movedToLandlines: number;
    alreadyResponded: number;
  } | null>(null);
  const syncJsonFileInputRef = useRef<HTMLInputElement>(null);

  // Fetch batches from server
  const fetchBatches = async () => {
    try {
      setLoading(true);
      const res = await apiFetch(urlCampaignBatches);
      if (res.ok) {
        const data = (await res.json()) as RespostaListaLotes;
        setBatches(data);
        if (data.length > 0 && !selectedBatchId) {
          setSelectedBatchId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar safras:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  // Fetch leads for the active batch
  const fetchLeads = async () => {
    const idsQuadro = checkedBatchIds.length > 0 ? checkedBatchIds : (selectedBatchId ? [selectedBatchId] : []);
    if (idsQuadro.length === 0) {
      setLeads([]);
      return;
    }
    try {
      const url = new URL('/api/campaign/leads', window.location.origin);
      url.searchParams.set('batchIds', idsQuadro.join(','));
      url.searchParams.set('limit', 'ALL');
      if (statusFilter !== 'ALL') {
        url.searchParams.set('status', statusFilter);
      }
      if (searchQuery.trim()) {
        url.searchParams.set('search', searchQuery.trim());
      }
      const res = await apiFetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      }
    } catch (err) {
      console.error('Erro ao buscar leads da campanha:', err);
    }
  };

  useEffect(() => {
    setVisibleStagingCount(100);
    setVisibleColdCount(100);
    fetchLeads();
  }, [selectedBatchId, checkedBatchIds.join(','), statusFilter, searchQuery]);

  // Selected batch reference
  const currentBatch = useMemo(() => {
    return batches.find(b => b.id === selectedBatchId) || batches[0] || null;
  }, [batches, selectedBatchId]);

  // Carrega as duas regras de saída salvas na safra selecionada (para a tela refletir o que está no banco)
  useEffect(() => {
    const r: any = (currentBatch as any)?.onReplyAction;
    const e: any = (currentBatch as any)?.onExpireAction;
    if (r === 'lock_closer' || r === 'notify_admin' || r === 'move_hot_column') setQuarantineOnReplyAction(r);
    if (e === 'roulette_closers' || e === 'manual_pool' || e === 'cold_call_list') setQuarantineOnExpireAction(e);
  }, [currentBatch?.id, (currentBatch as any)?.onReplyAction, (currentBatch as any)?.onExpireAction]);

  // Initialize quotas for distribution
  useEffect(() => {
    if (salespeople.length > 0) {
      const initial: Record<string, number> = {};
      salespeople.forEach(s => {
        initial[s.id] = 15;
      });
      setSellerQuotas(initial);
    }
  }, [salespeople]);

  // Timer countdown
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentBatch?.quarantineEndsAt) {
        const diff = new Date(currentBatch.quarantineEndsAt).getTime() - Date.now();
        if (diff > 0) {
          const h = Math.floor(diff / (1000 * 60 * 60));
          const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const s = Math.floor((diff % (1000 * 60)) / 1000);
          setQuarantineRemainingTime(
            `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
          );
        } else {
          const regraExpira: any = (currentBatch as any)?.onExpireAction;
          setQuarantineRemainingTime(
            regraExpira === 'manual_pool' || !regraExpira
              ? 'Tempo acabou: aguardando sua liberação'
              : 'Tempo acabou: distribuição automática ainda não está ligada, aguardando sua liberação'
          );
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [currentBatch]);

  // Fetch initial speed from backend
  const fetchDispatchSpeed = async () => {
    try {
      const res = await apiFetch(urlCampaignDispatchSpeed);
      if (res.ok) {
        const data = (await res.json()) as RespostaVelocidadeDisparo;
        if (data.currentSpeed) setDispatchSpeed(data.currentSpeed);
        if (data.presets) setSpeedPresets(data.presets);
        if (data.maxSpeed) setSpeedLimits({ maxSpeed: data.maxSpeed, maxPerMinute: data.maxPerMinute, planRpm: data.planRpm });
      }
    } catch (err) {
      console.warn('Erro ao obter velocidade de disparo:', err);
    }
  };

  useEffect(() => {
    fetchDispatchSpeed();
  }, []);

  // Update speed in real-time
  const handleUpdateGlobalSpeed = async (newSpeed: number) => {
    // nunca acima do teto do plano (o servidor também corta; aqui é só para a tela não prometer o impossível)
    const val = Math.max(1 / 60, Math.min(speedLimits.maxSpeed, newSpeed));
    setDispatchSpeed(val);
    setIsUpdatingSpeed(true);
    try {
      const res = await apiFetch(urlCampaignDispatchSpeed, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed: val })
      });
      if (res.ok) {
        const data = await res.json();
        setDispatchSpeed(data.speed);
        showNotification('success', `⚡ Velocidade da esteira: ${Math.round(data.speed * 60)} msgs/min${data.cappedByPlan ? ` (limitada ao teto do seu plano FluxoAPI: ${data.planRpm}/min no total)` : ''}.`);
      }
    } catch {
      showNotification('error', 'Falha ao atualizar velocidade.');
    } finally {
      setIsUpdatingSpeed(false);
    }
  };

  // Pause batch
  const handlePauseBatch = async (batchId: string) => {
    try {
      const res = await apiFetch(urlCampaignBatchesPauseId(batchId), { method: 'POST' });
      if (res.ok) {
        setLiveBatchProgress(prev => prev ? { ...prev, status: 'paused' } : null);
        showNotification('success', '⏸️ Esteira de disparo pausada.');
      }
    } catch {
      showNotification('error', 'Erro ao pausar esteira.');
    }
  };

  // Resume batch
  const handleResumeBatch = async (batchId: string) => {
    try {
      const res = await apiFetch(urlCampaignBatchesResumeId(batchId), { method: 'POST' });
      if (res.ok) {
        setLiveBatchProgress(prev => prev ? { ...prev, status: 'running' } : null);
        showNotification('success', '▶️ Esteira de disparo retomada.');
      }
    } catch {
      showNotification('error', 'Erro ao retomar esteira.');
    }
  };

  // Cancel batch
  const handleCancelBatch = async (batchId: string) => {
    if (!confirm('Deseja realmente cancelar o disparo dos leads restantes deste lote?')) return;
    try {
      const res = await apiFetch(urlCampaignBatchesCancelId(batchId), { method: 'POST' });
      if (res.ok) {
        setLiveBatchProgress(prev => prev ? { ...prev, status: 'cancelled' } : null);
        showNotification('success', '🛑 Disparo cancelado pelo gestor.');
        fetchLeads();
        fetchBatches();
      }
    } catch {
      showNotification('error', 'Erro ao cancelar disparo.');
    }
  };

  // Progresso do disparo em tempo real, pela conexão ÚNICA da aba (src/lib/realtime.ts).
  useEffect(() => {
    const offs = [
      onRealtime('CAMPAIGN_BATCH_PROGRESS', (data: any) => {
        if (!data) return;
        setLiveBatchProgress(data);
        const percent = Math.min(100, Math.round(((data.sent + data.failed) / (data.total || 1)) * 100));
        setDispatchProgress(percent);
      }),

      onRealtime('DISPATCH_COMPLETED', (data: any) => {
        if (!data) return;
        setBatchDispatchStats({
          total: data.dispatchedCount,
          dispatched: data.successCount,
          failed: data.failCount,
          sellersUsed: []
        });
        setDispatchProgress(100);
        setDispatchModalStep('success');
        setLiveBatchProgress(prev => prev ? { ...prev, status: 'completed' } : null);
        showNotification('success', `🎉 Disparo concluído! ${data.successCount} enviados com sucesso.`);
        fetchBatches();
        fetchLeads();
        onLeadsUpdated?.();
      }),

      onRealtime('CAMPAIGN_SPEED_CHANGED', (data: any) => {
        if (data?.speed) setDispatchSpeed(data.speed);
      })
    ];

    return () => {
      for (const off of offs) off();
    };
  }, []);

  // Toast notification helper
  const showNotification = (type: 'success' | 'error', message: string) => {
    setActionNotification({ type, message });
    setTimeout(() => setActionNotification(null), 5000);
  };

  // Create new Campaign Safra
  const handleCreateBatch = async () => {
    if (!newBatchName.trim()) return;
    try {
      const res = await apiFetch(urlCampaignBatches, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBatchName.trim(),
          quarantineHours: newBatchHours || 4
        })
      });
      if (res.ok) {
        const created = await res.json();
        setBatches(prev => [created, ...prev]);
        setSelectedBatchId(created.id);
        setShowNewBatchModal(false);
        setNewBatchName('');
        showNotification('success', `Campanha "${created.name}" criada com sucesso!`);
      } else {
        showNotification('error', 'Não foi possível criar a nova safra.');
      }
    } catch {
      showNotification('error', 'Falha na conexão ao criar safra.');
    }
  };

  // Delete Campaign Safra
  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm('Deseja realmente excluir esta safra e todos os seus leads de staging?')) return;
    try {
      const res = await apiFetch(urlCampaignBatchesId(batchId), { method: 'DELETE' });
      if (res.ok) {
        setBatches(prev => prev.filter(b => b.id !== batchId));
        if (selectedBatchId === batchId) {
          const remaining = batches.filter(b => b.id !== batchId);
          setSelectedBatchId(remaining[0]?.id || '');
        }
        showNotification('success', 'Safra excluída com sucesso.');
      }
    } catch {
      showNotification('error', 'Erro ao excluir safra.');
    }
  };

  // Upload ZIP diretamente para o Staging Oficial com Modal de Progresso em Tempo Real
  const handleUploadZip = async (file: File) => {
    if (!file) return;

    // Se o usuário selecionou um arquivo .json:
    if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (content) {
          setSyncWhatsAppInput(content);
          setShowUploadZipModal(false);
          setShowSyncWhatsAppModal(true);
          showNotification('success', 'Arquivo JSON carregado no sincronizador do WhatsApp Web!');
        }
      };
      reader.readAsText(file);
      return;
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const foundBatch = batches.find(b => b.id === selectedBatchId);
    const batchNameTarget = foundBatch?.name || file.name.replace(/\.[^/.]+$/, '');
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);

    const initialProgress: ImportProgressData = {
      jobId,
      batchId: selectedBatchId || undefined,
      batchName: batchNameTarget,
      fileName: file.name,
      fileSizeBytes: file.size,
      stage: 'uploading',
      percent: 5,
      statusText: `Enviando ${file.name} (${fileSizeMB} MB) para o disco temporário da Railway...`,
      processedFiles: 0,
      totalFiles: 0,
      totalLeadsFound: 0,
      savedLeads: 0,
      validMobiles: 0,
      landlines: 0,
      withNyrohUrl: 0,
      withWebsite: 0,
      logs: [
        {
          timestamp: new Date().toLocaleTimeString('pt-BR'),
          text: `Iniciando upload de ${file.name} (${fileSizeMB} MB). Gravando diretamente em disco para poupar memória RAM...`,
          type: 'info'
        }
      ],
      startedAt: Date.now(),
      updatedAt: Date.now()
    };

    setImportProgressData(initialProgress);
    setShowImportProgressModal(false);
    setPaginaSubirZip(true);
    setIsUploading(true);

    // 1. Notificar servidor e inicializar job de tracking
    try {
      await apiFetch(urlCampaignImportProgressInit, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          fileName: file.name,
          fileSizeBytes: file.size,
          batchId: selectedBatchId
        })
      });
    } catch (e) {
      console.warn('Erro ao inicializar progresso no servidor:', e);
    }

    // 2. Polling contínuo como garantia absoluta caso WebSockets sofram oscilações de rede
    const pollInterval = setInterval(async () => {
      try {
        const pRes = await apiFetch(urlCampaignImportProgressId(jobId));
        if (pRes.ok) {
          const pData: ImportProgressData = await pRes.json();
          setImportProgressData(prev => ({
            ...(prev || {}),
            ...pData
          }));
          if (pData.stage === 'completed' || pData.stage === 'error') {
            clearInterval(pollInterval);
            setIsUploading(false);
            if (pData.stage === 'completed') {
              fetchBatches();
              fetchLeads();
            }
          }
        }
      } catch (err) {
        console.warn('Erro no polling de progresso:', err);
      }
    }, 600);

    // 3. Upload via XMLHttpRequest com progresso físico de bytes
    const formData = new FormData();
    formData.append('zipFile', file);
    formData.append('jobId', jobId);
    if (selectedBatchId) {
      formData.append('batchId', selectedBatchId);
    } else {
      formData.append('safraName', file.name.replace(/\.[^/.]+$/, ''));
    }

    const xhr = new XMLHttpRequest();
    importAbortRef.current = xhr;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const uploadPercent = Math.min(99, Math.round((event.loaded / event.total) * 100));
        setImportProgressData(prev => {
          if (!prev || prev.stage !== 'uploading') return prev;
          const displayPercent = Math.min(25, Math.floor(uploadPercent * 0.25));
          return {
            ...prev,
            percent: displayPercent,
            statusText: `Enviando arquivo: ${((event.loaded) / (1024 * 1024)).toFixed(1)} MB de ${((event.total) / (1024 * 1024)).toFixed(1)} MB (${uploadPercent}%)...`
          };
        });
      }
    };

    xhr.onload = async () => {
      clearInterval(pollInterval);
      setIsUploading(false);
      try {
        if (xhr.status >= 200 && xhr.status < 300) {
          const res = JSON.parse(xhr.responseText) as RespostaUploadZip;
          if (res.success) {
            setImportProgressData(prev => ({
              ...(prev || initialProgress),
              stage: 'completed',
              percent: 100,
              savedLeads: res.totalProcessed,
              validMobiles: res.validMobiles,
              landlines: res.landlines,
              withNyrohUrl: res.withNyrohUrl,
              withWebsite: res.withWebsite,
              statusText: `Concluído com sucesso! ${res.totalProcessed.toLocaleString('pt-BR')} leads gravados no PostgreSQL.`
            }));
            showNotification(
              'success',
              `Importação concluída: ${res.totalProcessed} leads processados (${res.validMobiles} celulares aptos para WhatsApp)!`
            );
            await fetchBatches();
            carregarHistoricoZips();
            if (res.batchId) setSelectedBatchId(res.batchId);
            await fetchLeads();
          } else {
            const errTxt = (res as RespostaErroApi).error || 'Erro ao processar arquivo ZIP.';
            setImportProgressData(prev => ({
              ...(prev || initialProgress),
              stage: 'error',
              error: errTxt
            }));
            showNotification('error', errTxt);
          }
        } else {
          let errTxt = 'Erro na resposta do servidor.';
          try {
            const parsed = JSON.parse(xhr.responseText);
            errTxt = parsed.error || errTxt;
          } catch {
            errTxt = `Erro HTTP ${xhr.status}: ${xhr.statusText}`;
          }
          setImportProgressData(prev => ({
            ...(prev || initialProgress),
            stage: 'error',
            error: errTxt
          }));
          showNotification('error', errTxt);
        }
      } catch (err: any) {
        setImportProgressData(prev => ({
          ...(prev || initialProgress),
          stage: 'error',
          error: err.message
        }));
        showNotification('error', `Erro ao finalizar upload: ${err.message}`);
      }
    };

    xhr.onerror = () => {
      clearInterval(pollInterval);
      setIsUploading(false);
      setImportProgressData(prev => ({
        ...(prev || initialProgress),
        stage: 'error',
        error: 'Erro de conexão com o servidor da Railway durante o upload.'
      }));
      showNotification('error', 'Falha na conexão durante o upload.');
    };

    xhr.open('POST', '/api/campaign/upload-zip');
    xhr.send(formData);
  };

  const handleCancelImport = () => {
    if (importAbortRef.current) {
      importAbortRef.current.abort();
      importAbortRef.current = null;
    }
    setIsUploading(false);
    setShowImportProgressModal(false);
    setImportProgressData(null);
    showNotification('success', 'Upload cancelado pelo usuário.');
  };

  // Trigger Dispatch (Blast)
  const handleTriggerDispatch = async () => {
    if (!selectedBatchId) return;
    setIsDispatching(true);
    setDispatchProgress(20);

    try {
      const interval = setInterval(() => {
        setDispatchProgress(prev => (prev < 90 ? prev + 15 : prev));
      }, 300);

      const res = await apiFetch(urlCampaignDispatch, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedBatchId,
          templateName: selectedTemplate,
          quarantineHours: dispatchQuarantineHours,
          phoneNumberId: dispatchPhoneNumberId || undefined,
          variableValues: {
            var1: templateVar1,
            var2: templateVar2,
            var3: templateVar3,
            byIndex: copiesByIndexForClient()
          }
        })
      });

      clearInterval(interval);
      setDispatchProgress(100);
      const data = await res.json();

      if (res.ok && data.success) {
        showNotification(
          'success',
          `Disparo efetuado com sucesso! ${data.dispatchedCount} leads enviados. Quarentena de ${dispatchQuarantineHours}h iniciada.`
        );
        await fetchBatches();
        await fetchLeads();
        setActiveTab('quarentena');
      } else {
        showNotification('error', data.error || 'Erro no disparo da campanha.');
      }
    } catch (err: any) {
      showNotification('error', `Erro ao disparar: ${err.message}`);
    } finally {
      setIsDispatching(false);
      setDispatchProgress(0);
    }
  };

  // Simulate positive response or opt-out
  const handleSimulateLeadReply = async (leadId: string, isInterested: boolean) => {
    try {
      const res = await apiFetch(urlCampaignLeadsSimulateReplyId(leadId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isInterested })
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(
          'success',
          isInterested
            ? '🔥 Lead respondeu interessado! Movido para INTERESSADOS.'
            : 'Opt-out registrado. Lead descartado da lista.'
        );
        fetchLeads();
        fetchBatches();
        onLeadsUpdated?.();
      } else {
        showNotification('error', data.error || 'Erro ao simular resposta.');
      }
    } catch {
      showNotification('error', 'Falha na comunicação.');
    }
  };

  // Open Batch Dispatch Modal with calculated quantities
  const handleOpenDispatchModal = (preselectedQuantity?: number) => {
    const stagingCount = leads.filter(l => l.status === 'STAGING').length;
    if (preselectedQuantity) {
      setDispatchQuantityOption(preselectedQuantity);
      setCustomDispatchQuantity(String(preselectedQuantity));
    } else {
      const defaultQty = stagingCount > 0 ? Math.min(100, stagingCount) : 100;
      setDispatchQuantityOption(defaultQty);
      setCustomDispatchQuantity(String(defaultQty));
    }

    if (dispatchSelectedClosers.length === 0 && salespeople && salespeople.length > 0) {
      setDispatchSelectedClosers([salespeople[0].id]);
      setDispatchSelectedCloser(salespeople[0].id);
    }

    setDispatchModalStep('config');
    setIsBatchDispatchModalOpen(true);
    carregarInfoDisparo();
  };

  /** Marca, números e previa das regras, para o admin ver o que vai acontecer antes de disparar. */
  const carregarInfoDisparo = async () => {
    setDispatchInfo(null);
    try {
      const [marcas, numeros, previa] = await Promise.all([
        apiFetch(urlBrands).then(r => (r.ok ? r.json() : [])),
        apiFetch(urlPhoneNumbers).then(r => (r.ok ? r.json() : [])),
        apiFetch(urlRegrasContatoPrevia, { method: 'POST' }).then(r => (r.ok ? r.json() : null)),
      ]);
      const marcaId = (currentBatch as any)?.brandId as string | undefined;
      const marca = marcas.find((m: any) => m.id === marcaId);
      const usados = marca ? numeros.filter((n: any) => marca.numberIds.includes(n.id)).map((n: any) => n.label) : [];
      setDispatchInfo({ marca: marca?.name || 'Sem marca', numeros: usados, previa });
    } catch {
      setDispatchInfo({ marca: 'Não carregou', numeros: [], previa: null });
    }
  };

  // Execute Batch Dispatch (Moves selected quantity from Staging -> Quarentena/Espera)
  // Dispara cada safra marcada, uma após a outra, com a mesma quantidade e copy escolhidas no modal
  const handleDispatchCheckedBatches = async () => {
    const erroCopy = erroCopyParaDisparo();
    if (erroCopy) {
      showNotification('error', erroCopy);
      return;
    }
    const targets = checkedBatchIds.filter(id => batches.some(b => b.id === id));
    if (targets.length === 0) return;
    const effectiveClosers = dispatchSelectedClosers.length > 0
      ? dispatchSelectedClosers
      : [dispatchSelectedCloser || 'seller-thomas'];
    const plano = planoDisparo;
    const totalPlano = totalPlanoDisparo;
    if (totalPlano <= 0) {
      showNotification('error', 'Nenhuma mensagem para disparar nas safras marcadas.');
      return;
    }
    const estourou = linhasDisparo.find((l) => (plano[l.id] ?? 0) > l.disponivel);
    if (estourou) {
      showNotification('error', `A safra "${estourou.nome}" recebeu mais leads do que tem disponível. Ajuste a distribuição.`);
      return;
    }
    if (totalPlano > CONFIRMA_ACIMA_DE && !window.confirm(`Confirma disparar ${totalPlano.toLocaleString('pt-BR')} mensagens nas ${targets.length} safra(s) marcadas?`)) {
      return;
    }
    setDispatchModalStep('processing');
    setIsDispatching(true);
    setDispatchProgress(5);
    let totalEnviados = 0;
    const batchesEnfileiradas: string[] = [];
    const falhas: string[] = [];
    for (const batchId of targets) {
      const qtd = plano[batchId] ?? 0;
      if (qtd <= 0) continue;
      try {
        const res = await apiFetch(urlCampaignDispatch, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId,
            templateName: dispatchSelectedTemplate,
            quarantineHours: dispatchQuarantineHours,
            phoneNumberId: dispatchPhoneNumberId || undefined,
            speedPerSecond: dispatchSpeed,
            limit: qtd,
            salespersonId: effectiveClosers[0],
            salespersonIds: effectiveClosers,
            variableValues: {
              var1: templateVar1.slice(0, META_CHAR_LIMITS.var1),
              var2: templateVar2.slice(0, META_CHAR_LIMITS.var2),
              var3: templateVar3.slice(0, META_CHAR_LIMITS.var3),
              byIndex: copiesByIndexForClient()
            }
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const enfileirados = data.enqueuedCount || data.dispatchedCount || 0;
          totalEnviados += enfileirados;
          if (enfileirados > 0) batchesEnfileiradas.push(batchId);
        } else {
          falhas.push(`${batches.find(b => b.id === batchId)?.name || batchId}: ${data.error || 'erro'}`);
        }
      } catch (err: any) {
        falhas.push(`${batches.find(b => b.id === batchId)?.name || batchId}: ${err.message}`);
      }
    }
    // Espera a fila de cada safra terminar (mesmo critério do disparo de uma safra só), para o resultado ser real.
    let enviadosReais = 0;
    let falhasReais = 0;
    for (const batchId of batchesEnfileiradas) {
      let concluido = false;
      let tentativas = 0;
      while (!concluido && tentativas < 5400) {
        tentativas++;
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
          const progRes = await apiFetch(urlCampaignBatchesProgressId(batchId));
          if (!progRes.ok) { concluido = true; break; }
          const prog = await progRes.json();
          if (prog && prog.total > 0) {
            setDispatchProgress(Math.min(99, Math.round(((prog.sent + prog.failed) / prog.total) * 100)));
            if (prog.status === 'completed' || prog.status === 'cancelled' || prog.sent + prog.failed >= prog.total) {
              concluido = true;
              enviadosReais += prog.sent || 0;
              falhasReais += prog.failed || 0;
            }
          }
        } catch {
          // tenta de novo na próxima volta
        }
      }
    }
    setBatchDispatchStats({ total: totalEnviados, dispatched: enviadosReais, failed: falhasReais, sellersUsed: effectiveClosers });
    setDispatchProgress(100);
    setDispatchModalStep('success');
    setIsDispatching(false);
    if (falhas.length === 0) {
      showNotification('success', `Disparo concluído em ${targets.length} safra(s): ${enviadosReais} enviados, ${falhasReais} falhas.`);
    } else {
      showNotification('error', `Algumas safras não dispararam: ${falhas.join(' | ')}`);
    }
    await fetchBatches();
    await fetchLeads();
  };

  const handleExecuteBatchDispatch = async () => {
    const erroCopy = erroCopyParaDisparo();
    if (erroCopy) {
      showNotification('error', erroCopy);
      return;
    }
    if (stagingSelectedLeadIds.length === 0 && checkedBatchIds.length > 0) {
      return handleDispatchCheckedBatches();
    }
    if (!selectedBatchId) {
      showNotification('error', 'Selecione uma campanha ou safra para disparar.');
      return;
    }

    const stagingLeads = leads.filter(l => l.status === 'STAGING');
    if (stagingLeads.length === 0) {
      showNotification('error', 'Não há leads na 1ª Etapa (Novos Leads) para disparar.');
      return;
    }

    // Validação rígida dos limites de caracteres da Meta para evitar o erro #132005 (Translated text too long)
    const totalBody = measureBodyLength();
    if (totalBody > META_BODY_MAX) {
      showNotification('error', `O corpo do template ficou com ${totalBody} caracteres (limite da Meta: ${META_BODY_MAX}). Encurte o texto antes do disparo.`);
      return;
    }

    let limitParam: number | 'ALL' | undefined = undefined;
    if (stagingSelectedLeadIds.length > 0) {
      // Disparar apenas os leads marcados manualmente
      limitParam = undefined;
    } else if (dispatchQuantityOption === 'ALL') {
      limitParam = 'ALL';
    } else {
      const parsedQty = Number(customDispatchQuantity);
      limitParam = parsedQty > 0 ? parsedQty : 100;
    }

    setDispatchModalStep('processing');
    setIsDispatching(true);
    setDispatchProgress(5);

    try {
      const effectiveClosers = dispatchSelectedClosers.length > 0 
        ? dispatchSelectedClosers 
        : [dispatchSelectedCloser || 'seller-thomas'];

      const res = await apiFetch(urlCampaignDispatch, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedBatchId,
          templateName: dispatchSelectedTemplate,
          quarantineHours: dispatchQuarantineHours,
          phoneNumberId: dispatchPhoneNumberId || undefined,
          speedPerSecond: dispatchSpeed,
          limit: stagingSelectedLeadIds.length > 0 ? undefined : limitParam,
          allowAll: limitParam === 'ALL',
          leadIds: stagingSelectedLeadIds.length > 0 ? stagingSelectedLeadIds : undefined,
          salespersonId: effectiveClosers[0],
          salespersonIds: effectiveClosers,
          variableValues: {
            var1: templateVar1.slice(0, META_CHAR_LIMITS.var1),
            var2: templateVar2.slice(0, META_CHAR_LIMITS.var2),
            var3: templateVar3.slice(0, META_CHAR_LIMITS.var3),
            byIndex: copiesByIndexForClient()
          }
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        const totalEnqueued = data.enqueuedCount || data.dispatchedCount || 0;
        setLiveBatchProgress({
          batchId: selectedBatchId,
          total: totalEnqueued,
          enqueued: totalEnqueued,
          sent: 0,
          delivered: 0,
          failed: 0,
          speed: data.speedPerSecond || dispatchSpeed,
          status: 'running',
          estimatedSeconds: data.estimatedDurationSeconds || Math.ceil(totalEnqueued / (dispatchSpeed || 0.8)),
          startedAt: Date.now()
        });

        // Polling para acompanhar progresso real da fila BullMQ
        let isDone = false;
        let attempts = 0;
        const maxAttempts = 5400; // até ~3 horas (a 2s por consulta): lote grande no ritmo do plano leva dezenas de minutos

        const pollInterval = setInterval(async () => {
          attempts++;
          try {
            const progRes = await apiFetch(urlCampaignBatchesProgressId(selectedBatchId));
            if (progRes.ok) {
              const progData = await progRes.json();
              if (progData && progData.total > 0) {
                setLiveBatchProgress(progData);
                const percent = Math.min(100, Math.round(((progData.sent + progData.failed) / (progData.total || 1)) * 100));
                setDispatchProgress(percent);

                if (progData.status === 'completed' || (progData.sent + progData.failed >= progData.total && progData.total > 0)) {
                  isDone = true;
                  clearInterval(pollInterval);
                  setBatchDispatchStats({
                    total: progData.total,
                    dispatched: progData.sent,
                    failed: progData.failed || 0,
                    sellersUsed: effectiveClosers
                  });
                  setDispatchModalStep('success');
                  setIsDispatching(false);
                  showNotification('success', `🚀 ${progData.sent} leads enviados com sucesso via Meta Cloud API Oficial!`);
                  await fetchBatches();
                  await fetchLeads();
                  setStagingSelectedLeadIds([]);
                  onLeadsUpdated?.();
                } else if (progData.status === 'cancelled') {
                  isDone = true;
                  clearInterval(pollInterval);
                  setIsDispatching(false);
                  showNotification('error', 'Disparo cancelado.');
                  await fetchBatches();
                  await fetchLeads();
                }
              }
            }
          } catch (err) {
            console.error('Erro ao verificar progresso da fila:', err);
          }

          if (attempts >= maxAttempts && !isDone) {
            clearInterval(pollInterval);
            setIsDispatching(false);
            setDispatchModalStep('success');
            await fetchBatches();
            await fetchLeads();
          }
        }, 2000);

      } else {
        showNotification('error', data.error || 'Erro ao executar disparo.');
        setDispatchModalStep('config');
        setIsDispatching(false);
      }
    } catch (err: any) {
      showNotification('error', `Falha no disparo: ${err.message}`);
      setDispatchModalStep('config');
      setIsDispatching(false);
    }
  };

  // Move Lead to arbitrary Status in Kanban
  const handleMoveLeadStatus = async (leadId: string, newStatus: CampaignLeadStatus, note?: string) => {
    try {
      const res = await apiFetch(urlCampaignSimulateAction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          action: 'SET_STATUS',
          status: newStatus,
          responseText: note
        })
      });
      if (res.ok) {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus, responsePreview: note || l.responsePreview } : l));
        showNotification('success', `Lead movido com sucesso.`);
        fetchBatches();
        onLeadsUpdated?.();
      }
    } catch {
      showNotification('error', 'Falha ao atualizar status do lead.');
    }
  };

  // Distribute leads to salespeople
  const handleDistributeToClosers = async () => {
    if (!selectedBatchId) return;
    setIsDistributing(true);
    try {
      const distributions = Object.entries(sellerQuotas).map(([sellerId, quota]) => {
        const seller = salespeople.find(s => s.id === sellerId);
        return {
          salespersonId: sellerId,
          salespersonName: seller ? seller.name : (sellerId === 'seller-thomas' ? 'Thomas' : sellerId),
          quota: Number(quota) || 0
        };
      }).filter(d => d.quota > 0);

      const res = await apiFetch(urlCampaignDistribute, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedBatchId,
          retainHotForAdmin,
          onlyCold: onlyColdLeads,
          onlyColdLeads,
          includeQuarantine: true,
          sellerQuotas,
          distributions
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('success', data.message || `${data.totalDistributed} leads distribuídos!`);
        await fetchBatches();
        await fetchLeads();
        onLeadsUpdated?.();
      } else {
        showNotification('error', data.error || 'Erro ao distribuir leads.');
      }
    } catch (err: any) {
      showNotification('error', `Falha ao distribuir: ${err.message}`);
    } finally {
      setIsDistributing(false);
    }
  };

  // Liberar Quarentena Antecipadamente
  const handleReleaseQuarantine = async () => {
    if (!selectedBatchId) return;
    try {
      const res = await apiFetch(urlCampaignBatchesReleaseQuarantineId(selectedBatchId), {
        method: 'POST'
      });
      const data = (await res.json()) as RespostaLiberacaoQuarentena | RespostaErroApi;
      if (res.ok && data.success) {
        showNotification('success', data.message || 'Quarentena liberada com sucesso!');
        await fetchBatches();
        await fetchLeads();
        setActiveTab('distribuicao');
      } else {
        showNotification('error', ('error' in data && data.error) || 'Erro ao liberar quarentena.');
      }
    } catch (err: any) {
      showNotification('error', `Falha ao liberar quarentena: ${err.message}`);
    }
  };

  // Salvar Regras de Quarentena no Banco de Dados
  const handleSaveQuarantineConfig = async () => {
    if (!selectedBatchId) return;
    try {
      const res = await apiFetch(urlCampaignBatchesQuarantineConfigId(selectedBatchId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quarantineHours: dispatchQuarantineHours,
          onReplyAction: quarantineOnReplyAction,
          onExpireAction: quarantineOnExpireAction
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('success', data.message || `Regras salvas: Quarentena de ${dispatchQuarantineHours}h gravada no banco!`);
        await fetchBatches();
      } else {
        showNotification('error', data.error || 'Erro ao salvar regras de quarentena.');
      }
    } catch (err: any) {
      showNotification('error', `Falha ao salvar regras: ${err.message}`);
    }
  };

  // Devolve para Novos Leads só os que NÃO saíram de fato (sem ID da Meta) e limpa as mensagens pendentes da fila
  const handleReturnUnsent = async () => {
    if (!selectedBatchId) return;
    const ok = window.confirm(
      'Devolver para Novos Leads os leads que NÃO foram enviados de fato?\n\nIsso cancela as mensagens pendentes deste lote na fila. Os que já foram aceitos pela Meta continuam como estão.'
    );
    if (!ok) return;
    try {
      const res = await apiFetch(urlCampaignBatchesReturnUnsentId(selectedBatchId), { method: 'POST' });
      const data = (await res.json()) as RespostaDevolucaoLeads | RespostaErroApi;
      if (res.ok && 'returned' in data) {
        showNotification('success', data.message);
        await fetchBatches();
        await fetchLeads();
      } else {
        showNotification('error', ('error' in data && data.error) || 'Erro ao devolver leads.');
      }
    } catch (err: any) {
      showNotification('error', `Falha ao devolver leads: ${err.message}`);
    }
  };

  // Zerar Disparos e Restaurar Todos os Leads para Staging
  const handleResetBatchToStaging = async () => {
    if (!selectedBatchId) return;
    const confirmReset = window.confirm(
      '⚠️ ATENÇÃO: Deseja ZERAR todos os disparos desta safra e restaurar todos os leads para a 1ª Etapa (Novos Leads / Staging)?\n\nIsso permitirá que você recomece os disparos do zero com a quantidade exata desejada (ex: 1000 leads).'
    );
    if (!confirmReset) return;

    try {
      const res = await apiFetch(urlCampaignBatchesResetStagingId(selectedBatchId), {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('success', data.message || 'Safra restaurada para Staging com sucesso!');
        await fetchBatches();
        await fetchLeads();
      } else {
        showNotification('error', data.error || 'Erro ao resetar safra.');
      }
    } catch (err: any) {
      showNotification('error', `Falha ao resetar safra: ${err.message}`);
    }
  };

  // Sincronizar Safra com lista real de chats do WhatsApp Web
  const handleSyncWhatsAppWeb = async () => {
    if (!selectedBatchId) {
      showNotification('error', 'Selecione uma campanha antes de sincronizar.');
      return;
    }
    if (!syncWhatsAppInput.trim()) {
      showNotification('error', 'Cole o JSON ou a lista de contatos do WhatsApp Web.');
      return;
    }

    try {
      setIsSyncingWhatsApp(true);
      const res = await apiFetch(urlCampaignBatchesSyncWhatsappWebId(selectedBatchId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: syncWhatsAppInput })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncWhatsAppResult(data.stats);
        showNotification('success', data.message || 'Sincronização e reciclagem concluídas com sucesso!');
        await fetchBatches();
        await fetchLeads();
      } else {
        showNotification('error', data.error || 'Erro ao sincronizar com WhatsApp Web.');
      }
    } catch (err: any) {
      showNotification('error', `Falha na requisição: ${err.message}`);
    } finally {
      setIsSyncingWhatsApp(false);
    }
  };

  const handleSyncFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setSyncWhatsAppInput(text);
      }
    };
    reader.readAsText(file);
  };

  // Active lead for smartphone preview
  const activeSimulatorLead = useMemo(() => {
    if (leads.length === 0) return null;
    return leads[simulatorLeadIndex % leads.length];
  }, [leads, simulatorLeadIndex]);

  // Lead metrics for active safra
  const safraMetrics = useMemo(() => {
    const total = leads.length;
    const validMobiles = leads.filter(l => l.isMobile).length;
    const landlines = leads.filter(l => !l.isMobile).length;
    const withNyroh = leads.filter(l => Boolean(l.publicUrl)).length;
    const withWeb = leads.filter(l => Boolean(l.website)).length;
    const staging = leads.filter(l => l.status === 'STAGING').length;
    const quarantine = leads.filter(l => l.status === 'QUARENTENA').length;
    const hot = leads.filter(l => l.status === 'INTERESSADO').length;
    const cold = leads.filter(l => l.status === 'FRIO').length;
    const discarded = leads.filter(l => l.status === 'DESCARTADO').length;

    return { total, validMobiles, landlines, withNyroh, withWeb, staging, quarantine, hot, cold, discarded };
  }, [leads]);


  return {salespeople, currentUser, onLeadsUpdated, onNavigateToKanban, onNavigateToWhatsApp, runtime, instanceLabel, activeTab, setActiveTab, batches, setBatches, checkedBatchIds, setCheckedBatchIds, brandOptions, setBrandOptions, selectedBatchId, setSelectedBatchId, leads, setLeads, loading, setLoading, isUploading, setIsUploading, searchQuery, setSearchQuery, statusFilter, setStatusFilter, actionNotification, setActionNotification, isBatchDispatchModalOpen, setIsBatchDispatchModalOpen, dispatchQuantityOption, setDispatchQuantityOption, customDispatchQuantity, setCustomDispatchQuantity, distribuicaoManual, setDistribuicaoManual, linhasDisparo, desejadoDisparo, planoDisparo, totalPlanoDisparo, dispatchSelectedCloser, setDispatchSelectedCloser, dispatchSelectedClosers, setDispatchSelectedClosers, dispatchModalStep, setDispatchModalStep, dispatchInfo, setDispatchInfo, batchDispatchStats, setBatchDispatchStats, dispatchSpeed, setDispatchSpeed, dispatchPhoneNumberId, setDispatchPhoneNumberId, dispatchNumbers, setDispatchNumbers, speedLimits, setSpeedLimits, speedPresets, setSpeedPresets, liveBatchProgress, setLiveBatchProgress, isUpdatingSpeed, setIsUpdatingSpeed, isDragOverStaging, setIsDragOverStaging, stagingSelectedLeadIds, setStagingSelectedLeadIds, visibleStagingCount, setVisibleStagingCount, visibleColdCount, setVisibleColdCount, stagingZipInputRef, montadorSubTab, setMontadorSubTab, activeVarField, setActiveVarField, buttonDestinationType, setButtonDestinationType, buttonCustomUrl, setButtonCustomUrl, buttonTextLabel, setButtonTextLabel, quarantineUnit, setQuarantineUnit, quarantineOnReplyAction, setQuarantineOnReplyAction, quarantineOnExpireAction, setQuarantineOnExpireAction, quarantineCustomHours, setQuarantineCustomHours, selectedTemplate, setSelectedTemplate, dispatchSelectedTemplate, setDispatchSelectedTemplate, availableTemplates, setAvailableTemplates, loadingTemplates, setLoadingTemplates, simulatorLeadIndex, setSimulatorLeadIndex, dispatchQuarantineHours, setDispatchQuarantineHours, isDispatching, setIsDispatching, dispatchProgress, setDispatchProgress, highlightVariables, setHighlightVariables, metaTemplatesList, activeMetaTemplate, activeVarIndexes, TAGS_FIXAS, camposLead, setCamposLead, camposTag, valoresParaSalvar, erroCopyParaDisparo, testPhone, setTestPhone, testSending, setTestSending, handleSendTestToPhone, copiesByIndexForClient, META_BODY_MAX, META_CHAR_LIMITS, bodyMeasureSample, measureBodyLength, copiesMapByTemplate, setCopiesMapByTemplate, copiesByIdx, setCopyAt, templateVar1, templateVar2, templateVar3, setTemplateVar1, setTemplateVar2, setTemplateVar3, copyTemplates, setCopyTemplates, selectedCopyTemplateId, setSelectedCopyTemplateId, loadingCopies, setLoadingCopies, showSaveCopyModal, setShowSaveCopyModal, showLibraryModal, setShowLibraryModal, newCopyName, setNewCopyName, newCopyDesc, setNewCopyDesc, newCopyCategory, setNewCopyCategory, fetchMetaTemplates, fetchCopyTemplates, handleSelectCopyTemplate, handleUpdateCurrentCopyTemplate, handleResetToApprovedCopy, handleSaveCurrentAsCopyTemplate, handleDeleteCopyTemplate, insertTagIntoActiveVar, quarantineRemainingTime, setQuarantineRemainingTime, retainHotForAdmin, setRetainHotForAdmin, onlyColdLeads, setOnlyColdLeads, sellerQuotas, setSellerQuotas, isDistributing, setIsDistributing, showNewBatchModal, setShowNewBatchModal, newBatchName, setNewBatchName, newBatchHours, setNewBatchHours, showUploadZipModal, setShowUploadZipModal, paginaSubirZip, setPaginaSubirZip, zipUploads, setZipUploads, zipUploadsCarregando, setZipUploadsCarregando, carregarHistoricoZips, showImportProgressModal, setShowImportProgressModal, importProgressData, setImportProgressData, importAbortRef, fileInputRef, showSyncWhatsAppModal, setShowSyncWhatsAppModal, syncWhatsAppInput, setSyncWhatsAppInput, isSyncingWhatsApp, setIsSyncingWhatsApp, syncWhatsAppResult, setSyncWhatsAppResult, syncJsonFileInputRef, fetchBatches, fetchLeads, currentBatch, fetchDispatchSpeed, handleUpdateGlobalSpeed, handlePauseBatch, handleResumeBatch, handleCancelBatch, showNotification, handleCreateBatch, handleDeleteBatch, handleUploadZip, handleCancelImport, handleTriggerDispatch, handleSimulateLeadReply, handleOpenDispatchModal, carregarInfoDisparo, handleDispatchCheckedBatches, handleExecuteBatchDispatch, handleMoveLeadStatus, handleDistributeToClosers, handleReleaseQuarantine, handleSaveQuarantineConfig, handleReturnUnsent, handleResetBatchToStaging, handleSyncWhatsAppWeb, handleSyncFileSelect, activeSimulatorLead, safraMetrics };
}

export type DisparosVM = ReturnType<typeof useDisparos>;
