import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRuntimeConfig, formatInstancePhone } from '../lib/useRuntimeConfig';
import { onRealtime } from '../lib/realtime';
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
import { CampaignBatch, CampaignLead, CampaignLeadStatus, CampaignCopyTemplate, Salesperson } from '../types';
import { AdminDispatchTestSandbox } from './AdminDispatchTestSandbox';
import { ZipImportProgressModal, ImportProgressData } from './ZipImportProgressModal';

interface MetaTemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phoneNumber?: string;
}

interface MetaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  buttons?: MetaTemplateButton[];
}

interface MetaTemplateFull {
  id?: string;
  name: string;
  category?: string;
  language?: string;
  status?: string;
  components?: MetaTemplateComponent[];
  headerText?: string;
  bodyText?: string;
  footerText?: string;
  buttons?: MetaTemplateButton[];
  variableCount?: number;
}

interface AdminCampaignDisparosViewProps {
  salespeople: Salesperson[];
  currentUser?: { id: string; name: string; role: string };
  onLeadsUpdated?: () => void;
  onNavigateToKanban?: (salespersonId?: string) => void;
  onNavigateToWhatsApp?: (leadId?: string, salespersonId?: string) => void;
}

type SubPageTab = 'safras' | 'montador' | 'teste_sandbox' | 'quarentena' | 'kanban' | 'distribuicao';

/** 75 → "1 min 15 s"; 3700 → "1 h 02 min". No ritmo do plano um lote leva minutos/horas, não segundos. */
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  return sec > 0 ? `${m} min ${String(sec).padStart(2, '0')} s` : `${m} min`;
}

