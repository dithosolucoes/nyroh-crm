import { apiFetch } from '../../api/client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MessageSquare, Send, Phone, ExternalLink, Globe, Search, Sparkles, Flame, Clock, CheckCheck, Check, User, ShieldCheck, RefreshCw, AlertCircle, Paperclip, Smile, Mic, Trash2, Filter, BadgeCheck, X, ChevronRight, FileText, Download, Layers, Zap } from 'lucide-react';
import { InboxConversation, InboxPage, Lead, LeadChatMessage, Salesperson, PIPELINE_COLUMNS } from '@shared/types';
import { WhatsAppVoiceAudioPlayer } from '../../components/WhatsAppVoiceAudioPlayer';
import { useRuntimeConfig, formatInstancePhone } from '@shared/lib/useRuntimeConfig';
import { onRealtime, onRealtimeConnection } from '@shared/lib/realtime';
import type { RespostaEnviarMensagem, RespostaSessaoAtual, RespostaListaNotas, RespostaListaRespostasRapidas, RespostaRapida } from '@shared/contracts/rotas';
import { QuickRepliesModal } from '../../components/QuickRepliesModal';
import { arePhonesEquivalent } from '@shared/lib/phone';
import { shouldApplyStatus, statusRank } from '@shared/lib/fluxoStatus';

import { ThomasWhatsAppDesktopViewProps, newClientMessageId, describeSendError, MetaTemplateOption, catalogToOption, playNotificationChime } from './base';

