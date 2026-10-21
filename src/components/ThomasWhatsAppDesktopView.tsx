import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MessageSquare,
  Send,
  Phone,
  ExternalLink,
  Globe,
  Search,
  Sparkles,
  Flame,
  Clock,
  CheckCheck,
  Check,
  User,
  ShieldCheck,
  RefreshCw,
  Sliders,
  AlertCircle,
  Play,
  Volume2,
  FileCheck,
  Paperclip,
  Smile,
  Mic,
  MicOff,
  Trash2,
  ArrowRight,
  Filter,
  BadgeCheck,
  Info,
  X,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Download,
  CheckCircle2,
  Share2,
  Layers,
  Settings,
  Zap
} from 'lucide-react';
import { InboxConversation, InboxPage, Lead, LeadChatMessage, Salesperson, PIPELINE_COLUMNS, ColumnStatus, QuickReply } from '../types';
import { WhatsAppVoiceAudioPlayer } from './WhatsAppVoiceAudioPlayer';
import { useRuntimeConfig, formatInstancePhone } from '../lib/useRuntimeConfig';
import { onRealtime, onRealtimeConnection } from '../lib/realtime';
import { QuickRepliesModal } from './QuickRepliesModal';
import { arePhonesEquivalent } from '../lib/phone';
import { shouldApplyStatus, statusRank } from '../lib/fluxoStatus';

/** ID único por tentativa de envio: o servidor usa para NÃO enviar duas vezes (duplo clique / retry de rede). */
function newClientMessageId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** Texto legível de um erro de envio (`{ message, action }` vindo do servidor). */
function describeSendError(err: any): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  return [err.message, err.action].filter(Boolean).join(' — ');
}

interface ThomasWhatsAppDesktopViewProps {
  leads: Lead[];
  onUpdateLeadColumn?: (leadId: string, newColumn: string) => void;
  onShowToast: (msg: string) => void;
  activeSalesperson?: Salesperson;
  initialLeadId?: string;
}

// Modelos aprovados: vêm do catálogo REAL da conta na FluxoAPI (GET /api/whatsapp/fluxo-templates).
// Antes eram 4 nomes fixos no código — se não existissem na sua Meta, todo envio de modelo pelo chat falhava.
interface MetaTemplateOption {
  name: string;
  language: string;
  category: string;
  label: string;
  description: string;
  sendable: boolean;
  /** Campos que o chat não preenche sozinho (botão de URL variável, mídia de cabeçalho…). */
  extraRequired: string[];
  getText: (lead: Lead, closerName: string) => string;
}

function humanizeTemplateName(name: string): string {
  const s = String(name || '').replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : name;
}

function catalogToOption(t: any): MetaTemplateOption {
  const body = String(t.bodyText || '');
  return {
    name: t.name,
    language: t.language || 'pt_BR',
    category: t.category || 'MODELO',
    label: humanizeTemplateName(t.name),
    description: body ? body.slice(0, 140) + (body.length > 140 ? '…' : '') : 'Modelo aprovado pela Meta.',
    sendable: t.sendable !== false && (!t.extraRequired || t.extraRequired.length === 0),
    extraRequired: Array.isArray(t.extraRequired) ? t.extraRequired : [],
    // Prévia: mesmas variáveis que o servidor preenche por padrão ({{1}} nome, {{2}} link do site, {{3}} vendedor)
    getText: (lead, closerName) => {
      const values: Record<string, string> = {
        '1': (lead.name || 'Cliente').split(' ')[0] || 'Cliente',
        '2': lead.publicUrl || 'https://nyroh.com.br',
        '3': (closerName || 'Thomas').replace(/\(.*\)/, '').trim().split(/\s+/)[0] || 'Thomas'
      };
      return body ? body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, ref) => values[ref] ?? `{{${ref}}}`) : `[Modelo ${t.name}]`;
    }
  };
}
// Quick Emojis
const QUICK_EMOJIS = ['👍', '🤝', '🔥', '📅', '✅', '🚀', '⭐', '💡', '👋', '🎉'];

// Play notification sound using Web Audio API
function playNotificationChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(659.25, now); // E5
    osc2.frequency.setValueAtTime(880.0, now + 0.08); // A5

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.1);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.35);
  } catch {
    // Audio context may be restricted by browser policy
  }
}

