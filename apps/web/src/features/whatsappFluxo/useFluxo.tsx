import { apiFetch } from '../../api/client';
import React, { useState, useEffect } from 'react';
import { useRuntimeConfig, formatInstancePhone } from '@shared/lib/useRuntimeConfig';
import { onRealtime } from '@shared/lib/realtime';
import type { RespostaConfigFluxo, RespostaEventosFluxo, RespostaListaModelosFluxo, RespostaSincronizacaoModelos, RespostaModeloCriado, RespostaErroApi, RespostaInstanciasFluxo, RespostaEnvioTeste } from '@shared/contracts/rotas';
import MetaAccountsPanel from '../../components/MetaAccountsPanel';
import MetaStatusStrip from '../../components/MetaStatusStrip';
import { MessageSquare, CheckCircle2, AlertCircle, RefreshCw, Send, ExternalLink, ShieldCheck, Zap, Key, Lock, Smartphone, CheckCheck, Terminal, Clock, Radio, Copy, Info, Plus, FileText, Sparkles, Trash2, Play, CheckCheck as DualCheck, LayoutGrid, List, Search, Code2, Edit3, X, BookmarkPlus } from 'lucide-react';
import { FluxoInstance } from '@shared/types';

import type { AdminWhatsAppFluxoViewProps, MetaTemplateItem, WebhookEventItem } from './base';

