import React, { useState, useMemo, useEffect } from 'react';
import { onRealtime } from '../lib/realtime';
import {
  Send,
  Phone,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Kanban,
  MessageSquare,
  UserCheck,
  RefreshCw,
  Globe,
  Smartphone,
  Zap,
  ArrowRight,
  ShieldCheck,
  Sliders,
  RotateCcw,
  Check,
  Radio,
  Wifi,
  Lock,
  ChevronRight,
  Layers,
  FileText,
  MousePointerClick,
  Info,
  CornerDownLeft,
  XOctagon,
  Eye,
  Highlighter,
  SlidersHorizontal,
  Share2,
  Copy,
  Tag,
  AlertTriangle,
  CheckCheck
} from 'lucide-react';
import { CampaignCopyTemplate, Salesperson, LeadChatMessage } from '../types';

interface MetaTemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE';
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

interface AdminDispatchTestSandboxProps {
  salespeople: Salesperson[];
  availableTemplates: any[];
  copyTemplates: CampaignCopyTemplate[];
  onLeadsUpdated?: () => void;
  onNavigateToKanban?: (salespersonId?: string) => void;
  onNavigateToWhatsApp?: (leadId?: string, salespersonId?: string) => void;
  showNotification: (type: 'success' | 'error', message: string) => void;
}