export function useThomasDesktop({ leads, onUpdateLeadColumn, onShowToast, activeSalesperson, initialLeadId }: ThomasWhatsAppDesktopViewProps) {
  const [selectedLeadId, setSelectedLeadId] = useState<string>(initialLeadId || leads[0]?.id || '');
  // Estado REAL do servidor: se a instância está mesmo conectada e se as rotas de teste existem.
  const runtime = useRuntimeConfig();
  const [currentUser, setCurrentUser] = useState<{ role?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch('/api/auth/me')
      .then(r => (r.ok ? (r.json() as Promise<RespostaSessaoAtual>) : null))
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
      const res = await apiFetch(`/api/whatsapp/fluxo-templates${refresh ? '?refresh=1' : ''}`);
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
  const [quickReplies, setQuickReplies] = useState<RespostaRapida[]>([]);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState<number>(0);
  const [showSlashDropdown, setShowSlashDropdown] = useState<boolean>(false);
  const [slashQuery, setSlashQuery] = useState<string>('');

  const fetchQuickReplies = async () => {
    try {
      const res = await apiFetch('/api/quick-replies');
      if (res.ok) {
        const data = (await res.json()) as RespostaListaRespostasRapidas;
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

      const res = await apiFetch(`/api/inbox?${params.toString()}`);
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
  const handleSelectQuickReply = (qr: RespostaRapida) => {
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
      const res = await apiFetch(`/api/leads/${leadId}/messages?before=${encodeURIComponent(olderCursor)}`);
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
        const r = await apiFetch(`/api/messages/search?q=${encodeURIComponent(termo)}`);
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
    apiFetch('/api/salespeople')
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
      const r = await apiFetch(`/api/leads/${leadId}/notes`);
      if (r.ok && leadId === openLeadIdRef.current) setNotes(((await r.json()) as RespostaListaNotas).notes || []);
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
      const r = await apiFetch(`/api/leads/${leadId}/notes`, {
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
      const r = await apiFetch(`/api/leads/${lead.id}/assign`, {
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
      const r = await apiFetch(`/api/leads/${lead.id}/resolve`, {
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
      const res = await apiFetch(`/api/leads/${leadId}/messages`);
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
    apiFetch(`/api/leads/${encodeURIComponent(leadId)}/read`, { method: 'POST' }).catch(() => {});
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
    return apiFetch(`/api/leads/${encodeURIComponent(leadId)}/presence`, {
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
    const res = await apiFetch(`/api/leads/${encodeURIComponent(lead.id)}/messages`, {
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
      data = (await res.json()) as RespostaEnviarMensagem;
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
      const res = await apiFetch(`/api/leads/${activeLead.id}/simulate-reply`, {
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

  return {
    leads,
    onUpdateLeadColumn,
    onShowToast,
    activeSalesperson,
    initialLeadId,
    selectedLeadId,
    setSelectedLeadId,
    runtime,
    currentUser,
    setCurrentUser,
    isAdminUser,
    searchQuery,
    setSearchQuery,
    filterType,
    setFilterType,
    messages,
    setMessages,
    inputText,
    setInputText,
    loadingMessages,
    setLoadingMessages,
    isSending,
    setIsSending,
    isSimulating,
    setIsSimulating,
    realtimeActive,
    setRealtimeActive,
    serverWindowExpiresAt,
    setServerWindowExpiresAt,
    presenceUsers,
    setPresenceUsers,
    myUserIdRef,
    lastTypingPingRef,
    isRecordingAudio,
    setIsRecordingAudio,
    recordingDuration,
    setRecordingDuration,
    micDenied,
    setMicDenied,
    liveAudioVolume,
    setLiveAudioVolume,
    isTemplateModalOpen,
    setIsTemplateModalOpen,
    catalogTemplates,
    setCatalogTemplates,
    catalogError,
    setCatalogError,
    catalogLoading,
    setCatalogLoading,
    selectedTemplate,
    setSelectedTemplate,
    loadTemplateCatalog,
    isDossierOpen,
    setIsDossierOpen,
    showEmojiPicker,
    setShowEmojiPicker,
    attachmentPreview,
    setAttachmentPreview,
    isQuickRepliesModalOpen,
    setIsQuickRepliesModalOpen,
    quickReplies,
    setQuickReplies,
    selectedSlashIndex,
    setSelectedSlashIndex,
    showSlashDropdown,
    setShowSlashDropdown,
    slashQuery,
    setSlashQuery,
    fetchQuickReplies,
    messagesEndRef,
    audioIntervalRef,
    mediaRecorderRef,
    audioChunksRef,
    audioStreamRef,
    audioAnalyserRef,
    audioCtxRef,
    animFrameRef,
    fileInputRef,
    inbox,
    setInbox,
    inboxCursor,
    setInboxCursor,
    inboxHasMore,
    setInboxHasMore,
    inboxLoading,
    setInboxLoading,
    inboxRequestRef,
    serverFilter,
    fetchInbox,
    inputTextareaRef,
    formatarHorario,
    previaDaConversa,
    bumpConversationUnread,
    inboxIdsRef,
    inboxUnreadRef,
    bumpConversation,
    filteredLeads,
    totalNaoLidas,
    activeLead,
    replaceLeadVariables,
    matchingSlashReplies,
    handleSelectQuickReply,
    windowStatus,
    lastMessageListSignature,
    prevLeadIdRef,
    prevMessagesLengthRef,
    openLeadIdRef,
    hasOlderMessages,
    setHasOlderMessages,
    olderCursor,
    setOlderCursor,
    loadingOlder,
    setLoadingOlder,
    loadOlderMessages,
    messageSearch,
    setMessageSearch,
    messageResults,
    setMessageResults,
    searchingMessages,
    setSearchingMessages,
    salespeople,
    setSalespeople,
    notes,
    setNotes,
    noteDraft,
    setNoteDraft,
    savingNote,
    setSavingNote,
    carregarNotas,
    salvarNota,
    transferirConversa,
    alternarResolvida,
    fetchMessages,
    activeLeadRef,
    onShowToastRef,
    onUpdateLeadColumnRef,
    fetchMessagesRef,
    bumpConversationRef,
    refreshInboxRef,
    upsertMessage,
    markConversationRead,
    sendPresence,
    notifyTyping,
    postLeadMessage,
    reportSendFailure,
    handleSendMessage,
    handleRetryMessage,
    handleStartVoiceRecord,
    handleCancelVoiceRecord,
    handleSendVoiceRecord,
    dispatchAudioMessage,
    handleSendMetaTemplate,
    handleSimulateReply,
    handleFileSelect,
    attachFile,
    handlePasteIntoInput,
    isDraggingFile,
    setIsDraggingFile,
    handleDropFile,
    formatSeconds,
  };
}

export type DesktopVM = ReturnType<typeof useThomasDesktop>;