export function useFluxo({ currentUser, onShowToast }: AdminWhatsAppFluxoViewProps) {
  // Número e estado REAIS da instância, vindos do servidor (antes estavam chumbados no código)
  const runtime = useRuntimeConfig();
  const instanceLabel = formatInstancePhone(runtime.instancePhone);

  // Active Sub-tab
  const [activeSubTab, setActiveSubTab] = useState<
    'instances' | 'templates' | 'sandbox' | 'webhooks'
  >('instances');

  // Config state
  const [config, setConfig] = useState<RespostaConfigFluxo>({
    apiKey: '',
    hasApiKey: false,
    hasSecret: false,
    instanceId: '',
    isConfigured: false,
    source: 'none',
    metaAccessToken: '',
    hasMetaToken: false,
    metaWabaId: '',
    metaPhoneNumberId: '',
    metaVerifyToken: '',
    isMetaConfigured: false
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
  const [selectedBmId, setSelectedBmId] = useState<string | null>(null);
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
  const [templateAccountFilter, setTemplateAccountFilter] = useState<string>('ALL');
  const visibleTemplates = templateAccountFilter === 'ALL'
    ? templates
    : templates.filter((t) => (t.accountId || 'env') === templateAccountFilter);
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<'ALL' | 'UTILITY' | 'MARKETING'>('ALL');

  // JSON Import Modal State
  const [showJsonImportModal, setShowJsonImportModal] = useState(false);
  const [jsonInputText, setJsonInputText] = useState('');
  const [jsonImportError, setJsonImportError] = useState<string | null>(null);

  // Template Creator State (Initialized with the proven 8x cheaper Utility camouflage structure)
  const [tplName, setTplName] = useState('notificacao_pedido_atendimento');
  const [tplCategory, setTplCategory] = useState<'MARKETING' | 'UTILITY'>('UTILITY');
  const [tplAccountId, setTplAccountId] = useState<string>('env');
  const [bmAccounts, setBmAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const fetchBmAccounts = async () => {
    try {
      const res = await apiFetch('/api/admin/meta/accounts');
      const data = await res.json();
      if (res.ok && data.success) setBmAccounts(data.accounts || []);
    } catch { /* lista de BMs é opcional */ }
  };
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
  const [testPhoneNumberId, setTestPhoneNumberId] = useState('');
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
      const res = await apiFetch('/api/admin/fluxo/config');
      if (res.ok) {
        const data = (await res.json()) as RespostaConfigFluxo;
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
      const res = await apiFetch('/api/admin/fluxo/templates/sync-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = (await res.json()) as RespostaSincronizacaoModelos | RespostaErroApi;
      if (res.ok && 'count' in data) {
        setMetaSyncNotice(data.message || `${data.count} modelos sincronizados diretamente da Meta!`);
        onShowToast(data.message || `${data.count} modelos sincronizados com a Meta!`);
        await fetchTemplates();
      } else {
        await fetchTemplates();
        const msg = ('error' in data && data.error) || 'Não foi possível sincronizar direto com a Meta. Carregando templates locais.';
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
      const res = await apiFetch('/api/admin/fluxo/config', {
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
      const res = await apiFetch('/api/admin/fluxo/instances');
      if (res.ok) {
        const data = (await res.json()) as RespostaInstanciasFluxo;
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
      const res = await apiFetch('/api/admin/fluxo/templates');
      if (res.ok) {
        const data = (await res.json()) as RespostaListaModelosFluxo;
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
      const res = await apiFetch('/api/admin/fluxo/events');
      if (res.ok) {
        const data = (await res.json()) as RespostaEventosFluxo;
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
    fetchBmAccounts();
  }, []);

  // Status de aprovação chega pelo webhook da Meta (APPROVED / REJECTED): atualiza a lista sem recarregar a página
  useEffect(() => {
    const off = onRealtime('TEMPLATE_STATUS_UPDATE', (p: any) => {
      fetchTemplates();
      if (p?.templateName) onShowToast(`Modelo "${p.templateName}" agora está ${String(p.status || '').toLowerCase()}.`);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const res = await apiFetch('/api/admin/fluxo/config', {
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

      const res = await apiFetch('/api/admin/fluxo/test-connection', {
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

      const res = await apiFetch('/api/admin/fluxo/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tplName.trim(),
          category: tplCategory,
          language: 'pt_BR',
          accountId: tplAccountId,
          components,
          examples: tplExamples,
          isDraft: false
        })
      });

      const data = (await res.json()) as RespostaModeloCriado | RespostaErroApi;
      if (res.ok && 'template' in data) {
        onShowToast(data.message || 'Modelo enviado para a fila de aprovação da Meta!');
        await fetchTemplates();
        setTemplateSubView('kanban');
      } else {
        onShowToast(('error' in data && data.error) || 'Erro ao submeter modelo para a Meta.');
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

      const res = await apiFetch('/api/admin/fluxo/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tplName.trim(),
          category: tplCategory,
          language: 'pt_BR',
          accountId: tplAccountId,
          components,
          isDraft: true
        })
      });

      const data = (await res.json()) as RespostaModeloCriado | RespostaErroApi;
      if (res.ok && 'template' in data) {
        onShowToast('Template salvo como Rascunho com sucesso!');
        await fetchTemplates();
        setTemplateSubView('kanban');
      } else {
        onShowToast(('error' in data && data.error) || 'Erro ao salvar rascunho.');
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
      const res = await apiFetch(`/api/admin/fluxo/templates/${encodeURIComponent(templateName)}/status`, {
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
  const handleDeleteTemplate = async (templateName: string, accountId?: string) => {
    if (!confirm(`Deseja realmente excluir o template "${templateName}"?`)) return;
    try {
      const res = await apiFetch(`/api/admin/fluxo/templates/${encodeURIComponent(templateName)}?accountId=${encodeURIComponent(accountId || 'env')}`, {
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
    // O criador só suporta MARKETING e UTILITY. Outras categorias da Meta (ex.: AUTHENTICATION) caem em UTILITY.
    setTplCategory(tpl.category === 'MARKETING' ? 'MARKETING' : 'UTILITY');
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
      const res = await apiFetch('/api/admin/fluxo/send-test-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientPhone.trim(),
          text: messageBody.trim(),
          instanceId: inputInstanceId.trim() || config.instanceId || undefined
        })
      });

      const data = (await res.json()) as RespostaEnvioTeste;
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
        onShowToast((('error' in data) && typeof data.error === 'object' && data.error?.message) || 'Erro ao enviar mensagem.');
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
      const res = await apiFetch('/api/admin/fluxo/send-template-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientPhone.trim(),
          templateName: selectedTemplateForTest,
          language: 'pt_BR',
          parameters: [param1.trim(), param2.trim()].filter(Boolean),
          requestedInstanceId: inputInstanceId.trim() || config.instanceId || undefined,
          phoneNumberId: testPhoneNumberId || undefined
        })
      });

      const data = (await res.json()) as RespostaEnvioTeste;
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
        onShowToast((('error' in data) && typeof data.error === 'object' && data.error?.message) || 'Erro ao enviar template.');
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
      const res = await apiFetch('/api/admin/fluxo/send-test-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientPhone.trim(),
          text: userText,
          instanceId: inputInstanceId.trim() || config.instanceId || undefined
        })
      });
      const data = (await res.json()) as RespostaEnvioTeste;
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
      const res = await apiFetch('/api/admin/fluxo/events/simulate', {
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
      const res = await apiFetch('/api/webhooks/simulate-incoming', {
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
      await apiFetch('/api/admin/fluxo/events', { method: 'DELETE' });
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

  return {
    runtime,
    instanceLabel,
    activeSubTab,
    setActiveSubTab,
    config,
    setConfig,
    loadingConfig,
    setLoadingConfig,
    savedLocalInstance,
    inputApiKey,
    setInputApiKey,
    inputApiSecret,
    setInputApiSecret,
    inputInstanceId,
    setInputInstanceId,
    savingConfig,
    setSavingConfig,
    inputMetaAccessToken,
    setInputMetaAccessToken,
    inputMetaWabaId,
    setInputMetaWabaId,
    inputMetaPhoneNumberId,
    setInputMetaPhoneNumberId,
    inputMetaVerifyToken,
    setInputMetaVerifyToken,
    savingMetaConfig,
    setSavingMetaConfig,
    metaSaveSuccess,
    setMetaSaveSuccess,
    syncingWithMeta,
    setSyncingWithMeta,
    metaSyncNotice,
    setMetaSyncNotice,
    instances,
    setInstances,
    selectedBmId,
    setSelectedBmId,
    instancesError,
    setInstancesError,
    loadingInstances,
    setLoadingInstances,
    newInstanceName,
    setNewInstanceName,
    newInstancePhone,
    setNewInstancePhone,
    creatingInstance,
    setCreatingInstance,
    testingConnection,
    setTestingConnection,
    connectionResult,
    setConnectionResult,
    templates,
    setTemplates,
    loadingTemplates,
    setLoadingTemplates,
    submittingTemplate,
    setSubmittingTemplate,
    savingAsDraft,
    setSavingAsDraft,
    templateSubView,
    setTemplateSubView,
    templateSearchTerm,
    setTemplateSearchTerm,
    templateAccountFilter,
    setTemplateAccountFilter,
    visibleTemplates,
    templateCategoryFilter,
    setTemplateCategoryFilter,
    showJsonImportModal,
    setShowJsonImportModal,
    jsonInputText,
    setJsonInputText,
    jsonImportError,
    setJsonImportError,
    tplName,
    setTplName,
    tplCategory,
    setTplCategory,
    tplAccountId,
    setTplAccountId,
    bmAccounts,
    setBmAccounts,
    fetchBmAccounts,
    tplHeader,
    setTplHeader,
    tplBody,
    setTplBody,
    tplFooter,
    setTplFooter,
    tplButtons,
    setTplButtons,
    tplExamples,
    setTplExamples,
    tplVariableMappings,
    setTplVariableMappings,
    previewSimulationMode,
    setPreviewSimulationMode,
    newButtonInput,
    setNewButtonInput,
    testMode,
    setTestMode,
    recipientPhone,
    setRecipientPhone,
    testPhoneNumberId,
    setTestPhoneNumberId,
    messageBody,
    setMessageBody,
    selectedTemplateForTest,
    setSelectedTemplateForTest,
    param1,
    setParam1,
    param2,
    setParam2,
    sendingTest,
    setSendingTest,
    sendResult,
    setSendResult,
    testChatMessages,
    setTestChatMessages,
    chatInputText,
    setChatInputText,
    webhookEvents,
    setWebhookEvents,
    loadingWebhooks,
    setLoadingWebhooks,
    currentOrigin,
    webhookUrl,
    fetchConfig,
    syncWithMetaRealtime,
    handleSaveMetaConfig,
    fetchInstances,
    fetchTemplates,
    fetchWebhookEvents,
    handleSaveConfig,
    handleTestConnection,
    handleAddButton,
    handleRemoveButton,
    handleSubmitTemplateToMeta,
    handleSaveDraftTemplate,
    handleUpdateTemplateStatus,
    handleDeleteTemplate,
    handleLoadTemplateIntoCreator,
    handleParseAndImportJson,
    handleSendTestFreeMessage,
    handleSendTestTemplate,
    handleQuickChatSend,
    loadPresetTemplate,
    handleSimulateWebhook,
    handleSimulateIncomingMessage,
    handleClearWebhookLogs,
    copyToClipboard,
    currentUser,
    onShowToast,
  };
}

export type FluxoVM = ReturnType<typeof useFluxo>;
