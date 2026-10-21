import React, { useState, useEffect } from 'react';
import { useRuntimeConfig, formatInstancePhone } from '../lib/useRuntimeConfig';
import {
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  ExternalLink,
  ShieldCheck,
  Zap,
  Key,
  Lock,
  Smartphone,
  CheckCheck,
  Terminal,
  Clock,
  Radio,
  Copy,
  Info,
  Layers,
  Plus,
  Check,
  FileText,
  Sparkles,
  Trash2,
  Play,
  ArrowRight,
  Eye,
  Sliders,
  ListFilter,
  CheckCheck as DualCheck,
  LayoutGrid,
  List,
  Search,
  Code2,
  Edit3,
  X,
  FileCode,
  Activity,
  BookmarkPlus,
  HelpCircle,
  Share2
} from 'lucide-react';
import { FluxoConfig, FluxoInstance, User } from '../types';

interface AdminWhatsAppFluxoViewProps {
  currentUser: User;
  onShowToast: (msg: string) => void;
}

interface MetaTemplateItem {
  id: string;
  name: string;
  category: 'MARKETING' | 'UTILITY';
  language: string;
  status: 'DRAFT' | 'APPROVED' | 'PENDING' | 'REJECTED';
  components: any[];
  usageCount?: number;
  qualityScore?: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  rejectedReason?: string;
  createdAt?: string;
  submittedToMeta?: boolean;
}

interface WebhookEventItem {
  id: string;
  receivedAt: string;
  type: string;
  summary: string;
  payload: any;
}