export const AdminCampaignDisparosView: React.FC<AdminCampaignDisparosViewProps> = ({
  salespeople,
  currentUser,
  onLeadsUpdated,
  onNavigateToKanban,
  onNavigateToWhatsApp
}) => {
  // Número REAL da instância (antes estava chumbado no código)
  const runtime = useRuntimeConfig();
  const instanceLabel = formatInstancePhone(runtime.instancePhone);
  const [activeTab, setActiveTab] = useState<SubPageTab>('kanban');
  const [batches, setBatches] = useState<CampaignBatch[]>([]);
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
  const [dispatchSelectedTemplate, setDispatchSelectedTemplate] = useState<string>('dns_escassez_np4');
  const [dispatchSelectedCloser, setDispatchSelectedCloser] = useState<string>('seller-thomas');
  const [dispatchSelectedClosers, setDispatchSelectedClosers] = useState<string[]>([]);
  const [dispatchModalStep, setDispatchModalStep] = useState<'config' | 'processing' | 'success'>('config');
  const [batchDispatchStats, setBatchDispatchStats] = useState<{ total: number; dispatched: number; failed: number; sellersUsed?: string[] }>({ total: 0, dispatched: 0, failed: 0 });

  // Configuração da Velocidade de Disparo & Rastreamento em Tempo Real (BullMQ + Redis)
  // A vazão é limitada pelo plano da FluxoAPI, que mede por MINUTO (Starter 60/min, Pro 300, Escala 1.200...).
  // Os valores reais vêm do servidor (FLUXO_PLAN_RPM); aqui só guardamos o que ele devolve. Unidade interna: msgs/segundo.
  const [dispatchSpeed, setDispatchSpeed] = useState<number>(0.8);
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
  const [activeVarField, setActiveVarField] = useState<'var1' | 'var2' | 'var3'>('var1');

  // Configuração do Botão do Template da Meta (Call to Action)
  const [buttonDestinationType, setButtonDestinationType] = useState<'site_novo' | 'site_antigo' | 'custom'>('site_novo');
  const [buttonCustomUrl, setButtonCustomUrl] = useState<string>('https://nyroh.com.br');
  const [buttonTextLabel, setButtonTextLabel] = useState<string>('Acessar Site Criado');

  // Configurações Avançadas da Quarentena Anti-Vazamento
  const [quarantineUnit, setQuarantineUnit] = useState<'hours' | 'days'>('hours');
  const [quarantineOnReplyAction, setQuarantineOnReplyAction] = useState<'lock_closer' | 'notify_admin' | 'move_hot_column'>('lock_closer');
  const [quarantineOnExpireAction, setQuarantineOnExpireAction] = useState<'roulette_closers' | 'manual_pool' | 'cold_call_list'>('roulette_closers');
  const [quarantineCustomHours, setQuarantineCustomHours] = useState<number>(4);

  // Montador State - Templates & 2 Níveis de Variáveis
  const [selectedTemplate, setSelectedTemplate] = useState<string>('dns_escassez_np4');
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

      if (t.name === 'dns_escassez_np4' && (!btns || btns.length === 0)) {
        btns = [
          { type: 'QUICK_REPLY', text: 'Acessar Link' },
          { type: 'QUICK_REPLY', text: 'Parar Mensagens' }
        ];
      }

      return {
        ...t,
        buttons: btns,
        footerText: t.footerText || (t.components?.find((c: any) => c.type === 'FOOTER')?.text || '')
      };
    });

    if (!list.some(t => t.name === 'dns_escassez_np4')) {
      list.unshift({
        id: '1073339218665318',
        name: 'dns_escassez_np4',
        category: 'UTILITY',
        status: 'APPROVED',
        language: 'pt_BR',
        variableCount: 3,
        bodyText: 'Ei,\n\n{{1}}\n\n{{2}}\n\n{{3}}\n\n*Clique no link abaixo para saber mais*',
        footerText: '',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Acessar Link' },
          { type: 'QUICK_REPLY', text: 'Parar Mensagens' }
        ]
      });
    }

    return list;
  }, [availableTemplates]);

  // Recuperar o template da Meta ativo
  const activeMetaTemplate: MetaTemplateFull = useMemo(() => {
    return (
      metaTemplatesList.find(t => t.name === selectedTemplate) ||
      metaTemplatesList[0]
    );
  }, [metaTemplatesList, selectedTemplate]);


  // Limite oficial da Meta para o CORPO do template (texto fixo + variáveis somados): 1024 caracteres.
  // Cada variável pode ocupar o corpo inteiro; o que vale é o total renderizado.
  const META_BODY_MAX = 1024;
  const META_CHAR_LIMITS = {
    var1: META_BODY_MAX,
    var2: META_BODY_MAX,
    var3: META_BODY_MAX
  };
  // Tamanho do corpo já renderizado com as três variáveis
  const renderedBodyLength = (v1: string, v2: string, v3: string) => {
    const tpl = availableTemplates.find((t: any) => t.name === selectedTemplate) as any;
    const base: string = tpl?.bodyText || '{{1}}{{2}}{{3}}';
    return base
      .replace('{{1}}', () => v1)
      .replace('{{2}}', () => v2)
      .replace('{{3}}', () => v3)
      .length;
  };

  // Variáveis de Conteúdo (Nível 2: O que vai DENTRO de cada {{X}} do template)
  const [templateVar1, setTemplateVar1] = useState<string>(() => {
    try {
      return localStorage.getItem('nyroh_campaign_var1') || '{nome}! Bom diaaa! Ótima semana 😄 Falo com o responsável pela {empresa}?';
    } catch {
      return '{nome}! Bom diaaa! Ótima semana 😄 Falo com o responsável pela {empresa}?';
    }
  });
  const [templateVar2, setTemplateVar2] = useState<string>(() => {
    try {
      return localStorage.getItem('nyroh_campaign_var2') || 'Eu sou {vendedor} e queria te fazer uma pergunta: você ficaria chateado se eu tivesse criado um site para a {empresa} sem pedir? 😂';
    } catch {
      return 'Eu sou {vendedor} e queria te fazer uma pergunta: você ficaria chateado se eu tivesse criado um site para a {empresa} sem pedir? 😂';
    }
  });
  const [templateVar3, setTemplateVar3] = useState<string>(() => {
    try {
      return localStorage.getItem('nyroh_campaign_var3') || 'Desenvolvi uma prévia exclusiva para vocês: 🔗 {site_novo}';
    } catch {
      return 'Desenvolvi uma prévia exclusiva para vocês: 🔗 {site_novo}';
    }
  });

  // Biblioteca de Templates de Copy (O que vai DENTRO das variáveis do template da Meta)
  const [copyTemplates, setCopyTemplates] = useState<CampaignCopyTemplate[]>([]);
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

  // Sincronizar variáveis da copy no localStorage para não perder ao dar F5
  useEffect(() => {
    try {
      localStorage.setItem('nyroh_campaign_var1', templateVar1);
      localStorage.setItem('nyroh_campaign_var2', templateVar2);
      localStorage.setItem('nyroh_campaign_var3', templateVar3);
    } catch {}
  }, [templateVar1, templateVar2, templateVar3]);

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
      const res = await fetch('/api/admin/fluxo/templates');
      if (res.ok) {
        const data = await res.json();
        if (data.templates && Array.isArray(data.templates)) {
          const approved = data.templates.filter((t: any) => t.status === 'APPROVED' || t.status === 'active');
          const list = approved.length > 0 ? approved : data.templates;
          setAvailableTemplates(list);
          if (list.length > 0 && !selectedTemplate) {
            // Priorizar dns_escassez_np4 se existir na lista
            const preferred = list.find((t: any) => t.name === 'dns_escassez_np4');
            setSelectedTemplate(preferred ? preferred.name : list[0].name);
          }
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
      const res = await fetch('/api/campaign/copies');
      if (res.ok) {
        const data = await res.json();
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
    const found = copyTemplates.find(c => c.id === copyId);
    if (found) {
      const v1 = (found.var1 || '').slice(0, META_CHAR_LIMITS.var1);
      const v2 = (found.var2 || '').slice(0, META_CHAR_LIMITS.var2);
      const v3 = (found.var3 || '').slice(0, META_CHAR_LIMITS.var3);
      setTemplateVar1(v1);
      setTemplateVar2(v2);
      setTemplateVar3(v3);
      try {
        localStorage.setItem('nyroh_campaign_var1', v1);
        localStorage.setItem('nyroh_campaign_var2', v2);
        localStorage.setItem('nyroh_campaign_var3', v3);
      } catch {}
      setActionNotification({
        type: 'success',
        message: `Copy "${found.name}" carregada e selecionada para o disparo!`
      });
    }
  };

  // Atualizar copy atual selecionada na biblioteca
  const handleUpdateCurrentCopyTemplate = async () => {
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
      const res = await fetch(`/api/campaign/copies/${selectedCopyTemplateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: current.name,
          description: current.description,
          category: current.category,
          var1: templateVar1.slice(0, META_CHAR_LIMITS.var1),
          var2: templateVar2.slice(0, META_CHAR_LIMITS.var2),
          var3: templateVar3.slice(0, META_CHAR_LIMITS.var3)
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setCopyTemplates(prev => prev.map(c => c.id === updated.id ? updated : c));
        setActionNotification({
          type: 'success',
          message: `Alterações salvas com sucesso na copy "${updated.name}"!`
        });
      } else {
        const err = await res.json();
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

  // Restaurar para a copy oficial da Meta
  const handleResetToApprovedCopy = () => {
    setTemplateVar1('{nome}! Bom diaaa! Ótima semana 😄 Falo com o responsável pela {empresa}?');
    setTemplateVar2('Eu sou {vendedor} e queria te fazer uma pergunta: você ficaria chateado se eu tivesse criado um site para a {empresa} sem pedir? 😂');
    setTemplateVar3('Desenvolvi uma prévia exclusiva para vocês: 🔗 {site_novo}');
    setActionNotification({
      type: 'success',
      message: 'Copy restaurada para o padrão oficial aprovado da Meta!'
    });
  };

  // Save current copy variables as a new copy template
  const handleSaveCurrentAsCopyTemplate = async () => {
    if (!newCopyName.trim()) {
      alert('Por favor, informe o nome do seu template de mensagem.');
      return;
    }

    try {
      const res = await fetch('/api/campaign/copies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCopyName.trim(),
          description: newCopyDesc.trim(),
          category: newCopyCategory,
          var1: templateVar1,
          var2: templateVar2,
          var3: templateVar3
        })
      });

      if (res.ok) {
        const created = await res.json();
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
      const res = await fetch(`/api/campaign/copies/${copyId}`, { method: 'DELETE' });
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

  // Insert Tag Helper: Insere a tag na variável selecionada atualmente respeitando os limites da Meta
  const insertTagIntoActiveVar = (tag: string) => {
    if (activeVarField === 'var1') {
      const next = `${templateVar1} ${tag}`.trim();
      const total = renderedBodyLength(next, templateVar2, templateVar3);
      if (total > META_BODY_MAX) {
        setActionNotification({
          type: 'error',
          message: `Não foi possível inserir ${tag}: o corpo do template chegaria a ${total} caracteres (Limite Meta: ${META_BODY_MAX}).`
        });
        return;
      }
      setTemplateVar1(next);
    } else if (activeVarField === 'var2') {
      const next = `${templateVar2} ${tag}`.trim();
      const total = renderedBodyLength(templateVar1, next, templateVar3);
      if (total > META_BODY_MAX) {
        setActionNotification({
          type: 'error',
          message: `Não foi possível inserir ${tag}: o corpo do template chegaria a ${total} caracteres (Limite Meta: ${META_BODY_MAX}).`
        });
        return;
      }
      setTemplateVar2(next);
    } else if (activeVarField === 'var3') {
      const next = `${templateVar3} ${tag}`.trim();
      const total = renderedBodyLength(templateVar1, templateVar2, next);
      if (total > META_BODY_MAX) {
        setActionNotification({
          type: 'error',
          message: `Não foi possível inserir ${tag}: o corpo do template chegaria a ${total} caracteres (Limite Meta: ${META_BODY_MAX}).`
        });
        return;
      }
      setTemplateVar3(next);
    }
    setActionNotification({
      type: 'success',
      message: `Tag ${tag} inserida na Variável {{${activeVarField === 'var1' ? '1' : activeVarField === 'var2' ? '2' : '3'}}}`
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
      const res = await fetch('/api/campaign/batches');
      if (res.ok) {
        const data = await res.json();
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
    if (!selectedBatchId) {
      setLeads([]);
      return;
    }
    try {
      const url = new URL('/api/campaign/leads', window.location.origin);
      url.searchParams.set('batchId', selectedBatchId);
      url.searchParams.set('limit', 'ALL');
      if (statusFilter !== 'ALL') {
        url.searchParams.set('status', statusFilter);
      }
      if (searchQuery.trim()) {
        url.searchParams.set('search', searchQuery.trim());
      }
      const res = await fetch(url.toString());
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
  }, [selectedBatchId, statusFilter, searchQuery]);

  // Selected batch reference
  const currentBatch = useMemo(() => {
    return batches.find(b => b.id === selectedBatchId) || batches[0] || null;
  }, [batches, selectedBatchId]);

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
          setQuarantineRemainingTime('Quarentena Expirada (Pronto para distribuição)');
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [currentBatch]);

  // Fetch initial speed from backend
  const fetchDispatchSpeed = async () => {
    try {
      const res = await fetch('/api/campaign/dispatch/speed');
      if (res.ok) {
        const data = await res.json();
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
      const res = await fetch('/api/campaign/dispatch/speed', {
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
      const res = await fetch(`/api/campaign/batches/${batchId}/pause`, { method: 'POST' });
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
      const res = await fetch(`/api/campaign/batches/${batchId}/resume`, { method: 'POST' });
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
      const res = await fetch(`/api/campaign/batches/${batchId}/cancel`, { method: 'POST' });
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
      const res = await fetch('/api/campaign/batches', {
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
      const res = await fetch(`/api/campaign/batches/${batchId}`, { method: 'DELETE' });
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
    setShowImportProgressModal(true);
    setShowUploadZipModal(false);
    setIsUploading(true);

    // 1. Notificar servidor e inicializar job de tracking
    try {
      await fetch('/api/campaign/import-progress/init', {
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
        const pRes = await fetch(`/api/campaign/import-progress/${jobId}`);
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
          const res = JSON.parse(xhr.responseText);
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
            if (res.batchId) setSelectedBatchId(res.batchId);
            await fetchLeads();
          } else {
            const errTxt = res.error || 'Erro ao processar arquivo ZIP.';
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

      const res = await fetch('/api/campaign/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedBatchId,
          templateName: selectedTemplate,
          quarantineHours: dispatchQuarantineHours,
          variableValues: {
            var1: templateVar1,
            var2: templateVar2,
            var3: templateVar3
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
      const res = await fetch(`/api/campaign/leads/${leadId}/simulate-reply`, {
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
  };

  // Execute Batch Dispatch (Moves selected quantity from Staging -> Quarentena/Espera)
  const handleExecuteBatchDispatch = async () => {
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
    const totalBody = renderedBodyLength(templateVar1, templateVar2, templateVar3);
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

      const res = await fetch('/api/campaign/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedBatchId,
          templateName: dispatchSelectedTemplate,
          quarantineHours: dispatchQuarantineHours,
          speedPerSecond: dispatchSpeed,
          limit: stagingSelectedLeadIds.length > 0 ? undefined : limitParam,
          allowAll: limitParam === 'ALL',
          leadIds: stagingSelectedLeadIds.length > 0 ? stagingSelectedLeadIds : undefined,
          salespersonId: effectiveClosers[0],
          salespersonIds: effectiveClosers,
          variableValues: {
            var1: templateVar1.slice(0, META_CHAR_LIMITS.var1),
            var2: templateVar2.slice(0, META_CHAR_LIMITS.var2),
            var3: templateVar3.slice(0, META_CHAR_LIMITS.var3)
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
            const progRes = await fetch(`/api/campaign/batches/${selectedBatchId}/progress`);
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
      const res = await fetch('/api/campaign/simulate-action', {
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

      const res = await fetch('/api/campaign/distribute', {
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
      const res = await fetch(`/api/campaign/batches/${selectedBatchId}/release-quarantine`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('success', data.message || 'Quarentena liberada com sucesso!');
        await fetchBatches();
        await fetchLeads();
        setActiveTab('distribuicao');
      } else {
        showNotification('error', data.error || 'Erro ao liberar quarentena.');
      }
    } catch (err: any) {
      showNotification('error', `Falha ao liberar quarentena: ${err.message}`);
    }
  };

  // Salvar Regras de Quarentena no Banco de Dados
  const handleSaveQuarantineConfig = async () => {
    if (!selectedBatchId) return;
    try {
      const res = await fetch(`/api/campaign/batches/${selectedBatchId}/quarantine-config`, {
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
      const res = await fetch(`/api/campaign/batches/${selectedBatchId}/return-unsent`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('success', data.message);
        await fetchBatches();
        await fetchLeads();
      } else {
        showNotification('error', data.error || 'Erro ao devolver leads.');
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
      const res = await fetch(`/api/campaign/batches/${selectedBatchId}/reset-staging`, {
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
      const res = await fetch(`/api/campaign/batches/${selectedBatchId}/sync-whatsapp-web`, {
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

  return (
    <div id="campaign-disparos-fullview" className="w-full flex-1 flex flex-col bg-[#f8f9fa] text-neutral-900 min-h-0 overflow-y-auto">
      {/* Toast Notification */}
      {actionNotification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 border text-xs font-semibold animate-in fade-in slide-in-from-top-2 ${
            actionNotification.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          {actionNotification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{actionNotification.message}</span>
          <button onClick={() => setActionNotification(null)} className="ml-2 text-neutral-500 hover:text-neutral-900 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TOP HEADER: Full Width Command Bar - Design System Compliant */}
      <header className="w-full bg-white border-b border-neutral-200 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-2xs">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-neutral-900">
                Disparos & Campanhas em Massa
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                Staging & Quarentena
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              Isolamento de leads: Novas safras entram em Staging e só são distribuídas após a quarentena.
            </p>
          </div>
        </div>

        {/* Safra Picker & Actions */}
        <div className="flex items-center flex-wrap gap-2.5">
          <div className="flex items-center gap-2 bg-neutral-100 border border-neutral-200 rounded-xl px-3 py-1.5">
            <span className="text-xs text-neutral-500 font-semibold">Campanha:</span>
            <select
              value={selectedBatchId}
              onChange={e => setSelectedBatchId(e.target.value)}
              className="bg-transparent text-neutral-900 text-xs font-bold focus:outline-none cursor-pointer"
            >
              {batches.map(b => (
                <option key={b.id} value={b.id} className="bg-white text-neutral-900">
                  {b.name} ({b.totalLeads} leads)
                </option>
              ))}
              {batches.length === 0 && (
                <option value="" className="bg-white text-neutral-500">
                  Nenhuma safra criada ainda
                </option>
              )}
            </select>
          </div>

          <button
            onClick={() => setShowNewBatchModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold transition shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Campanha</span>
          </button>

          <button
            onClick={() => setShowUploadZipModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Subir ZIP</span>
          </button>

          {/* Botão para devolver os não enviados pra Novos Leads */}
          {selectedBatchId && (
            <button
              onClick={handleReturnUnsent}
              title="Devolve para Novos Leads os leads que não saíram de fato e tira as mensagens pendentes da fila"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold shadow-2xs transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-emerald-700" />
              <span className="hidden md:inline">Devolver não enviados</span>
            </button>
          )}

          {/* Botão de Zerar Disparos e Resetar Safra */}
          {selectedBatchId && (
            <button
              onClick={handleResetBatchToStaging}
              title="Zera os disparos acumulados e restaura todos os leads da safra para a 1ª Etapa (Novos Leads / Staging)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold shadow-2xs transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
              <span className="hidden md:inline">Zerar / Resetar Safra</span>
            </button>
          )}

          {/* Botão de Sincronizar com WhatsApp Web & Reciclar Não Disparados */}
          {selectedBatchId && (
            <button
              onClick={() => {
                setSyncWhatsAppResult(null);
                setShowSyncWhatsAppModal(true);
              }}
              title="Cruzar com chats do WhatsApp Web: confirma disparos reais, separa fixos e recicla não disparados para Etapa 1"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-white" />
              <span>Sincronizar WhatsApp Web</span>
            </button>
          )}

          {/* Indicador de Velocidade da Fila (BullMQ) */}
          <div
            onClick={() => handleOpenDispatchModal()}
            title="Clique para configurar velocidade e disparar"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-neutral-700 text-xs font-semibold cursor-pointer transition"
          >
            <Gauge className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="text-neutral-500">Vazão:</span>
            <span className="font-mono font-bold text-neutral-900">{Math.round(dispatchSpeed * 60)} msgs/min</span>
            <span className="text-[10px] text-neutral-400 font-mono">(teto {speedLimits.maxPerMinute}/min)</span>
          </div>

          <button
            onClick={() => handleOpenDispatchModal()}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Fazer Disparo ({leads.filter(l => l.status === 'STAGING').length})</span>
          </button>
        </div>
      </header>

      {/* SUB-NAVIGATION TABS: Full Width, Neutral-100 Pill Bar */}
      <div className="w-full bg-white border-b border-neutral-200 px-4 sm:px-6 py-2 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar shrink-0">
        <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-xl border border-neutral-200 shadow-2xs">
          <button
            onClick={() => setActiveTab('kanban')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
              activeTab === 'kanban'
                ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                : 'text-neutral-700 hover:text-neutral-900 font-semibold'
            }`}
          >
            <Kanban className="w-3.5 h-3.5" />
            <span>⭐ 1. Kanban de Disparos</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
              activeTab === 'kanban' ? 'bg-emerald-700 text-white' : 'bg-neutral-200 text-neutral-800'
            }`}>
              {leads.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('safras')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
              activeTab === 'safras'
                ? 'bg-white text-neutral-900 font-bold shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-900 font-medium'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2. Safras & Base</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-200 text-neutral-800 font-mono font-bold">
              {batches.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('montador')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
              activeTab === 'montador'
                ? 'bg-white text-neutral-900 font-bold shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-900 font-medium'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>3. Montador de Copy</span>
          </button>

          <button
            onClick={() => setActiveTab('teste_sandbox')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
              activeTab === 'teste_sandbox'
                ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-medium'
            }`}
            title="Disparo individual de teste real com integração direta ao WhatsApp e ao Kanban do Thomas"
          >
            <Send className="w-3.5 h-3.5 text-emerald-200" />
            <span>4. Teste Sandbox</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-200 text-emerald-950 font-bold uppercase">
              100% REAL
            </span>
          </button>

          <button
            onClick={() => setActiveTab('quarentena')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
              activeTab === 'quarentena'
                ? 'bg-white text-neutral-900 font-bold shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-900 font-medium'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>5. Quarentena</span>
            {currentBatch?.status === 'quarantine' && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('distribuicao')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
              activeTab === 'distribuicao'
                ? 'bg-white text-neutral-900 font-bold shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-900 font-medium'
            }`}
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>6. Distribuição</span>
          </button>
        </div>

        {/* Quick Batch Details */}
        {currentBatch && (
          <div className="hidden lg:flex items-center gap-3 text-xs text-neutral-600">
            <span>Criada em: <strong>{new Date(currentBatch.createdAt).toLocaleDateString('pt-BR')}</strong></span>
            <span>• Total: <strong>{currentBatch.totalLeads} leads</strong></span>
            <span>• Aceitos pela API: <strong className="text-blue-700">{currentBatch.acceptedCount ?? currentBatch.dispatchedCount}</strong></span>
            <span>• Entregues: <strong className="text-emerald-700">{currentBatch.deliveredCount ?? 0}</strong></span>
            <span>• Falhas (sem WhatsApp, etc.): <strong className="text-red-700">{currentBatch.failedCount ?? 0}</strong></span>
          </div>
        )}
      </div>

      {/* MAIN VIEW CONTENT (Aproveita toda a tela) */}
      <div className="w-full flex-1 p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* ========================================================= */}
        {/* TAB 1: SAFRAS & CAMPANHAS (Staging de Importação) */}
        {/* ========================================================= */}
        {activeTab === 'safras' && (
          <div className="flex flex-col gap-6">
            {/* KPI Metrics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between text-neutral-500 mb-1">
                  <span className="text-xs font-semibold">Total de Campanhas</span>
                  <Layers className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-neutral-900">{batches.length}</div>
                <div className="text-[11px] text-neutral-400 mt-1">Safras cadastradas</div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between text-neutral-500 mb-1">
                  <span className="text-xs font-semibold">Leads em Staging</span>
                  <FileArchive className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-2xl font-bold text-amber-700">{safraMetrics.staging}</div>
                <div className="text-[11px] text-neutral-400 mt-1">Aguardando disparo</div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between text-neutral-500 mb-1">
                  <span className="text-xs font-semibold">Contatos Aptos (WhatsApp)</span>
                  <Phone className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold text-emerald-700">{safraMetrics.staging}</div>
                <div className="text-[11px] text-neutral-500 mt-1">{safraMetrics.validMobiles} celulares • {safraMetrics.landlines} fixos/comerciais</div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between text-neutral-500 mb-1">
                  <span className="text-xs font-semibold">Com Site Novo Nyroh</span>
                  <Globe className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-blue-700">{safraMetrics.withNyroh}</div>
                <div className="text-[11px] text-neutral-400 mt-1">Prévia pronta para envio</div>
              </div>
            </div>

            {/* If zero batches, show clean empty state */}
            {batches.length === 0 ? (
              <div className="bg-white border border-neutral-200 rounded-2xl p-12 text-center max-w-xl mx-auto shadow-2xs">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 border border-blue-200">
                  <FileArchive className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-neutral-900 mb-1">
                  Nenhuma campanha criada ainda
                </h3>
                <p className="text-xs text-neutral-500 mb-6 leading-relaxed">
                  Crie sua primeira campanha para carregar leads via ZIP, filtrar celulares válidos e efetuar disparos oficiais via Meta Cloud API com quarentena automática.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setShowNewBatchModal(true)}
                    className="px-4 py-2 bg-neutral-900 hover:bg-black text-white text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer"
                  >
                    + Criar Primeira Campanha
                  </button>
                  <button
                    onClick={() => setShowUploadZipModal(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Subir Arquivo ZIP</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Active Campaign Info Header */}
                {currentBatch && (
                  <div className="bg-white border border-neutral-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-neutral-900">
                          {currentBatch.name}
                        </h2>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          currentBatch.status === 'draft'
                            ? 'bg-neutral-100 text-neutral-700 border-neutral-300'
                            : currentBatch.status === 'quarantine'
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        }`}>
                          {currentBatch.status === 'draft' ? 'Em Preparação (Staging)' : currentBatch.status === 'quarantine' ? 'Em Quarentena' : 'Concluída'}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        Template: <strong>{currentBatch.templateName}</strong> • Quarentena configurada: <strong>{currentBatch.quarantineHours} horas</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveTab('montador')}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Configurar & Disparar Safra</span>
                      </button>

                      <button
                        onClick={() => handleDeleteBatch(currentBatch.id)}
                        className="p-2 rounded-xl border border-neutral-200 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title="Excluir esta safra"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Leads Filter & Search Bar */}
                <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                  <div className="relative flex-1 min-w-[240px]">
                    <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Filtrar por nome, telefone ou nicho..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-800 focus:outline-none focus:border-neutral-400"
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-neutral-500 font-semibold">Status:</span>
                    <select
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value)}
                      className="bg-neutral-50 border border-neutral-200 text-neutral-800 text-xs font-medium rounded-xl px-2.5 py-1.5 focus:outline-none cursor-pointer"
                    >
                      <option value="ALL">Todos os Leads ({leads.length})</option>
                      <option value="STAGING">Aguardando Disparo (Staging)</option>
                      <option value="DISPARADO">Disparados</option>
                      <option value="QUARENTENA">Em Quarentena</option>
                      <option value="INTERESSADO">🔥 Interessados (Responderam)</option>
                      <option value="FRIO">❄️ Frios (Sem Resposta)</option>
                      <option value="DESCARTADO">🛑 Descartados (Opt-out / Inválidos)</option>
                    </select>

                    <button
                      onClick={fetchLeads}
                      className="p-1.5 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-50 transition"
                      title="Atualizar lista"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Staging Leads Table */}
                <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-neutral-50/80 border-b border-neutral-200 text-neutral-600 font-bold uppercase tracking-wider text-[11px]">
                          <th className="py-3 px-4">Empresa / Lead</th>
                          <th className="py-3 px-4">Telefone</th>
                          <th className="py-3 px-4">Tipo</th>
                          <th className="py-3 px-4">Site Nyroh Novo</th>
                          <th className="py-3 px-4">Site Antigo</th>
                          <th className="py-3 px-4">Status da Campanha</th>
                          <th className="py-3 px-4 text-right">Ações Rápidas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {leads.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-neutral-400">
                              Nenhum lead encontrado nesta safra. Faça o upload de um arquivo ZIP acima.
                            </td>
                          </tr>
                        ) : (
                          leads.map(lead => (
                            <tr key={lead.id} className="hover:bg-neutral-50/60 transition-colors">
                              <td className="py-3 px-4 font-bold text-neutral-900">
                                {lead.name}
                                {lead.niche && (
                                  <span className="block text-[11px] text-neutral-400 font-normal">
                                    {lead.niche}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono text-neutral-700">
                                {lead.phoneNumber}
                              </td>
                              <td className="py-3 px-4">
                                {lead.isMobile ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                    <Smartphone className="w-3 h-3" />
                                    <span>Celular WhatsApp</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                                    <Phone className="w-3 h-3" />
                                    <span>Fixo WhatsApp Business</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                {lead.publicUrl ? (
                                  <a
                                    href={lead.publicUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold"
                                  >
                                    <Globe className="w-3 h-3" />
                                    <span>Ver Prévia</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                ) : (
                                  <span className="text-neutral-400 text-[11px]">-</span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                {lead.website ? (
                                  <a
                                    href={lead.website}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-neutral-600 hover:text-neutral-900 truncate max-w-[140px] block"
                                  >
                                    {lead.website.replace(/^https?:\/\//, '')}
                                  </a>
                                ) : (
                                  <span className="text-neutral-400 text-[11px]">-</span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`inline-block px-2 py-0.5 rounded-md font-bold text-[10px] border ${
                                  lead.status === 'STAGING'
                                    ? 'bg-neutral-100 text-neutral-700 border-neutral-300'
                                    : lead.status === 'QUARENTENA'
                                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                                    : lead.status === 'INTERESSADO'
                                    ? 'bg-rose-50 text-rose-700 border-rose-300 font-black'
                                    : lead.status === 'FRIO'
                                    ? 'bg-sky-50 text-sky-700 border-sky-300'
                                    : 'bg-neutral-100 text-neutral-500 border-neutral-200'
                                }`}>
                                  {lead.status === 'STAGING'
                                    ? '📦 Staging'
                                    : lead.status === 'QUARENTENA'
                                    ? '⏳ Quarentena'
                                    : lead.status === 'INTERESSADO'
                                    ? '🔥 Interessado'
                                    : lead.status === 'FRIO'
                                    ? '❄️ Frio'
                                    : lead.status}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleSimulateLeadReply(lead.id, true)}
                                    className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold rounded-lg border border-amber-300 transition cursor-pointer"
                                    title="Simular que este lead respondeu com interesse"
                                  >
                                    Simular 🔥
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

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
                          onChange={e => setSelectedTemplate(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white border border-neutral-300 rounded-xl text-xs font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                        >
                          {availableTemplates.length > 0 ? (
                            availableTemplates.map(tpl => (
                              <option key={tpl.name || tpl.id} value={tpl.name}>
                                {tpl.name} ({tpl.category || 'UTILITY'}) — Status: {tpl.status || 'APPROVED'}
                              </option>
                            ))
                          ) : (
                            <option value="notificacao_pedido_atendimento">
                              notificacao_pedido_atendimento (UTILITY) — APROVADO META
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
                            Inserindo na: <strong className="text-blue-600 uppercase">Variável &#123;&#123;{activeVarField === 'var1' ? '1' : activeVarField === 'var2' ? '2' : '3'}&#125;&#125;</strong>
                          </span>
                        </div>

                        {/* Pills de variáveis principais */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {[
                            { tag: '{nome}', desc: 'Primeiro nome do responsável' },
                            { tag: '{empresa}', desc: 'Razão social ou fantasia' },
                            { tag: '{site_novo}', desc: 'Link do site criado no Nyroh' },
                            { tag: '{vendedor}', desc: 'Nome do closer ou admin' },
                            { tag: '{cidade}', desc: 'Cidade da marcenaria/lead' },
                            { tag: '{telefone}', desc: 'Telefone do lead' },
                            { tag: '{site_antigo}', desc: 'Site antigo (se tiver)' },
                            { tag: '{data}', desc: 'Data do disparo' }
                          ].map(v => (
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
                            <select
                              value={selectedCopyTemplateId}
                              onChange={e => handleSelectCopyTemplate(e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-bold text-neutral-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                            >
                              {copyTemplates.map(c => (
                                <option key={c.id} value={c.id}>
                                  {c.name} {c.isDefault ? '(Padrão)' : ''}
                                </option>
                              ))}
                            </select>
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

                        {/* Variável 1 */}
                        <div
                          onClick={() => setActiveVarField('var1')}
                          className={`p-3 rounded-xl border transition-all ${
                            activeVarField === 'var1'
                              ? 'bg-white border-blue-500 shadow-2xs ring-1 ring-blue-500/20'
                              : 'bg-white/70 border-neutral-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs font-bold text-neutral-700 mb-1.5">
                            <label className="flex items-center gap-1.5">
                              <span className={`w-4 h-4 rounded-full text-white flex items-center justify-center text-[10px] ${
                                activeVarField === 'var1' ? 'bg-blue-600' : 'bg-neutral-400'
                              }`}>1</span>
                              <span>Variável &#123;&#123;1&#125;&#125; (Saudação + Nome + Pergunta do Responsável):</span>
                            </label>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border transition-colors ${
                                templateVar1.length >= META_CHAR_LIMITS.var1
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : templateVar1.length >= META_CHAR_LIMITS.var1 * 0.85
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}>
                                {templateVar1.length} / {META_CHAR_LIMITS.var1} chars
                              </span>
                              <span className="text-[10px] text-neutral-400 font-semibold hidden sm:inline">
                                Limite Máx: {META_CHAR_LIMITS.var1}
                              </span>
                            </div>
                          </div>

                          <div className="w-full bg-neutral-100 rounded-full h-1 mb-2 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                templateVar1.length >= META_CHAR_LIMITS.var1
                                  ? 'bg-rose-500'
                                  : templateVar1.length >= META_CHAR_LIMITS.var1 * 0.85
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, (templateVar1.length / META_CHAR_LIMITS.var1) * 100)}%` }}
                            />
                          </div>

                          <textarea
                            value={templateVar1}
                            maxLength={META_CHAR_LIMITS.var1}
                            onFocus={() => setActiveVarField('var1')}
                            onChange={e => setTemplateVar1(e.target.value)}
                            rows={2}
                            className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                            placeholder="Ex: {nome}! Bom diaaa! Ótima semana 😄 Falo com o responsável pela {empresa}?"
                          />
                        </div>

                        {/* Variável 2 */}
                        <div
                          onClick={() => setActiveVarField('var2')}
                          className={`p-3 rounded-xl border transition-all ${
                            activeVarField === 'var2'
                              ? 'bg-white border-blue-500 shadow-2xs ring-1 ring-blue-500/20'
                              : 'bg-white/70 border-neutral-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs font-bold text-neutral-700 mb-1.5">
                            <label className="flex items-center gap-1.5">
                              <span className={`w-4 h-4 rounded-full text-white flex items-center justify-center text-[10px] ${
                                activeVarField === 'var2' ? 'bg-blue-600' : 'bg-neutral-400'
                              }`}>2</span>
                              <span>Variável &#123;&#123;2&#125;&#125; (O Gancho Comercial + Criado sem Pedir):</span>
                            </label>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border transition-colors ${
                                templateVar2.length >= META_CHAR_LIMITS.var2
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : templateVar2.length >= META_CHAR_LIMITS.var2 * 0.85
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}>
                                {templateVar2.length} / {META_CHAR_LIMITS.var2} chars
                              </span>
                              <span className="text-[10px] text-neutral-400 font-semibold hidden sm:inline">
                                Limite Máx: {META_CHAR_LIMITS.var2}
                              </span>
                            </div>
                          </div>

                          <div className="w-full bg-neutral-100 rounded-full h-1 mb-2 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                templateVar2.length >= META_CHAR_LIMITS.var2
                                  ? 'bg-rose-500'
                                  : templateVar2.length >= META_CHAR_LIMITS.var2 * 0.85
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, (templateVar2.length / META_CHAR_LIMITS.var2) * 100)}%` }}
                            />
                          </div>

                          <textarea
                            value={templateVar2}
                            maxLength={META_CHAR_LIMITS.var2}
                            onFocus={() => setActiveVarField('var2')}
                            onChange={e => setTemplateVar2(e.target.value)}
                            rows={3}
                            className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                            placeholder="Ex: Eu sou {vendedor} e queria te fazer uma pergunta: você ficaria chateado se eu tivesse criado um site para a {empresa} sem pedir? 😂"
                          />
                        </div>

                        {/* Variável 3 */}
                        <div
                          onClick={() => setActiveVarField('var3')}
                          className={`p-3 rounded-xl border transition-all ${
                            activeVarField === 'var3'
                              ? 'bg-white border-blue-500 shadow-2xs ring-1 ring-blue-500/20'
                              : 'bg-white/70 border-neutral-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs font-bold text-neutral-700 mb-1.5">
                            <label className="flex items-center gap-1.5">
                              <span className={`w-4 h-4 rounded-full text-white flex items-center justify-center text-[10px] ${
                                activeVarField === 'var3' ? 'bg-blue-600' : 'bg-neutral-400'
                              }`}>3</span>
                              <span>Variável &#123;&#123;3&#125;&#125; (Entrega do Link Nyroh + Pedido de Feedback):</span>
                            </label>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border transition-colors ${
                                templateVar3.length >= META_CHAR_LIMITS.var3
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : templateVar3.length >= META_CHAR_LIMITS.var3 * 0.85
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}>
                                {templateVar3.length} / {META_CHAR_LIMITS.var3} chars
                              </span>
                              <span className="text-[10px] text-neutral-400 font-semibold hidden sm:inline">
                                Limite Máx: {META_CHAR_LIMITS.var3}
                              </span>
                            </div>
                          </div>

                          <div className="w-full bg-neutral-100 rounded-full h-1 mb-2 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                templateVar3.length >= META_CHAR_LIMITS.var3
                                  ? 'bg-rose-500'
                                  : templateVar3.length >= META_CHAR_LIMITS.var3 * 0.85
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, (templateVar3.length / META_CHAR_LIMITS.var3) * 100)}%` }}
                            />
                          </div>

                          <textarea
                            value={templateVar3}
                            maxLength={META_CHAR_LIMITS.var3}
                            onFocus={() => setActiveVarField('var3')}
                            onChange={e => setTemplateVar3(e.target.value)}
                            rows={3}
                            className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                            placeholder="Ex: Desenvolvi uma prévia exclusiva para vocês: 🔗 {site_novo}"
                          />
                        </div>
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
                              <option value="site_antigo">🏛️ Site Antigo do Cliente ({'{site_antigo}'})</option>
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
                            <span>Restaurar Padrão</span>
                          </button>
                        </div>
                      </div>

                      {/* CARD GUIA: ORIENTAÇÃO PARA DISPARO NO KANBAN */}
                      <div className="p-4 bg-gradient-to-r from-blue-50/80 to-indigo-50/60 border border-blue-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
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
                          const leadName = activeSimulatorLead?.name || 'Marcelo';
                          const firstName = leadName.split(' ')[0];
                          const companyName = activeSimulatorLead?.name || 'Sua Empresa';
                          const siteUrl = activeSimulatorLead?.publicUrl || 'https://sua-empresa.nyroh.com.br';
                          const sellerName = currentUser?.name || 'Thomas';

                          const resolvedVar1 = templateVar1
                            .replace(/\{nome\}/gi, firstName)
                            .replace(/\{empresa\}/gi, companyName)
                            .replace(/\{vendedor\}/gi, sellerName)
                            .replace(/\{site_novo\}/gi, siteUrl)
                            .replace(/\{cidade\}/gi, 'São Paulo')
                            .replace(/\{site_antigo\}/gi, activeSimulatorLead?.website || 'https://empresa.com.br');

                          const resolvedVar2 = templateVar2
                            .replace(/\{nome\}/gi, firstName)
                            .replace(/\{empresa\}/gi, companyName)
                            .replace(/\{vendedor\}/gi, sellerName)
                            .replace(/\{site_novo\}/gi, siteUrl)
                            .replace(/\{cidade\}/gi, 'São Paulo')
                            .replace(/\{site_antigo\}/gi, activeSimulatorLead?.website || 'https://empresa.com.br');

                          const resolvedVar3 = templateVar3
                            .replace(/\{nome\}/gi, firstName)
                            .replace(/\{empresa\}/gi, companyName)
                            .replace(/\{vendedor\}/gi, sellerName)
                            .replace(/\{site_novo\}/gi, siteUrl)
                            .replace(/\{cidade\}/gi, 'São Paulo')
                            .replace(/\{site_antigo\}/gi, activeSimulatorLead?.website || 'https://empresa.com.br');

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

        {/* ========================================================= */}
        {/* TAB 3: TESTE DE DISPARO INDIVIDUAL & SANDBOX WHATSAPP */}
        {/* ========================================================= */}
        {activeTab === 'teste_sandbox' && (
          <AdminDispatchTestSandbox
            salespeople={salespeople}
            availableTemplates={availableTemplates}
            copyTemplates={copyTemplates}
            onLeadsUpdated={onLeadsUpdated}
            onNavigateToKanban={onNavigateToKanban}
            onNavigateToWhatsApp={onNavigateToWhatsApp}
            showNotification={showNotification}
          />
        )}

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

        {/* ========================================================= */}
        {/* TAB 1: KANBAN DA CAMPANHA (FLUXO OFICIAL DE DISPAROS) */}
        {/* ========================================================= */}
        {activeTab === 'kanban' && (
          <div className="space-y-4">
            {/* Top Kanban Workflow Banner */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <Kanban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                    Fluxo de Disparo em Massa & Quarentena
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      Oficial Meta
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Etapa 1: Novos Leads do ZIP ➔ Clique em Disparar ➔ Escolha a quantidade e a copy ➔ Etapa 2: Em Espera ➔ Respostas vão para Etapa 3.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center flex-wrap gap-2 w-full md:w-auto">
                <input
                  type="file"
                  ref={stagingZipInputRef}
                  accept=".zip"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadZip(file);
                  }}
                  className="hidden"
                />

                <button
                  onClick={() => stagingZipInputRef.current?.click()}
                  className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold border border-neutral-200 transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Subir ZIP (+ Leads)</span>
                </button>

                <button
                  onClick={() => handleOpenDispatchModal()}
                  disabled={leads.filter(l => l.status === 'STAGING').length === 0}
                  className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
                    leads.filter(l => l.status === 'STAGING').length > 0
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  <span>🚀 Fazer Disparo ({leads.filter(l => l.status === 'STAGING').length} Prontos)</span>
                </button>
              </div>
            </div>

            {/* Kanban Columns Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
              {/* ========================================================= */}
              {/* COLUNA 1: NOVOS LEADS (AGUARDANDO DISPARO) */}
              {/* ========================================================= */}
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragOverStaging(true);
                }}
                onDragLeave={() => setIsDragOverStaging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragOverStaging(false);
                  const file = e.dataTransfer.files[0];
                  if (file && file.name.endsWith('.zip')) {
                    handleUploadZip(file);
                  } else {
                    showNotification('error', 'Por favor, solte um arquivo .ZIP válido.');
                  }
                }}
                className={`border rounded-2xl p-3 flex flex-col gap-2 min-h-[550px] transition-all ${
                  isDragOverStaging
                    ? 'bg-emerald-50/90 border-emerald-400 ring-2 ring-emerald-500'
                    : 'bg-neutral-100/80 border-neutral-200'
                }`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="font-bold text-xs text-neutral-800">1. Novos Leads (Aguardando)</span>
                  </div>
                  <span className="bg-blue-100 text-blue-800 text-[11px] px-2 py-0.5 rounded-full font-mono font-bold">
                    {leads.filter(l => l.status === 'STAGING').length}
                  </span>
                </div>

                {/* Quick Column Action Button */}
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    onClick={() => handleOpenDispatchModal()}
                    disabled={leads.filter(l => l.status === 'STAGING').length === 0}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-300 text-white rounded-lg text-[11px] font-bold shadow-2xs transition cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    <span>⚡ Disparar Esta Etapa</span>
                  </button>

                  <button
                    onClick={() => stagingZipInputRef.current?.click()}
                    title="Adicionar mais leads via ZIP"
                    className="p-1.5 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-200 rounded-lg text-xs cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Dropzone Hint */}
                {isDragOverStaging && (
                  <div className="p-4 bg-emerald-100/80 border-2 border-dashed border-emerald-500 rounded-xl text-center text-xs font-bold text-emerald-800">
                    Solte o arquivo ZIP aqui para carregar os leads!
                  </div>
                )}

                {/* Staging Leads List */}
                <div className="flex-1 overflow-y-auto space-y-2 max-h-[600px] pr-1">
                  {leads.filter(l => l.status === 'STAGING').length === 0 ? (
                    <div className="text-center py-12 px-4 border-2 border-dashed border-neutral-200 rounded-xl bg-white/50">
                      <FileArchive className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-neutral-700">Nenhum lead aguardando</p>
                      <p className="text-[11px] text-neutral-500 mt-1">
                        Suba um arquivo ZIP ou arraste aqui para adicionar leads a esta etapa.
                      </p>
                      <button
                        onClick={() => stagingZipInputRef.current?.click()}
                        className="mt-3 px-3 py-1 bg-neutral-900 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                      >
                        + Subir ZIP de Leads
                      </button>
                    </div>
                  ) : (
                    <>
                      {leads.filter(l => l.status === 'STAGING').slice(0, visibleStagingCount).map(lead => (
                        <div
                          key={lead.id}
                          className="bg-white p-3 rounded-xl border border-neutral-200 hover:border-blue-300 hover:shadow-xs transition text-xs space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-bold text-neutral-900 truncate">{lead.name || 'Empresa / Lead'}</div>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              lead.isMobile ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-600'
                            }`}>
                              {lead.isMobile ? 'Celular' : 'Fixo'}
                            </span>
                          </div>

                          <div className="text-[11px] text-neutral-600 font-mono flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-neutral-400" />
                            <span>{lead.phoneNumber}</span>
                          </div>

                          {lead.niche && (
                            <div className="text-[10px] text-neutral-500 bg-neutral-50 px-2 py-0.5 rounded inline-block">
                              🏷️ {lead.niche}
                            </div>
                          )}

                          {lead.publicUrl && (
                            <a
                              href={lead.publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-semibold truncate block"
                            >
                              <Globe className="w-3 h-3 shrink-0" />
                              <span className="truncate">{lead.publicUrl}</span>
                            </a>
                          )}

                          <div className="pt-1.5 border-t border-neutral-100 flex items-center justify-between">
                            <span className="text-[10px] text-neutral-400">Pronto p/ disparo</span>
                            <button
                              onClick={() => {
                                setStagingSelectedLeadIds([lead.id]);
                                handleOpenDispatchModal(1);
                              }}
                              className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                            >
                              Disparar este lead ➔
                            </button>
                          </div>
                        </div>
                      ))}

                      {leads.filter(l => l.status === 'STAGING').length > visibleStagingCount && (
                        <div className="pt-2 pb-1 flex flex-col items-center gap-1.5 sticky bottom-0 bg-white/95 backdrop-blur-xs p-2 rounded-xl border border-neutral-200 shadow-2xs">
                          <button
                            onClick={() => setVisibleStagingCount(prev => prev + 250)}
                            className="w-full py-2 px-3 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>Exibindo {Math.min(visibleStagingCount, leads.filter(l => l.status === 'STAGING').length).toLocaleString('pt-BR')} de {leads.filter(l => l.status === 'STAGING').length.toLocaleString('pt-BR')} leads • Carregar +250 cards</span>
                          </button>
                          <button
                            onClick={() => setVisibleStagingCount(leads.filter(l => l.status === 'STAGING').length)}
                            className="text-[11px] text-blue-600 hover:underline font-semibold cursor-pointer"
                          >
                            Mostrar todos os {leads.filter(l => l.status === 'STAGING').length.toLocaleString('pt-BR')} cards
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* ========================================================= */}
              {/* COLUNA 2: DISPARADOS (EM ESPERA / QUARENTENA) */}
              {/* ========================================================= */}
              <div className="bg-amber-50/40 border border-amber-200/80 rounded-2xl p-3 flex flex-col gap-2 min-h-[550px]">
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 border-b border-amber-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="font-bold text-xs text-amber-900">2. Disparados (Em Espera)</span>
                  </div>
                  <span className="bg-amber-100 text-amber-900 text-[11px] px-2 py-0.5 rounded-full font-mono font-bold">
                    {leads.filter(l => l.status === 'QUARENTENA' || l.status === 'DISPARADO').length}
                  </span>
                </div>

                <p className="text-[11px] text-amber-800/80 leading-tight">
                  Mensagens enviadas via Meta. Aguardando interação do cliente na janela de 24h.
                </p>

                {/* Botão de Sincronização / Reciclagem WhatsApp Web */}
                <button
                  onClick={() => {
                    setSyncWhatsAppResult(null);
                    setShowSyncWhatsAppModal(true);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 bg-white hover:bg-teal-50 border border-teal-300 text-teal-800 rounded-xl text-[11px] font-bold shadow-2xs transition cursor-pointer"
                  title="Cruzar com chats reais do WhatsApp Web: confirma enviados, isola fixos e recicla não disparados"
                >
                  <RefreshCw className="w-3 h-3 text-teal-600" />
                  <span>Sincronizar com WhatsApp Web</span>
                </button>

                {/* Dispatched Leads List */}
                <div className="flex-1 overflow-y-auto space-y-2 max-h-[600px] pr-1">
                  {leads.filter(l => l.status === 'QUARENTENA' || l.status === 'DISPARADO').length === 0 ? (
                    <div className="text-center py-12 px-4 border-2 border-dashed border-amber-200 rounded-xl bg-white/60">
                      <Clock className="w-8 h-8 text-amber-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-amber-900">Nenhum disparo em espera</p>
                      <p className="text-[11px] text-amber-700 mt-1">
                        Dispare leads da Etapa 1 para que entrem neste processo de espera.
                      </p>
                    </div>
                  ) : (
                    leads.filter(l => l.status === 'QUARENTENA' || l.status === 'DISPARADO').map(lead => (
                      <div
                        key={lead.id}
                        className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs text-xs space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-bold text-neutral-900 truncate">{lead.name || 'Lead'}</div>
                          <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            Em Espera
                          </span>
                        </div>

                        <div className="text-[11px] text-neutral-600 font-mono">{lead.phoneNumber}</div>

                        <div className="p-1.5 bg-neutral-50 rounded border border-neutral-200 text-[10px] text-neutral-600 flex items-center justify-between">
                          <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                            <CheckCircle2 className="w-3 h-3" />
                            Enviado via Meta
                          </span>
                          <span className="text-neutral-400 font-mono">24h Quarentena</span>
                        </div>

                        <div className="pt-1 border-t border-neutral-100 flex items-center justify-between">
                          <button
                            onClick={() => handleSimulateLeadReply(lead.id, true)}
                            className="text-[10px] font-bold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Flame className="w-3 h-3" />
                            Simular Resposta 🔥
                          </button>

                          <button
                            onClick={() => handleMoveLeadStatus(lead.id, 'FRIO', 'Sem resposta no prazo.')}
                            className="text-[10px] font-medium text-neutral-400 hover:text-neutral-600 cursor-pointer"
                          >
                            Expirar ➔
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ========================================================= */}
              {/* COLUNA 3: RESPONDEU NO WHATSAPP (INTERESSADOS 🔥) */}
              {/* ========================================================= */}
              <div className="bg-rose-50/40 border border-rose-200/80 rounded-2xl p-3 flex flex-col gap-2 min-h-[550px]">
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 border-b border-rose-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    <span className="font-bold text-xs text-rose-900">3. Respondeu no WhatsApp 🔥</span>
                  </div>
                  <span className="bg-rose-100 text-rose-900 text-[11px] px-2 py-0.5 rounded-full font-mono font-bold">
                    {leads.filter(l => l.status === 'INTERESSADO').length}
                  </span>
                </div>

                <p className="text-[11px] text-rose-800/80 leading-tight">
                  Clientes que responderam à copy enviada! Retidos com Thomas para fechamento.
                </p>

                {/* Hot Leads List */}
                <div className="flex-1 overflow-y-auto space-y-2 max-h-[600px] pr-1">
                  {leads.filter(l => l.status === 'INTERESSADO').length === 0 ? (
                    <div className="text-center py-12 px-4 border-2 border-dashed border-rose-200 rounded-xl bg-white/60">
                      <Flame className="w-8 h-8 text-rose-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-rose-900">Aguardando primeiras respostas</p>
                      <p className="text-[11px] text-rose-700 mt-1">
                        Assim que o lead responder no WhatsApp oficial, o card aparecerá aqui em tempo real.
                      </p>
                    </div>
                  ) : (
                    leads.filter(l => l.status === 'INTERESSADO').map(lead => (
                      <div
                        key={lead.id}
                        className="bg-white p-3 rounded-xl border border-rose-300 shadow-xs text-xs space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-bold text-neutral-900 truncate">{lead.name || 'Lead Interessado'}</div>
                          <span className="text-[9px] bg-rose-600 text-white font-bold px-1.5 py-0.5 rounded">
                            Quente
                          </span>
                        </div>

                        <div className="text-[11px] text-neutral-600 font-mono">{lead.phoneNumber}</div>

                        {/* Speech bubble with lead's reply */}
                        <div className="p-2.5 bg-rose-50/90 rounded-xl border border-rose-200 text-[11px] text-neutral-800 italic relative">
                          <span className="font-bold text-rose-900 not-italic block text-[10px] mb-0.5">
                            Resposta do Lead:
                          </span>
                          "{lead.responsePreview || 'Olá! Gostei da proposta do site. Como funciona para ativarmos?'}"
                        </div>

                        <div className="pt-1 flex flex-col gap-1.5">
                          <button
                            onClick={() => onNavigateToWhatsApp?.(lead.id, 'seller-thomas')}
                            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Atender no WhatsApp do Thomas</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ========================================================= */}
              {/* COLUNA 4: SEM RESPOSTA / FRIO */}
              {/* ========================================================= */}
              <div className="bg-sky-50/40 border border-sky-200/80 rounded-2xl p-3 flex flex-col gap-2 min-h-[550px]">
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 border-b border-sky-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-500" />
                    <span className="font-bold text-xs text-sky-900">4. Sem Resposta (Frio)</span>
                  </div>
                  <span className="bg-sky-100 text-sky-900 text-[11px] px-2 py-0.5 rounded-full font-mono font-bold">
                    {leads.filter(l => l.status === 'FRIO' || l.status === 'DESCARTADO').length}
                  </span>
                </div>

                <p className="text-[11px] text-sky-800/80 leading-tight">
                  Não responderam no WhatsApp dentro da quarentena. Liberados para ligação.
                </p>

                {/* Cold Leads List */}
                <div className="flex-1 overflow-y-auto space-y-2 max-h-[600px] pr-1">
                  {leads.filter(l => l.status === 'FRIO' || l.status === 'DESCARTADO').length === 0 ? (
                    <div className="text-center py-12 px-4 border-2 border-dashed border-sky-200 rounded-xl bg-white/60">
                      <Snowflake className="w-8 h-8 text-sky-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-sky-900">Nenhum lead expirado</p>
                      <p className="text-[11px] text-sky-700 mt-1">
                        Leads que não responderem no prazo aparecerão aqui para discagem da equipe.
                      </p>
                    </div>
                  ) : (
                    <>
                      {leads.filter(l => l.status === 'FRIO' || l.status === 'DESCARTADO').slice(0, visibleColdCount).map(lead => (
                        <div
                          key={lead.id}
                          className="bg-white p-3 rounded-xl border border-sky-200 shadow-2xs text-xs space-y-2"
                        >
                          <div className="font-bold text-neutral-900 truncate">{lead.name}</div>
                          <div className="text-[11px] text-neutral-500 font-mono">{lead.phoneNumber}</div>
                          <div className="text-[10px] text-sky-700 bg-sky-50 px-2 py-1 rounded font-medium">
                            📞 Disponível para Ligação Telefônica
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-neutral-100">
                            <button
                              onClick={() => handleMoveLeadStatus(lead.id, 'STAGING')}
                              className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                            >
                              ↩️ Voltar para Etapa 1
                            </button>
                          </div>
                        </div>
                      ))}

                      {leads.filter(l => l.status === 'FRIO' || l.status === 'DESCARTADO').length > visibleColdCount && (
                        <div className="pt-2 pb-1 flex flex-col items-center gap-1.5 sticky bottom-0 bg-white/95 backdrop-blur-xs p-2 rounded-xl border border-sky-200 shadow-2xs">
                          <button
                            onClick={() => setVisibleColdCount(prev => prev + 250)}
                            className="w-full py-2 px-3 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>Exibindo {Math.min(visibleColdCount, leads.filter(l => l.status === 'FRIO' || l.status === 'DESCARTADO').length).toLocaleString('pt-BR')} de {leads.filter(l => l.status === 'FRIO' || l.status === 'DESCARTADO').length.toLocaleString('pt-BR')} leads • Carregar +250</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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
                          Garantia de Limite: Serão disparados <strong>{dispatchQuantityOption === 'ALL' ? leads.filter(l => l.status === 'STAGING').length.toLocaleString('pt-BR') : (Number(customDispatchQuantity) || 100).toLocaleString('pt-BR')} leads</strong> (o sistema respeita rigorosamente o limite).
                        </span>
                      </div>
                    </div>
                  </div>

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
                        {availableTemplates.length > 0 ? (
                          availableTemplates.map((t: any) => (
                            <option key={t.name} value={t.name}>
                              {t.name} — {t.category || 'MARKETING'} ({t.status || 'APPROVED'})
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="dns_escassez_np4">
                              dns_escassez_np4 — Template Oficial Meta com Botão CTA (Recomendado)
                            </option>
                            <option value="notificacao_pedido_atendimento">
                              notificacao_pedido_atendimento — Template Padrão Notificação
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

                        {/* Bloco 1 com Ei, */}
                        <div className="text-neutral-900 font-medium">
                          Ei, {templateVar1.slice(0, META_CHAR_LIMITS.var1).replace(/\{nome\}/gi, 'Roberto').replace(/\{empresa\}/gi, 'Padaria Estrela')}
                        </div>

                        {/* Bloco 2 */}
                        <div className="text-neutral-800">
                          {templateVar2.slice(0, META_CHAR_LIMITS.var2).replace(/\{vendedor\}/gi, salespeople.find(s => s.id === (dispatchSelectedClosers[0] || dispatchSelectedCloser))?.name || 'Thomas Gabriel').replace(/\{empresa\}/gi, 'Padaria Estrela')}
                        </div>

                        {/* Bloco 3 */}
                        <div className="text-neutral-800">
                          {templateVar3.slice(0, META_CHAR_LIMITS.var3).replace(/\{site_novo\}/gi, 'https://padariaestrela.nyroh.app')}
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
      </div>

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

      {/* MODAL DE ACOMPANHAMENTO EM TEMPO REAL (STREAM DISCO + POSTGRESQL + RAILWAY SAFE) */}
      <ZipImportProgressModal
        isOpen={showImportProgressModal}
        onClose={() => {
          setShowImportProgressModal(false);
          setImportProgressData(null);
        }}
        progressData={importProgressData}
        onCancelUpload={handleCancelImport}
        onViewBatch={(bId) => {
          setSelectedBatchId(bId);
          setShowImportProgressModal(false);
          fetchLeads();
        }}
      />
    </div>
  );

};