export const AdminDispatchTestSandbox: React.FC<AdminDispatchTestSandboxProps> = ({
  salespeople,
  availableTemplates,
  copyTemplates,
  onLeadsUpdated,
  onNavigateToKanban,
  onNavigateToWhatsApp,
  showNotification
}) => {
  // Closer Vendedor selecionado (Padrão: Thomas ou primeiro cadastrado)
  const defaultSeller = useMemo(() => {
    return (
      salespeople.find(s => s.id === 'seller-thomas' || s.name.toLowerCase().includes('thomas')) ||
      salespeople[0] || {
        id: 'seller-thomas',
        name: 'Thomas (Closer Principal)',
        color: '#0284c7',
        bgColor: '#e0f2fe'
      }
    );
  }, [salespeople]);

  const [selectedSellerId, setSelectedSellerId] = useState<string>(defaultSeller.id);

  // Lista unificada e enriquecida de templates homologados da Meta
  const metaTemplatesList: MetaTemplateFull[] = useMemo(() => {
    const list: MetaTemplateFull[] = availableTemplates.map(t => {
      // Normalizar botões se existirem no objeto ou nos componentes
      let btns: MetaTemplateButton[] = t.buttons || [];
      if ((!btns || btns.length === 0) && t.components && Array.isArray(t.components)) {
        const btnComp = t.components.find((c: any) => c.type === 'BUTTONS');
        if (btnComp && Array.isArray(btnComp.buttons)) {
          btns = btnComp.buttons;
        }
      }

      // Se for o template dns_escassez_np4 e não tiver botões preenchidos, preencher com a estrutura oficial aprovada
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

    // Se o dns_escassez_np4 não veio da API por algum motivo, garantir sua presença homologada
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

  // 1. Template Oficial Homologado da Meta selecionado
  const [selectedMetaTemplateName, setSelectedMetaTemplateName] = useState<string>('dns_escassez_np4');

  // Recuperar o template da Meta completo ativo
  const activeMetaTemplate = useMemo(() => {
    return (
      metaTemplatesList.find(t => t.name === selectedMetaTemplateName) ||
      metaTemplatesList[0]
    );
  }, [metaTemplatesList, selectedMetaTemplateName]);

  // 2. Template de Copy do Sistema (Recheio das variáveis)
  const [selectedCopyId, setSelectedCopyId] = useState<string>(copyTemplates[0]?.id || '');

  // Campos das 3 Variáveis editáveis no Sandbox
  const [var1Text, setVar1Text] = useState<string>('');
  const [var2Text, setVar2Text] = useState<string>('');
  const [var3Text, setVar3Text] = useState<string>('');
  const [activeVarField, setActiveVarField] = useState<'var1' | 'var2' | 'var3'>('var1');

  // Toggle estilo GoHighLevel: Destacar variáveis no preview
  const [highlightVariables, setHighlightVariables] = useState<boolean>(true);

  // Dados do Lead / Contato de Teste
  const [testLeadName, setTestLeadName] = useState<string>('Gabriel (Nyroh)');
  const [testPhone, setTestPhone] = useState<string>('');
  const [testPublicUrl, setTestPublicUrl] = useState<string>('https://nyroh.app/p/gabriel-teste');
  const [testWebsite, setTestWebsite] = useState<string>('');
  const [testNiche, setTestNiche] = useState<string>('Tecnologia / Design');

  // Estados de Envio e Telemetria Real
  const [isSending, setIsSending] = useState<boolean>(false);
  const [lastDispatchedLead, setLastDispatchedLead] = useState<any | null>(null);
  const [lastMessageSent, setLastMessageSent] = useState<any | null>(null);
  const [lastDispatchTelemetry, setLastDispatchTelemetry] = useState<any | null>(null);
  const [deliveryStatusInfo, setDeliveryStatusInfo] = useState<{
    status: 'checking' | 'queued' | 'delivered' | 'failed' | 'sent' | null;
    metaCode?: number | string;
    metaMessage?: string;
    translation?: {
      title: string;
      description: string;
      action: string;
      link?: string;
    } | null;
  } | null>(null);

  // Estados de Conversa ao Vivo com o Lead de Teste
  const [conversationMessages, setConversationMessages] = useState<LeadChatMessage[]>([]);
  const [replyInputText, setReplyInputText] = useState<string>('');
  const [isSendingReply, setIsSendingReply] = useState<boolean>(false);

  // Efeito para carregar e ouvir em tempo real as mensagens trocadas com o lead de teste
  useEffect(() => {
    if (!lastDispatchedLead?.id) return;
    const leadId = lastDispatchedLead.id;

    const fetchChat = async () => {
      try {
        const res = await fetch(`/api/leads/${leadId}/messages`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.messages)) {
            setConversationMessages(data.messages);
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar mensagens no sandbox:', err);
      }
    };

    fetchChat();
    const interval = setInterval(fetchChat, 3000);

    // Conexão ÚNICA da aba (src/lib/realtime.ts), em vez de mais um EventSource só para o sandbox.
    const offs = [
      onRealtime('NEW_MESSAGE', (payload: any) => {
        if (!payload || payload.leadId === leadId) fetchChat();
      }),
      onRealtime('MESSAGE_STATUS_UPDATE', (payload: any) => {
        if (!payload || payload.leadId === leadId) fetchChat();
      })
    ];

    return () => {
      clearInterval(interval);
      for (const off of offs) off();
    };
  }, [lastDispatchedLead]);

  // Responder ao lead diretamente de dentro do sandbox
  const handleSendSandboxReply = async () => {
    if (!lastDispatchedLead?.id || !replyInputText.trim() || isSendingReply) return;
    const textToSend = replyInputText.trim();
    setIsSendingReply(true);
    setReplyInputText('');

    try {
      const res = await fetch(`/api/leads/${lastDispatchedLead.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSend,
          senderName: `${activeSeller.name.split(' ')[0]} (Closer)`
        })
      });
      if (res.ok) {
        const fetchRes = await fetch(`/api/leads/${lastDispatchedLead.id}/messages`);
        if (fetchRes.ok) {
          const data = await fetchRes.json();
          setConversationMessages(data.messages || []);
        }
        showNotification?.('success', 'Mensagem enviada com sucesso no WhatsApp!');
      } else {
        showNotification?.('error', 'Erro ao enviar mensagem para o WhatsApp.');
      }
    } catch {
      showNotification?.('error', 'Erro de conexão ao enviar mensagem.');
    } finally {
      setIsSendingReply(false);
    }
  };

  // Resolver vendedor atual
  const activeSeller = useMemo(() => {
    return salespeople.find(s => s.id === selectedSellerId) || defaultSeller;
  }, [salespeople, selectedSellerId, defaultSeller]);

  // Carregar variáveis quando o template de copy for selecionado
  useEffect(() => {
    const foundCopy = copyTemplates.find(c => c.id === selectedCopyId) || copyTemplates[0];
    if (foundCopy) {
      setVar1Text(foundCopy.var1 || '{nome}! Bom diaaa! Ótima semana 😄 Falo com o responsável pela {empresa}?');
      setVar2Text(foundCopy.var2 || 'Eu sou {vendedor} e queria te fazer uma pergunta antes de qualquer coisa: você ficaria chateado se eu tivesse criado um site para a {empresa} sem você me pedir? 😂 Eu sou bem proativo no meu trabalho e, quando encontrei a empresa de vocês, resolvi não ficar apenas oferecendo. Preferi criar algo primeiro e te mostrar.');
      setVar3Text(foundCopy.var3 || 'Então… eu realmente criei um site personalizado para vocês: 🔗 {site_novo}\n\nTambém tirei um print caso você prefira dar uma olhada por aqui antes de abrir o link. Além da criação de sites, também trabalho com gestão de tráfego, criação de aplicativos, sistemas e automações, social media e agentes de IA no WhatsApp.\n\nMas antes de qualquer coisa, queria mesmo saber o que você achou do site. Pode me dar um feedback sincero, mesmo que não tenha gostado? 😄');
      if (foundCopy.metaTemplateName && metaTemplatesList.some(m => m.name === foundCopy.metaTemplateName)) {
        setSelectedMetaTemplateName(foundCopy.metaTemplateName);
      }
    }
  }, [selectedCopyId, copyTemplates, metaTemplatesList]);

  // Inserir tag dinâmica no campo ativo (estilo GoHighLevel / ManyChat)
  const handleInsertTag = (tag: string) => {
    if (activeVarField === 'var1') {
      setVar1Text(prev => prev + tag);
    } else if (activeVarField === 'var2') {
      setVar2Text(prev => prev + tag);
    } else if (activeVarField === 'var3') {
      setVar3Text(prev => prev + tag);
    }
  };

  // Resolver as variáveis substituindo as tags dinâmicas
  const resolvedVariables = useMemo(() => {
    const rawName = testLeadName.trim() || 'Cliente';
    const firstName = rawName.split(' ')[0] || 'Cliente';
    const company = testLeadName.includes('(')
      ? testLeadName.replace(/.*\((.*?)\).*/, '$1').trim()
      : (testLeadName.trim() || 'sua empresa');
    const seller = activeSeller.name.split(' ')[0] || 'Thomas';
    const url = testPublicUrl.trim() || 'https://nyroh.app/p/demonstracao';

    const r1 = (var1Text || '')
      .replace(/\{nome\}/gi, firstName)
      .replace(/\{empresa\}/gi, company)
      .replace(/\{vendedor\}/gi, seller)
      .replace(/\{site_novo\}/gi, url)
      .trim();

    const r2 = (var2Text || '')
      .replace(/\{nome\}/gi, firstName)
      .replace(/\{empresa\}/gi, company)
      .replace(/\{vendedor\}/gi, seller)
      .replace(/\{site_novo\}/gi, url)
      .trim();

    const r3 = (var3Text || '')
      .replace(/\{nome\}/gi, firstName)
      .replace(/\{empresa\}/gi, company)
      .replace(/\{vendedor\}/gi, seller)
      .replace(/\{site_novo\}/gi, url)
      .trim();

    return {
      '1': r1,
      '2': r2,
      '3': r3,
      firstName,
      company,
      seller,
      url
    };
  }, [var1Text, var2Text, var3Text, testLeadName, activeSeller, testPublicUrl]);

  // Botões reais extraídos do template oficial da Meta
  const resolvedButtons: MetaTemplateButton[] = useMemo(() => {
    if (activeMetaTemplate?.buttons && activeMetaTemplate.buttons.length > 0) {
      return activeMetaTemplate.buttons;
    }
    // Fallback padrão se for o dns_escassez_np4
    return [
      { type: 'QUICK_REPLY', text: 'Acessar Link' },
      { type: 'QUICK_REPLY', text: 'Parar Mensagens' }
    ];
  }, [activeMetaTemplate]);

  // Mensagem de rodapé oficial (se existir no template homologado)
  const resolvedFooterText = useMemo(() => {
    if (activeMetaTemplate?.footerText) {
      return activeMetaTemplate.footerText;
    }
    if (activeMetaTemplate?.name === 'dns_escassez_np4') {
      return '*Clique no link abaixo para saber mais*';
    }
    return '';
  }, [activeMetaTemplate]);

  // Mensagem final montada fiel à renderização oficial da Meta no WhatsApp
  const fullRenderedWhatsAppMessage = useMemo(() => {
    const footerPart = resolvedFooterText ? `\n\n${resolvedFooterText}` : '';
    return `Ei,\n\n${resolvedVariables['1']}\n\n${resolvedVariables['2']}\n\n${resolvedVariables['3']}${footerPart}`;
  }, [resolvedVariables, resolvedFooterText]);

  // Formatador de Telefone
  const formatPhoneInput = (val: string) => {
    const raw = val.replace(/\D/g, '');
    if (raw.length <= 2) return raw;
    if (raw.length <= 6) return `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
    if (raw.length <= 10) return `(${raw.slice(0, 2)}) ${raw.slice(2, 6)}-${raw.slice(6)}`;
    return `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7, 11)}`;
  };

  // Polling em background para verificar o status real de entrega da Meta (via Webhook)
  const pollMessageDeliveryStatus = (messageId: string) => {
    let attempts = 0;
    const maxAttempts = 8;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const sRes = await fetch(`/api/campaign/test-dispatch/status/${encodeURIComponent(messageId)}`);
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.deliveryStatus === 'failed') {
            clearInterval(interval);
            setDeliveryStatusInfo({
              status: 'failed',
              metaCode: sData.error?.code,
              metaMessage: sData.error?.message,
              translation: sData.translation
            });
            showNotification('error', `Aviso da Meta: ${sData.translation?.title || sData.error?.message || 'Falha na entrega'}`);
            return;
          } else if (sData.deliveryStatus === 'delivered' || sData.deliveryStatus === 'read') {
            clearInterval(interval);
            setDeliveryStatusInfo({
              status: 'delivered'
            });
            showNotification('success', '✓ Mensagem oficialmente entregue no aparelho do WhatsApp!');
            return;
          } else if (sData.deliveryStatus === 'sent') {
            setDeliveryStatusInfo({
              status: 'sent'
            });
          }
        }
      } catch (e) {
        // ignore
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setDeliveryStatusInfo(prev => prev?.status === 'checking' ? { status: 'queued' } : prev);
      }
    }, 1800);
  };

  // Disparo direto pelo WhatsApp Web / Celular (100% garantido e instantâneo)
  const handleDirectWhatsAppWeb = async () => {
    const cleanDigits = testPhone.replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length < 10) {
      showNotification('error', 'Por favor, informe seu número de WhatsApp com DDD para o envio.');
      return;
    }

    const cleanLeadName = testLeadName.trim() || `Lead Teste (${formatPhoneInput(cleanDigits)})`;
    const fullPhone = cleanDigits.startsWith('55') ? cleanDigits : `55${cleanDigits}`;
    const targetUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(fullRenderedWhatsAppMessage)}`;

    try {
      // Registrar o lead no CRM imediatamente
      const res = await fetch('/api/campaign/test-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: cleanDigits,
          leadName: cleanLeadName,
          salespersonId: activeSeller.id,
          salespersonName: activeSeller.name,
          metaTemplateName: selectedMetaTemplateName,
          copyTemplateId: selectedCopyId,
          dispatchMode: 'direct_text',
          messageText: fullRenderedWhatsAppMessage,
          publicUrl: testPublicUrl.trim(),
          website: testWebsite.trim(),
          niche: testNiche.trim() || 'Geral',
          customNotes: `Disparo direto via WhatsApp Web / Celular em ${new Date().toLocaleTimeString('pt-BR')}`
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLastDispatchedLead(data.lead);
        setLastMessageSent(data.outgoingMessage);
        setDeliveryStatusInfo({ status: 'delivered' });
        if (onLeadsUpdated) onLeadsUpdated();
      }
    } catch {}

    window.open(targetUrl, '_blank');
    showNotification('success', 'WhatsApp aberto com a mensagem pronta para envio!');
  };

  // Disparo do teste real oficial
  const handleTriggerTestDispatch = async () => {
    const cleanDigits = testPhone.replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length < 10) {
      showNotification('error', 'Por favor, informe seu número de WhatsApp com DDD para o teste (ex: 11 98821-6073).');
      return;
    }

    try {
      setIsSending(true);
      setLastDispatchTelemetry(null);
      setDeliveryStatusInfo(null);

      const cleanLeadName = testLeadName.trim() || `Lead Teste (${formatPhoneInput(cleanDigits)})`;

      const res = await fetch('/api/campaign/test-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: cleanDigits,
          leadName: cleanLeadName,
          salespersonId: activeSeller.id,
          salespersonName: activeSeller.name,
          metaTemplateName: selectedMetaTemplateName,
          copyTemplateId: selectedCopyId,
          dispatchMode: 'official_meta_template',
          variables: {
            '1': resolvedVariables['1'],
            '2': resolvedVariables['2'],
            '3': resolvedVariables['3']
          },
          var1: resolvedVariables['1'],
          var2: resolvedVariables['2'],
          var3: resolvedVariables['3'],
          messageText: fullRenderedWhatsAppMessage,
          publicUrl: testPublicUrl.trim(),
          website: testWebsite.trim(),
          niche: testNiche.trim() || 'Geral',
          customNotes: `Disparo oficial de teste do template ${selectedMetaTemplateName} em ${new Date().toLocaleTimeString('pt-BR')}`
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setLastDispatchedLead(data.lead);
        setLastMessageSent(data.outgoingMessage);
        setLastDispatchTelemetry(data.dispatchResult);

        const msgId = data.dispatchResult?.messageId || data.dispatchResult?.data?.id;
        if (msgId) {
          setDeliveryStatusInfo({ status: 'checking' });
          pollMessageDeliveryStatus(msgId);
        }

        if (data.dispatchResult?.success) {
          showNotification('success', `Solicitação enviada para a fila da Meta (Status 202). Monitorando entrega...`);
        } else if (data.dispatchResult?.error) {
          showNotification('error', `Aviso da API: ${data.dispatchResult?.error?.message || JSON.stringify(data.dispatchResult?.error)}`);
        } else {
          showNotification('success', `Lead criado e processado para ${data.lead?.phoneNumber}!`);
        }

        if (onLeadsUpdated) onLeadsUpdated();
      } else {
        showNotification('error', data.error || 'Falha ao realizar disparo de teste.');
      }
    } catch (err: any) {
      showNotification('error', 'Erro de conexão ao disparar teste.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div id="admin-dispatch-test-sandbox" className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Header com Engenharia do Fluxo (Padrão GoHighLevel / Meta Cloud API) */}
      <div className="bg-neutral-900 rounded-2xl p-5 sm:p-6 text-white border border-neutral-800 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-xs">
                <Send className="w-5 h-5" />
              </div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                Disparo Oficial de Template Homologado na Meta
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Meta Cloud API • 100% Homologado
              </span>
            </div>
            <p className="text-xs text-neutral-300 max-w-3xl leading-relaxed">
              Inspirado no padrão <strong>GoHighLevel</strong> e <strong>ManyChat</strong>: o sistema analisa a estrutura real do template aprovado na Meta (variáveis, cabeçalho, rodapé e botões interativos). Ele injeta a sua copy de vendas em cada slot aprovado, contornando a janela de 24h sem risco de bloqueio.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto bg-neutral-800 p-2.5 rounded-xl border border-neutral-700 shrink-0">
            <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="text-left">
              <div className="text-[10px] uppercase font-bold text-neutral-400">Closer Responsável:</div>
              <div className="text-xs font-bold text-white">{activeSeller.name}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Principal: Mapeador à Esquerda, Visualizador Fiel à Direita */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Formulário de Configuração e Injeção de Variáveis (7 colunas) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Card 1: Inspetor do Template da Meta & Mapeador de Variáveis */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold text-xs">
                  1
                </div>
                <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                  Template Oficial da Meta & Mapeamento de Variáveis
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Fura Janela 24h
                </span>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  {resolvedButtons.length} Botões Ativos
                </span>
              </div>
            </div>

            {/* Linha 1: Seletor do Template Homologado da Meta */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span>Template Homologado Oficial da Meta (Base / Carcaça):</span>
                </label>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-neutral-500 font-mono">
                    ID: {activeMetaTemplate.id || '1073339218665318'}
                  </span>
                  <span className="text-blue-700 font-mono font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                    {activeMetaTemplate.category || 'UTILITY'}
                  </span>
                </div>
              </div>
              <select
                value={selectedMetaTemplateName}
                onChange={e => setSelectedMetaTemplateName(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-neutral-300 bg-neutral-50 text-xs font-bold text-neutral-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {metaTemplatesList.map(t => (
                  <option key={t.name} value={t.name}>
                    {t.name} • {t.status || 'APPROVED'} • ({t.category || 'UTILITY'}) • {t.buttons?.length || 2} botões
                  </option>
                ))}
              </select>

              {/* Ficha Técnica do Template Inspecionado (GoHighLevel Inspector) */}
              <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200 text-[11px] text-neutral-600 space-y-1">
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span>Status na Meta: <strong className="text-emerald-700">APPROVED ✓</strong></span>
                  <span>Idioma: <strong>{activeMetaTemplate.language || 'pt_BR'}</strong></span>
                  <span>Variáveis no Body: <strong>3 campos (&#123;&#123;1&#125;&#125;, &#123;&#123;2&#125;&#125;, &#123;&#123;3&#125;&#125;)</strong></span>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-neutral-200/60 text-[10px] text-neutral-500">
                  <span className="font-bold text-neutral-700">Botões oficiais aprovados:</span>
                  {resolvedButtons.map((btn, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.5 rounded bg-white border border-neutral-200 text-neutral-700 font-bold flex items-center gap-1"
                    >
                      {btn.text.toLowerCase().includes('parar') ? (
                        <XOctagon className="w-2.5 h-2.5 text-rose-500" />
                      ) : (
                        <ExternalLink className="w-2.5 h-2.5 text-emerald-600" />
                      )}
                      <span>{btn.text}</span>
                      <span className="text-[8px] text-neutral-400 uppercase">({btn.type})</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Linha 2: Seletor de Copy do Sistema & Tag Inserters */}
            <div className="space-y-1.5 pt-2 border-t border-neutral-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <label className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Template de Copy do Sistema (Conteúdo Comercial):</span>
                </label>
                <div className="flex items-center gap-1 flex-wrap text-[10px] text-neutral-500">
                  <span className="font-medium text-neutral-400">Pílulas Rápidas:</span>
                  <button
                    type="button"
                    onClick={() => handleInsertTag('{nome}')}
                    className="font-mono text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                  >
                    +&#123;nome&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertTag('{empresa}')}
                    className="font-mono text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                  >
                    +&#123;empresa&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertTag('{vendedor}')}
                    className="font-mono text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                  >
                    +&#123;vendedor&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertTag('{site_novo}')}
                    className="font-mono text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                  >
                    +&#123;site_novo&#125;
                  </button>
                </div>
              </div>
              <select
                value={selectedCopyId}
                onChange={e => setSelectedCopyId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-neutral-300 bg-neutral-50 text-xs font-bold text-neutral-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                {copyTemplates.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.isDefault ? '(Padrão)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Os 3 Campos das Variáveis Mapeadas na Meta (Estilo Mapeador GoHighLevel) */}
            <div className="space-y-3 pt-2">
              {/* Variável 1 */}
              <div
                onClick={() => setActiveVarField('var1')}
                className={`p-3 rounded-xl border transition-all ${
                  activeVarField === 'var1'
                    ? 'bg-blue-50/40 border-blue-500 shadow-2xs ring-1 ring-blue-500/20'
                    : 'bg-neutral-50/70 border-neutral-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-800">
                    <span className={`w-4 h-4 rounded-full text-white flex items-center justify-center text-[10px] ${
                      activeVarField === 'var1' ? 'bg-blue-600' : 'bg-neutral-400'
                    }`}>1</span>
                    <span>Variável &#123;&#123;1&#125;&#125; (Saudação + Nome + Pergunta do Responsável):</span>
                  </label>
                  <span className="text-[10px] text-blue-700 font-mono font-bold bg-blue-100/70 px-1.5 py-0.2 rounded">
                    Meta Slot &#123;&#123;1&#125;&#125;
                  </span>
                </div>
                <textarea
                  value={var1Text}
                  onFocus={() => setActiveVarField('var1')}
                  onChange={e => setVar1Text(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans leading-relaxed"
                  placeholder="Ex: {nome}! Bom diaaa! Ótima semana 😄 Falo com o responsável pela {empresa}?"
                />
              </div>

              {/* Variável 2 */}
              <div
                onClick={() => setActiveVarField('var2')}
                className={`p-3 rounded-xl border transition-all ${
                  activeVarField === 'var2'
                    ? 'bg-blue-50/40 border-blue-500 shadow-2xs ring-1 ring-blue-500/20'
                    : 'bg-neutral-50/70 border-neutral-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-800">
                    <span className={`w-4 h-4 rounded-full text-white flex items-center justify-center text-[10px] ${
                      activeVarField === 'var2' ? 'bg-blue-600' : 'bg-neutral-400'
                    }`}>2</span>
                    <span>Variável &#123;&#123;2&#125;&#125; (O Gancho Comercial da Abordagem Proativa):</span>
                  </label>
                  <span className="text-[10px] text-blue-700 font-mono font-bold bg-blue-100/70 px-1.5 py-0.2 rounded">
                    Meta Slot &#123;&#123;2&#125;&#125;
                  </span>
                </div>
                <textarea
                  value={var2Text}
                  onFocus={() => setActiveVarField('var2')}
                  onChange={e => setVar2Text(e.target.value)}
                  rows={3}
                  className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans leading-relaxed"
                  placeholder="Ex: Eu sou {vendedor} e criei um site para a {empresa} sem você me pedir..."
                />
              </div>

              {/* Variável 3 */}
              <div
                onClick={() => setActiveVarField('var3')}
                className={`p-3 rounded-xl border transition-all ${
                  activeVarField === 'var3'
                    ? 'bg-blue-50/40 border-blue-500 shadow-2xs ring-1 ring-blue-500/20'
                    : 'bg-neutral-50/70 border-neutral-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-800">
                    <span className={`w-4 h-4 rounded-full text-white flex items-center justify-center text-[10px] ${
                      activeVarField === 'var3' ? 'bg-blue-600' : 'bg-neutral-400'
                    }`}>3</span>
                    <span>Variável &#123;&#123;3&#125;&#125; (Entrega do Link Nyroh + Pedido de Feedback Sincero):</span>
                  </label>
                  <span className="text-[10px] text-blue-700 font-mono font-bold bg-blue-100/70 px-1.5 py-0.2 rounded">
                    Meta Slot &#123;&#123;3&#125;&#125;
                  </span>
                </div>
                <textarea
                  value={var3Text}
                  onFocus={() => setActiveVarField('var3')}
                  onChange={e => setVar3Text(e.target.value)}
                  rows={4}
                  className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans leading-relaxed"
                  placeholder="Ex: Então… eu realmente criei um site personalizado para vocês: 🔗 {site_novo}... Consegue me dar um feedback sincero?"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Dados do Contato / Lead de Teste & Atribuição de Vendedor */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-neutral-100 text-neutral-800 flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                  Destinatário & Closer Responsável
                </h3>
              </div>
              <span className="text-[11px] text-neutral-400 font-medium">Passo 2 de 3</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Telefone WhatsApp */}
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Seu WhatsApp (com DDD) que receberá a mensagem:</span>
                  </label>
                  {testPhone && (
                    <button
                      type="button"
                      onClick={() => setTestPhone('')}
                      className="text-[10px] text-neutral-400 hover:text-neutral-600 cursor-pointer"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={testPhone}
                    onChange={e => setTestPhone(formatPhoneInput(e.target.value))}
                    placeholder="(11) 98821-6073"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl text-xs font-mono font-bold text-neutral-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-neutral-200 text-neutral-700 font-bold px-1.5 py-0.5 rounded">
                    +55 Brasil
                  </span>
                </div>
              </div>

              {/* Nome do Contato / Empresa */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-800">
                  Nome do Contato ou Empresa:
                </label>
                <input
                  type="text"
                  value={testLeadName}
                  onChange={e => setTestLeadName(e.target.value)}
                  placeholder="Ex: Gabriel (Nyroh)"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl text-xs text-neutral-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Closer Responsável */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-800">
                  Closer que receberá a resposta:
                </label>
                <select
                  value={selectedSellerId}
                  onChange={e => setSelectedSellerId(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl text-xs font-bold text-neutral-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  {salespeople.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.id === defaultSeller.id ? '(Padrão / Closer)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Link do Site Criado */}
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-neutral-600" />
                    <span>Link do Novo Site Criado na Nyroh:</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const cleanSlug = testLeadName ? testLeadName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') : 'cliente';
                      setTestPublicUrl(`https://nyroh.app/p/${cleanSlug}`);
                    }}
                    className="text-[10px] text-neutral-600 hover:text-neutral-900 font-semibold underline cursor-pointer"
                  >
                    Gerar link automático
                  </button>
                </div>
                <input
                  type="url"
                  value={testPublicUrl}
                  onChange={e => setTestPublicUrl(e.target.value)}
                  placeholder="https://nyroh.app/p/minha-empresa"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl text-xs text-neutral-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Card 3: Botões de Disparo (Meta Cloud API Oficial ou WhatsApp Web/Celular Instantâneo) */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Opções de Disparo do Teste</span>
                </h4>
                <p className="text-[11px] text-neutral-500">
                  Destino: <strong>{testPhone ? formatPhoneInput(testPhone) : '(Informe o número)'}</strong> • Closer: <strong>{activeSeller.name}</strong> • Template: <strong>{selectedMetaTemplateName}</strong>
                </p>
              </div>
              <span className="text-[10px] font-mono bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full">
                {testPhone ? formatPhoneInput(testPhone) : 'Aguardando número'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Opção 1: Envio Instantâneo pelo WhatsApp Web / Celular (Garantia Absoluta) */}
              <button
                type="button"
                id="btn-trigger-whatsapp-direct"
                onClick={handleDirectWhatsAppWeb}
                disabled={!testPhone.trim()}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs transition-all shadow-xs disabled:opacity-40 cursor-pointer"
              >
                <Smartphone className="w-4 h-4 text-emerald-100" />
                <div className="text-left">
                  <div className="font-bold text-xs">Disparar pelo WhatsApp Web / Celular</div>
                  <div className="text-[10px] font-normal text-emerald-100">100% instantâneo e garantido no seu aparelho</div>
                </div>
              </button>

              {/* Opção 2: Disparo Homologado Oficial via Meta Cloud API */}
              <button
                type="button"
                id="btn-trigger-real-dispatch"
                onClick={handleTriggerTestDispatch}
                disabled={isSending || !testPhone.trim()}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-neutral-900 hover:bg-black active:bg-neutral-800 text-white font-bold text-xs transition-all shadow-xs disabled:opacity-40 cursor-pointer"
              >
                {isSending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                    <div className="text-left">
                      <div className="font-bold text-xs">Enviando para Fila da Meta...</div>
                      <div className="text-[10px] font-normal text-neutral-400">Aguardando confirmação oficial</div>
                    </div>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <div className="text-left">
                      <div className="font-bold text-xs">Disparar via Meta Cloud API Oficial</div>
                      <div className="text-[10px] font-normal text-neutral-400">Template homologado na nuvem da Meta</div>
                    </div>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Feedback & Telemetria do Envio Real com Verificação em Tempo Real */}
          {lastDispatchedLead && (
            <div className={`bg-white border-2 rounded-2xl p-5 shadow-sm space-y-4 animate-in fade-in duration-200 ${
              deliveryStatusInfo?.status === 'failed'
                ? 'border-rose-500'
                : deliveryStatusInfo?.status === 'delivered'
                ? 'border-emerald-500'
                : 'border-blue-500'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0 ${
                  deliveryStatusInfo?.status === 'failed'
                    ? 'bg-rose-600'
                    : deliveryStatusInfo?.status === 'delivered'
                    ? 'bg-emerald-600'
                    : 'bg-blue-600'
                }`}>
                  {deliveryStatusInfo?.status === 'failed' ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : deliveryStatusInfo?.status === 'delivered' ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-neutral-900">
                      {deliveryStatusInfo?.status === 'failed'
                        ? 'Alerta da Meta: Entrega Bloqueada na Nuvem'
                        : deliveryStatusInfo?.status === 'delivered'
                        ? 'Disparo Confirmado e Entregue!'
                        : 'Disparo Transmitido para a Fila da Meta'}
                    </h4>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      deliveryStatusInfo?.status === 'failed'
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : deliveryStatusInfo?.status === 'delivered'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-blue-100 text-blue-800 border-blue-300'
                    }`}>
                      {deliveryStatusInfo?.status === 'failed'
                        ? `Meta Erro #${deliveryStatusInfo.metaCode || '131042'}`
                        : deliveryStatusInfo?.status === 'delivered'
                        ? '✓✓ Entregue no WhatsApp'
                        : deliveryStatusInfo?.status === 'checking'
                        ? 'Verificando com a Meta...'
                        : 'Status 202 - Enfileirado'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 mt-0.5">
                    Lead: <strong>{lastDispatchedLead.name}</strong> ({lastDispatchedLead.phoneNumber}) salvo no CRM e atribuído ao closer <strong>{lastDispatchedLead.salespersonName || activeSeller.name}</strong>.
                  </p>
                </div>
              </div>

              {/* CARD DE DIAGNÓSTICO DETALHADO CASO A META TENHA REJEITADO */}
              {deliveryStatusInfo?.status === 'failed' && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 space-y-3">
                  <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{deliveryStatusInfo.translation?.title || 'Problema de Faturamento / Elegibilidade na Meta'}</span>
                  </div>
                  <p className="text-xs text-rose-900 leading-relaxed">
                    {deliveryStatusInfo.translation?.description ||
                      'A sua conta do WhatsApp Business na Meta (WABA) vinculada à instância não possui forma de pagamento cadastrada no Meta Business Suite para cobrir mensagens de template.'}
                  </p>
                  <div className="p-3 bg-white rounded-lg border border-rose-200 text-xs text-rose-800 space-y-1">
                    <strong>Como resolver definitivamente:</strong>
                    <p className="text-[11px] text-neutral-700">
                      {deliveryStatusInfo.translation?.action ||
                        'Adicione um cartão de crédito no Gerenciador de Negócios da Meta (business.facebook.com > Faturamento ou Contas do WhatsApp).'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {deliveryStatusInfo.translation?.link && (
                      <a
                        href={deliveryStatusInfo.translation.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Abrir Central de Cobrança da Meta</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={handleDirectWhatsAppWeb}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Disparar Agora pelo WhatsApp do Celular</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Status detalhado da transmissão da API */}
              {lastDispatchTelemetry && (
                <div className="p-3.5 rounded-xl bg-neutral-900 text-neutral-200 text-xs space-y-1.5 font-mono">
                  <div className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Telemetria Oficial Meta Cloud API:</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] border-b border-neutral-800 pb-1">
                    <span className="text-neutral-400">Template Homologado:</span>
                    <span className="font-bold text-white">{lastDispatchTelemetry.templateName || selectedMetaTemplateName}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] border-b border-neutral-800 pb-1">
                    <span className="text-neutral-400">Destino Formatado E.164:</span>
                    <span className="font-bold text-emerald-300">{lastDispatchTelemetry.targetPhone}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] border-b border-neutral-800 pb-1">
                    <span className="text-neutral-400">Resultado da Transmissão:</span>
                    <span className="font-bold text-emerald-400">
                      {lastDispatchTelemetry.success ? '✓ Entregue para fila de despacho oficial da Meta' : 'Aviso retornado'}
                    </span>
                  </div>
                  {lastDispatchTelemetry.error && (
                    <div className="p-2 bg-rose-950/80 border border-rose-800 text-rose-300 rounded text-[11px] font-sans mt-2">
                      <strong>Aviso retornado pela API:</strong> {typeof lastDispatchTelemetry.error === 'string' ? lastDispatchTelemetry.error : JSON.stringify(lastDispatchTelemetry.error)}
                    </div>
                  )}
                </div>
              )}

              {/* CONVERSA AO VIVO DO WHATSAPP COM ESTE LEAD DE TESTE */}
              <div className="rounded-2xl border border-emerald-200 bg-[#efeae2]/30 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs">
                        {lastDispatchedLead.name.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-white"></span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                        <span>{lastDispatchedLead.name}</span>
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-normal border border-emerald-200">
                          Tempo Real Oficial
                        </span>
                      </h4>
                      <p className="text-[10px] text-neutral-500 font-mono">{lastDispatchedLead.phoneNumber}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Webhook Conectado</span>
                  </div>
                </div>

                {/* Bolhas de conversa */}
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {conversationMessages.length === 0 ? (
                    <div className="p-4 text-center text-xs text-neutral-500 italic bg-white/60 rounded-xl border border-neutral-200/50">
                      Disparo realizado com sucesso! Quando o lead responder no WhatsApp (ou se você enviar mensagem pelo celular do WhatsApp conectado), ela aparecerá aqui instantaneamente via Webhook em tempo real.
                    </div>
                  ) : (
                    conversationMessages.map((msg) => {
                      const isFromLead = msg.sender === 'lead';
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isFromLead ? 'items-start' : 'items-end'}`}
                        >
                          <div
                            className={`max-w-[88%] rounded-xl px-3 py-2 text-xs shadow-xs ${
                              isFromLead
                                ? 'bg-white text-neutral-900 rounded-tl-xs border border-neutral-200/70'
                                : 'bg-[#d9fdd3] text-neutral-900 rounded-tr-xs border border-[#b8f7ad]/60'
                            }`}
                          >
                            <div className="text-[10px] font-bold mb-0.5 text-neutral-500">
                              {isFromLead ? lastDispatchedLead.name : (msg.senderName || 'Você (Closer)')}
                            </div>
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                            <div className="flex items-center justify-end gap-1 mt-1 text-[9px] text-neutral-400">
                              <span>
                                {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                              {!isFromLead && (
                                msg.status === 'read' ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                                ) : msg.status === 'delivered' ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-neutral-400" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 text-neutral-400" />
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Campo de resposta rápida */}
                <div className="pt-2 border-t border-emerald-200/50 flex items-center gap-2">
                  <input
                    type="text"
                    value={replyInputText}
                    onChange={(e) => setReplyInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendSandboxReply();
                    }}
                    placeholder="Digite para responder ao lead no WhatsApp..."
                    className="flex-1 bg-white px-3 py-2 text-xs rounded-xl border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleSendSandboxReply}
                    disabled={isSendingReply || !replyInputText.trim()}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar</span>
                  </button>
                </div>
              </div>

              {/* Ações Imediatas: Navegar para o Kanban ou WhatsApp do Thomas */}
              <div className="pt-2 border-t border-neutral-100 flex flex-col sm:flex-row items-stretch gap-2">
                <button
                  type="button"
                  id="btn-goto-kanban"
                  onClick={() => {
                    if (onNavigateToKanban) {
                      onNavigateToKanban(activeSeller.id);
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <Kanban className="w-4 h-4 text-emerald-400" />
                  <span>Abrir Kanban do {activeSeller.name.split(' ')[0]}</span>
                </button>

                <button
                  type="button"
                  id="btn-goto-whatsapp"
                  onClick={() => {
                    if (onNavigateToWhatsApp) {
                      onNavigateToWhatsApp(lastDispatchedLead.id, activeSeller.id);
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-white" />
                  <span>Atender no WhatsApp do {activeSeller.name.split(' ')[0]}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDirectWhatsAppWeb}
                  className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-neutral-300 hover:bg-neutral-50 text-neutral-800 text-xs font-bold transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-neutral-600" />
                  <span>WhatsApp Web</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Coluna Direita: Visualizador Fiel do WhatsApp (5 colunas) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs space-y-4 sticky top-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold text-neutral-900">
                  Prévia Fiel no WhatsApp
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {/* Toggle GoHighLevel para destacar variáveis */}
                <button
                  type="button"
                  onClick={() => setHighlightVariables(!highlightVariables)}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 transition cursor-pointer border ${
                    highlightVariables
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-neutral-100 text-neutral-500 border-neutral-200'
                  }`}
                  title="Destacar slots de variáveis injetadas no texto"
                >
                  <Highlighter className="w-3 h-3" />
                  <span>{highlightVariables ? 'Slots Ativos' : 'Texto Puro'}</span>
                </button>

                <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  {selectedMetaTemplateName}
                </span>
              </div>
            </div>

            {/* Container da Conversa Estilo WhatsApp Real */}
            <div className="rounded-2xl border border-neutral-300 overflow-hidden shadow-xs bg-[#efeae2] flex flex-col h-[540px]">
              {/* WhatsApp Chat Header */}
              <div className="bg-[#075e54] text-white px-4 py-2.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-800 border border-emerald-400/50 flex items-center justify-center font-bold text-xs text-white">
                    {activeSeller.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                      <span>{activeSeller.name}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    </div>
                    <div className="text-[10px] text-emerald-200">
                      online • Conta Oficial Meta
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] bg-emerald-900/80 text-emerald-200 px-2 py-0.5 rounded-full font-mono">
                    {activeMetaTemplate.category || 'UTILITY'}
                  </span>
                </div>
              </div>

              {/* Chat Messages Area */}
              <div className="flex-1 p-3.5 overflow-y-auto space-y-3 flex flex-col justify-end">
                <div className="bg-amber-100/90 text-neutral-700 text-[10px] py-1 px-2.5 rounded-lg text-center mx-auto max-w-[290px] leading-snug">
                  🔒 As mensagens são protegidas com a criptografia de ponta a ponta oficial da Meta.
                </div>

                {/* Balão da Mensagem do Template Oficial */}
                <div className="bg-[#d9fdd3] text-neutral-900 rounded-xl rounded-tr-none p-3 shadow-2xs text-xs space-y-2.5 border border-emerald-200/50 max-w-[96%] ml-auto">
                  {/* Cabeçalho do template oficial */}
                  <div className="font-bold text-neutral-900 text-xs border-b border-emerald-200/50 pb-1 flex items-center justify-between">
                    <span>Ei,</span>
                    <span className="text-[9px] text-emerald-700 font-mono font-normal">
                      Template: {selectedMetaTemplateName}
                    </span>
                  </div>

                  {/* Variável 1 Resolvida */}
                  <div className={`text-[11px] leading-relaxed select-text ${
                    highlightVariables
                      ? 'bg-white/60 p-2 rounded-lg border border-blue-200/60'
                      : ''
                  }`}>
                    {highlightVariables && (
                      <span className="text-[8px] font-bold text-blue-700 uppercase font-mono block mb-0.5">
                        Slot &#123;&#123;1&#125;&#125; (Saudação):
                      </span>
                    )}
                    <span className="font-medium text-neutral-900">{resolvedVariables['1']}</span>
                  </div>

                  {/* Variável 2 Resolvida */}
                  <div className={`text-[11px] leading-relaxed select-text ${
                    highlightVariables
                      ? 'bg-white/60 p-2 rounded-lg border border-blue-200/60'
                      : ''
                  }`}>
                    {highlightVariables && (
                      <span className="text-[8px] font-bold text-blue-700 uppercase font-mono block mb-0.5">
                        Slot &#123;&#123;2&#125;&#125; (Gancho Proativo):
                      </span>
                    )}
                    <span className="text-neutral-800">{resolvedVariables['2']}</span>
                  </div>

                  {/* Variável 3 Resolvida */}
                  <div className={`text-[11px] leading-relaxed select-text ${
                    highlightVariables
                      ? 'bg-white/60 p-2 rounded-lg border border-blue-200/60'
                      : ''
                  }`}>
                    {highlightVariables && (
                      <span className="text-[8px] font-bold text-blue-700 uppercase font-mono block mb-0.5">
                        Slot &#123;&#123;3&#125;&#125; (Link & Feedback):
                      </span>
                    )}
                    <span className="text-neutral-800 whitespace-pre-line">{resolvedVariables['3']}</span>
                  </div>

                  {/* Rodapé Oficial da Meta (Footer) */}
                  {resolvedFooterText && (
                    <div className="text-[10px] text-neutral-500 italic pt-1 border-t border-emerald-200/60">
                      {resolvedFooterText}
                    </div>
                  )}

                  {/* BOTÕES OFICIAIS DINÂMICOS DA META (Exatamente os 2 botões aprovados no template!) */}
                  <div className="pt-1.5 border-t border-emerald-200/60 space-y-1.5">
                    {resolvedButtons.map((button, bIdx) => {
                      const isOptOut =
                        button.text.toLowerCase().includes('parar') ||
                        button.text.toLowerCase().includes('stop') ||
                        button.text.toLowerCase().includes('sair');

                      return (
                        <div
                          key={bIdx}
                          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer shadow-2xs ${
                            isOptOut
                              ? 'bg-white/80 hover:bg-rose-50 text-neutral-600 hover:text-rose-700 border-neutral-300 hover:border-rose-300'
                              : 'bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-300'
                          }`}
                        >
                          {isOptOut ? (
                            <XOctagon className="w-3.5 h-3.5 text-neutral-400 group-hover:text-rose-600" />
                          ) : button.type === 'URL' || button.text.toLowerCase().includes('link') ? (
                            <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <CornerDownLeft className="w-3.5 h-3.5 text-blue-600" />
                          )}
                          <span>{button.text}</span>
                          {isOptOut && (
                            <span className="text-[8px] text-neutral-400 font-normal uppercase ml-1">
                              (Opt-out Meta)
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-end gap-1 text-[9px] text-neutral-500 pt-0.5">
                    <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-blue-500 font-bold">✓✓</span>
                  </div>
                </div>
              </div>

              {/* Fake WhatsApp Input Footer */}
              <div className="bg-[#f0f2f5] px-3 py-2 flex items-center gap-2 border-t border-neutral-200 shrink-0">
                <div className="flex-1 bg-white rounded-full px-3 py-1.5 text-[11px] text-neutral-400 border border-neutral-200">
                  Mensagem
                </div>
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <Send className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Ficha da Arquitetura do Template (GoHighLevel Inspection Card) */}
            <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs text-neutral-600 space-y-2">
              <div className="flex items-center justify-between font-bold text-neutral-900 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-blue-600" />
                  <span>Estrutura Dinâmica dos Botões Meta:</span>
                </div>
                <span className="text-[10px] text-emerald-700 font-mono">
                  {resolvedButtons.length} botões detectados
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-neutral-500">
                No WhatsApp Business Cloud API, os botões <strong>Acessar Link</strong> e <strong>Parar Mensagens</strong> vêm registrados diretamente no registro homologado da Meta. O sistema agora lê dinamicamente esses componentes para garantir 100% de paridade visual e funcional.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