export const AdminWhatsAppFluxoView: React.FC<AdminWhatsAppFluxoViewProps> = ({
  currentUser,
  onShowToast
}) => {
  // Número e estado REAIS da instância, vindos do servidor (antes estavam chumbados no código)
  const runtime = useRuntimeConfig();
  const instanceLabel = formatInstancePhone(runtime.instancePhone);

  // Active Sub-tab
  const [activeSubTab, setActiveSubTab] = useState<
    'instances' | 'templates' | 'sandbox' | 'webhooks'
  >('instances');

  // Config state
  const [config, setConfig] = useState<FluxoConfig>({
    apiKey: '',
    apiSecret: '',
    instanceId: '',
    isConfigured: false,
    source: 'none'
  });
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Persistent state from localStorage as safety fallback on F5
  // A chave da FluxoAPI NÃO é guardada no navegador. Antes ficava em localStorage e era
  // preenchida de volta no formulário — qualquer um no mesmo computador a lia.
  if (typeof window !== 'undefined') {
    try { localStorage.removeItem('nyroh_fluxo_key'); } catch { /* ignora */ }
  }
  const savedLocalInstance = typeof window !== 'undefined' ? localStorage.getItem('nyroh_fluxo_instance_id') || '' : '';

  // Form input state (FluxoAPI)
  const [inputApiKey, setInputApiKey] = useState('');
  const [inputApiSecret, setInputApiSecret] = useState('');
  const [inputInstanceId, setInputInstanceId] = useState(savedLocalInstance);
  const [savingConfig, setSavingConfig] = useState(false);

  // Form input state (Meta Cloud API Oficial)
  const [inputMetaAccessToken, setInputMetaAccessToken] = useState('');
  const [inputMetaWabaId, setInputMetaWabaId] = useState('');
  const [inputMetaPhoneNumberId, setInputMetaPhoneNumberId] = useState('');
  const [inputMetaVerifyToken, setInputMetaVerifyToken] = useState('crm_webhook_meta_token');
  const [savingMetaConfig, setSavingMetaConfig] = useState(false);
  const [metaSaveSuccess, setMetaSaveSuccess] = useState<string | null>(null);

  // Sincronização em tempo real com a Meta
  const [syncingWithMeta, setSyncingWithMeta] = useState(false);
  const [metaSyncNotice, setMetaSyncNotice] = useState<string | null>(null);

  // Instances list
  // Instâncias REAIS vindas da FluxoAPI (nunca um valor fixo): vazio até a API responder
  const [instances, setInstances] = useState<any[]>([]);
  const [instancesError, setInstancesError] = useState<{ message?: string; action?: string; code?: string } | null>(null);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [newInstancePhone, setNewInstancePhone] = useState('');
  const [creatingInstance, setCreatingInstance] = useState(false);

  // Test connection state
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean;
    latencyMs?: number;
    instances?: FluxoInstance[];
    selectedInstance?: FluxoInstance;
    error?: any;
    raw?: any;
    testedAt?: string;
  } | null>(null);

  // Templates state & sub-navigation
  const [templates, setTemplates] = useState<MetaTemplateItem[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [submittingTemplate, setSubmittingTemplate] = useState(false);
  const [savingAsDraft, setSavingAsDraft] = useState(false);
  const [templateSubView, setTemplateSubView] = useState<'kanban' | 'list' | 'creator'>('kanban');
  const [templateSearchTerm, setTemplateSearchTerm] = useState('');
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<'ALL' | 'UTILITY' | 'MARKETING'>('ALL');

  // JSON Import Modal State
  const [showJsonImportModal, setShowJsonImportModal] = useState(false);
  const [jsonInputText, setJsonInputText] = useState('');
  const [jsonImportError, setJsonImportError] = useState<string | null>(null);

  // Template Creator State (Initialized with the proven 8x cheaper Utility camouflage structure)
  const [tplName, setTplName] = useState('notificacao_pedido_atendimento');
  const [tplCategory, setTplCategory] = useState<'MARKETING' | 'UTILITY'>('UTILITY');
  const [tplHeader, setTplHeader] = useState('');
  const [tplBody, setTplBody] = useState(
    'Ei, {{1}}\n\n{{2}}\n\n{{3}}\n\nClique no botão abaixo para acessar:'
  );
  const [tplFooter, setTplFooter] = useState('Responda PARAR para sair');
  const [tplButtons, setTplButtons] = useState<string[]>(['Acessar Link', 'Parar Mensagens']);
  const [tplExamples, setTplExamples] = useState<string[]>([
    'Caio',
    'Seu pedido foi confirmado com sucesso e em breve estará no seu destino.',
    'O link para rastreio da viagem já está disponível para acesso, conforme solicitado.'
  ]);
  const [tplVariableMappings, setTplVariableMappings] = useState<Record<string, string>>({
    '1': 'contact.name',
    '2': 'lead.custom_pitch',
    '3': 'lead.website_url'
  });
  const [previewSimulationMode, setPreviewSimulationMode] = useState<'meta_evaluation' | 'lead_real'>('meta_evaluation');
  const [newButtonInput, setNewButtonInput] = useState('');

  // Sandbox & Test Dispatches (Zero mock data - strictly user driven)
  const [testMode, setTestMode] = useState<'free_text' | 'template'>('template');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [selectedTemplateForTest, setSelectedTemplateForTest] = useState<string>('');
  const [param1, setParam1] = useState('');
  const [param2, setParam2] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [sendResult, setSendResult] = useState<{
    success: boolean;
    status?: number;
    data?: any;
    error?: any;
    latencyMs?: number;
    sentAt?: string;
    result?: any;
  } | null>(null);

  // Chat Test Simulation (Zero mock messages - clean slate until real events or user tests)
  const [testChatMessages, setTestChatMessages] = useState<
    Array<{ id: string; sender: 'user' | 'nyroh'; text: string; time: string; status?: string }>
  >([]);
  const [chatInputText, setChatInputText] = useState('');

  // Webhooks state
  const [webhookEvents, setWebhookEvents] = useState<WebhookEventItem[]>([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(false);

  // Webhook URL display
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const webhookUrl = `${currentOrigin}/api/webhooks/fluxo`;

  // Fetch initial config
  const fetchConfig = async () => {
    setLoadingConfig(true);
    try {
      const res = await fetch('/api/admin/fluxo/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        // `data.apiKey` vem mascarado (••••1234). Serve de indicação, nunca de valor do campo.
        const resolvedInstance = data.instanceId || savedLocalInstance;
        if (resolvedInstance) {
          setInputInstanceId(resolvedInstance);
          if (typeof window !== 'undefined') localStorage.setItem('nyroh_fluxo_instance_id', resolvedInstance);
        }

        // Credenciais Meta: o token também vem mascarado e não volta para o campo.
        if (data.metaWabaId) setInputMetaWabaId(data.metaWabaId);
        if (data.metaPhoneNumberId) setInputMetaPhoneNumberId(data.metaPhoneNumberId);
        if (data.metaVerifyToken) setInputMetaVerifyToken(data.metaVerifyToken);
      }
    } catch (err) {
      console.error('Erro ao buscar configuração FluxoAPI/Meta:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  // Sincronização em tempo real diretamente com a Meta Graph API
  const syncWithMetaRealtime = async () => {
    setSyncingWithMeta(true);
    setMetaSyncNotice(null);
    try {
      const res = await fetch('/api/admin/fluxo/templates/sync-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMetaSyncNotice(data.message || `${data.count} modelos sincronizados diretamente da Meta!`);
        onShowToast(data.message || `${data.count} modelos sincronizados com a Meta!`);
        await fetchTemplates();
      } else {
        await fetchTemplates();
        const msg = data.error || 'Não foi possível sincronizar direto com a Meta. Carregando templates locais.';
        setMetaSyncNotice(msg);
        onShowToast(msg);
      }
    } catch (err: any) {
      console.error('Erro na sincronização em tempo real com a Meta:', err);
      await fetchTemplates();
      setMetaSyncNotice('Falha na comunicação direta com a Meta.');
    } finally {
      setSyncingWithMeta(false);
    }
  };

  // Salvar credenciais oficiais da Meta Cloud API
  const handleSaveMetaConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMetaConfig(true);
    setMetaSaveSuccess(null);
    try {
      const res = await fetch('/api/admin/fluxo/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metaAccessToken: inputMetaAccessToken.trim() || undefined,
          metaWabaId: inputMetaWabaId.trim() || undefined,
          metaPhoneNumberId: inputMetaPhoneNumberId.trim() || undefined,
          metaVerifyToken: inputMetaVerifyToken.trim() || undefined
        })
      });

      if (res.ok) {
        setMetaSaveSuccess('Credenciais oficiais da Meta salvas no Banco de Dados com sucesso!');
        onShowToast('Credenciais da Meta salvas! Sincronizando templates...');
        await fetchConfig();
        await syncWithMetaRealtime();
      } else {
        const d = await res.json();
        setMetaSaveSuccess(d.error || 'Erro ao salvar credenciais da Meta.');
        onShowToast('Erro ao salvar credenciais.');
      }
    } catch (err: any) {
      setMetaSaveSuccess(`Erro: ${err.message}`);
      onShowToast('Erro de conexão ao salvar.');
    } finally {
      setSavingMetaConfig(false);
    }
  };

  // Fetch instances
  const fetchInstances = async () => {
    setLoadingInstances(true);
    try {
      const res = await fetch('/api/admin/fluxo/instances');
      if (res.ok) {
        const data = await res.json();
        setInstances(Array.isArray(data.instances) ? data.instances : []);
        setInstancesError(data.success === false ? (data.error || { message: 'Não foi possível ler as instâncias da FluxoAPI.' }) : null);
      } else {
        setInstancesError({ message: `Falha ao consultar as instâncias (HTTP ${res.status}).` });
      }
    } catch (err) {
      console.error('Erro ao buscar instâncias:', err);
    } finally {
      setLoadingInstances(false);
    }
  };

  // Fetch templates
  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch('/api/admin/fluxo/templates');
      if (res.ok) {
        const data = await res.json();
        if (data.templates && Array.isArray(data.templates)) {
          setTemplates(data.templates);
          if (data.templates.length > 0 && !selectedTemplateForTest) {
            setSelectedTemplateForTest(data.templates[0].name);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao buscar templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Fetch webhook events
  const fetchWebhookEvents = async () => {
    setLoadingWebhooks(true);
    try {
      const res = await fetch('/api/admin/fluxo/events');
      if (res.ok) {
        const data = await res.json();
        if (data.events && Array.isArray(data.events)) {
          setWebhookEvents(data.events);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar eventos webhook:', err);
    } finally {
      setLoadingWebhooks(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchInstances();
    fetchTemplates();
    fetchWebhookEvents();
  }, []);

  // Save config handler
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalKey = inputApiKey.trim();
    if (!finalKey && !config.hasApiKey) {
      onShowToast('Informe a Chave da API (Key).');
      return;
    }
    if (!inputApiSecret.trim() && !config.hasSecret) {
      onShowToast('Informe o Segredo da Chave (Secret).');
      return;
    }

    setSavingConfig(true);
    try {
      const res = await fetch('/api/admin/fluxo/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: finalKey,
          apiSecret: inputApiSecret.trim() || undefined,
          instanceId: inputInstanceId.trim() || undefined
        })
      });

      const data = await res.json();
      if (res.ok) {
        if (typeof window !== 'undefined') {
          if (inputInstanceId.trim()) localStorage.setItem('nyroh_fluxo_instance_id', inputInstanceId.trim());
        }
        onShowToast('Credenciais da FluxoAPI salvas no Banco de Dados com sucesso!');
        await fetchConfig();
        handleTestConnection(finalKey, inputApiSecret.trim() || undefined, inputInstanceId.trim() || undefined);
      } else {
        onShowToast(data.error || 'Erro ao salvar credenciais.');
      }
    } catch (err: any) {
      onShowToast(`Erro de conexão: ${err.message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  // Test connection handler
  const handleTestConnection = async (customKey?: string, customSecret?: string, customInstance?: string) => {
    setTestingConnection(true);
    try {
      const payload: any = {};
      if (customKey && customSecret) {
        payload.apiKey = customKey;
        payload.apiSecret = customSecret;
      }
      if (customInstance) {
        payload.instanceId = customInstance;
      }

      const res = await fetch('/api/admin/fluxo/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      setConnectionResult({
        ...data,
        testedAt: new Date().toLocaleTimeString('pt-BR')
      });

      if (data.success) {
        onShowToast(`Conexão confirmada com a FluxoAPI! Latência: ${data.latencyMs || 0}ms`);
        fetchInstances();
      } else {
        onShowToast(data.error?.message || 'Falha ao validar conexão.');
      }
    } catch (err: any) {
      setConnectionResult({
        success: false,
        error: { message: err.message || 'Erro de rede ao conectar à FluxoAPI.' },
        testedAt: new Date().toLocaleTimeString('pt-BR')
      });
      onShowToast('Erro de comunicação com o servidor local.');
    } finally {
      setTestingConnection(false);
    }
  };

  // Add button to creator
  const handleAddButton = () => {
    if (!newButtonInput.trim()) return;
    if (tplButtons.length >= 3) {
      onShowToast('A Meta permite no máximo 3 botões de resposta rápida.');
      return;
    }
    setTplButtons((prev) => [...prev, newButtonInput.trim()]);
    setNewButtonInput('');
  };

  const handleRemoveButton = (indexToRemove: number) => {
    setTplButtons((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Submit Template to Meta Handler
  const handleSubmitTemplateToMeta = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tplName.trim() || !tplBody.trim()) {
      onShowToast('Preencha o nome do modelo e o corpo da mensagem.');
      return;
    }

    setSubmittingTemplate(true);
    try {
      const components: any[] = [];
      if (tplHeader.trim()) {
        components.push({ type: 'HEADER', format: 'TEXT', text: tplHeader.trim() });
      }
      components.push({ type: 'BODY', text: tplBody.trim() });
      if (tplFooter.trim()) {
        components.push({ type: 'FOOTER', text: tplFooter.trim() });
      }
      const validButtons = tplButtons.filter((b) => b.trim());
      if (validButtons.length > 0) {
        components.push({
          type: 'BUTTONS',
          buttons: validButtons.map((text) => ({ type: 'QUICK_REPLY', text: text.trim() }))
        });
      }

      const res = await fetch('/api/admin/fluxo/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tplName.trim(),
          category: tplCategory,
          language: 'pt_BR',
          components,
          examples: tplExamples,
          isDraft: false
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onShowToast(data.message || 'Modelo enviado para a fila de aprovação da Meta!');
        await fetchTemplates();
        setTemplateSubView('kanban');
      } else {
        onShowToast(data.error || 'Erro ao submeter modelo para a Meta.');
      }
    } catch (err: any) {
      onShowToast(`Erro ao criar template: ${err.message}`);
    } finally {
      setSubmittingTemplate(false);
    }
  };

  // Save as Local Draft (Doesn't hit Meta API yet)
  const handleSaveDraftTemplate = async () => {
    if (!tplName.trim() || !tplBody.trim()) {
      onShowToast('Preencha o nome do modelo e o corpo da mensagem.');
      return;
    }

    setSavingAsDraft(true);
    try {
      const components: any[] = [];
      if (tplHeader.trim()) {
        components.push({ type: 'HEADER', format: 'TEXT', text: tplHeader.trim() });
      }
      components.push({ type: 'BODY', text: tplBody.trim() });
      if (tplFooter.trim()) {
        components.push({ type: 'FOOTER', text: tplFooter.trim() });
      }
      const validButtons = tplButtons.filter((b) => b.trim());
      if (validButtons.length > 0) {
        components.push({
          type: 'BUTTONS',
          buttons: validButtons.map((text) => ({ type: 'QUICK_REPLY', text: text.trim() }))
        });
      }

      const res = await fetch('/api/admin/fluxo/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tplName.trim(),
          category: tplCategory,
          language: 'pt_BR',
          components,
          isDraft: true
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onShowToast('Template salvo como Rascunho com sucesso!');
        await fetchTemplates();
        setTemplateSubView('kanban');
      } else {
        onShowToast(data.error || 'Erro ao salvar rascunho.');
      }
    } catch (err: any) {
      onShowToast(`Erro ao salvar rascunho: ${err.message}`);
    } finally {
      setSavingAsDraft(false);
    }
  };

  // Update Template Status / Quality Score
  const handleUpdateTemplateStatus = async (templateName: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/fluxo/templates/${encodeURIComponent(templateName)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        onShowToast(`Status de "${templateName}" alterado para ${newStatus}!`);
        await fetchTemplates();
      } else {
        onShowToast('Erro ao atualizar status.');
      }
    } catch (err: any) {
      onShowToast(`Erro ao atualizar status: ${err.message}`);
    }
  };

  // Delete Template
  const handleDeleteTemplate = async (templateName: string) => {
    if (!confirm(`Deseja realmente excluir o template "${templateName}"?`)) return;
    try {
      const res = await fetch(`/api/admin/fluxo/templates/${encodeURIComponent(templateName)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        onShowToast(`Template "${templateName}" excluído com sucesso!`);
        await fetchTemplates();
      } else {
        onShowToast('Erro ao excluir template.');
      }
    } catch (err: any) {
      onShowToast(`Erro ao excluir: ${err.message}`);
    }
  };

  // Load existing template into creator
  const handleLoadTemplateIntoCreator = (tpl: MetaTemplateItem) => {
    setTplName(tpl.name);
    setTplCategory(tpl.category);
    const headerComp = tpl.components?.find((c) => c.type === 'HEADER');
    const bodyComp = tpl.components?.find((c) => c.type === 'BODY');
    const footerComp = tpl.components?.find((c) => c.type === 'FOOTER');
    const btnComp = tpl.components?.find((c) => c.type === 'BUTTONS');

    setTplHeader(headerComp?.text || '');
    setTplBody(bodyComp?.text || '');
    setTplFooter(footerComp?.text || '');
    if (btnComp && Array.isArray(btnComp.buttons)) {
      setTplButtons(btnComp.buttons.map((b: any) => b.text || b.label || String(b)));
    } else {
      setTplButtons([]);
    }
    setTemplateSubView('creator');
    onShowToast(`Template "${tpl.name}" carregado no criador!`);
  };

  // Parse and import JSON into creator
  const handleParseAndImportJson = (rawJson: string) => {
    if (!rawJson.trim()) {
      setJsonImportError('Cole um JSON antes de processar.');
      return;
    }

    try {
      const parsed = JSON.parse(rawJson);
      const obj = parsed.template || parsed.data || parsed;

      // 1. Template Name
      const extractedName = obj.name || obj.template_name || obj.id || '';
      if (extractedName) {
        setTplName(String(extractedName).toLowerCase().replace(/[^a-z0-9_]/g, '_'));
      }

      // 2. Category
      const rawCategory = String(obj.category || '').toUpperCase();
      if (rawCategory === 'UTILITY' || rawCategory === 'MARKETING') {
        setTplCategory(rawCategory as any);
      } else {
        setTplCategory('UTILITY');
      }

      // 3. Components
      const components: any[] = Array.isArray(obj.components) ? obj.components : [];

      let headerText = '';
      let bodyText = '';
      let footerText = '';
      const buttonsList: string[] = [];

      if (obj.header) headerText = typeof obj.header === 'string' ? obj.header : obj.header.text || '';
      if (obj.body) bodyText = typeof obj.body === 'string' ? obj.body : obj.body.text || '';
      if (obj.footer) footerText = typeof obj.footer === 'string' ? obj.footer : obj.footer.text || '';

      for (const comp of components) {
        const type = String(comp.type || '').toUpperCase();
        if (type === 'HEADER') {
          headerText = comp.text || '';
        } else if (type === 'BODY') {
          bodyText = comp.text || '';
        } else if (type === 'FOOTER') {
          footerText = comp.text || '';
        } else if (type === 'BUTTONS') {
          if (Array.isArray(comp.buttons)) {
            comp.buttons.forEach((b: any) => {
              const btnText = typeof b === 'string' ? b : b.text || b.label || '';
              if (btnText) buttonsList.push(btnText);
            });
          }
        }
      }

      if (Array.isArray(obj.buttons) && buttonsList.length === 0) {
        obj.buttons.forEach((b: any) => {
          const btnText = typeof b === 'string' ? b : b.text || b.label || '';
          if (btnText) buttonsList.push(btnText);
        });
      }

      if (headerText) setTplHeader(headerText);
      if (bodyText) setTplBody(bodyText);
      if (footerText) setTplFooter(footerText);
      if (buttonsList.length > 0) {
        setTplButtons(buttonsList);
      } else {
        setTplButtons(['Sim', 'Não']);
      }

      // 4. Extract Examples if available
      let extractedExamples: string[] = [];
      if (obj.body && typeof obj.body === 'object' && Array.isArray(obj.body.examples)) {
        extractedExamples = obj.body.examples.map((e: any) => String(e));
      } else if (Array.isArray(obj.examples)) {
        extractedExamples = obj.examples.map((e: any) => String(e));
      }

      if (extractedExamples.length > 0) {
        setTplExamples(extractedExamples);
      } else {
        const matches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
        const count = new Set(matches).size;
        if (count > 0) {
          const defaults = ['Marcelo', 'Criei uma prévia exclusiva para a sua empresa', 'https://nyroh.com.br/demo'];
          setTplExamples(Array.from({ length: count }, (_, i) => defaults[i] || `Exemplo ${i + 1}`));
        }
      }

      setShowJsonImportModal(false);
      setJsonInputText('');
      setJsonImportError(null);
      setTemplateSubView('creator');
      onShowToast(`Template importado com sucesso para o criador!`);
    } catch (err: any) {
      setJsonImportError(`Erro de sintaxe no JSON: ${err.message}`);
    }
  };

  // Send Test Message (Free text)
  const handleSendTestFreeMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientPhone.trim() || !messageBody.trim()) {
      onShowToast('Preencha o número de destino e o texto da mensagem.');
      return;
    }

    setSendingTest(true);
    try {
      const res = await fetch('/api/admin/fluxo/send-test-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientPhone.trim(),
          text: messageBody.trim(),
          instanceId: inputInstanceId.trim() || config.instanceId || undefined
        })
      });

      const data = await res.json();
      setSendResult({
        ...data,
        sentAt: new Date().toLocaleTimeString('pt-BR')
      });

      if (data.success) {
        onShowToast('Mensagem enviada com sucesso para a fila da Meta!');
        setTestChatMessages((prev) => [
          ...prev,
          {
            id: `msg_${Date.now()}`,
            sender: 'nyroh',
            text: messageBody.trim(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'delivered'
          }
        ]);
      } else {
        onShowToast(data.error?.message || 'Erro ao enviar mensagem.');
      }
    } catch (err: any) {
      setSendResult({
        success: false,
        error: { message: err.message || 'Erro de rede ao enviar.' },
        sentAt: new Date().toLocaleTimeString('pt-BR')
      });
      onShowToast('Falha no envio da mensagem teste.');
    } finally {
      setSendingTest(false);
    }
  };

  // Send Template Test
  const handleSendTestTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientPhone.trim() || !selectedTemplateForTest) {
      onShowToast('Informe o número de destino e selecione um modelo.');
      return;
    }

    setSendingTest(true);
    try {
      const res = await fetch('/api/admin/fluxo/send-template-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientPhone.trim(),
          templateName: selectedTemplateForTest,
          language: 'pt_BR',
          parameters: [param1.trim(), param2.trim()].filter(Boolean),
          requestedInstanceId: inputInstanceId.trim() || config.instanceId || undefined
        })
      });

      const data = await res.json();
      setSendResult({
        ...data,
        sentAt: new Date().toLocaleTimeString('pt-BR')
      });

      if (data.success) {
        onShowToast(`Template ${selectedTemplateForTest} disparado com sucesso!`);
        setTestChatMessages((prev) => [
          ...prev,
          {
            id: `tpl_${Date.now()}`,
            sender: 'nyroh',
            text: `[TEMPLATE OFICIAL]: ${selectedTemplateForTest} (Parâmetros: ${param1}, ${param2})`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'delivered'
          }
        ]);
      } else {
        onShowToast(data.error?.message || 'Erro ao enviar template.');
      }
    } catch (err: any) {
      setSendResult({
        success: false,
        error: { message: err.message || 'Erro de rede ao disparar template.' },
        sentAt: new Date().toLocaleTimeString('pt-BR')
      });
      onShowToast('Falha no disparo do modelo teste.');
    } finally {
      setSendingTest(false);
    }
  };

  // Quick Chat Send (Inside Sandbox)
  const handleQuickChatSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInputText.trim()) return;

    const userText = chatInputText.trim();
    setChatInputText('');

    // Adiciona na conversa de teste
    const newMsg = {
      id: `m_${Date.now()}`,
      sender: 'nyroh' as const,
      text: userText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'sent'
    };
    setTestChatMessages((prev) => [...prev, newMsg]);

    try {
      const res = await fetch('/api/admin/fluxo/send-test-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientPhone.trim(),
          text: userText,
          instanceId: inputInstanceId.trim() || config.instanceId || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        setTestChatMessages((prev) =>
          prev.map((m) => (m.id === newMsg.id ? { ...m, status: 'delivered' } : m))
        );
      }
    } catch {
      // Ignora para chat de teste
    }
  };

  // Quick load template blueprint
  const loadPresetTemplate = (presetKey: string) => {
    if (presetKey === 'video_estrategia' || presetKey === 'utilitario_camuflado') {
      setTplName('notificacao_pedido_atendimento');
      setTplCategory('UTILITY');
      setTplHeader('');
      setTplBody('Ei, {{1}}\n\n{{2}}\n\n{{3}}\n\nClique no botão abaixo para acessar:');
      setTplFooter('Responda PARAR para sair');
      setTplButtons(['Acessar Link', 'Parar Mensagens']);
      setTplExamples([
        'Caio',
        'Seu pedido foi confirmado com sucesso e em breve estará no seu destino.',
        'O link para rastreio da viagem já está disponível para acesso, conforme solicitado.'
      ]);
      setTplVariableMappings({
        '1': 'contact.name',
        '2': 'lead.custom_pitch',
        '3': 'lead.website_url'
      });
      onShowToast('⭐ Modelo Camuflado do Vídeo (8x mais barato) carregado!');
    } else if (presetKey === 'utilitario_troiano' || presetKey === 'confirmacao_utilitaria') {
      setTplName('confirmacao_atendimento_utilitario');
      setTplCategory('UTILITY');
      setTplHeader('');
      setTplBody('Ei, {{1}}!\n\n{{2}}\n\nPoderia estar confirmando por gentileza?');
      setTplFooter('Responda PARAR para sair');
      setTplButtons(['Sim', 'Não']);
      setTplExamples([
        'Caio',
        'Informamos que seu chamado de suporte foi atualizado com sucesso.'
      ]);
      setTplVariableMappings({
        '1': 'contact.name',
        '2': 'lead.custom_pitch'
      });
    } else if (presetKey === 'apresentacao') {
      setTplName('apresentacao_comercial_closer');
      setTplCategory('MARKETING');
      setTplHeader('Nyroh Tech • Apresentação Comercial');
      setTplBody('Olá {{1}}, tudo bem? Aqui é da Nyroh Tech. Notamos que a {{2}} está buscando escalar seu comercial e gostaríamos de demonstrar a ferramenta.');
      setTplFooter('Responda PARAR para cancelar');
      setTplButtons(['Quero Agendar Apresentação']);
      setTplExamples([
        'Marcelo',
        'Marcenaria Oliveira'
      ]);
    } else if (presetKey === 'followup') {
      setTplName('followup_pos_reuniao');
      setTplCategory('UTILITY');
      setTplHeader('Nyroh Tech • Follow-up');
      setTplBody('Oi {{1}}, tudo bem? Passando para saber se conseguiu avaliar a proposta comercial personalizada enviada para a {{2}}.');
      setTplFooter('Nyroh Tech Comercial');
      setTplButtons(['Analisando Proposta']);
      setTplExamples([
        'Marcelo',
        'Marcenaria Oliveira'
      ]);
    } else if (presetKey === 'reativacao') {
      setTplName('reativacao_lead_frio');
      setTplCategory('MARKETING');
      setTplHeader('Novas Condições Exclusivas');
      setTplBody('Olá {{1}}! Estamos liberando uma condição exclusiva para novos clientes da {{2}} este mês. Ainda faz sentido batermos um papo rápido?');
      setTplFooter('Nyroh Tech');
      setTplButtons(['Quero Conversar']);
      setTplExamples([
        'Marcelo',
        'Marcenaria Oliveira'
      ]);
    }
    setTemplateSubView('creator');
    if (presetKey !== 'video_estrategia' && presetKey !== 'utilitario_camuflado') {
      onShowToast('Modelo carregado no criador!');
    }
  };

  // Simulate Webhook Event
  const handleSimulateWebhook = async (status: string) => {
    try {
      const res = await fetch('/api/admin/fluxo/events/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          recipientPhone
        })
      });
      if (res.ok) {
        onShowToast(`Evento de webhook (${status}) simulado com sucesso!`);
        fetchWebhookEvents();
      }
    } catch {
      onShowToast('Erro ao simular evento.');
    }
  };

  // Simulate Incoming Customer Message via Webhook
  const handleSimulateIncomingMessage = async () => {
    try {
      const res = await fetch('/api/webhooks/simulate-incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: recipientPhone || '+55 11 98821-6073',
          text: 'Olá! Recebi o contato sobre o projeto e tenho interesse. Gostaria de saber os valores e prazos!',
          senderName: 'Lead Interessado (Simulação)'
        })
      });
      if (res.ok) {
        onShowToast('Mensagem de WhatsApp recebida via Webhook simulada com sucesso!');
        fetchWebhookEvents();
      }
    } catch {
      onShowToast('Erro ao simular mensagem recebida.');
    }
  };

  // Clear Webhook Logs
  const handleClearWebhookLogs = async () => {
    try {
      await fetch('/api/admin/fluxo/events', { method: 'DELETE' });
      setWebhookEvents([]);
      onShowToast('Logs de webhooks limpos com sucesso.');
    } catch {
      onShowToast('Erro ao limpar logs.');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    onShowToast(`${label} copiado para a área de transferência!`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner Oficial */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-850 to-neutral-900 rounded-2xl p-6 text-white border border-emerald-800 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Meta Cloud API Oficial • Coexistência
              </span>
              <span className="text-xs text-neutral-400 font-mono">
                Autenticação HMAC-SHA256
              </span>
            </div>
            <h2 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-emerald-400" />
              WhatsApp Oficial da Nyroh Tech (FluxoAPI)
            </h2>
            <p className="text-xs text-neutral-300 max-w-2xl leading-relaxed">
              Hub executivo de governança, instâncias e templates oficiais da Meta. Configure chaves, submeta novos modelos de mensagens, audite webhooks e monitore a integridade do seu canal oficial.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleTestConnection()}
              disabled={testingConnection}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
              <span>{testingConnection ? 'Testando Conexão...' : 'Testar Conexão Oficial'}</span>
            </button>
            <a
              href="https://fluxoapi.com.br/app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 transition-colors"
            >
              <span>Painel FluxoAPI</span>
              <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
            </a>
          </div>
        </div>

        {/* Live Status Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-emerald-800/60">
          <div className="p-3 bg-neutral-900/60 rounded-xl border border-emerald-750/50">
            <div className="text-[11px] text-neutral-400">Instância Conectada</div>
            <div className="text-sm font-bold text-white mt-0.5">NYROH TECH 1</div>
            <div className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              No ar (Conectada)
            </div>
          </div>

          <div className="p-3 bg-neutral-900/60 rounded-xl border border-emerald-750/50">
            <div className="text-[11px] text-neutral-400">Número de WhatsApp</div>
            <div className="text-sm font-bold text-white font-mono mt-0.5">{instanceLabel}</div>
            <div className="text-[10px] text-neutral-400 mt-0.5">Operacional Oficial</div>
          </div>

          <div className="p-3 bg-neutral-900/60 rounded-xl border border-emerald-750/50">
            <div className="text-[11px] text-neutral-400">Vazão & Limite</div>
            <div className="text-sm font-bold text-white mt-0.5">Até 80 msg/s</div>
            <div className="text-[10px] text-emerald-400 mt-0.5">Tier 1K (Meta Cloud)</div>
          </div>

          <div className="p-3 bg-neutral-900/60 rounded-xl border border-emerald-750/50">
            <div className="text-[11px] text-neutral-400">Status da Autenticação</div>
            <div className="text-sm font-bold mt-0.5 flex items-center gap-1.5">
              {config.isConfigured ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Configurada
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Aguardando Chaves
                </span>
              )}
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">
              Origem: {config.source === 'env' ? 'Variáveis de Ambiente' : config.source === 'database' ? 'Banco de Dados' : 'Chaves no Servidor'}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Aba Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('instances')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'instances'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>📡 Instâncias & Conexão</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-800 text-white font-mono">
            {instances.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('templates')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'templates'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>🎨 Modelos & Templates Meta</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-neutral-200 text-neutral-800 font-mono">
            {templates.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('sandbox')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'sandbox'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>🧪 Laboratório de Testes & Chat Teste</span>
        </button>

        <button
          onClick={() => setActiveSubTab('webhooks')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'webhooks'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>⚡ Webhooks & Logs em Tempo Real</span>
          {webhookEvents.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-neutral-950 font-mono font-bold">
              {webhookEvents.length}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUB-ABA 1: INSTÂNCIAS & CONEXÃO                                          */}
      {/* ========================================================================= */}
      {activeSubTab === 'instances' && (
        <div className="space-y-6">
          {/* Card de Instâncias Conectadas */}
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-600" />
                  Instâncias Oficiais da Meta Conectadas
                </h3>
                <p className="text-xs text-neutral-500">
                  Gerenciamento de linhas e coexistência com o aplicativo WhatsApp Business do celular.
                </p>
              </div>

              <button
                onClick={fetchInstances}
                disabled={loadingInstances}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingInstances ? 'animate-spin' : ''}`} />
                <span>Atualizar Linhas</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {instancesError && (
                <div className="md:col-span-2 p-4 rounded-xl border-2 border-amber-300 bg-amber-50 space-y-1">
                  <p className="text-xs font-bold text-amber-900">Não foi possível ler as linhas da FluxoAPI</p>
                  <p className="text-[11px] text-amber-800">{instancesError.message}</p>
                  {instancesError.action && <p className="text-[11px] text-amber-700">→ {instancesError.action}</p>}
                </div>
              )}

              {!instancesError && !loadingInstances && instances.length === 0 && (
                <div className="md:col-span-2 p-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 text-[11px] text-neutral-600">
                  Nenhuma instância encontrada para esta credencial. Conecte um número no painel da FluxoAPI.
                </div>
              )}

              {instances.map((inst, index) => {
                const connected = inst.status === 'connected';
                const coexistence = inst.coexistence === true;
                const quality = String(inst.quality || 'UNKNOWN').toUpperCase();
                const qualityLabel = quality === 'GREEN' ? 'Alta (Verde)' : quality === 'YELLOW' ? 'Atenção (Amarela)' : quality === 'RED' ? 'Baixa (Vermelha)' : 'Desconhecida';
                const qualityColor = quality === 'GREEN' ? 'text-emerald-700' : quality === 'YELLOW' ? 'text-amber-700' : quality === 'RED' ? 'text-red-700' : 'text-neutral-500';
                const statusLabel: Record<string, string> = { connected: 'Conectada', pending: 'Aguardando conexão', disconnected: 'Desconectada', suspended: 'Suspensa' };
                return (
                  <div
                    key={inst.id || index}
                    className={`p-4 rounded-xl border-2 space-y-3 relative overflow-hidden ${connected ? 'border-emerald-200 bg-emerald-50/30' : 'border-red-200 bg-red-50/30'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${connected ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-red-100 text-red-800 border-red-300'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-600 animate-pulse' : 'bg-red-600'}`} />
                          {statusLabel[inst.status] || inst.status || 'Status desconhecido'}
                        </div>
                        <h4 className="text-sm font-black text-neutral-900 mt-1">{inst.name || inst.id}</h4>
                        <p className="text-xs font-mono font-bold text-neutral-700">{inst.phone || 'Número ainda não informado'}</p>
                      </div>

                      <span className="text-[11px] font-mono text-neutral-400 bg-white px-2 py-1 rounded border border-neutral-200">
                        {inst.id}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-neutral-200 text-[11px]">
                      <div>
                        <span className="text-neutral-500 block text-[10px]">Qualidade Meta:</span>
                        <span className={`font-bold flex items-center gap-1 ${qualityColor}`}>
                          <CheckCircle2 className="w-3 h-3" /> {qualityLabel}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-500 block text-[10px]">Coexistência:</span>
                        <span className={`font-bold ${coexistence ? 'text-emerald-700' : 'text-red-700'}`}>
                          {coexistence ? 'Ativa (celular + CRM)' : 'DESLIGADA (somente API)'}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-500 block text-[10px]">Limite diário (Meta):</span>
                        <span className="font-bold text-neutral-800">
                          {inst.messagingLimit24h ? `${Number(inst.messagingLimit24h).toLocaleString('pt-BR')} conversas/24h` : '—'}
                        </span>
                      </div>
                    </div>

                    {!coexistence && (
                      <p className="text-[11px] leading-relaxed text-red-800 bg-red-50 border border-red-200 rounded-lg p-2">
                        <b>Por que as mensagens enviadas pelo celular não aparecem no CRM:</b> este número está em modo
                        <b> somente API</b>. A FluxoAPI só envia o evento <code>message.sent_from_phone</code> em instâncias com
                        coexistência. Reconecte o número em modo coexistência pelo painel da FluxoAPI.
                      </p>
                    )}
                    {(quality === 'YELLOW' || quality === 'RED') && (
                      <p className="text-[11px] leading-relaxed text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2">
                        <b>Atenção:</b> a qualidade do número caiu. A Meta reduz o limite diário e pode desativar o número. Reduza o volume de disparos.
                      </p>
                    )}
                  </div>
                );
              })}
              {/* Box de Instrução para Nova Instância */}
              <div className="p-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 flex flex-col justify-between space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-neutral-500" />
                    Vincular Novo Número ou Instância
                  </h4>
                  <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">
                    Para adicionar uma 2ª linha (ex: número exclusivo para suporte ou closer individual), cadastre o número no painel oficial da Meta ou FluxoAPI e vincule o ID da nova instância aqui.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <a
                    href="https://fluxoapi.com.br/app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-800 text-xs font-medium cursor-pointer"
                  >
                    <span>Abrir Wizard de Instâncias</span>
                    <ExternalLink className="w-3 h-3 text-neutral-400" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Grid de Credenciais e Diagnóstico */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Coluna 1: Chaves da API */}
            <div className="lg:col-span-6 bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Credenciais Criptográficas (HMAC-SHA256)
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Chaves da sua conta para autenticar requisições na FluxoAPI
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Chave Pública (FLUXO_KEY):
                  </label>
                  <input
                    type="text"
                    value={inputApiKey}
                    onChange={(e) => setInputApiKey(e.target.value)}
                    placeholder="fxk_live_01J..."
                    className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-neutral-400 block mt-1">
                    Começa com <code className="text-emerald-700 font-bold">fxk_live_</code> ou <code className="text-neutral-600">fxk_test_</code>
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Segredo da Chave (FLUXO_SECRET):
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={inputApiSecret}
                      onChange={(e) => setInputApiSecret(e.target.value)}
                      placeholder={config.hasSecret ? '••••••••••••••••••••••••••••••••' : 'fxs_...'}
                      className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none pr-9"
                    />
                    <Lock className="w-3.5 h-3.5 text-neutral-400 absolute right-3 top-2.5" />
                  </div>
                  {config.hasSecret ? (
                    <span className="text-[10px] text-emerald-600 font-medium mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      Segredo protegido e salvo no Banco de Dados. Deixe em branco para manter o atual.
                    </span>
                  ) : (
                    <span className="text-[10px] text-neutral-400 block mt-1">
                      Começa com <code className="text-neutral-600">fxs_</code>. Usado apenas para gerar a assinatura HMAC no servidor.
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    ID da Instância Padrão:
                  </label>
                  <input
                    type="text"
                    value={inputInstanceId}
                    onChange={(e) => setInputInstanceId(e.target.value)}
                    placeholder="inst_..."
                    className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingConfig}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{savingConfig ? 'Salvando...' : 'Salvar e Conectar'}</span>
                </button>
              </form>
            </div>

            {/* Coluna 2: Variáveis Railway & Diagnóstico */}
            <div className="lg:col-span-6 space-y-4">
              <div className="p-4 bg-white rounded-2xl border border-neutral-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-900">
                  <Terminal className="w-4 h-4 text-neutral-600" />
                  <span>Configuração Permanente na Railway</span>
                </div>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  Para que suas chaves fiquem salvas para sempre mesmo após deploys ou reinicializações do servidor, adicione essas variáveis no painel da Railway:
                </p>

                <div className="p-3 bg-neutral-900 rounded-xl text-neutral-200 text-xs font-mono space-y-1 relative group">
                  <div className="text-emerald-400">FLUXO_KEY=fxk_live_...</div>
                  <div className="text-emerald-400">FLUXO_SECRET=fxs_...</div>
                  <div className="text-emerald-400">FLUXO_INSTANCE_ID=inst_...</div>

                  <button
                    onClick={() =>
                      copyToClipboard(
                        `FLUXO_KEY=${inputApiKey || 'fxk_live_...'}\nFLUXO_SECRET=${inputApiSecret || 'fxs_...'}\nFLUXO_INSTANCE_ID=${inputInstanceId || 'inst_...'}`,
                        'Variáveis Railway'
                      )
                    }
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copiar</span>
                  </button>
                </div>
              </div>

              {/* Resultado do Teste de Conexão */}
              {connectionResult && (
                <div
                  className={`p-4 rounded-2xl border ${
                    connectionResult.success
                      ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                      : 'bg-red-50/50 border-red-200 text-red-950'
                  } space-y-2 text-xs`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1.5">
                      {connectionResult.success ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Conexão Autenticada com Sucesso
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-red-600" /> Falha na Conexão
                        </>
                      )}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">
                      {connectionResult.testedAt}
                    </span>
                  </div>

                  {connectionResult.latencyMs && (
                    <div className="text-[11px] text-neutral-600">
                      Latência do servidor: <span className="font-mono font-bold">{connectionResult.latencyMs}ms</span>
                    </div>
                  )}

                  {connectionResult.error && (
                    <div className="text-red-700 font-mono text-[11px] bg-white/80 p-2 rounded-lg border border-red-200">
                      {connectionResult.error.message || JSON.stringify(connectionResult.error)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Card Oficial Meta Cloud API (Graph API) */}
          <div className="bg-white p-5 rounded-2xl border border-blue-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-blue-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-base">
                  M
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                    <span>Meta Graph API Oficial (WhatsApp Business Cloud)</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
                      Sincronização Direta
                    </span>
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Conecte diretamente ao WhatsApp Cloud da Meta para puxar e sincronizar templates criados no Gerenciador do WhatsApp
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={syncWithMetaRealtime}
                disabled={syncingWithMeta}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingWithMeta ? 'animate-spin' : ''}`} />
                <span>Testar & Puxar Templates</span>
              </button>
            </div>

            <form onSubmit={handleSaveMetaConfig} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Token de Acesso Permanente da Meta (Graph API Access Token):
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={inputMetaAccessToken}
                    onChange={(e) => setInputMetaAccessToken(e.target.value)}
                    placeholder="EAAG... (Token de Sistema com permissões whatsapp_business_messaging e management)"
                    className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none pr-9"
                  />
                  <Lock className="w-3.5 h-3.5 text-neutral-400 absolute right-3 top-2.5" />
                </div>
                <span className="text-[10px] text-neutral-400 block mt-1">
                  Gerado em <em>Meta for Developers &gt; Usuários do Sistema</em> com escopo <code>whatsapp_business_management</code>.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  ID da Conta do WhatsApp Business (WABA ID):
                </label>
                <input
                  type="text"
                  value={inputMetaWabaId}
                  onChange={(e) => setInputMetaWabaId(e.target.value)}
                  placeholder="Ex: 104837592817492"
                  className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <span className="text-[10px] text-neutral-400 block mt-1">
                  Encontrado no Gerenciador do WhatsApp &gt; Configurações da Conta WABA.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Token de Verificação do Webhook (hub.verify_token):
                </label>
                <input
                  type="text"
                  value={inputMetaVerifyToken}
                  onChange={(e) => setInputMetaVerifyToken(e.target.value)}
                  placeholder="crm_webhook_meta_token"
                  className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <span className="text-[10px] text-neutral-400 block mt-1">
                  O mesmo token inserido na configuração de Webhook do aplicativo da Meta.
                </span>
              </div>

              {metaSaveSuccess && (
                <div className="md:col-span-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{metaSaveSuccess}</span>
                </div>
              )}

              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingMetaConfig}
                  className="flex items-center gap-2 py-2 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{savingMetaConfig ? 'Salvando no Banco...' : 'Salvar Credenciais da Meta'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-ABA 2: MODELOS & TEMPLATES META (KANBAN, LISTA, CRIADOR, IMPORTADOR) */}
      {/* ========================================================================= */}
      {activeSubTab === 'templates' && (
        <div className="space-y-6">
          {/* Sub-menu interno de Templates & Ações Globais */}
          <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Abas internas */}
            <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-xl">
              <button
                onClick={() => setTemplateSubView('kanban')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  templateSubView === 'kanban'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5 text-emerald-600" />
                <span>Quadro Kanban de Status</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-mono">
                  {templates.length}
                </span>
              </button>

              <button
                onClick={() => setTemplateSubView('list')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  templateSubView === 'list'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <List className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tabela & Métricas de Saúde</span>
              </button>

              <button
                onClick={() => setTemplateSubView('creator')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  templateSubView === 'creator'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Criador & Editor</span>
              </button>
            </div>

            {/* Ações rápidas */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setJsonInputText('');
                  setJsonImportError(null);
                  setShowJsonImportModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold border border-purple-200 transition-colors cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Importar JSON da Meta</span>
              </button>

              <button
                onClick={() => {
                  loadPresetTemplate('confirmacao_utilitaria');
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Modelo Utilitário Recomendado</span>
              </button>

              <button
                onClick={syncWithMetaRealtime}
                disabled={syncingWithMeta || loadingTemplates}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                title="Sincroniza todos os templates diretamente da Meta Graph API em tempo real"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingWithMeta ? 'animate-spin' : ''}`} />
                <span>{syncingWithMeta ? 'Sincronizando Meta...' : 'Puxar do Meta em Tempo Real'}</span>
              </button>

              <button
                onClick={fetchTemplates}
                disabled={loadingTemplates}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium cursor-pointer"
                title="Recarregar lista de templates"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingTemplates ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Atualizar</span>
              </button>
            </div>
          </div>

          {/* Feedback de Sincronização em Tempo Real com a Meta */}
          {metaSyncNotice && (
            <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="font-medium">{metaSyncNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setMetaSyncNotice(null)}
                className="text-blue-500 hover:text-blue-800 text-xs font-bold"
              >
                Fechar
              </button>
            </div>
          )}

          {/* Banner Informativo sobre Janela de 24h & Categoria Utilitária */}
          <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-amber-900">
                Estratégia de Disparo Oficial da Meta • Janela de 24h e Templates Utilitários
              </h4>
              <p className="text-xs text-amber-800 leading-relaxed">
                Pela política oficial da Meta, para iniciar conversa com um lead frio que ainda não falou com sua empresa, é <strong>obrigatório</strong> utilizar um template aprovado. Modelos da categoria <strong>UTILITY (Utilitário)</strong> possuem a <strong>menor tarifa por disparo</strong> e alta taxa de entrega. Assim que o lead responde (ex: clicando em "Sim"), a <strong>janela de 24 horas gratuitas</strong> se abre e seu atendente pode conversar livremente por texto, áudio e anexos!
              </p>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* VISÃO 1: QUADRO KANBAN DE STATUS (RASCUNHOS, ANÁLISE, APROVADOS, ETC) */}
          {/* ===================================================================== */}
          {templateSubView === 'kanban' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* COLUNA 1: RASCUNHOS (DRAFT) */}
                <div className="bg-neutral-50/80 rounded-2xl p-3.5 border border-neutral-200/80 flex flex-col min-h-[500px]">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-200 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-neutral-400" />
                      <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                        Rascunhos
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-700">
                      {templates.filter((t) => t.status === 'DRAFT').length}
                    </span>
                  </div>

                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {templates.filter((t) => t.status === 'DRAFT').length === 0 ? (
                      <div className="text-center py-10 px-4 text-neutral-400 text-xs border-2 border-dashed border-neutral-200 rounded-xl">
                        Nenhum rascunho local pendente.
                      </div>
                    ) : (
                      templates
                        .filter((t) => t.status === 'DRAFT')
                        .map((tpl) => (
                          <div
                            key={tpl.id || tpl.name}
                            className="bg-white p-3.5 rounded-xl border border-neutral-200 shadow-2xs hover:border-neutral-300 transition-all space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-neutral-900 break-all">
                                {tpl.name}
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 uppercase shrink-0">
                                {tpl.category}
                              </span>
                            </div>

                            <div className="text-[11px] text-neutral-600 line-clamp-3 bg-neutral-50 p-2 rounded-lg border border-neutral-100 font-sans">
                              {tpl.components?.find((c) => c.type === 'BODY')?.text || 'Sem texto'}
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-2 border-t border-neutral-100">
                              <span>Local</span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleLoadTemplateIntoCreator(tpl)}
                                  className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium cursor-pointer"
                                  title="Carregar no Criador"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleUpdateTemplateStatus(tpl.name, 'PENDING')}
                                  className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold cursor-pointer"
                                  title="Mover para Em Análise"
                                >
                                  Enviar
                                </button>
                                <button
                                  onClick={() => handleDeleteTemplate(tpl.name)}
                                  className="p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* COLUNA 2: EM ANÁLISE NA META (PENDING) */}
                <div className="bg-amber-50/40 rounded-2xl p-3.5 border border-amber-200/80 flex flex-col min-h-[500px]">
                  <div className="flex items-center justify-between pb-3 border-b border-amber-200 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                        Em Análise (Meta)
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      {templates.filter((t) => t.status === 'PENDING').length}
                    </span>
                  </div>

                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {templates.filter((t) => t.status === 'PENDING').length === 0 ? (
                      <div className="text-center py-10 px-4 text-amber-700/60 text-xs border-2 border-dashed border-amber-200 rounded-xl">
                        Nenhum template em análise no momento.
                      </div>
                    ) : (
                      templates
                        .filter((t) => t.status === 'PENDING')
                        .map((tpl) => (
                          <div
                            key={tpl.id || tpl.name}
                            className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-2xs hover:border-amber-300 transition-all space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-neutral-900 break-all">
                                {tpl.name}
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0">
                                Aguardando
                              </span>
                            </div>

                            <div className="text-[11px] text-neutral-600 line-clamp-3 bg-neutral-50 p-2 rounded-lg border border-neutral-100">
                              {tpl.components?.find((c) => c.type === 'BODY')?.text || 'Template Meta'}
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-2 border-t border-neutral-100">
                              <span className="flex items-center gap-1 text-amber-700 font-medium">
                                <Clock className="w-3 h-3" /> Fila Meta
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleUpdateTemplateStatus(tpl.name, 'APPROVED')}
                                  className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold cursor-pointer"
                                  title="Forçar Aprovação Local"
                                >
                                  Aprovar
                                </button>
                                <button
                                  onClick={() => handleUpdateTemplateStatus(tpl.name, 'REJECTED')}
                                  className="px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700 font-medium cursor-pointer"
                                >
                                  Rejeitar
                                </button>
                                <button
                                  onClick={() => handleDeleteTemplate(tpl.name)}
                                  className="p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* COLUNA 3: APROVADOS (APPROVED) */}
                <div className="bg-emerald-50/40 rounded-2xl p-3.5 border border-emerald-200/80 flex flex-col min-h-[500px]">
                  <div className="flex items-center justify-between pb-3 border-b border-emerald-200 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                        Aprovados (Ativos)
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {templates.filter((t) => t.status === 'APPROVED').length}
                    </span>
                  </div>

                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {templates.filter((t) => t.status === 'APPROVED').length === 0 ? (
                      <div className="text-center py-10 px-4 text-emerald-800/60 text-xs border-2 border-dashed border-emerald-200 rounded-xl">
                        Nenhum template aprovado ainda. Crie um novo ou importe via JSON!
                      </div>
                    ) : (
                      templates
                        .filter((t) => t.status === 'APPROVED')
                        .map((tpl) => {
                          const buttons = tpl.components?.find((c) => c.type === 'BUTTONS')?.buttons || [];
                          return (
                            <div
                              key={tpl.id || tpl.name}
                              className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-2xs hover:border-emerald-300 transition-all space-y-2.5"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-mono text-xs font-bold text-neutral-900 break-all">
                                  {tpl.name}
                                </span>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                    tpl.category === 'UTILITY'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-purple-100 text-purple-800'
                                  }`}
                                >
                                  {tpl.category}
                                </span>
                              </div>

                              {/* Indicadores de Saúde e Métricas */}
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                    tpl.qualityScore === 'GREEN' || !tpl.qualityScore
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : tpl.qualityScore === 'YELLOW'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                      : 'bg-red-50 text-red-700 border border-red-200'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      tpl.qualityScore === 'GREEN' || !tpl.qualityScore
                                        ? 'bg-emerald-500'
                                        : tpl.qualityScore === 'YELLOW'
                                        ? 'bg-amber-500'
                                        : 'bg-red-500'
                                    }`}
                                  />
                                  Saúde: {tpl.qualityScore === 'YELLOW' ? 'Atenção' : tpl.qualityScore === 'RED' ? 'Baixa' : 'Alta'}
                                </span>

                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 flex items-center gap-1">
                                  <Send className="w-2.5 h-2.5 text-neutral-500" />
                                  {tpl.usageCount || 0} envios
                                </span>
                              </div>

                              <div className="text-[11px] text-neutral-600 line-clamp-3 bg-neutral-50 p-2 rounded-lg border border-neutral-100">
                                {tpl.components?.find((c) => c.type === 'BODY')?.text || 'Template Meta Oficial'}
                              </div>

                              {/* Botões do template */}
                              {buttons.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {buttons.map((b: any, bIdx: number) => (
                                    <span
                                      key={bIdx}
                                      className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium"
                                    >
                                      🔘 {b.text || b}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-2 border-t border-neutral-100">
                                <button
                                  onClick={() => {
                                    setSelectedTemplateForTest(tpl.name);
                                    setActiveSubTab('sandbox');
                                    setTestMode('template');
                                    onShowToast(`Template ${tpl.name} carregado no laboratório!`);
                                  }}
                                  className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Play className="w-3 h-3" /> Testar
                                </button>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleLoadTemplateIntoCreator(tpl)}
                                    className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium cursor-pointer"
                                    title="Abrir no Criador"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTemplate(tpl.name)}
                                    className="p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                    title="Excluir"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>

                {/* COLUNA 4: REJEITADOS (REJECTED) */}
                <div className="bg-red-50/40 rounded-2xl p-3.5 border border-red-200/80 flex flex-col min-h-[500px]">
                  <div className="flex items-center justify-between pb-3 border-b border-red-200 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <h4 className="text-xs font-bold text-red-900 uppercase tracking-wider">
                        Rejeitados (Meta)
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                      {templates.filter((t) => t.status === 'REJECTED').length}
                    </span>
                  </div>

                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {templates.filter((t) => t.status === 'REJECTED').length === 0 ? (
                      <div className="text-center py-10 px-4 text-red-700/60 text-xs border-2 border-dashed border-red-200 rounded-xl">
                        Nenhum template rejeitado pela Meta!
                      </div>
                    ) : (
                      templates
                        .filter((t) => t.status === 'REJECTED')
                        .map((tpl) => (
                          <div
                            key={tpl.id || tpl.name}
                            className="bg-white p-3.5 rounded-xl border border-red-200 shadow-2xs hover:border-red-300 transition-all space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-neutral-900 break-all">
                                {tpl.name}
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800 shrink-0">
                                Rejeitado
                              </span>
                            </div>

                            <div className="text-[11px] text-neutral-600 line-clamp-3 bg-neutral-50 p-2 rounded-lg border border-neutral-100">
                              {tpl.components?.find((c) => c.type === 'BODY')?.text || 'Template'}
                            </div>

                            {tpl.rejectedReason && (
                              <div className="text-[10px] text-red-700 bg-red-50 p-1.5 rounded border border-red-200">
                                <strong>Motivo:</strong> {tpl.rejectedReason}
                              </div>
                            )}

                            <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-2 border-t border-neutral-100">
                              <button
                                onClick={() => handleLoadTemplateIntoCreator(tpl)}
                                className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium cursor-pointer"
                              >
                                Corrigir no Criador
                              </button>
                              <button
                                onClick={() => handleDeleteTemplate(tpl.name)}
                                className="p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* VISÃO 2: TABELA DE TEMPLATES & MÉTRICAS DETALHADAS DE SAÚDE            */}
          {/* ===================================================================== */}
          {templateSubView === 'list' && (
            <div className="space-y-4">
              {/* Cards de Métricas Consolidadas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs">
                  <span className="text-[11px] text-neutral-500 font-semibold block">
                    Total Cadastrados
                  </span>
                  <span className="text-xl font-bold text-neutral-900 mt-1 block">
                    {templates.length}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs">
                  <span className="text-[11px] text-emerald-700 font-semibold block">
                    Aprovados & Prontos
                  </span>
                  <span className="text-xl font-bold text-emerald-800 mt-1 block">
                    {templates.filter((t) => t.status === 'APPROVED').length}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs">
                  <span className="text-[11px] text-amber-700 font-semibold block">
                    Em Análise / Rascunhos
                  </span>
                  <span className="text-xl font-bold text-amber-800 mt-1 block">
                    {templates.filter((t) => t.status === 'PENDING' || t.status === 'DRAFT').length}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs">
                  <span className="text-[11px] text-purple-700 font-semibold block">
                    Total de Disparos
                  </span>
                  <span className="text-xl font-bold text-purple-800 mt-1 block">
                    {templates.reduce((acc, t) => acc + (t.usageCount || 0), 0)}
                  </span>
                </div>
              </div>

              {/* Filtros e Busca */}
              <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={templateSearchTerm}
                    onChange={(e) => setTemplateSearchTerm(e.target.value)}
                    placeholder="Buscar por nome do template..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-neutral-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-xs font-semibold text-neutral-600">Categoria:</span>
                  <select
                    value={templateCategoryFilter}
                    onChange={(e) => setTemplateCategoryFilter(e.target.value as any)}
                    className="text-xs border border-neutral-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="ALL">Todas as Categorias</option>
                    <option value="UTILITY">UTILITY (Utilitários)</option>
                    <option value="MARKETING">MARKETING (Comercial)</option>
                  </select>
                </div>
              </div>

              {/* Tabela de Templates */}
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50/80 border-b border-neutral-200 text-neutral-600 font-bold">
                      <tr>
                        <th className="py-3 px-4">Identificador</th>
                        <th className="py-3 px-4">Categoria</th>
                        <th className="py-3 px-4">Status Meta</th>
                        <th className="py-3 px-4">Saúde da Meta</th>
                        <th className="py-3 px-4">Disparos Realizados</th>
                        <th className="py-3 px-4">Ações Rápidas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {templates
                        .filter((t) => {
                          const matchesSearch = t.name.toLowerCase().includes(templateSearchTerm.toLowerCase());
                          const matchesCategory =
                            templateCategoryFilter === 'ALL' || t.category === templateCategoryFilter;
                          return matchesSearch && matchesCategory;
                        })
                        .map((tpl) => (
                          <tr key={tpl.id || tpl.name} className="hover:bg-neutral-50/60 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-mono font-bold text-neutral-900">{tpl.name}</div>
                              <div className="text-[11px] text-neutral-500 line-clamp-1 max-w-xs mt-0.5">
                                {tpl.components?.find((c) => c.type === 'BODY')?.text || 'Sem texto'}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  tpl.category === 'UTILITY'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {tpl.category}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  tpl.status === 'APPROVED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : tpl.status === 'PENDING'
                                    ? 'bg-amber-100 text-amber-800'
                                    : tpl.status === 'DRAFT'
                                    ? 'bg-neutral-100 text-neutral-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {tpl.status === 'APPROVED'
                                  ? 'Aprovado'
                                  : tpl.status === 'PENDING'
                                  ? 'Em Análise'
                                  : tpl.status === 'DRAFT'
                                  ? 'Rascunho'
                                  : 'Rejeitado'}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                  tpl.qualityScore === 'GREEN' || !tpl.qualityScore
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : tpl.qualityScore === 'YELLOW'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-red-50 text-red-700 border border-red-200'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    tpl.qualityScore === 'GREEN' || !tpl.qualityScore
                                      ? 'bg-emerald-500'
                                      : tpl.qualityScore === 'YELLOW'
                                      ? 'bg-amber-500'
                                      : 'bg-red-500'
                                  }`}
                                />
                                {tpl.qualityScore === 'YELLOW'
                                  ? 'Atenção (Média)'
                                  : tpl.qualityScore === 'RED'
                                  ? 'Baixa'
                                  : 'Alta (Verde)'}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-neutral-800">
                              {tpl.usageCount || 0} envios
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setSelectedTemplateForTest(tpl.name);
                                    setActiveSubTab('sandbox');
                                    setTestMode('template');
                                    onShowToast(`Template ${tpl.name} selecionado para teste!`);
                                  }}
                                  className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Play className="w-3 h-3" /> Testar
                                </button>
                                <button
                                  onClick={() => handleLoadTemplateIntoCreator(tpl)}
                                  className="text-neutral-600 hover:text-neutral-900 font-medium cursor-pointer"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleDeleteTemplate(tpl.name)}
                                  className="text-neutral-400 hover:text-red-600 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* VISÃO 3: CRIADOR DE TEMPLATES COM PREVIEW EM TEMPO REAL               */}
          {/* ===================================================================== */}
          {templateSubView === 'creator' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Formulário do Criador */}
              <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900">
                        Criador & Editor de Templates da Meta
                      </h3>
                      <p className="text-[11px] text-neutral-500">
                        Configure o modelo, variáveis e botões para aprovação oficial
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setJsonInputText('');
                        setJsonImportError(null);
                        setShowJsonImportModal(true);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold border border-purple-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span>Colar JSON</span>
                    </button>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                      pt_BR Oficial
                    </span>
                  </div>
                </div>

                {/* Presets Rápidos */}
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 space-y-1.5">
                  <span className="text-[11px] font-bold text-neutral-700 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    Atalhos Estratégicos:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => loadPresetTemplate('video_estrategia')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all border border-emerald-700"
                    >
                      <Sparkles className="w-3 h-3 text-amber-300" />
                      <span>⭐ Estratégia do Vídeo (Camuflado 8x Mais Barato)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => loadPresetTemplate('confirmacao_utilitaria')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 hover:text-emerald-800 text-neutral-700 text-xs font-medium border border-neutral-200 transition-colors cursor-pointer"
                    >
                      🛡️ Utilitário Confirmação (Sim/Não)
                    </button>
                    <button
                      type="button"
                      onClick={() => loadPresetTemplate('apresentacao')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 hover:text-emerald-800 text-neutral-700 text-xs font-medium border border-neutral-200 transition-colors cursor-pointer"
                    >
                      🎯 Comercial Closer (Marketing)
                    </button>
                    <button
                      type="button"
                      onClick={() => loadPresetTemplate('followup')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 hover:text-emerald-800 text-neutral-700 text-xs font-medium border border-neutral-200 transition-colors cursor-pointer"
                    >
                      📄 Follow-up
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSubmitTemplateToMeta} className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        Identificador do Template (snake_case):
                      </label>
                      <input
                        type="text"
                        value={tplName}
                        onChange={(e) => setTplName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                        placeholder="ex: notificacao_pedido_atendimento"
                        className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        Categoria na Meta:
                      </label>
                      <select
                        value={tplCategory}
                        onChange={(e) => setTplCategory(e.target.value as any)}
                        className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-medium"
                      >
                        <option value="UTILITY">UTILITY (Menor custo • R$ ~0,08 • Confirmações & Rastreios)</option>
                        <option value="MARKETING">MARKETING (Tarifa cheia • R$ ~0,65 • Prospecção comercial)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Cabeçalho (Opcional - Negrito no topo):
                    </label>
                    <input
                      type="text"
                      value={tplHeader}
                      onChange={(e) => setTplHeader(e.target.value)}
                      placeholder="Deixe em branco ou informe o cabeçalho"
                      className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  {/* Corpo da Mensagem com Toolbar de Formatação e + Variável */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-neutral-700">
                        Corpo da Mensagem (Body):
                      </label>
                      <span className="text-[10px] text-neutral-500">
                        Insira as variáveis numéricas como {'{{1}}'}, {'{{2}}'}, etc.
                      </span>
                    </div>

                    <textarea
                      rows={5}
                      value={tplBody}
                      onChange={(e) => setTplBody(e.target.value)}
                      placeholder="Escreva o texto do template..."
                      className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-t-xl border-b-0 focus:ring-0 focus:outline-none leading-relaxed"
                    />

                    {/* Barra de Ferramentas / Formatação estilo GoHighLevel */}
                    <div className="flex items-center justify-between bg-neutral-50 border border-neutral-300 rounded-b-xl px-2.5 py-1.5 text-neutral-600">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setTplBody((b) => b + '*negrito*')}
                          className="px-2 py-0.5 rounded hover:bg-neutral-200 text-xs font-bold font-serif"
                          title="Negrito (*texto*)"
                        >
                          B
                        </button>
                        <button
                          type="button"
                          onClick={() => setTplBody((b) => b + '_itálico_')}
                          className="px-2 py-0.5 rounded hover:bg-neutral-200 text-xs italic font-serif"
                          title="Itálico (_texto_)"
                        >
                          I
                        </button>
                        <button
                          type="button"
                          onClick={() => setTplBody((b) => b + '~tachado~')}
                          className="px-2 py-0.5 rounded hover:bg-neutral-200 text-xs line-through"
                          title="Tachado (~texto~)"
                        >
                          S
                        </button>
                        <button
                          type="button"
                          onClick={() => setTplBody((b) => b + '```código```')}
                          className="px-2 py-0.5 rounded hover:bg-neutral-200 text-[10px] font-mono"
                          title="Monospace (```texto```)"
                        >
                          &lt;/&gt;
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const existingVars = Array.from(
                            new Set((tplBody.match(/\{\{(\d+)\}\}/g) || []).map((m) => Number(m.replace(/[{}]/g, ''))))
                          );
                          let nextNum = 1;
                          while (existingVars.includes(nextNum)) nextNum++;
                          setTplBody((b) => (b.endsWith(' ') || b.endsWith('\n') || b === '' ? b : b + ' ') + `{{${nextNum}}}`);
                          
                          // Preenche um fallback amigável de utility
                          setTplExamples((prev) => {
                            const updated = [...prev];
                            if (!updated[nextNum - 1]) {
                              const fallbacks = [
                                'Caio',
                                'Seu pedido foi confirmado com sucesso e em breve estará no seu destino.',
                                'O link para rastreio da viagem já está disponível para acesso, conforme solicitado.',
                                'Código de rastreio #883921',
                                'Central de Atendimento ao Cliente'
                              ];
                              updated[nextNum - 1] = fallbacks[nextNum - 1] || `Amostra ${nextNum}`;
                            }
                            return updated;
                          });
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                        <span>+ Adicionar Variável</span>
                      </button>
                    </div>
                  </div>

                  {/* Tabela Dinâmica de Variáveis & Mapeamento (Inspirado no GoHighLevel) */}
                  {(() => {
                    const varsInBody = Array.from(
                      new Set((tplBody.match(/\{\{(\d+)\}\}/g) || []).map((m) => m.replace(/[{}]/g, '')))
                    ).sort((a, b) => Number(a) - Number(b));

                    if (varsInBody.length === 0) return null;

                    return (
                      <div className="p-3.5 bg-gradient-to-br from-emerald-50/70 via-teal-50/40 to-amber-50/40 border border-emerald-200/80 rounded-2xl space-y-3 shadow-2xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-2">
                          <div>
                            <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-emerald-700" />
                              Camuflagem de Variáveis para Utility (Pague 8x Menos):
                            </span>
                            <p className="text-[11px] text-emerald-800/80 mt-0.5 leading-snug">
                              A Meta avalia a amostra da direita. Use textos burocráticos para aprovar como UTILITY. No envio real, o sistema injeta o campo da esquerda.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setTplExamples([
                                'Caio',
                                'Seu pedido foi confirmado com sucesso e em breve estará no seu destino.',
                                'O link para rastreio da viagem já está disponível para acesso, conforme solicitado.',
                                'Código de rastreio #883921',
                                'Central de Atendimento ao Cliente'
                              ]);
                              onShowToast('🛡️ Amostras de camuflagem Utility aplicadas com sucesso!');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-2xs flex items-center gap-1 cursor-pointer shrink-0"
                          >
                            <Sparkles className="w-3 h-3 text-amber-300" />
                            <span>Preencher Camuflagem Utility</span>
                          </button>
                        </div>

                        <div className="space-y-2">
                          {varsInBody.map((vNum, idx) => (
                            <div
                              key={vNum}
                              className="p-2.5 bg-white border border-neutral-200 rounded-xl shadow-2xs flex flex-col sm:flex-row sm:items-center gap-2"
                            >
                              {/* Tag da Variável */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-900 font-mono font-bold text-xs">
                                  {'{{' + vNum + '}}*'}
                                </span>
                              </div>

                              {/* Mapeamento no CRM (Disparo Real) */}
                              <div className="flex-1 sm:max-w-[200px]">
                                <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                                  Disparo Real (CRM):
                                </label>
                                <select
                                  value={
                                    tplVariableMappings[vNum] ||
                                    (idx === 0
                                      ? 'contact.name'
                                      : idx === 1
                                      ? 'lead.custom_pitch'
                                      : idx === 2
                                      ? 'lead.website_url'
                                      : 'contact.name')
                                  }
                                  onChange={(e) =>
                                    setTplVariableMappings((prev) => ({
                                      ...prev,
                                      [vNum]: e.target.value
                                    }))
                                  }
                                  className="w-full text-xs px-2 py-1.5 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-1 focus:ring-emerald-500 font-medium text-neutral-800"
                                >
                                  <option value="contact.name">👤 Nome do Lead (contact.name)</option>
                                  <option value="lead.custom_pitch">💬 Pitch / Mensagem (lead.pitch)</option>
                                  <option value="lead.website_url">🌐 Link do Site (lead.website)</option>
                                  <option value="lead.company">🏢 Empresa (lead.company)</option>
                                  <option value="contact.phone">📞 WhatsApp (contact.phone)</option>
                                  <option value="custom">⚙️ Campo Personalizado</option>
                                </select>
                              </div>

                              {/* Exemplo de Amostra para a Meta */}
                              <div className="flex-1">
                                <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                                  Amostra para Meta (Enter sample content):
                                </label>
                                <input
                                  type="text"
                                  value={tplExamples[idx] ?? ''}
                                  onChange={(e) => {
                                    const updated = [...tplExamples];
                                    updated[idx] = e.target.value;
                                    setTplExamples(updated);
                                  }}
                                  placeholder={
                                    idx === 0
                                      ? 'Ex: Caio'
                                      : idx === 1
                                      ? 'Ex: Seu pedido foi confirmado...'
                                      : idx === 2
                                      ? 'Ex: O link para rastreio já está...'
                                      : `Amostra para {{${vNum}}}`
                                  }
                                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg focus:ring-1 focus:ring-emerald-500 font-sans"
                                />
                              </div>

                              {/* Remover Variável */}
                              <button
                                type="button"
                                onClick={() => {
                                  setTplBody((b) =>
                                    b.replace(new RegExp(`\\{\\{${vNum}\\}\\}`, 'g'), '').replace(/\s+/g, ' ').trim()
                                  );
                                }}
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors self-end sm:self-center cursor-pointer"
                                title="Remover esta variável do corpo do texto"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Rodapé (Texto discreto de opt-out):
                    </label>
                    <input
                      type="text"
                      value={tplFooter}
                      onChange={(e) => setTplFooter(e.target.value)}
                      placeholder="ex: Responda PARAR para sair"
                      className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  {/* Gerenciador Dinâmico de Botões Rápidos */}
                  <div className="space-y-2 pt-1 border-t border-neutral-100">
                    <label className="block text-xs font-semibold text-neutral-700">
                      Botões de Resposta Rápida (Até 3 botões):
                    </label>

                    {tplButtons.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {tplButtons.map((btn, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-200"
                          >
                            <span>🔘 {btn}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveButton(idx)}
                              className="text-emerald-600 hover:text-red-600 transition-colors cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {tplButtons.length < 3 && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newButtonInput}
                          onChange={(e) => setNewButtonInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddButton();
                            }
                          }}
                          placeholder="Texto do botão (ex: Acessar Link, Parar Mensagens)"
                          className="flex-1 text-xs px-3 py-1.5 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleAddButton}
                          className="px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold cursor-pointer"
                        >
                          + Adicionar Botão
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Ações de Submissão */}
                  <div className="flex items-center gap-3 pt-3">
                    <button
                      type="button"
                      onClick={handleSaveDraftTemplate}
                      disabled={savingAsDraft}
                      className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5 text-neutral-600" />
                      <span>{savingAsDraft ? 'Salvando...' : 'Salvar como Rascunho'}</span>
                    </button>

                    <button
                      type="submit"
                      disabled={submittingTemplate}
                      className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{submittingTemplate ? 'Submetendo à Meta...' : 'Submeter para Aprovação da Meta'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Preview do Template no WhatsApp (Com Toggle de Visão Meta vs Lead) */}
              <div className="lg:col-span-5 bg-neutral-900 p-5 rounded-2xl border border-neutral-800 text-white flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                    <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-emerald-400" />
                      Simulação em Tempo Real
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        tplCategory === 'UTILITY'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-purple-950 text-purple-400 border border-purple-800'
                      }`}
                    >
                      {tplCategory === 'UTILITY' ? 'UTILITY (~8x Mais Barato)' : 'MARKETING (Tarifa Cheia)'}
                    </span>
                  </div>

                  {/* Toggle de Simulação (Meta vs Lead) */}
                  <div className="flex items-center gap-1 bg-neutral-800 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setPreviewSimulationMode('meta_evaluation')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        previewSimulationMode === 'meta_evaluation'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Visão da Meta (Camuflagem)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewSimulationMode('lead_real')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        previewSimulationMode === 'lead_real'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Visão do Lead (Disparo Real)</span>
                    </button>
                  </div>

                  {/* Status Informativo do Modo */}
                  <div
                    className={`p-2 rounded-xl text-[11px] border leading-relaxed ${
                      previewSimulationMode === 'meta_evaluation'
                        ? 'bg-emerald-950/50 border-emerald-800/80 text-emerald-300'
                        : 'bg-indigo-950/50 border-indigo-800/80 text-indigo-300'
                    }`}
                  >
                    {previewSimulationMode === 'meta_evaluation' ? (
                      <span>
                        🤖 <strong>O robô da Meta lê isto:</strong> Amostra burocrática de confirmação de pedido e rastreio. Como não há menção comercial, aprova com o selo verde de <strong>UTILITY</strong>.
                      </span>
                    ) : (
                      <span>
                        🎯 <strong>O Lead recebe isto:</strong> No disparo da campanha, as variáveis são trocadas pelo nome do contato, pitch de vendas e link do site criado.
                      </span>
                    )}
                  </div>

                  {/* Balão do WhatsApp */}
                  <div className="bg-[#0b141a] p-4 rounded-xl border border-neutral-800 space-y-2">
                    <div className="p-3.5 rounded-2xl rounded-tl-none bg-[#005c4b] text-white text-xs space-y-2 shadow-sm">
                      {tplHeader && (
                        <div className="font-bold text-emerald-200 border-b border-emerald-700/50 pb-1">
                          {tplHeader}
                        </div>
                      )}

                      <div className="text-neutral-100 whitespace-pre-line leading-relaxed font-sans">
                        {(() => {
                          let rendered = tplBody;
                          const vars = Array.from(
                            new Set((tplBody.match(/\{\{(\d+)\}\}/g) || []).map((m) => m.replace(/[{}]/g, '')))
                          );

                          vars.forEach((vNum) => {
                            const idx = Number(vNum) - 1;
                            if (previewSimulationMode === 'meta_evaluation') {
                              const sample =
                                tplExamples[idx] ||
                                (idx === 0
                                  ? 'Caio'
                                  : idx === 1
                                  ? 'Seu pedido foi confirmado com sucesso e em breve estará no seu destino.'
                                  : idx === 2
                                  ? 'O link para rastreio da viagem já está disponível para acesso, conforme solicitado.'
                                  : `[Amostra ${vNum}]`);
                              rendered = rendered.replace(new RegExp(`\\{\\{${vNum}\\}\\}`, 'g'), sample);
                            } else {
                              const mapping =
                                tplVariableMappings[vNum] ||
                                (idx === 0
                                  ? 'contact.name'
                                  : idx === 1
                                  ? 'lead.custom_pitch'
                                  : idx === 2
                                  ? 'lead.website_url'
                                  : 'contact.name');

                              let realVal = 'Marcelo';
                              if (mapping === 'contact.name') realVal = 'Marcelo';
                              else if (mapping === 'lead.custom_pitch')
                                realVal =
                                  'Criei uma versão moderna e exclusiva para a Marcenaria Oliveira ver como pode dobrar seus orçamentos no Google:';
                              else if (mapping === 'lead.website_url')
                                realVal = 'https://nyroh.com.br/marcenaria-oliveira';
                              else if (mapping === 'lead.company') realVal = 'Marcenaria Oliveira';
                              else if (mapping === 'contact.phone') realVal = '(11) 98765-4321';
                              else realVal = `[Dado do Lead {{${vNum}}}]`;

                              rendered = rendered.replace(new RegExp(`\\{\\{${vNum}\\}\\}`, 'g'), realVal);
                            }
                          });

                          return rendered;
                        })()}
                      </div>

                      {tplFooter && (
                        <div className="text-[10px] text-emerald-300/70 pt-1">
                          {tplFooter}
                        </div>
                      )}

                      <div className="text-[9px] text-emerald-200/60 text-right flex items-center justify-end gap-1">
                        <span>12:00</span>
                        <CheckCheck className="w-3 h-3 text-emerald-300" />
                      </div>
                    </div>

                    {/* Botões Interativos (Quick Replies) */}
                    {tplButtons.length > 0 && (
                      <div className="space-y-1.5 mt-2">
                        {tplButtons.map((btnText, bIdx) => (
                          <div
                            key={bIdx}
                            className="w-full py-2 px-3 rounded-xl bg-[#202c33] text-emerald-400 text-xs font-semibold text-center border border-neutral-700 hover:bg-[#2a3942] transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                          >
                            <span>{btnText}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-neutral-800/80 rounded-xl text-[11px] text-neutral-300 mt-4 border border-neutral-700 space-y-1">
                  <div className="font-bold text-emerald-300 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Dica Estratégica de Utilidade:
                  </div>
                  <p className="text-neutral-300 leading-relaxed">
                    Templates utilitários camuflados com 3 variáveis e botões "Acessar Link" e "Parar Mensagens" pagam a menor tarifa de todas (~R$ 0,08) e protegem seu número de bloqueios de spam via opt-out transparente.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* MODAL / DIALOG DE IMPORTAÇÃO DE JSON OFICIAL DA META                   */}
          {/* ===================================================================== */}
          {showJsonImportModal && (
            <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl max-w-2xl w-full p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                      <Code2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900">
                        Importar Template via JSON da Meta / Graph API
                      </h3>
                      <p className="text-xs text-neutral-500">
                        Cole a estrutura JSON do template. O sistema preenche nome, textos e botões automaticamente.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowJsonImportModal(false)}
                    className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Exemplos Prontos de 1-Clique */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-neutral-700">
                    Carregar Exemplo Pré-Configurado:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const example = {
                          name: "confirmacao_atendimento_v1",
                          category: "UTILITY",
                          language: "pt_BR",
                          body: {
                            text: "Olá {{1}}, confirmamos o seu agendamento para hoje. Tudo certo para conversarmos?",
                            examples: ["Marcelo"]
                          },
                          footer: "Responda PARAR para sair",
                          buttons: [
                            { type: "QUICK_REPLY", text: "Sim, confirmado" },
                            { type: "QUICK_REPLY", text: "Reagendar" }
                          ]
                        };
                        setJsonInputText(JSON.stringify(example, null, 2));
                        setJsonImportError(null);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 text-xs font-bold border border-blue-200 hover:bg-blue-100 cursor-pointer"
                    >
                      ⚡ 1 Variável (Confirmação Simples)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const example = {
                          name: "notificacao_pedido_atendimento",
                          category: "UTILITY",
                          language: "pt_BR",
                          body: {
                            text: "Ei, {{1}}\n\n{{2}}\n\n{{3}}\n\nClique no botão abaixo para acessar:",
                            examples: [
                              "Caio",
                              "Seu pedido foi confirmado com sucesso e em breve estará no seu destino.",
                              "O link para rastreio da viagem já está disponível para acesso, conforme solicitado."
                            ]
                          },
                          footer: "Responda PARAR para sair",
                          buttons: [
                            { type: "QUICK_REPLY", text: "Acessar Link" },
                            { type: "QUICK_REPLY", text: "Parar Mensagens" }
                          ]
                        };
                        setJsonInputText(JSON.stringify(example, null, 2));
                        setJsonImportError(null);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                    >
                      ⭐ Estratégia do Vídeo (3 Variáveis Camufladas • 8x Mais Barato)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const example = {
                          name: "apresentacao_comercial_closer",
                          category: "MARKETING",
                          language: "pt_BR",
                          body: {
                            text: "Olá {{1}}, tudo bem? Analisei o momento da {{2}} e preparamos uma demonstração exclusiva.",
                            examples: [
                              "Marcelo",
                              "sua empresa"
                            ]
                          },
                          footer: "Responda PARAR para cancelar",
                          buttons: [
                            { type: "QUICK_REPLY", text: "Quero Agendar Reunião" }
                          ]
                        };
                        setJsonInputText(JSON.stringify(example, null, 2));
                        setJsonImportError(null);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 text-xs font-bold border border-purple-200 hover:bg-purple-100 cursor-pointer"
                    >
                      🎯 Comercial Prospecção (MARKETING)
                    </button>
                  </div>
                </div>

                {/* Textarea do JSON */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Cole o código JSON abaixo:
                  </label>
                  <textarea
                    rows={10}
                    value={jsonInputText}
                    onChange={(e) => {
                      setJsonInputText(e.target.value);
                      if (jsonImportError) setJsonImportError(null);
                    }}
                    placeholder={`{\n  "name": "meu_template",\n  "category": "UTILITY",\n  "components": [...]\n}`}
                    className="w-full text-xs font-mono p-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-neutral-900 text-emerald-300 leading-relaxed"
                  />
                </div>

                {jsonImportError && (
                  <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{jsonImportError}</span>
                  </div>
                )}

                {/* Ações do Modal */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setShowJsonImportModal(false)}
                    className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleParseAndImportJson(jsonInputText)}
                    className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold cursor-pointer shadow-sm"
                  >
                    Processar e Preencher Criador
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-ABA 3: LABORATÓRIO DE TESTES & CHAT TESTE                             */}
      {/* ========================================================================= */}
      {activeSubTab === 'sandbox' && (
        <div className="space-y-6">
          {/* Seletor de Modo de Teste */}
          <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-neutral-200">
            <span className="text-xs font-bold text-neutral-700 ml-2">Modo do Laboratório:</span>
            <button
              onClick={() => setTestMode('free_text')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                testMode === 'free_text'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              💬 Mensagem Livre (Janela 24h Aberta)
            </button>
            <button
              onClick={() => setTestMode('template')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                testMode === 'template'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              🎯 Disparo de Template Oficial (Quebra de Janela)
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Coluna de Envio (7 cols) */}
            <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    {testMode === 'free_text' ? 'Envio de Mensagem de Teste' : 'Disparo de Template Oficial'}
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Disparo real através do número oficial da Nyroh ({instanceLabel})
                  </p>
                </div>
              </div>

              {testMode === 'free_text' ? (
                <form onSubmit={handleSendTestFreeMessage} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Número do Destinatário (WhatsApp com DDD):
                    </label>
                    <input
                      type="text"
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="+55 11 98821-6073"
                      className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-neutral-400 block mt-1">
                      O sistema garante automaticamente o formato E.164 com + e código do país.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Texto da Mensagem:
                    </label>
                    <textarea
                      rows={4}
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sendingTest}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingTest ? 'Disparando...' : 'Disparar Mensagem Oficial de Teste'}</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSendTestTemplate} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Número do Destinatário:
                    </label>
                    <input
                      type="text"
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="+55 11 98821-6073"
                      className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Selecionar Template Aprovado:
                    </label>
                    <select
                      value={selectedTemplateForTest}
                      onChange={(e) => setSelectedTemplateForTest(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-mono"
                    >
                      {templates.map((t) => (
                        <option key={t.id || t.name} value={t.name}>
                          {t.name} ({t.category} - {t.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        Variável {'{{1}}'} (Ex: Nome):
                      </label>
                      <input
                        type="text"
                        value={param1}
                        onChange={(e) => setParam1(e.target.value)}
                        placeholder="Thomas"
                        className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">
                        Variável {'{{2}}'} (Ex: Empresa):
                      </label>
                      <input
                        type="text"
                        value={param2}
                        onChange={(e) => setParam2(e.target.value)}
                        placeholder="Ditho Soluções"
                        className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={sendingTest}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{sendingTest ? 'Disparando Template...' : 'Disparar Template Oficial de Teste'}</span>
                  </button>
                </form>
              )}

              {/* Auditoria do Retorno HTTP */}
              {sendResult && (
                <div
                  className={`p-4 rounded-xl border ${
                    sendResult.success
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                      : 'bg-red-50/70 border-red-200 text-red-950'
                  } space-y-1.5 text-xs`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1.5">
                      {sendResult.success ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Envio Aceito com Sucesso (HTTP 202/200)
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-red-600" /> Falha no Envio
                        </>
                      )}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">
                      {sendResult.sentAt} {sendResult.latencyMs ? `• ${sendResult.latencyMs}ms` : ''}
                    </span>
                  </div>

                  {sendResult.error && (
                    <div className="text-[11px] text-red-700 bg-white/80 p-2 rounded border border-red-200 font-mono space-y-0.5">
                      <div>Código: {sendResult.error.code}</div>
                      <div>Mensagem: {sendResult.error.message}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Chat de Teste Interativo (5 cols) */}
            <div className="lg:col-span-5 bg-neutral-900 rounded-2xl border border-neutral-800 text-white flex flex-col h-[520px] overflow-hidden shadow-md">
              {/* Header do Chat */}
              <div className="p-3.5 bg-neutral-850 border-b border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-xs text-white">
                    NT
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Simulador de Chat Teste</h4>
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Linha Oficial Nyroh ({instanceLabel})
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setTestChatMessages([])}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                  title="Limpar Conversa de Teste"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Body com as mensagens */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#0b141a]">
                <div className="text-center">
                  <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2.5 py-1 rounded-full">
                    Sessão Oficial com Coexistência
                  </span>
                </div>

                {testChatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === 'nyroh' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-3 rounded-2xl text-xs space-y-1 shadow-sm ${
                        msg.sender === 'nyroh'
                          ? 'bg-[#005c4b] text-white rounded-tr-none'
                          : 'bg-[#202c33] text-neutral-100 rounded-tl-none'
                      }`}
                    >
                      <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>
                      <div className="flex items-center justify-end gap-1 text-[9px] text-neutral-300/80">
                        <span>{msg.time}</span>
                        {msg.sender === 'nyroh' && (
                          <DualCheck className="w-3 h-3 text-emerald-300" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Input rápido do Chat */}
              <form onSubmit={handleQuickChatSend} className="p-2.5 bg-neutral-850 border-t border-neutral-800 flex items-center gap-2">
                <input
                  type="text"
                  value={chatInputText}
                  onChange={(e) => setChatInputText(e.target.value)}
                  placeholder="Enviar mensagem teste rápida..."
                  className="flex-1 text-xs bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-ABA 4: WEBHOOKS & LOGS EM TEMPO REAL                                  */}
      {/* ========================================================================= */}
      {activeSubTab === 'webhooks' && (
        <div className="space-y-6">
          {/* Card de Configuração do Webhook */}
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  URL Oficial do Webhook de Entrada
                </h3>
                <p className="text-xs text-neutral-500">
                  Cadastre esta URL na aba "Webhooks" do painel da FluxoAPI para receber mensagens e confirmações de leitura.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleSimulateIncomingMessage}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Simular Mensagem de Lead</span>
                </button>
                <button
                  onClick={() => handleSimulateWebhook('delivered')}
                  className="px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium cursor-pointer"
                >
                  Simular "Delivered"
                </button>
                <button
                  onClick={() => handleSimulateWebhook('read')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-medium border border-emerald-200 cursor-pointer"
                >
                  Simular "Read" (2 Tiques)
                </button>
              </div>
            </div>

            <div className="p-3 bg-neutral-900 rounded-xl flex items-center justify-between gap-3">
              <span className="text-xs font-mono text-emerald-400 truncate select-all">
                {webhookUrl}
              </span>
              <button
                onClick={() => copyToClipboard(webhookUrl, 'URL do Webhook')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold cursor-pointer shrink-0 transition-colors"
              >
                <Copy className="w-3 h-3" />
                <span>Copiar URL</span>
              </button>
            </div>
          </div>

          {/* Feed de Eventos Recebidos */}
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  Histórico de Eventos Recebidos da Meta
                </h3>
                <p className="text-xs text-neutral-500">
                  Transparência de entrega (sent, delivered, read) e mensagens recebidas dos leads.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchWebhookEvents}
                  disabled={loadingWebhooks}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingWebhooks ? 'animate-spin' : ''}`} />
                  <span>Atualizar</span>
                </button>
                <button
                  onClick={handleClearWebhookLogs}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpar</span>
                </button>
              </div>
            </div>

            {webhookEvents.length === 0 ? (
              <div className="text-center py-10 text-neutral-400 space-y-2">
                <Radio className="w-8 h-8 mx-auto text-neutral-300" />
                <p className="text-xs">Nenhum evento registrado ainda.</p>
                <p className="text-[11px] text-neutral-400">
                  Os eventos chegarão automaticamente assim que mensagens forem enviadas ou recebidas.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {webhookEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/60 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-neutral-900">{evt.summary}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700 font-mono">
                          {evt.type}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-500 font-mono truncate max-w-xl">
                        {JSON.stringify(evt.payload)}
                      </div>
                    </div>

                    <span className="text-[10px] font-mono text-neutral-400 shrink-0">
                      {evt.receivedAt}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