export const ThomasWhatsAppDesktopView: React.FC<ThomasWhatsAppDesktopViewProps> = ({
  leads,
  onUpdateLeadColumn,
  onShowToast,
  activeSalesperson,
  initialLeadId
}) => {
  const [selectedLeadId, setSelectedLeadId] = useState<string>(initialLeadId || leads[0]?.id || '');
  // Estado REAL do servidor: se a instância está mesmo conectada e se as rotas de teste existem.
  const runtime = useRuntimeConfig();
  const [currentUser, setCurrentUser] = useState<{ role?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (alive && d?.user) setCurrentUser(d.user);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const isAdminUser = currentUser?.role === 'admin';

  useEffect(() => {
    if (initialLeadId) {
      setSelectedLeadId(initialLeadId);
    }
  }, [initialLeadId]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'ALL' | 'HOT' | 'WAITING' | 'NEGOTIATION' | 'RESOLVED'>('ALL');
  
  const [messages, setMessages] = useState<LeadChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [realtimeActive, setRealtimeActive] = useState<boolean>(true);
  // Fim da janela de 24h segundo o servidor (última mensagem do cliente + 24h) — mais confiável que o dado do lead em cache
  const [serverWindowExpiresAt, setServerWindowExpiresAt] = useState<string | null>(null);
  // Presença: OUTROS vendedores com esta conversa aberta (mesmo número de WhatsApp para a equipe toda)
  const [presenceUsers, setPresenceUsers] = useState<Array<{ id: string; name: string; typing: boolean }>>([]);
  const myUserIdRef = useRef<string>('');
  const lastTypingPingRef = useRef<number>(0);

  // Audio Recording State
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [micDenied, setMicDenied] = useState<boolean>(false);
  const [liveAudioVolume, setLiveAudioVolume] = useState<number>(0);

  // Modals & Panels State
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState<boolean>(false);
  const [catalogTemplates, setCatalogTemplates] = useState<MetaTemplateOption[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState<boolean>(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MetaTemplateOption | null>(null);

  const loadTemplateCatalog = async (refresh = false) => {
    setCatalogLoading(true);
    try {
      const res = await fetch(`/api/whatsapp/fluxo-templates${refresh ? '?refresh=1' : ''}`);
      const data = await res.json().catch(() => null);
      const list = Array.isArray(data?.templates) ? data.templates.map(catalogToOption) : [];
      setCatalogTemplates(list);
      setCatalogError(data?.success === false ? describeSendError(data.error) || 'Não foi possível ler os modelos da sua conta.' : null);
      setSelectedTemplate(prev => (prev && list.some((t: MetaTemplateOption) => t.name === prev.name) ? prev : list.find((t: MetaTemplateOption) => t.sendable) || list[0] || null));
    } catch {
      setCatalogError('Não foi possível ler os modelos da sua conta (sem conexão com o servidor).');
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    loadTemplateCatalog();
  }, []);
  const [isDossierOpen, setIsDossierOpen] = useState<boolean>(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const [attachmentPreview, setAttachmentPreview] = useState<{ name: string; url: string; type: string } | null>(null);

  // Quick Replies (Atalhos com '/') & Autocomplete
  const [isQuickRepliesModalOpen, setIsQuickRepliesModalOpen] = useState<boolean>(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState<number>(0);
  const [showSlashDropdown, setShowSlashDropdown] = useState<boolean>(false);
  const [slashQuery, setSlashQuery] = useState<string>('');

  const fetchQuickReplies = async () => {
    try {
      const res = await fetch('/api/quick-replies');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.quickReplies) ? data.quickReplies : (Array.isArray(data) ? data : []);
        setQuickReplies(list);
      }
    } catch (err) {
      console.error('Erro ao carregar respostas rápidas:', err);
    }
  };

  useEffect(() => {
    fetchQuickReplies();
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioIntervalRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------------------
  // CAIXA DE ENTRADA (GET /api/inbox)
  //
  // Antes a lista da esquerda era a lista de leads inteira, na ordem em que o banco devolvia:
  // quem acabou de escrever podia estar na posição 3.000, não havia contador de não lidas e
  // conversa nova só aparecia recarregando tudo. Agora vem do servidor já ordenada pela
  // última mensagem, em páginas, e cada evento reposiciona a conversa na hora.
  // ---------------------------------------------------------------------------------------
  const [inbox, setInbox] = useState<InboxConversation[]>([]);
  const [inboxCursor, setInboxCursor] = useState<string | null>(null);
  const [inboxHasMore, setInboxHasMore] = useState<boolean>(false);
  const [inboxLoading, setInboxLoading] = useState<boolean>(false);
  const inboxRequestRef = useRef(0);

  const serverFilter =
    filterType === 'HOT' ? 'unread' : filterType === 'WAITING' ? 'waiting' : filterType === 'RESOLVED' ? 'resolved' : '';

  const fetchInbox = async (opts: { append?: boolean } = {}) => {
    const req = ++inboxRequestRef.current;
    setInboxLoading(true);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (opts.append && inboxCursor) params.set('cursor', inboxCursor);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (serverFilter) params.set('filter', serverFilter);

      const res = await fetch(`/api/inbox?${params.toString()}`);
      if (!res.ok) return;
      const data: InboxPage = await res.json();
      if (req !== inboxRequestRef.current) return; // resposta velha: a busca já mudou
      setInbox(prev => (opts.append ? [...prev, ...(data.conversations || [])] : data.conversations || []));
      setInboxCursor(data.nextCursor);
      setInboxHasMore(Boolean(data.hasMore));
    } catch (err) {
      console.error('Erro ao carregar a caixa de entrada:', err);
    } finally {
      if (req === inboxRequestRef.current) setInboxLoading(false);
    }
  };

  // Busca com espera de 300ms para não disparar uma consulta por tecla digitada
  useEffect(() => {
    const t = setTimeout(() => {
      setInboxCursor(null);
      fetchInbox();
    }, searchQuery ? 300 : 0);
    return () => clearTimeout(t);
  }, [searchQuery, filterType]);

  // Caixa de texto que cresce com o conteúdo (até um limite) em vez de uma linha só.
  const inputTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = inputTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [inputText]);

  /** Horário curto na lista: hora hoje, "ontem", ou a data. */
  const formatarHorario = (iso?: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const agora = new Date();
    const mesmoDia = d.toDateString() === agora.toDateString();
    if (mesmoDia) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const ontem = new Date(agora);
    ontem.setDate(agora.getDate() - 1);
    if (d.toDateString() === ontem.toDateString()) return 'ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  /** Texto da prévia: quem falou por último, com ✓✓ quando fomos nós. */
  const previaDaConversa = (lead: any): string => {
    const texto = lead.lastMessageText ?? lead.lastWhatsAppMessage ?? '';
    const tipo = lead.lastMessageIsAudio
      ? '🎤 Áudio'
      : lead.lastMessageMediaType === 'image'
      ? '📷 Foto'
      : lead.lastMessageMediaType === 'document'
      ? '📄 Documento'
      : lead.lastMessageMediaType === 'video'
      ? '🎬 Vídeo'
      : '';
    const corpo = tipo || texto || 'Sem mensagens ainda';
    if (lead.lastMessageSender && lead.lastMessageSender !== 'lead') {
      const marca = lead.lastMessageStatus === 'read' ? '✓✓' : lead.lastMessageStatus === 'failed' ? '⚠️' : '✓';
      return `${marca} ${corpo}`;
    }
    return corpo;
  };

  /** Zera (ou ajusta) o contador de não lidas de uma conversa na tela. */
  const bumpConversationUnread = (leadId: string, unreadCount: number) => {
    setInbox(prev => prev.map(c => (c.id === leadId ? { ...c, unreadCount } : c)));
  };

  // Os ouvintes de tempo real são registrados UMA vez; estes refs dão a eles o estado atual
  // da caixa sem recriar a conexão a cada mensagem que chega.
  const inboxIdsRef = useRef<Set<string>>(new Set());
  const inboxUnreadRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    inboxIdsRef.current = new Set(inbox.map(c => c.id));
    inboxUnreadRef.current = new Map(inbox.map(c => [c.id, c.unreadCount || 0]));
  }, [inbox]);

  /** Põe a conversa no topo e atualiza a prévia, sem ir à rede. */
  const bumpConversation = (leadId: string, patch: Partial<InboxConversation>) => {
    if (!leadId) return;
    setInbox(prev => {
      const i = prev.findIndex(c => c.id === leadId);
      if (i === -1) return prev; // conversa desconhecida: o efeito abaixo recarrega a lista
      const atualizado = { ...prev[i], ...patch } as InboxConversation;
      const resto = prev.slice(0, i).concat(prev.slice(i + 1));
      return [atualizado, ...resto];
    });
  };

  // Lista mostrada: a caixa de entrada; com busca sem resultado, cai para os leads sem conversa
  // (para conseguir ABRIR uma conversa que ainda não existe).
  const filteredLeads = useMemo(() => {
    if (inbox.length > 0 || !searchQuery.trim()) return inbox as unknown as Lead[];
    const q = searchQuery.toLowerCase().trim();
    return leads
      .filter(l => l.name.toLowerCase().includes(q) || l.phoneNumber.includes(q) || (l.niche || '').toLowerCase().includes(q))
      .slice(0, 30);
  }, [inbox, leads, searchQuery]);

  const totalNaoLidas = useMemo(
    () => inbox.reduce((soma, c) => soma + (c.unreadCount || 0), 0),
    [inbox]
  );

  // Selected lead object: procura na caixa de entrada e na lista geral
  const activeLead = useMemo(() => {
    const naCaixa = (inbox as unknown as Lead[]).find(l => l.id === selectedLeadId);
    return naCaixa || leads.find(l => l.id === selectedLeadId) || (inbox as unknown as Lead[])[0] || leads[0];
  }, [inbox, leads, selectedLeadId]);

  // Substituição dinâmica de variáveis nos atalhos de resposta rápida
  const replaceLeadVariables = (templateText: string, lead?: Lead) => {
    if (!lead) return templateText;
    const firstName = (lead.name || 'Cliente').trim().split(/\s+/)[0];
    const sellerName = (activeSalesperson?.name || 'Thomas').trim();
    const siteUrl = lead.publicUrl || lead.website || 'https://nyroh.com';
    return templateText
      .replace(/\{\{\s*nome\s*\}\}|\{\s*nome\s*\}/gi, lead.name)
      .replace(/\{\{\s*primeiro_nome\s*\}\}|\{\s*primeiro_nome\s*\}/gi, firstName)
      .replace(/\{\{\s*site\s*\}\}|\{\s*site\s*\}/gi, siteUrl)
      .replace(/\{\{\s*vendedor\s*\}\}|\{\s*vendedor\s*\}/gi, sellerName)
      .replace(/\{\{\s*empresa\s*\}\}|\{\s*empresa\s*\}/gi, lead.name);
  };

  // Filtragem dos atalhos ao digitar '/'
  const matchingSlashReplies = useMemo(() => {
    if (!showSlashDropdown) return [];
    const q = slashQuery.toLowerCase().trim();
    if (!q) return quickReplies;
    return quickReplies.filter(r =>
      r.shortcut.toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q) ||
      r.content.toLowerCase().includes(q)
    );
  }, [showSlashDropdown, slashQuery, quickReplies]);

  // Inserir atalho selecionado no composer
  const handleSelectQuickReply = (qr: QuickReply) => {
    const formatted = replaceLeadVariables(qr.content, activeLead);
    setInputText(formatted);
    setShowSlashDropdown(false);
    setSlashQuery('');
  };

  // Status da Janela de 24h Oficial da Meta Cloud API
  const windowStatus = useMemo(() => {
    const candidates = [(activeLead as any)?.windowExpiresAt, serverWindowExpiresAt]
      .map(v => (v ? new Date(v).getTime() : NaN))
      .filter(n => Number.isFinite(n)) as number[];
    const expiry = candidates.length ? new Date(Math.max(...candidates)).toISOString() : null;
    if (!expiry) {
      return { isOpen: false, text: 'Janela 24h Expirada (Requer Template Oficial)' };
    }
    const diff = new Date(expiry).getTime() - Date.now();
    if (diff <= 0) {
      return { isOpen: false, text: 'Janela 24h Expirada (Requer Template Oficial)' };
    }
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return {
      isOpen: true,
      text: `Janela 24h Aberta (${hours}h ${mins}m restantes)`
    };
  }, [(activeLead as any)?.windowExpiresAt, serverWindowExpiresAt]);

  // Cache signature to prevent unnecessary re-renders and eliminate screen flashing (anti-piscando)
  const lastMessageListSignature = useRef<string>('');
  const prevLeadIdRef = useRef<string>('');
  const prevMessagesLengthRef = useRef<number>(0);

  // Load chat messages when selected lead changes (silent background refresh without flickering)
  // Conversa que a tela está mostrando AGORA. Toda resposta de rede é conferida contra isto
  // antes de entrar na tela: sem essa trava, um fetch da conversa anterior que só chega
  // depois da troca sobrescreve a conversa aberta (mensagem de um cliente aparecendo na
  // conversa de outro por alguns segundos).
  const openLeadIdRef = useRef<string>('');

  // "Carregar mensagens antigas": a conversa abre com as últimas 500 e busca o resto sob demanda.
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const loadOlderMessages = async () => {
    const leadId = openLeadIdRef.current;
    if (!leadId || !olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/messages?before=${encodeURIComponent(olderCursor)}`);
      if (!res.ok || leadId !== openLeadIdRef.current) return;
      const data = await res.json();
      const antigas = (data.messages || []) as LeadChatMessage[];
      if (antigas.length) {
        setMessages(prev => {
          const jaTem = new Set(prev.map(m => m.id));
          return [...antigas.filter(m => !jaTem.has(m.id)), ...prev];
        });
      }
      setHasOlderMessages(Boolean(data.hasMoreOlder));
      setOlderCursor(data.olderCursor || null);
    } catch (err) {
      console.error('Erro ao carregar mensagens antigas:', err);
    } finally {
      setLoadingOlder(false);
    }
  };

  // ------------------------------------------------------------------------------------
  // FERRAMENTAS DA CONVERSA: busca no histórico, notas internas, transferir e resolver.
  // Antes não existia nenhuma delas: para achar uma conversa antiga era abrir uma a uma, e
  // o que a equipe combinava sobre o cliente não ficava registrado em lugar nenhum.
  // ------------------------------------------------------------------------------------
  const [messageSearch, setMessageSearch] = useState('');
  const [messageResults, setMessageResults] = useState<any[]>([]);
  const [searchingMessages, setSearchingMessages] = useState(false);

  useEffect(() => {
    const termo = messageSearch.trim();
    if (termo.length < 2) {
      setMessageResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearchingMessages(true);
      try {
        const r = await fetch(`/api/messages/search?q=${encodeURIComponent(termo)}`);
        if (r.ok) setMessageResults((await r.json()).results || []);
      } catch {
        /* ignora */
      } finally {
        setSearchingMessages(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [messageSearch]);

  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  useEffect(() => {
    let vivo = true;
    fetch('/api/salespeople')
      .then(r => (r.ok ? r.json() : []))
      .then(d => {
        if (vivo && Array.isArray(d)) setSalespeople(d);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const [notes, setNotes] = useState<any[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const carregarNotas = async (leadId: string) => {
    try {
      const r = await fetch(`/api/leads/${leadId}/notes`);
      if (r.ok && leadId === openLeadIdRef.current) setNotes((await r.json()).notes || []);
    } catch {
      /* ignora */
    }
  };

  const salvarNota = async () => {
    const leadId = openLeadIdRef.current;
    const texto = noteDraft.trim();
    if (!leadId || !texto || savingNote) return;
    setSavingNote(true);
    try {
      const r = await fetch(`/api/leads/${leadId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: texto })
      });
      if (r.ok) {
        setNoteDraft('');
        carregarNotas(leadId);
        onShowToast('Nota interna salva (o cliente não vê).');
      } else {
        onShowToast('Não consegui salvar a nota.');
      }
    } finally {
      setSavingNote(false);
    }
  };

  const transferirConversa = async (salespersonId: string) => {
    const lead = activeLeadRef.current;
    if (!lead?.id || !salespersonId) return;
    const destino = salespeople?.find(v => v.id === salespersonId);
    try {
      const r = await fetch(`/api/leads/${lead.id}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salespersonId, salespersonName: destino?.name })
      });
      if (r.ok) {
        onShowToast(`Conversa transferida para ${destino?.name || 'o vendedor'}.`);
        refreshInboxRef.current();
      } else {
        onShowToast('Não foi possível transferir esta conversa.');
      }
    } catch {
      onShowToast('Não foi possível transferir esta conversa.');
    }
  };

  const alternarResolvida = async () => {
    const lead: any = activeLeadRef.current;
    if (!lead?.id) return;
    const marcar = !lead.resolvedAt;
    try {
      const r = await fetch(`/api/leads/${lead.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: marcar })
      });
      if (r.ok) {
        onShowToast(marcar ? 'Conversa marcada como resolvida.' : 'Conversa reaberta.');
        refreshInboxRef.current();
      }
    } catch {
      /* ignora */
    }
  };

  const fetchMessages = async (leadId: string, isSilent = false) => {
    if (!leadId) return;
    try {
      if (!isSilent) {
        setLoadingMessages(true);
      }
      const res = await fetch(`/api/leads/${leadId}/messages`);
      if (leadId !== openLeadIdRef.current) return; // já trocou de conversa: resposta velha, descarta
      if (res.ok) {
        const data = await res.json();
        if (leadId !== openLeadIdRef.current) return; // conferir de novo depois do parse
        const incoming = (data.messages || []) as LeadChatMessage[];
        setServerWindowExpiresAt(data.windowExpiresAt || null);
        setHasOlderMessages(Boolean(data.hasMoreOlder));
        setOlderCursor(data.olderCursor || null);
        // Compute message content and status signature
        const signature = incoming.map(m => `${m.id}_${m.status}_${m.statusRank ?? ''}_${m.text?.length || 0}_${m.mediaUrl ? 1 : 0}`).join('|');
        if (signature !== lastMessageListSignature.current || prevLeadIdRef.current !== leadId) {
          lastMessageListSignature.current = signature;
          prevLeadIdRef.current = leadId;
          setMessages(incoming);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar mensagens do lead:', err);
    } finally {
      if (!isSilent && leadId === openLeadIdRef.current) {
        setLoadingMessages(false);
      }
    }
  };

  // Dados que os handlers de tempo real precisam ler SEM recriar a conexão. Antes o EventSource era derrubado e
  // recriado a cada render do App (as props mudavam de identidade) — e o que chegava no intervalo se perdia.
  const activeLeadRef = useRef(activeLead);
  activeLeadRef.current = activeLead;
  const onShowToastRef = useRef(onShowToast);
  onShowToastRef.current = onShowToast;
  const onUpdateLeadColumnRef = useRef(onUpdateLeadColumn);
  onUpdateLeadColumnRef.current = onUpdateLeadColumn;
  const fetchMessagesRef = useRef(fetchMessages);
  fetchMessagesRef.current = fetchMessages;
  const bumpConversationRef = useRef(bumpConversation);
  bumpConversationRef.current = bumpConversation;
  const refreshInboxRef = useRef<() => void>(() => {});
  refreshInboxRef.current = () => {
    setInboxCursor(null);
    void fetchInbox();
  };

  // Insere ou atualiza (por id) uma mensagem na conversa aberta, sem deixar um status velho sobrescrever um novo
  const upsertMessage = (incoming: LeadChatMessage) => {
    setMessages(prev => {
      const i = prev.findIndex(m => m.id === incoming.id);
      if (i === -1) return [...prev, incoming];
      const cur = prev[i];
      const staleStatus =
        incoming.status !== cur.status &&
        !shouldApplyStatus({ status: cur.status, rank: cur.statusRank }, { status: incoming.status, rank: incoming.statusRank });
      const merged: LeadChatMessage = { ...cur, ...incoming, ...(staleStatus ? { status: cur.status, statusRank: cur.statusRank, error: cur.error } : {}) };
      const next = prev.slice();
      next[i] = merged;
      return next;
    });
  };

  // Avisa a FluxoAPI que a conversa foi aberta/lida (dois traços azuis no celular do cliente). O servidor limita a 1x/20s.
  const markConversationRead = (leadId: string) => {
    fetch(`/api/leads/${encodeURIComponent(leadId)}/read`, { method: 'POST' }).catch(() => {});
  };

  useEffect(() => {
    if (activeLead?.id) {
      // Marca a conversa aberta ANTES de qualquer fetch e limpa a tela na hora:
      // assim nada da conversa anterior continua visível enquanto a nova carrega.
      openLeadIdRef.current = activeLead.id;
      lastMessageListSignature.current = '';
      setMessages([]);
      fetchMessages(activeLead.id, false);
      markConversationRead(activeLead.id);
      setNotes([]);
      setNoteDraft('');
      carregarNotas(activeLead.id);
      // Rede de segurança (o tempo real é o SSE; isto cobre qualquer falha dele)
      const pollTimer = setInterval(() => {
        fetchMessages(activeLead.id, true);
      }, 5000);
      return () => clearInterval(pollTimer);
    } else {
      openLeadIdRef.current = '';
      setMessages([]);
    }
  }, [activeLead?.id]);

  // Scroll to bottom on new messages ONLY when message count actually increases
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length]);

  // ---- Presença: avisa o servidor que estou nesta conversa (a cada 8s) e saio ao trocar/fechar ----
  const sendPresence = (leadId: string, body: { typing?: boolean; leave?: boolean }) => {
    return fetch(`/api/leads/${encodeURIComponent(leadId)}/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: Boolean(body.leave)
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return;
        if (d.me) myUserIdRef.current = d.me;
        if (Array.isArray(d.users) && activeLeadRef.current?.id === leadId) {
          setPresenceUsers(d.users.filter((u: any) => u.id !== myUserIdRef.current));
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    const leadId = activeLead?.id;
    setPresenceUsers([]);
    if (!leadId) return;
    sendPresence(leadId, {});
    const beat = setInterval(() => sendPresence(leadId, {}), 8000);
    const onUnload = () => sendPresence(leadId, { leave: true });
    window.addEventListener('beforeunload', onUnload);
    return () => {
      clearInterval(beat);
      window.removeEventListener('beforeunload', onUnload);
      sendPresence(leadId, { leave: true });
    };
  }, [activeLead?.id]);

  // "digitando…": no máx. 1 sinal a cada 3s enquanto escreve
  const notifyTyping = () => {
    const leadId = activeLeadRef.current?.id;
    if (!leadId) return;
    const now = Date.now();
    if (now - lastTypingPingRef.current < 3000) return;
    lastTypingPingRef.current = now;
    sendPresence(leadId, { typing: true });
  };

  // Tempo real: usa a conexão ÚNICA da aba (src/lib/realtime.ts). Antes esta tela abria o
  // próprio EventSource, somando duas conexões por aba com a tela principal.
  useEffect(() => {
    const refetchOpenConversation = () => {
      const lead = activeLeadRef.current;
      if (lead?.id) fetchMessagesRef.current(lead.id, true);
    };

    const offs = [
      onRealtimeConnection(online => setRealtimeActive(online)),
      onRealtime('reconnected', refetchOpenConversation),
      onRealtime('resync', refetchOpenConversation),

      onRealtime('NEW_MESSAGE', (payload: any) => {
        if (!payload) return;
        const lead = activeLeadRef.current;
        const isCurrentLead =
          payload.leadId === lead?.id ||
          (!!lead?.phoneNumber && !!payload.phone && arePhonesEquivalent(lead.phoneNumber, payload.phone));

        // A conversa sobe para o topo da caixa com a prévia nova. Se for de um número que
        // ainda não está na lista, recarrega a primeira página (conversa nova aparece sozinha).
        const msg = payload.message || {};
        const jaEstaNaLista = inboxIdsRef.current.has(payload.leadId);
        if (jaEstaNaLista) {
          bumpConversationRef.current(payload.leadId, {
            lastMessageAt: msg.timestamp || new Date().toISOString(),
            lastMessageText: msg.text || '',
            lastMessageSender: msg.sender,
            lastMessageStatus: msg.status,
            lastMessageIsAudio: msg.isAudio,
            lastMessageMediaType: msg.mediaType,
            unreadCount:
              msg.sender === 'lead' && !isCurrentLead
                ? (inboxUnreadRef.current.get(payload.leadId) || 0) + 1
                : isCurrentLead
                ? 0
                : inboxUnreadRef.current.get(payload.leadId) || 0
          } as any);
        } else {
          refreshInboxRef.current();
        }

        if (isCurrentLead && payload.message) {
          upsertMessage(payload.message);
          if (payload.message.sender === 'lead' && lead?.id) markConversationRead(lead.id);
        }
        if (payload.isReply || payload.message?.sender === 'lead') {
          playNotificationChime();
          onShowToastRef.current(`🔥 Nova mensagem de ${payload.leadName || 'Lead'}: "${(payload.message?.text || '').substring(0, 35)}..."`);
        }
      }),

      onRealtime('LEAD_HOT_REPLY', (payload: any) => {
        if (!payload) return;
        playNotificationChime();
        onShowToastRef.current(`🔥 Lead Quente! ${payload.leadName} respondeu no WhatsApp.`);
        if (activeLeadRef.current && onUpdateLeadColumnRef.current) {
          onUpdateLeadColumnRef.current(payload.leadId, 'Interessado');
        }
      }),

      // O estado só AVANÇA por rank (queued → sent → delivered → read; failed): um "entregue" atrasado não desfaz um "lido"
      onRealtime('MESSAGE_STATUS_UPDATE', (payload: any) => {
        if (!payload) return;
        if (payload.leadId && payload.leadId !== activeLeadRef.current?.id) return;
        setMessages(prev =>
          prev.map(m => {
            const same = m.id === payload.messageId || (payload.remoteMessageId && m.remoteMessageId === payload.remoteMessageId);
            if (!same) return m;
            const incoming = { status: payload.status, rank: payload.rank };
            if (!shouldApplyStatus({ status: m.status, rank: m.statusRank }, incoming)) return m;
            return { ...m, status: payload.status, statusRank: payload.rank ?? statusRank(payload.status), error: payload.error ?? m.error };
          })
        );
      }),

      // Outro vendedor abriu / está digitando nesta conversa
      onRealtime('LEAD_PRESENCE', (payload: any) => {
        if (!payload || payload.leadId !== activeLeadRef.current?.id) return;
        setPresenceUsers((payload.users || []).filter((u: any) => u.id !== myUserIdRef.current));
      })
    ];

    return () => {
      for (const off of offs) off();
    };
  }, []);
  // Clean up audio recording on unmount
  useEffect(() => {
    return () => {
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Envia pelo servidor e AGUARDA o resultado real: 202 = aceito na fila da FluxoAPI; erro = motivo exato.
  // `clientMessageId` torna o envio idempotente (duplo clique / retry de rede não duplica no celular do cliente).
  const postLeadMessage = async (payload: Record<string, any>) => {
    const lead = activeLeadRef.current;
    if (!lead) return { ok: false as const, status: 0, error: { message: 'Nenhuma conversa selecionada.' } as any };
    const phone = lead.phoneNumber || (lead as any).phone || (lead.id.startsWith('lead_wa_') ? lead.id.replace('lead_wa_', '') : undefined);
    const res = await fetch(`/api/leads/${encodeURIComponent(lead.id)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientMessageId: newClientMessageId(),
        phone,
        senderName: activeSalesperson?.name || 'Thomas (Admin / Closer)',
        ...payload
      })
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      /* resposta sem JSON */
    }
    // O servidor devolve a mensagem também quando falha (assim ela aparece na conversa como "falhou", com o motivo)
    if (data?.message) upsertMessage(data.message as LeadChatMessage);
    if (res.ok) return { ok: true as const, status: res.status, data };
    return { ok: false as const, status: res.status, error: (data?.error || { message: `Falha ao enviar (HTTP ${res.status}).` }) as any, data };
  };

  const reportSendFailure = (error: any) => {
    onShowToast(`❌ ${describeSendError(error) || 'Falha ao enviar a mensagem.'}`);
    // Janela de 24h fechada: o único caminho é um modelo aprovado — já abre a escolha
    if (error?.code === 'window_closed') setIsTemplateModalOpen(true);
  };

  // 1. Send standard text message or with attachment
  const handleSendMessage = async () => {
    if ((!inputText.trim() && !attachmentPreview) || !activeLead || isSending) return;
    const textToSend = inputText.trim() || (attachmentPreview ? `[Arquivo: ${attachmentPreview.name}]` : '');
    const currentAttachment = attachmentPreview;

    setInputText('');
    setAttachmentPreview(null);
    setShowEmojiPicker(false);
    setIsSending(true);

    try {
      const mime = currentAttachment?.type || '';
      const kind = !currentAttachment
        ? undefined
        : mime.startsWith('image/') ? 'image'
        : mime.startsWith('video/') ? 'video'
        : mime.startsWith('audio/') ? 'audio'
        : 'document';

      const r = await postLeadMessage({
        text: textToSend,
        mediaUrl: currentAttachment?.url,
        mediaName: currentAttachment?.name,
        mediaType: kind,
        isAudio: kind === 'audio' ? true : undefined
      });
      if (!r.ok) reportSendFailure(r.error);
    } catch (err) {
      console.error(err);
      onShowToast('❌ Não consegui falar com o servidor. A mensagem NÃO foi enviada.');
    } finally {
      setIsSending(false);
    }
  };

  // Reenvia uma mensagem que falhou (nova tentativa = novo clientMessageId)
  const handleRetryMessage = async (msg: LeadChatMessage) => {
    if (isSending) return;
    setIsSending(true);
    try {
      const r = await postLeadMessage({
        text: msg.text,
        templateName: msg.templateName,
        mediaType: msg.mediaType,
        mediaUrl: msg.mediaUrl,
        mediaName: msg.mediaName,
        isAudio: msg.isAudio,
        audioUrl: msg.audioUrl,
        audioDuration: msg.audioDuration,
        senderName: msg.senderName
      });
      if (r.ok) onShowToast('✅ Reenviado: a mensagem entrou na fila de envio.');
      else reportSendFailure(r.error);
    } catch {
      onShowToast('❌ Não consegui falar com o servidor. A mensagem NÃO foi enviada.');
    } finally {
      setIsSending(false);
    }
  };
  // 2. Start Real Microphone Voice Recording
  const handleStartVoiceRecord = async () => {
    setIsRecordingAudio(true);
    setRecordingDuration(0);
    audioChunksRef.current = [];

    // Start duration ticker
    audioIntervalRef.current = setInterval(() => {
      setRecordingDuration(prev => prev + 1);
    }, 1000);

    // Attempt Native MediaRecorder with getUserMedia
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = stream;

        // Set up Web Audio Analyser for live volume waveform
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            audioCtxRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            audioAnalyserRef.current = analyser;

            const updateMeter = () => {
              if (!analyser) return;
              const dataArray = new Uint8Array(analyser.frequencyBinCount);
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const avg = sum / dataArray.length;
              setLiveAudioVolume(Math.min(100, Math.round((avg / 128) * 100)));
              animFrameRef.current = requestAnimationFrame(updateMeter);
            };
            updateMeter();
          }
        } catch {
          // Live analyser optional
        }

        // Determine supported audio mime type (prefer WhatsApp native ogg/opus, then webm/opus or mp4)
        const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm';

        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.start(200); // chunk every 200ms
        setMicDenied(false);
      } else {
        setMicDenied(true);
      }
    } catch (micErr: any) {
      console.warn('Microfone físico não acessível ou restrito por permissão:', micErr);
      setMicDenied(true);
      onShowToast('Microfone físico restrito no navegador. Modo gravação simulada ativado!');
    }
  };

  // 3. Cancel Recording
  const handleCancelVoiceRecord = () => {
    if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    setIsRecordingAudio(false);
    setRecordingDuration(0);
    setLiveAudioVolume(0);
    audioChunksRef.current = [];
    onShowToast('Gravação cancelada.');
  };

  // 4. Finish and Send Audio
  const handleSendVoiceRecord = async () => {
    if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const seconds = Math.max(1, recordingDuration);
    setIsRecordingAudio(false);
    setRecordingDuration(0);
    setLiveAudioVolume(0);

    const stopTracks = () => {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
        audioStreamRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      const recorder = mediaRecorderRef.current;

      recorder.onstop = async () => {
        stopTracks();
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        
        // Convert Blob to Data URL
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          dispatchAudioMessage(seconds, dataUrl);
        };
        reader.readAsDataURL(audioBlob);
      };

      recorder.stop();
    } else {
      stopTracks();
      // Fallback: Dispatches with duration and synthetic voice playback
      dispatchAudioMessage(seconds, undefined);
    }
  };

  // Dispatch audio message to API
  const dispatchAudioMessage = async (seconds: number, audioUrl?: string) => {
    if (!activeLead) return;
    try {
      const r = await postLeadMessage({
        text: `🎤 Mensagem de voz (${seconds}s)`,
        isAudio: true,
        audioDuration: seconds,
        audioUrl: audioUrl || undefined,
        mediaType: 'audio',
        mediaUrl: audioUrl || undefined
      });
      if (r.ok) onShowToast('✅ Áudio aceito na fila de envio.');
      else reportSendFailure(r.error);
    } catch (err) {
      console.error(err);
      onShowToast('❌ Falha ao enviar o áudio (sem conexão com o servidor).');
    }
  };
  // 5. Send Selected Meta Template
  const handleSendMetaTemplate = async (template: MetaTemplateOption | null) => {
    if (!template) {
      setIsTemplateModalOpen(true);
      return;
    }
    if (!activeLead || isSending) return;
    const closerName = activeSalesperson?.name || 'Thomas';
    const templateText = template.getText(activeLead, closerName);

    setIsSending(true);
    setIsTemplateModalOpen(false);

    try {
      const r = await postLeadMessage({
        text: templateText,
        templateName: template.name,
        templateLanguage: template.language,
        senderName: `${closerName} (Admin / Closer)`
      });
      if (r.ok) {
        onShowToast(`✅ Modelo "${template.label}" aceito na fila de envio${r.data?.billable ? ' (conversa cobrada pela Meta)' : ''}.`);
      } else {
        reportSendFailure(r.error);
      }
    } catch (err) {
      console.error(err);
      onShowToast('❌ Não consegui falar com o servidor. O modelo NÃO foi enviado.');
    } finally {
      setIsSending(false);
    }
  };
  // 6. Simulate incoming replies (Text or Audio)
  const handleSimulateReply = async (type: 'text' | 'audio' | 'optout') => {
    if (!activeLead || isSimulating) return;
    setIsSimulating(true);

    let payload: any = { isInterested: true };
    if (type === 'audio') {
      payload = {
        isInterested: true,
        isAudio: true,
        audioDuration: 14,
        text: '🎤 Mensagem de áudio (14s) • Cliente interessado no novo site'
      };
    } else if (type === 'optout') {
      payload = {
        isInterested: false,
        text: 'Não temos interesse no momento, favor descadastrar este número.'
      };
    }

    try {
      const res = await fetch(`/api/leads/${activeLead.id}/simulate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => {
          const exists = prev.some(m => m.id === data.message.id);
          return exists ? prev.map(m => m.id === data.message.id ? data.message : m) : [...prev, data.message];
        });
        playNotificationChime();
        if (type === 'audio') {
          onShowToast('🎤 Cliente enviou uma mensagem de áudio no WhatsApp!');
        } else if (type === 'text') {
          onShowToast('🔥 Resposta de interesse recebida do cliente!');
        } else {
          onShowToast('Opt-out recebido e registrado.');
        }
      }
    } catch (err) {
      console.error(err);
      onShowToast('Erro ao simular resposta.');
    } finally {
      setIsSimulating(false);
    }
  };

  // 7. Handle File Upload (Screenshot, PDF, etc.)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      onShowToast('Arquivo muito grande (limite de 15MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentPreview({
        name: file.name,
        url: reader.result as string,
        type: file.type
      });
      onShowToast(`Anexo selecionado: ${file.name}`);
    };
    reader.readAsDataURL(file);
  };

  /** Anexa um arquivo vindo de colar (Ctrl+V) ou de arrastar para a tela. */
  const attachFile = (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      onShowToast('Arquivo muito grande (limite de 15MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentPreview({ name: file.name || 'imagem.png', url: reader.result as string, type: file.type });
      onShowToast(`Anexo pronto: ${file.name || 'imagem colada'}`);
    };
    reader.readAsDataURL(file);
  };

  /** Colar imagem direto na caixa de texto (print de tela, foto copiada). */
  const handlePasteIntoInput = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(e.clipboardData?.items || []).find(i => i.kind === 'file');
    const file = item?.getAsFile();
    if (!file) return; // texto normal segue o caminho de sempre
    e.preventDefault();
    attachFile(file);
  };

  // Arrastar e soltar arquivo em qualquer lugar da conversa
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const handleDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) attachFile(file);
  };

  // Format seconds to mm:ss
  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="w-full h-full flex flex-col xl:flex-row bg-[#f8f9fa] border border-neutral-200 rounded-2xl overflow-hidden shadow-2xs">
      {/* ========================================================================= */}
      {/* 1. LEFT COLUMN: Leads / Conversations List                                */}
      {/* ========================================================================= */}
      <div className="w-full xl:w-96 flex flex-col bg-white border-b xl:border-b-0 xl:border-r border-neutral-200 shrink-0 h-full">
        {/* User Identity & Real-time Indicator Header */}
        <div className="p-4 border-b border-neutral-200 bg-neutral-50/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-2xs">
                {activeSalesperson?.name?.substring(0, 2).toUpperCase() || 'TH'}
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-sm text-neutral-900 leading-tight">
                  {activeSalesperson?.name || 'Thomas'} (Mesa do Closer)
                </h3>
                {isAdminUser && (
                  <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-200">
                    Admin
                  </span>
                )}
              </div>
              {/* Dois estados separados e honestos: a conexão do navegador com o CRM,
                  e o estado REAL da instância na FluxoAPI (antes isto dizia "Meta Cloud API
                  Conectada" só porque o SSE do navegador estava aberto). */}
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${realtimeActive ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`} />
                  <span className="font-medium text-[11px]">{realtimeActive ? 'CRM em tempo real' : 'CRM offline'}</span>
                </span>
                <span className="text-neutral-300">•</span>
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${runtime.whatsappConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className="font-medium text-[11px]">
                    {runtime.whatsappConnected
                      ? `WhatsApp ${formatInstancePhone(runtime.instancePhone)}`
                      : `WhatsApp: ${runtime.instanceStatus === 'unconfigured' ? 'não configurado' : runtime.instanceStatus}`}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => activeLead?.id && fetchMessages(activeLead.id)}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/60 transition-colors"
            title="Atualizar mensagens"
          >
            <RefreshCw className={`w-4 h-4 ${loadingMessages ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-neutral-100">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome, telefone ou nicho..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-neutral-100/80 hover:bg-neutral-100 focus:bg-white border border-transparent focus:border-neutral-300 rounded-xl text-xs text-neutral-800 placeholder-neutral-400 transition-all focus:outline-none"
            />
          </div>
        </div>

        {/* Busca DENTRO das mensagens (antes não existia: achar uma conversa antiga era abrir uma a uma) */}
        <div className="px-3 pb-2 border-b border-neutral-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Procurar no histórico de mensagens…"
              value={messageSearch}
              onChange={e => setMessageSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-amber-50/60 hover:bg-amber-50 focus:bg-white border border-amber-200/70 focus:border-amber-400 rounded-xl text-[11px] text-neutral-800 placeholder-neutral-400 transition-all focus:outline-none"
            />
          </div>
          {messageSearch.trim().length >= 2 && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100">
              {searchingMessages && <p className="p-2.5 text-[11px] text-neutral-500">Procurando…</p>}
              {!searchingMessages && messageResults.length === 0 && (
                <p className="p-2.5 text-[11px] text-neutral-500">Nada encontrado com esse texto.</p>
              )}
              {messageResults.map(r => (
                <button
                  key={r.messageId}
                  onClick={() => {
                    setSelectedLeadId(r.leadId);
                    setMessageSearch('');
                  }}
                  className="w-full text-left p-2.5 hover:bg-neutral-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-neutral-900 truncate">{r.leadName}</span>
                    <span className="text-[10px] text-neutral-400 shrink-0">{formatarHorario(r.timestamp)}</span>
                  </div>
                  <p className="text-[11px] text-neutral-600 truncate">
                    {r.sender === 'lead' ? '' : '↩ '}{r.text}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filter Quick Pills */}
        <div className="px-3 py-2 border-b border-neutral-100 flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filterType === 'ALL'
                ? 'bg-neutral-900 text-white font-bold'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            Todos ({inbox.length}{inboxHasMore ? '+' : ''})
          </button>
          <button
            onClick={() => setFilterType('HOT')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1 ${
              filterType === 'HOT'
                ? 'bg-rose-600 text-white font-bold'
                : 'text-rose-700 bg-rose-50 hover:bg-rose-100'
            }`}
          >
            <Flame className="w-3 h-3 text-rose-500" />
            <span>Não lidas ({totalNaoLidas})</span>
          </button>
          <button
            onClick={() => setFilterType('WAITING')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filterType === 'WAITING'
                ? 'bg-neutral-900 text-white font-bold'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            Sem resposta
          </button>
          <button
            onClick={() => setFilterType('NEGOTIATION')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filterType === 'NEGOTIATION'
                ? 'bg-neutral-900 text-white font-bold'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            Negociação
          </button>
          <button
            onClick={() => setFilterType('RESOLVED')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filterType === 'RESOLVED'
                ? 'bg-neutral-900 text-white font-bold'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            Resolvidas
          </button>
        </div>

        {/* Leads Scroll List */}
        <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
          {filteredLeads.length === 0 ? (
            <div className="p-8 text-center text-neutral-400">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">Nenhum lead encontrado com esse filtro.</p>
            </div>
          ) : (
            filteredLeads.map(lead => {
              const isSelected = lead.id === activeLead?.id;
              const hasReplied = Boolean(
                (lead as any).hasWhatsAppReply ||
                (lead as any).whatsappReplied ||
                lead.subStatus?.toLowerCase().includes('whatsapp') ||
                lead.lastCallTag?.toLowerCase().includes('respondeu no whatsapp') ||
                lead.lastCallTag?.includes('🔥 Respondeu')
              );
              const hasNyroh = Boolean(lead.publicUrl);
              const naoLidas = Number((lead as any).unreadCount || 0);

              return (
                <div
                  key={lead.id}
                  onClick={() => {
                    setSelectedLeadId(lead.id);
                    if (naoLidas > 0) bumpConversationUnread(lead.id, 0);
                  }}
                  className={`p-3.5 flex items-start gap-3 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-50/70 border-l-4 border-blue-600'
                      : 'hover:bg-neutral-50/80'
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-neutral-200 text-neutral-700 font-bold flex items-center justify-center text-xs">
                      {lead.name.substring(0, 2).toUpperCase()}
                    </div>
                    {naoLidas > 0 ? (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shadow-2xs font-bold">
                        {naoLidas > 99 ? '99+' : naoLidas}
                      </span>
                    ) : hasReplied ? (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px] shadow-2xs font-bold">
                        🔥
                      </span>
                    ) : null}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h4 className={`text-xs truncate ${naoLidas > 0 ? 'font-extrabold text-neutral-900' : 'font-bold text-neutral-900'}`}>
                        {lead.name}
                      </h4>
                      <span className="text-[10px] text-neutral-400 shrink-0 font-mono">
                        {formatarHorario((lead as any).lastMessageAt)}
                      </span>
                    </div>

                    {/* Prévia da ÚLTIMA mensagem, de qualquer lado — antes só mostrava o que o
                        cliente tinha mandado, nunca o que o vendedor respondeu. */}
                    <p className={`text-[11px] truncate mb-1.5 ${naoLidas > 0 ? 'text-neutral-800 font-semibold' : 'text-neutral-500'}`}>
                      {previaDaConversa(lead)}
                    </p>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {hasNyroh && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                          <Globe className="w-2.5 h-2.5" />
                          <span>Site Nyroh</span>
                        </span>
                      )}
                      {lead.niche && (
                        <span className="text-[10px] text-neutral-600 bg-neutral-100 px-1.5 py-0.2 rounded truncate max-w-[120px]">
                          {lead.niche}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {inboxHasMore && (
            <button
              onClick={() => fetchInbox({ append: true })}
              disabled={inboxLoading}
              className="w-full py-3 text-xs font-bold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            >
              {inboxLoading ? 'Carregando…' : 'Carregar conversas anteriores'}
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MIDDLE COLUMN: Interactive Real-Time WhatsApp Chat Interface           */}
      {/* ========================================================================= */}
      <div
        className="flex-1 flex flex-col bg-[#efeae2]/30 min-w-0 h-full relative"
        onDragOver={e => {
          e.preventDefault();
          if (!isDraggingFile) setIsDraggingFile(true);
        }}
        onDragLeave={e => {
          if (e.currentTarget === e.target) setIsDraggingFile(false);
        }}
        onDrop={handleDropFile}
      >
        {isDraggingFile && (
          <div className="absolute inset-0 z-30 bg-emerald-50/90 border-4 border-dashed border-emerald-400 rounded-xl flex items-center justify-center pointer-events-none">
            <p className="text-sm font-bold text-emerald-800">Solte o arquivo para anexar</p>
          </div>
        )}
        {activeLead ? (
          <>
            {/* Chat Header Bar */}
            <div className="px-4 sm:px-5 py-3 bg-white border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs z-10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {activeLead.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm text-neutral-900 truncate">
                      {activeLead.name}
                    </h3>
                    <span className="text-xs text-neutral-500 font-mono">
                      {activeLead.phoneNumber}
                    </span>
                    {windowStatus.isOpen ? (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200" title="Janela de atendimento de 24h oficial aberta">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>{windowStatus.text}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200" title="Janela de 24h expirada. Envie um template pré-aprovado pela Meta para retomar.">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>{windowStatus.text}</span>
                      </span>
                    )}
                  </div>
                  {presenceUsers.length > 0 && (
                    <div
                      className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-300 px-2.5 py-0.5 rounded-full"
                      title="Outro vendedor está com esta conversa aberta agora. Combinem quem responde para o cliente não receber duas respostas."
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      {presenceUsers.some(u => u.typing)
                        ? `${presenceUsers.filter(u => u.typing).map(u => u.name).join(', ')} está digitando…`
                        : `${presenceUsers.map(u => u.name).join(', ')} também está nesta conversa`}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-neutral-500 mt-0.5">
                    <span>Nicho: <strong>{activeLead.niche || 'Geral'}</strong></span>
                    {activeLead.website && (
                      <span>• <a href={activeLead.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Ver Site Atual</a></span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons: Preview Nyroh Site, Quick Replies, Templates, Simulator, Dossier Toggle */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Quick Replies Atalhos Modal Trigger */}
                <button
                  onClick={() => setIsQuickRepliesModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold transition-all border border-neutral-200 shadow-2xs cursor-pointer"
                  title="Gerenciar Respostas Rápidas e Atalhos com '/'"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Atalhos (/)</span>
                </button>
                {activeLead.publicUrl && (
                  <a
                    href={activeLead.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 transition-colors shadow-2xs"
                    title="Abrir prévia do novo site desenvolvido na Nyroh"
                  >
                    <Globe className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Site Nyroh</span>
                    <ExternalLink className="w-3 h-3 text-emerald-500" />
                  </a>
                )}

                {/* Templates Modal Trigger */}
                <button
                  onClick={() => setIsTemplateModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  title="Catálogo de templates aprovados pela Meta"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Templates Oficiais</span>
                </button>

                {/* Simulador: só existe fora de produção (o servidor responde 404 quando desligado) */}
                <div className={`relative group ${runtime.simulatorsEnabled ? '' : 'hidden'}`}>
                  <button
                    disabled={isSimulating}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold border border-amber-300 transition-all shadow-2xs cursor-pointer"
                    title="Simular interações do cliente"
                  >
                    <Flame className="w-3.5 h-3.5 text-amber-600" />
                    <span>{isSimulating ? 'Simulando...' : '⚡ Simular Resposta'}</span>
                  </button>

                  <div className="absolute right-0 mt-1 w-52 bg-white border border-neutral-200 rounded-xl shadow-lg p-1.5 hidden group-hover:block z-30 animate-in fade-in">
                    <button
                      onClick={() => handleSimulateReply('text')}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-800 hover:bg-neutral-100 flex items-center gap-2 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Resposta de Texto (Quente)</span>
                    </button>
                    <button
                      onClick={() => handleSimulateReply('audio')}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-800 hover:bg-neutral-100 flex items-center gap-2 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-blue-600" />
                      <span>Áudio de 14s do Cliente</span>
                    </button>
                    <button
                      onClick={() => handleSimulateReply('optout')}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-700 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5 text-rose-600" />
                      <span>Simular Opt-out (Recusar)</span>
                    </button>
                  </div>
                </div>

                {/* Toggle Dossier Panel */}
                <button
                  onClick={() => setIsDossierOpen(!isDossierOpen)}
                  className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                    isDossierOpen
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-200'
                  }`}
                  title={isDossierOpen ? 'Fechar Dossiê do Lead' : 'Abrir Dossiê do Lead'}
                >
                  <Layers className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Chat Messages Stream */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-[#f0f2f5]/40">
              {/* Histórico: a conversa abre com as últimas mensagens e busca o resto sob demanda */}
              {hasOlderMessages && (
                <div className="flex justify-center mb-2">
                  <button
                    onClick={loadOlderMessages}
                    disabled={loadingOlder}
                    className="px-3 py-1.5 rounded-full bg-white border border-neutral-200 text-[11px] font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 shadow-2xs"
                  >
                    {loadingOlder ? 'Carregando…' : '↑ Carregar mensagens antigas'}
                  </button>
                </div>
              )}

              {/* WhatsApp Encryption & Official Template Notice */}
              <div className="flex justify-center mb-4">
                <div className="max-w-md bg-white/95 border border-neutral-200/90 rounded-xl px-4 py-2.5 text-center shadow-2xs">
                  <div className="flex items-center justify-center gap-1.5 text-neutral-800 font-bold text-xs mb-0.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Conexão Oficial Meta Cloud API (WABA)</span>
                  </div>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">
                    Mensagens criptografadas e entregues ponta a ponta na infraestrutura oficial da Meta.
                  </p>
                </div>
              </div>

              {loadingMessages ? (
                <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                  <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                  <span className="text-xs">Carregando conversa...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center max-w-sm mx-auto">
                  <div className="w-12 h-12 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center text-emerald-600 shadow-2xs mb-3">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-sm text-neutral-800 mb-1">
                    Nenhuma mensagem enviada ainda
                  </h4>
                  <p className="text-xs text-neutral-500 mb-4 leading-relaxed">
                    Para iniciar a conversa, a Meta exige um <strong>modelo aprovado</strong>. Escolha um dos modelos da sua conta.
                  </p>
                  <button
                    onClick={() => setIsTemplateModalOpen(true)}
                    disabled={isSending}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Escolher modelo aprovado</span>
                  </button>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isOut = msg.sender === 'salesperson';
                  const isAudio = msg.isAudio;
                  const isTemplate = Boolean(msg.templateName);
                  const hasMedia = Boolean(msg.mediaUrl);

                  return (
                    <div
                      key={`${msg.id || 'msg'}_${idx}`}
                      className={`flex ${isOut ? 'justify-end' : 'justify-start'} animate-in fade-in duration-100`}
                    >
                      <div
                        className={`max-w-[88%] sm:max-w-md rounded-2xl px-4 py-2.5 shadow-2xs relative ${
                          isOut
                            ? 'bg-[#d9fdd3] text-neutral-900 rounded-tr-none border border-emerald-200/60'
                            : 'bg-white text-neutral-900 rounded-tl-none border border-neutral-200'
                        }`}
                      >
                        {/* Header if template */}
                        {isTemplate && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1 pb-1 border-b border-emerald-300/40">
                            <BadgeCheck className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Template Oficial: {msg.templateName}</span>
                          </div>
                        )}

                        {/* Media presentation (Image or Document) */}
                        {hasMedia && msg.mediaType === 'image' && (
                          <div className="mb-2 rounded-xl overflow-hidden border border-neutral-200/80 max-w-xs">
                            <img
                              src={msg.mediaUrl}
                              alt="Anexo enviado"
                              className="w-full h-auto max-h-56 object-cover"
                            />
                          </div>
                        )}

                        {hasMedia && msg.mediaType === 'video' && (
                          <div className="mb-2 rounded-xl overflow-hidden border border-neutral-200/80 max-w-xs">
                            <video src={msg.mediaUrl} controls preload="metadata" className="w-full h-auto max-h-56" />
                          </div>
                        )}
                        {hasMedia && msg.mediaType === 'document' && (
                          <div className="mb-2 p-2.5 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between gap-2 max-w-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                              <span className="text-xs font-bold text-neutral-800 truncate">
                                {msg.mediaName || 'Documento.pdf'}
                              </span>
                            </div>
                            <a
                              href={msg.mediaUrl}
                              download={msg.mediaName || 'Documento'}
                              className="p-1 rounded-md hover:bg-neutral-200 text-neutral-600 transition-colors"
                              title="Baixar arquivo"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                        )}

                        {/* Voice Note Audio Player or Normal Text */}
                        {isAudio ? (
                          <WhatsAppVoiceAudioPlayer
                            audioUrl={msg.audioUrl}
                            durationSeconds={msg.audioDuration || 12}
                            isOut={isOut}
                            senderName={msg.senderName}
                          />
                        ) : (
                          <p className="text-xs leading-relaxed whitespace-pre-wrap">
                            {msg.text}
                          </p>
                        )}

                        {/* Timestamp & double checkmarks / status indicator */}
                        <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-neutral-400">
                          {(msg as any).sentFromPhone && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded mr-1" title="Mensagem enviada pelo celular do vendedor">
                              📱 Celular
                            </span>
                          )}
                          <span>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isOut && (
                            <>
                              {msg.status === 'read' ? (
                                <span title="Lida pelo lead">
                                  <CheckCheck className="w-3.5 h-3.5 text-blue-500 inline" />
                                </span>
                              ) : msg.status === 'delivered' ? (
                                <span title="Entregue no aparelho">
                                  <CheckCheck className="w-3.5 h-3.5 text-neutral-400 inline" />
                                </span>
                              ) : msg.status === 'sent' ? (
                                <span title="Enviado aos servidores do WhatsApp">
                                  <Check className="w-3.5 h-3.5 text-neutral-400 inline" />
                                </span>
                              ) : msg.status === 'queued' ? (
                                <span className="inline-flex items-center gap-0.5 text-amber-600" title="Aceita na fila da FluxoAPI — aguardando o envio à Meta (ainda NÃO entregue)">
                                  <Clock className="w-3 h-3 inline" />
                                  <span className="text-[9px] font-semibold">na fila</span>
                                </span>
                              ) : msg.status === 'failed' ? (
                                <span className="inline-flex items-center gap-0.5 text-rose-600 font-semibold text-[10px]" title={describeSendError(msg.error) || 'Falha no envio'}>
                                  <AlertCircle className="w-3.5 h-3.5 text-rose-500 inline" />
                                  <span>Não enviada</span>
                                </span>
                              ) : (
                                <span title="Enviando...">
                                  <Clock className="w-3 h-3 text-neutral-400 animate-pulse inline" />
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        {isOut && msg.status === 'failed' && (
                          <div className="mt-1.5 text-[10px] leading-snug text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5">
                            <div>{describeSendError(msg.error) || 'Falha no envio.'}</div>
                            <div className="flex items-center gap-3 mt-1">
                              <button
                                type="button"
                                onClick={() => handleRetryMessage(msg)}
                                disabled={isSending}
                                className="font-bold underline cursor-pointer disabled:opacity-50"
                              >
                                Tentar de novo
                              </button>
                              {(msg.error as any)?.code === 'window_closed' && (
                                <button type="button" onClick={() => setIsTemplateModalOpen(true)} className="font-bold underline cursor-pointer">
                                  Enviar modelo aprovado
                                </button>
                              )}
                            </div>
                          </div>
                        )}                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Template Short Bar */}
            <div className="px-4 py-2 bg-white/95 border-t border-neutral-200 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider hidden sm:inline">
                  Atalhos:
                </span>
                <button
                  onClick={() => setIsTemplateModalOpen(true)}
                  disabled={isSending}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold border border-emerald-200 transition-colors whitespace-nowrap cursor-pointer"
                  title="Enviar um modelo aprovado da sua conta (obrigatório fora da janela de 24h)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Enviar modelo aprovado</span>
                </button>              </div>

              {activeLead.publicUrl && (
                <span className="text-[11px] text-neutral-500 font-mono truncate max-w-xs hidden lg:inline">
                  Site: {activeLead.publicUrl}
                </span>
              )}
            </div>

            {/* Attachment preview if selected */}
            {attachmentPreview && (
              <div className="px-4 py-2 bg-neutral-100 border-t border-neutral-200 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-800 truncate">
                  <Paperclip className="w-4 h-4 text-neutral-500" />
                  <span className="truncate">Anexo pronto: {attachmentPreview.name}</span>
                </div>
                <button
                  onClick={() => setAttachmentPreview(null)}
                  className="p-1 hover:bg-neutral-200 rounded-md text-neutral-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Quick Emojis Bar (Collapsible) */}
            {showEmojiPicker && (
              <div className="px-4 py-2 bg-neutral-50 border-t border-neutral-200 flex items-center gap-2 overflow-x-auto no-scrollbar animate-in slide-in-from-bottom-2">
                {QUICK_EMOJIS.map(em => (
                  <button
                    key={em}
                    onClick={() => {
                      setInputText(prev => prev + em);
                    }}
                    className="p-1.5 hover:bg-white rounded-lg text-lg transition-transform hover:scale-125 cursor-pointer"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            {/* Hidden file input for attachments */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,.pdf,.doc,.docx,.txt"
              className="hidden"
            />

            {/* Message Composer Footer */}
            <div className="relative p-3 bg-white border-t border-neutral-200 shrink-0">
              {/* Floating Quick Replies (/) Autocomplete Popover */}
              {showSlashDropdown && matchingSlashReplies.length > 0 && (
                <div className="absolute bottom-full mb-2 left-4 right-4 max-h-64 overflow-y-auto bg-white border border-neutral-200 rounded-xl shadow-2xl z-50 p-1 divide-y divide-neutral-100 animate-in slide-in-from-bottom-2">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-500 uppercase tracking-wider flex items-center justify-between bg-neutral-50 rounded-t-lg">
                    <span className="flex items-center gap-1.5 text-emerald-800">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      Atalhos Rápidos ({matchingSlashReplies.length})
                    </span>
                    <span className="font-normal text-[10px] text-neutral-400">↑↓ navegar • Enter selecionar • Esc fechar</span>
                  </div>
                  <div className="max-h-52 overflow-y-auto py-1">
                    {matchingSlashReplies.map((r, idx) => (
                      <button
                        key={r.id}
                        type="button"
                        onMouseEnter={() => setSelectedSlashIndex(idx)}
                        onClick={() => handleSelectQuickReply(r)}
                        className={`w-full text-left p-2.5 rounded-lg transition-colors flex items-start justify-between gap-3 cursor-pointer ${
                          idx === selectedSlashIndex ? 'bg-emerald-50 text-emerald-950 border border-emerald-200' : 'hover:bg-neutral-50 text-neutral-800'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-100/70 px-1.5 py-0.5 rounded">
                              {r.shortcut.startsWith('/') ? r.shortcut : `/${r.shortcut}`}
                            </span>
                            <span className="text-xs font-bold truncate">{r.title}</span>
                          </div>
                          <p className="text-[11px] text-neutral-500 line-clamp-1 font-normal">
                            {replaceLeadVariables(r.content, activeLead)}
                          </p>
                        </div>
                        <span className="text-[10px] text-neutral-400 font-mono shrink-0 pt-0.5">↵ Inserir</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                {/* File Attachment Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-xl border border-neutral-200 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-colors cursor-pointer"
                  title="Anexar imagem ou documento PDF"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                {/* Emoji Button */}
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                    showEmojiPicker
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'border-neutral-200 bg-neutral-100 hover:bg-neutral-200 text-neutral-600'
                  }`}
                  title="Inserir emojis rápidos"
                >
                  <Smile className="w-4 h-4" />
                </button>

                {/* Voice Audio Recorder Trigger */}
                {!isRecordingAudio ? (
                  <button
                    type="button"
                    onClick={handleStartVoiceRecord}
                    className="p-2.5 rounded-xl border border-neutral-200 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-all cursor-pointer"
                    title="Gravar mensagem de áudio WhatsApp"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                ) : null}

                {/* Active Audio Recording Bar */}
                {isRecordingAudio ? (
                  <div className="flex-1 flex items-center justify-between px-4 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 animate-in fade-in">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping shrink-0" />
                      <span className="font-bold">Gravando áudio: {formatSeconds(recordingDuration)}</span>

                      {/* Live volume visualizer wave */}
                      <div className="hidden sm:flex items-center gap-0.5 h-4 ml-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(idx => (
                          <span
                            key={idx}
                            className="w-1 bg-rose-500 rounded-full transition-all duration-75"
                            style={{
                              height: `${Math.max(20, Math.min(100, (liveAudioVolume * (idx % 3 + 1)) / 2))}%`
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCancelVoiceRecord}
                        className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-100 transition-colors flex items-center gap-1 font-bold text-xs cursor-pointer"
                        title="Descartar gravação"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Descartar</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSendVoiceRecord}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                        title="Enviar áudio gravado"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Enviar Áudio</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Caixa de texto de VÁRIAS linhas: Shift+Enter quebra linha, Enter envia,
                     a altura cresce com o texto e dá para COLAR imagem direto (Ctrl+V). */
                  <textarea
                    ref={inputTextareaRef}
                    rows={1}
                    value={inputText}
                    onPaste={handlePasteIntoInput}
                    onChange={e => {
                      const val = e.target.value;
                      setInputText(val);
                      if (val.trim()) notifyTyping();
                      const slashMatch = val.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);
                      if (slashMatch) {
                        setSlashQuery(slashMatch[1]);
                        setShowSlashDropdown(true);
                        setSelectedSlashIndex(0);
                      } else {
                        setShowSlashDropdown(false);
                      }
                    }}
                    onKeyDown={e => {
                      if (showSlashDropdown && matchingSlashReplies.length > 0) {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setSelectedSlashIndex(prev => (prev + 1) % matchingSlashReplies.length);
                          return;
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setSelectedSlashIndex(prev => (prev - 1 + matchingSlashReplies.length) % matchingSlashReplies.length);
                          return;
                        }
                        if (e.key === 'Enter' || e.key === 'Tab') {
                          e.preventDefault();
                          const selected = matchingSlashReplies[selectedSlashIndex];
                          if (selected) {
                            handleSelectQuickReply(selected);
                          }
                          return;
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setShowSlashDropdown(false);
                          return;
                        }
                      }

                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={`Mensagem para ${activeLead.name}... (Shift+Enter quebra linha, / para atalhos)`}
                    className="flex-1 px-4 py-2.5 bg-neutral-100 focus:bg-white border border-transparent focus:border-neutral-300 rounded-xl text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none transition-all resize-none max-h-40 leading-relaxed"
                  />
                )}

                {/* Send Button */}
                {!isRecordingAudio && (
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={(!inputText.trim() && !attachmentPreview) || isSending}
                    className={`p-2.5 rounded-xl flex items-center justify-center font-bold text-white transition-all shadow-2xs ${
                      (inputText.trim() || attachmentPreview) && !isSending
                        ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
                        : 'bg-neutral-300 cursor-not-allowed'
                    }`}
                    title="Enviar mensagem (Enter)"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-neutral-400">
            <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
            <h4 className="font-bold text-sm text-neutral-700 mb-1">
              Selecione um lead para abrir a conversa
            </h4>
            <p className="text-xs text-neutral-500 max-w-sm">
              Gerencie a conversa com cada decisor via Meta Cloud API em tempo real com áudio, templates e fechamento direto no CRM.
            </p>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. RIGHT COLUMN: Collapsible Lead Dossier & CRM Pipeline Actions           */}
      {/* ========================================================================= */}
      {isDossierOpen && activeLead && (
        <div className="w-full xl:w-80 bg-white border-t xl:border-t-0 xl:border-l border-neutral-200 flex flex-col shrink-0 h-full overflow-y-auto animate-in slide-in-from-right-4 duration-150">
          {/* Header */}
          <div className="p-4 border-b border-neutral-200 bg-neutral-50/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-neutral-700" />
              <h3 className="font-bold text-xs text-neutral-900 uppercase tracking-wider">
                Dossiê & Fechamento
              </h3>
            </div>
            <button
              onClick={() => setIsDossierOpen(false)}
              className="p-1 text-neutral-400 hover:text-neutral-700 rounded-md cursor-pointer"
              title="Fechar painel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Transferir conversa e marcar como resolvida */}
          <div className="p-4 border-b border-neutral-100 space-y-2.5">
            <div>
              <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Passar a conversa para</label>
              <select
                value=""
                onChange={e => {
                  if (e.target.value) transferirConversa(e.target.value);
                  e.target.value = '';
                }}
                className="mt-1 w-full px-2.5 py-1.5 border border-neutral-300 rounded-lg text-[11px] text-neutral-800 bg-white focus:outline-none focus:border-neutral-500"
              >
                <option value="">Escolher vendedor…</option>
                {salespeople
                  .filter(v => v.id !== (activeLead as any).salespersonId)
                  .map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
              </select>
              <p className="mt-1 text-[10px] text-neutral-500">
                Agora com {(activeLead as any).salespersonName || 'ninguém'}.
              </p>
            </div>

            <button
              onClick={alternarResolvida}
              className={`w-full py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                (activeLead as any).resolvedAt
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              {(activeLead as any).resolvedAt ? '✓ Resolvida — reabrir' : 'Marcar como resolvida'}
            </button>
          </div>

          {/* Notas internas: a equipe vê, o cliente nunca */}
          <div className="p-4 border-b border-neutral-100">
            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
              Notas internas (o cliente não vê)
            </label>
            <div className="mt-1.5 flex gap-1.5">
              <input
                type="text"
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    salvarNota();
                  }
                }}
                placeholder="Ex.: pediu para ligar depois das 18h"
                className="flex-1 px-2.5 py-1.5 bg-amber-50/70 border border-amber-200 focus:border-amber-400 rounded-lg text-[11px] text-neutral-800 placeholder-neutral-400 focus:outline-none"
              />
              <button
                onClick={salvarNota}
                disabled={!noteDraft.trim() || savingNote}
                className="px-2.5 rounded-lg bg-neutral-900 text-white text-[11px] font-bold disabled:bg-neutral-300"
              >
                {savingNote ? '…' : 'Salvar'}
              </button>
            </div>
            {notes.length > 0 && (
              <ul className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                {notes.map(n => (
                  <li key={n.id} className="bg-amber-50/60 border border-amber-100 rounded-lg px-2.5 py-1.5">
                    <p className="text-[11px] text-neutral-800 whitespace-pre-wrap break-words">{n.text}</p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">
                      {n.authorName} · {formatarHorario(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Lead Summary */}
          <div className="p-4 border-b border-neutral-100 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-neutral-900 text-white flex items-center justify-center font-bold text-sm shadow-2xs">
                {activeLead.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-sm text-neutral-900 truncate">
                  {activeLead.name}
                </h4>
                <p className="text-xs text-neutral-500 font-mono">
                  {activeLead.phoneNumber}
                </p>
                <span className="inline-block mt-0.5 text-[10px] font-semibold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-full">
                  {activeLead.niche || 'Comércio & Serviços'}
                </span>
              </div>
            </div>

            {/* Pipeline Stage Quick Changer */}
            <div className="pt-2">
              <label className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
                Etapa do Funil (Kanban):
              </label>
              <select
                value={activeLead.columnStatus}
                onChange={(e) => onUpdateLeadColumn?.(activeLead.id, e.target.value)}
                className="w-full px-3 py-2 bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-900 focus:outline-none focus:border-emerald-500"
              >
                {PIPELINE_COLUMNS.map(col => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Direct Actions */}
          <div className="p-4 border-b border-neutral-100 space-y-2">
            <label className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider mb-1">
              Canais Diretos:
            </label>

            {/* Open WhatsApp Web Native */}
            <a
              href={`https://api.whatsapp.com/send?phone=${activeLead.phoneNumber.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <span>Abrir no App WhatsApp</span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-emerald-500" />
            </a>

            {/* Phone Call */}
            <a
              href={`tel:${activeLead.phoneNumber.replace(/\D/g, '')}`}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold border border-neutral-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-neutral-600" />
                <span>Discar via Telefone</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
            </a>

            {/* Nyroh Generated Site Link */}
            {activeLead.publicUrl && (
              <a
                href={activeLead.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold border border-blue-200 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <span>Novo Site da Nyroh</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
              </a>
            )}
          </div>

          {/* Lead Information Attributes */}
          <div className="p-4 space-y-3 flex-1 text-xs">
            <h5 className="font-bold text-[11px] text-neutral-400 uppercase tracking-wider">
              Dados Cadastrais
            </h5>

            <div className="space-y-2 text-neutral-600">
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-400">ID do Lead:</span>
                <span className="font-mono text-neutral-800 text-[11px]">{activeLead.id}</span>
              </div>

              {activeLead.city && (
                <div className="flex justify-between py-1 border-b border-neutral-100">
                  <span className="text-neutral-400">Cidade:</span>
                  <span className="font-medium text-neutral-800">{activeLead.city}</span>
                </div>
              )}

              {activeLead.website && (
                <div className="py-1 border-b border-neutral-100">
                  <span className="text-neutral-400 block mb-0.5">Website Legado:</span>
                  <a href={activeLead.website} target="_blank" rel="noreferrer" className="text-blue-600 font-mono text-[11px] hover:underline truncate block">
                    {activeLead.website}
                  </a>
                </div>
              )}

              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-400">Total Ligações:</span>
                <span className="font-bold text-neutral-800">{activeLead.callCount || 0}</span>
              </div>

              {activeLead.lastCallTag && (
                <div className="py-1">
                  <span className="text-neutral-400 block mb-1">Última Tag:</span>
                  <span className="inline-block px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-800 font-semibold text-[11px]">
                    {activeLead.lastCallTag}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL: Meta Cloud API Official Templates Selector                      */}
      {/* ========================================================================= */}
      {isTemplateModalOpen && activeLead && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-neutral-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-neutral-900">
                  Templates Oficiais Meta Cloud API
                </h3>
              </div>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Modelos <strong>aprovados na sua conta</strong>. O sistema preenche {'{{1}}'} com o primeiro nome do cliente,
                  {' {{2}}'} com o link do site Nyroh e {' {{3}}'} com o seu nome. Fora da janela de 24h, modelo é o único caminho (e é cobrado pela Meta).
                </p>
                <button
                  type="button"
                  onClick={() => loadTemplateCatalog(true)}
                  className="shrink-0 p-1.5 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-100 cursor-pointer"
                  title="Recarregar modelos da Meta"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${catalogLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {catalogError && (
                <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-[11px] text-amber-900">{catalogError}</div>
              )}
              {!catalogLoading && !catalogError && catalogTemplates.length === 0 && (
                <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 text-[11px] text-neutral-600">
                  Nenhum modelo aprovado encontrado na sua conta. Crie e aprove um modelo no painel da FluxoAPI (ou na tela Admin → WhatsApp).
                </div>
              )}

              <div className="space-y-2.5">
                {catalogTemplates.map(tpl => {
                  const isSelected = selectedTemplate?.name === tpl.name;
                  return (
                    <div
                      key={`${tpl.name}_${tpl.language}`}
                      onClick={() => setSelectedTemplate(tpl)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                          : 'border-neutral-200 hover:border-neutral-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                          {tpl.category}
                        </span>
                        <span className="text-[10px] font-mono text-neutral-400">
                          {tpl.name}
                        </span>
                      </div>
                      <h4 className="font-bold text-xs text-neutral-900 mb-1">
                        {tpl.label}
                      </h4>
                      <p className="text-[11px] text-neutral-500 mb-2">
                        {tpl.description}
                      </p>
                      {!tpl.sendable && (
                        <p className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-1">
                          Este modelo exige campos que o chat não preenche ({tpl.extraRequired.join(', ') || 'bloqueado na Meta'}). Use-o pela tela de Disparos.
                        </p>
                      )}

                      {isSelected && (
                        <div className="mt-2.5 p-3 rounded-lg bg-white border border-emerald-200/80 text-[11px] text-neutral-800 whitespace-pre-wrap leading-relaxed">
                          {tpl.getText(activeLead, activeSalesperson?.name || 'Thomas')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between">
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-600 hover:bg-neutral-200/60 transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                onClick={() => handleSendMetaTemplate(selectedTemplate)}
                disabled={isSending || !selectedTemplate || !selectedTemplate.sendable}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSending ? 'Enviando...' : selectedTemplate ? `Enviar "${selectedTemplate.label}"` : 'Escolha um modelo'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Replies Modal */}
      <QuickRepliesModal
        isOpen={isQuickRepliesModalOpen}
        onClose={() => {
          setIsQuickRepliesModalOpen(false);
          fetchQuickReplies();
        }}
        activeSalesperson={activeSalesperson}
        onShowToast={onShowToast}
        onSelectReply={(content) => {
          setInputText(replaceLeadVariables(content, activeLead));
        }}
      />
    </div>
  );
};
