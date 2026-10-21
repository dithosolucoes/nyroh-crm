import React, { useState, useEffect, useRef } from 'react';
import { Lead, CallLog, CustomTag, PIPELINE_COLUMNS, ColumnStatus, Salesperson, User as UserType, MasterColumnId } from '../types';
import { 
  X, Phone, ExternalLink, Calendar, MessageSquare, Plus, CheckCircle2, 
  QrCode, Tag as TagIcon, Play, Pause, RotateCcw, Clock, ArrowRight, PhoneCall, PhoneOff,
  CalendarClock, AlertTriangle, Bell, User, Sparkles, ChevronRight, Zap, History, Briefcase,
  Inbox, Star, Trophy, XCircle, Trash2, Globe, Copy, Check, FileSearch, Download, Pencil
} from 'lucide-react';
import { openWhatsApp, getStoredWhatsAppAppType, setStoredWhatsAppAppType, WhatsAppAppType, getDialerTelLink, getStoredWhatsAppTemplate, formatWhatsAppMessage } from '../lib/phone';
import { QrCodeModal } from './QrCodeModal';
import { AuditReportModal } from './AuditReportModal';
import { WebsiteAuditReport } from '../types/audit';
import { getFollowUpInfo } from '../lib/followUp';
import { getLeadNiche } from '../lib/niche';
import { 
  MASTER_COLUMNS_CONFIG, 
  MASTER_COLUMNS_ORDER, 
  getMasterColumn, 
  resolveTargetColumnStatus 
} from '../lib/pipeline';

interface LeadDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
  allLeads?: Lead[];
  onSelectLead?: (lead: Lead) => void;
  tags: CustomTag[];
  salespeople?: Salesperson[];
  currentUser?: UserType;
  onOpenTagsModal: () => void;
  onAddCallLog: (leadId: string, tag: string, comment: string, durationSeconds?: number, followUpAt?: string) => Promise<void>;
  onUpdateColumn: (leadId: string, newColumn: ColumnStatus) => Promise<void>;
  onReassignLead?: (leadId: string, salespersonId: string, salespersonName: string) => Promise<void>;
  onDeleteLead?: (leadId: string) => Promise<void> | void;
  onRefreshData?: () => void;
  onShowToast: (msg: string) => void;
}

export const formatDuration = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return '00s';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${String(secs).padStart(2, '0')}s`;
};

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({
  isOpen,
  onClose,
  lead,
  allLeads = [],
  onSelectLead,
  tags,
  salespeople = [],
  currentUser,
  onOpenTagsModal,
  onAddCallLog,
  onUpdateColumn,
  onReassignLead,
  onDeleteLead,
  onRefreshData,
  onShowToast
}) => {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [selectedColumn, setSelectedColumn] = useState<ColumnStatus>('Leads');
  const [subStatus, setSubStatus] = useState<string>('Contato Feito');
  const [lossReason, setLossReason] = useState<string>('Sem Interesse');
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [submittingCall, setSubmittingCall] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [autoDialOnNext, setAutoDialOnNext] = useState(true);

  // Website inline editing states
  const [isEditingWebsite, setIsEditingWebsite] = useState(false);
  const [websiteDraft, setWebsiteDraft] = useState(lead?.website || '');
  const [isSavingWebsite, setIsSavingWebsite] = useState(false);

  // Sync website draft when active lead changes
  useEffect(() => {
    setWebsiteDraft(lead?.website || '');
    setIsEditingWebsite(false);
  }, [lead?.id, lead?.website]);

  const handleSaveWebsite = async () => {
    if (!lead) return;
    setIsSavingWebsite(true);
    try {
      let clean = websiteDraft.trim();
      if (clean && !clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = `https://${clean}`;
      }
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website: clean })
      });
      if (res.ok) {
        lead.website = clean;
        onShowToast(clean ? 'Site antigo atualizado com sucesso!' : 'Site antigo removido.');
        setIsEditingWebsite(false);
        if (onRefreshData) onRefreshData();
      } else {
        onShowToast('Erro ao salvar site antigo.');
      }
    } catch (e) {
      onShowToast('Falha na comunicação com o servidor.');
    } finally {
      setIsSavingWebsite(false);
    }
  };

  // Timer states
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [accumulatedSeconds, setAccumulatedSeconds] = useState(0);

  // Follow-up state
  const [followUpDateTime, setFollowUpDateTime] = useState<string>('');

  // Active lead ID tracker to detect automated transitions
  const lastLeadIdRef = useRef<string | null>(null);

  // Website Audit States
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditReport, setAuditReport] = useState<WebsiteAuditReport | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Verifica rigorosamente se o cliente possui site antigo válido para auditoria
  const hasOldWebsite = Boolean(
    lead?.website && 
    typeof lead.website === 'string' &&
    lead.website.trim().length > 0 &&
    !['não informado', 'nao informado', 'sem site', 'nenhum', 'null', 'undefined', '-', 'n/a', 'nenhum site', 'sem website'].includes(lead.website.trim().toLowerCase())
  );

  // Vendedor associado (logado ou atribuído ao lead)
  const currentSeller = salespeople.find(s => s.id === currentUser?.salespersonId) ||
                        salespeople.find(s => s.email?.toLowerCase() === currentUser?.email?.toLowerCase()) ||
                        salespeople.find(s => s.id === lead?.salespersonId);

  // O Admin sempre tem acesso; vendedores respeitam o controle definido pelo Admin
  const canPerformAudit = currentUser?.role === 'admin' || (currentSeller ? currentSeller.canGenerateAuditPdf !== false : true);

  // O botão de laudo só deve aparecer se o cliente possuir site antigo E se o usuário estiver autorizado
  const showAuditButton = hasOldWebsite && canPerformAudit;

  const handleOpenAuditModal = async () => {
    if (!lead) return;
    if (!hasOldWebsite) {
      onShowToast('Este cliente não possui site antigo cadastrado para auditar.');
      return;
    }
    setIsAuditModalOpen(true);
    if (!auditReport || auditReport.leadId !== lead.id) {
      await fetchWebsiteAudit(lead.id);
    }
  };

  const fetchWebsiteAudit = async (leadId: string) => {
    setLoadingAudit(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditReport(data);
      } else {
        onShowToast('Não foi possível auditar o site do cliente.');
      }
    } catch (err) {
      console.error('Erro na auditoria do site:', err);
      onShowToast('Falha na conexão de auditoria.');
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (tags.length > 0 && selectedTags.length === 0) {
      setSelectedTags([tags[0].name]);
    }
  }, [tags]);

  // Reset / initialize state when lead changes
  useEffect(() => {
    if (lead) {
      setSelectedColumn(lead.columnStatus);
      setSubStatus(lead.subStatus || 'Contato Feito');
      setLossReason(lead.lossReason || 'Sem Interesse');
      fetchCallHistory(lead.id);
      setComment('');
      setFollowUpDateTime('');

      // Clean default tag for THIS lead
      if (tags.length > 0) {
        setSelectedTags([tags[0].name]);
      } else {
        setSelectedTags([]);
      }

      // Check if this transition was marked for auto-dial/auto-start
      const autoDialPayload = localStorage.getItem(`crm_autodial_${lead.id}`);
      const savedTimer = localStorage.getItem(`crm_timer_${lead.id}`);

      if (autoDialPayload) {
        // Auto-started transition from "Próximo Lead"
        localStorage.removeItem(`crm_autodial_${lead.id}`);
        const now = Date.now();
        setCallStartTime(now);
        setAccumulatedSeconds(0);
        setTimerSeconds(0);
        setIsTimerRunning(true);

        localStorage.setItem(`crm_timer_${lead.id}`, JSON.stringify({
          startTime: now,
          accum: 0,
          isRunning: true
        }));

        // Advance column if needed
        const nextCol = getNextColumnForStartCall(lead.columnStatus);
        if (nextCol !== lead.columnStatus) {
          setSelectedColumn(nextCol);
        }

        // Auto-trigger mobile phone call
        if (lead.phoneNumber) {
          window.location.href = getDialerTelLink(lead.phoneNumber);
        }
      } else if (savedTimer) {
        try {
          const { startTime, accum, isRunning } = JSON.parse(savedTimer);
          setCallStartTime(startTime);
          setAccumulatedSeconds(accum || 0);
          setIsTimerRunning(Boolean(isRunning));

          if (isRunning && startTime) {
            const currentSec = (accum || 0) + Math.floor((Date.now() - startTime) / 1000);
            setTimerSeconds(currentSec);
          } else {
            setTimerSeconds(accum || 0);
          }
        } catch (e) {
          setCallStartTime(null);
          setAccumulatedSeconds(0);
          setTimerSeconds(0);
          setIsTimerRunning(false);
        }
      } else {
        setCallStartTime(null);
        setAccumulatedSeconds(0);
        setTimerSeconds(0);
        setIsTimerRunning(false);
      }

      lastLeadIdRef.current = lead.id;
    }
  }, [lead?.id]);

  // Real-time Timer Ticker
  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning && callStartTime) {
      interval = setInterval(() => {
        const liveSeconds = accumulatedSeconds + Math.floor((Date.now() - callStartTime) / 1000);
        setTimerSeconds(liveSeconds);
      }, 250);
    } else {
      setTimerSeconds(accumulatedSeconds);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, callStartTime, accumulatedSeconds]);

  const fetchCallHistory = async (leadId: string) => {
    setLoadingCalls(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/calls`);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        setCalls(data);
      }
    } catch (err) {
      console.error('Erro ao buscar ligações:', err);
    } finally {
      setLoadingCalls(false);
    }
  };

  if (!isOpen || !lead) return null;

  // Compute next lead in queue
  const currentLeadIndex = allLeads.findIndex((l) => l.id === lead.id);
  const nextLead = currentLeadIndex >= 0 && currentLeadIndex < allLeads.length - 1 ? allLeads[currentLeadIndex + 1] : null;

  const getNextColumnForStartCall = (currentCol: ColumnStatus): ColumnStatus => {
    if (currentCol === 'Leads') return 'Ligação 1';
    if (currentCol === 'Ligação 1') return 'Ligação 2';
    if (currentCol === 'Ligação 2') return 'Ligação 3';
    if (currentCol === 'Ligação 3') return 'Ligação 4';
    return currentCol;
  };

  const handleStartCall = (triggerDial = true) => {
    const now = Date.now();
    setCallStartTime(now);
    setIsTimerRunning(true);

    if (lead) {
      localStorage.setItem(`crm_timer_${lead.id}`, JSON.stringify({
        startTime: now,
        accum: accumulatedSeconds,
        isRunning: true
      }));
    }

    const nextCol = getNextColumnForStartCall(selectedColumn);
    if (nextCol !== selectedColumn) {
      setSelectedColumn(nextCol);
      onShowToast(`Chamada iniciada! Etapa avançada para "${nextCol}".`);
    } else {
      onShowToast('Cronômetro de ligação iniciado!');
    }

    // Auto-dial no celular com o 0 na frente
    if (triggerDial && lead?.phoneNumber) {
      window.location.href = getDialerTelLink(lead.phoneNumber);
    }
  };

  const handlePauseTimer = () => {
    if (isTimerRunning && callStartTime) {
      const added = Math.floor((Date.now() - callStartTime) / 1000);
      const newAccum = accumulatedSeconds + added;
      setAccumulatedSeconds(newAccum);
      setTimerSeconds(newAccum);
      setCallStartTime(null);
      setIsTimerRunning(false);

      if (lead) {
        localStorage.setItem(`crm_timer_${lead.id}`, JSON.stringify({
          startTime: null,
          accum: newAccum,
          isRunning: false
        }));
      }
    } else {
      setIsTimerRunning(false);
    }
  };

  const handleResetTimer = () => {
    setIsTimerRunning(false);
    setCallStartTime(null);
    setAccumulatedSeconds(0);
    setTimerSeconds(0);
    if (lead) {
      localStorage.removeItem(`crm_timer_${lead.id}`);
      localStorage.removeItem(`crm_autodial_${lead.id}`);
    }
  };

  const setPresetFollowUp = (preset: '1h' | '1d' | '2d' | '1w' | 'today17' | 'tomorrow9') => {
    const d = new Date();
    if (preset === '1h') {
      d.setHours(d.getHours() + 1);
    } else if (preset === 'today17') {
      d.setHours(17, 0, 0, 0);
    } else if (preset === '1d') {
      d.setDate(d.getDate() + 1);
    } else if (preset === 'tomorrow9') {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    } else if (preset === '2d') {
      d.setDate(d.getDate() + 2);
    } else if (preset === '1w') {
      d.setDate(d.getDate() + 7);
    }
    
    const tzOffset = d.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
    setFollowUpDateTime(localISOTime);
  };

  const handleToggleTag = (tagName: string) => {
    if (selectedTags.includes(tagName)) {
      if (selectedTags.length > 1) {
        setSelectedTags(selectedTags.filter((t) => t !== tagName));
      } else {
        onShowToast('Selecione pelo menos uma etiqueta.');
      }
    } else {
      setSelectedTags([...selectedTags, tagName]);
    }
  };

  const saveCallLog = async (closeModalAfter = true, advanceToNext = false) => {
    if (!lead) return;

    const tagToUse = selectedTags.length > 0 ? selectedTags.join(', ') : (tags[0]?.name || 'Atendeu');
    
    // Cálculo de Duração Exata com base no Timestamp de Início (Clock do Sistema)
    let finalDuration = accumulatedSeconds;
    if (isTimerRunning && callStartTime) {
      finalDuration += Math.floor((Date.now() - callStartTime) / 1000);
    }
    if (finalDuration < 0) finalDuration = 0;

    const finalFollowUp = followUpDateTime ? new Date(followUpDateTime).toISOString() : undefined;

    setSubmittingCall(true);
    try {
      await onAddCallLog(lead.id, tagToUse, comment, finalDuration, finalFollowUp);
      
      // Update pipeline column if changed
      if (selectedColumn !== lead.columnStatus) {
        await onUpdateColumn(lead.id, selectedColumn);
      }

      const formattedTime = formatDuration(finalDuration);

      if (advanceToNext && nextLead && onSelectLead) {
        onShowToast(`Ligação salva (${formattedTime})! Discaremos para "${nextLead.name}" agora...`);
        localStorage.removeItem(`crm_timer_${lead.id}`);
        localStorage.removeItem(`crm_autodial_${lead.id}`);

        // Set auto-dial trigger for the next lead
        if (autoDialOnNext) {
          localStorage.setItem(`crm_autodial_${nextLead.id}`, 'true');
        }

        onSelectLead(nextLead);
      } else {
        onShowToast(`Ligação registrada com sucesso! Duração: ${formattedTime}`);
        await fetchCallHistory(lead.id);
        localStorage.removeItem(`crm_timer_${lead.id}`);
        localStorage.removeItem(`crm_autodial_${lead.id}`);
        setCallStartTime(null);
        setAccumulatedSeconds(0);
        setIsTimerRunning(false);
        setTimerSeconds(0);
        setComment('');
        setFollowUpDateTime('');
        if (closeModalAfter) {
          onClose();
        }
      }
    } catch (err) {
      console.error(err);
      onShowToast('Erro ao salvar ligação.');
    } finally {
      setSubmittingCall(false);
    }
  };

  const handleSubmitCallForm = (e: React.FormEvent) => {
    e.preventDefault();
    saveCallLog(false, false);
  };

  const handleColumnChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCol = e.target.value as ColumnStatus;
    setSelectedColumn(newCol);
    if (lead && newCol !== lead.columnStatus) {
      await onUpdateColumn(lead.id, newCol);
      onShowToast(`Estágio alterado para "${newCol}"`);
    }
  };

  const getTagStyle = (tagName: string) => {
    const found = tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
    if (found) {
      return { color: found.color, backgroundColor: found.bgColor };
    }
    return { color: '#374151', backgroundColor: '#f3f4f6' };
  };

  // Format MM:SS for display
  const displayMins = Math.floor(timerSeconds / 60);
  const displaySecs = timerSeconds % 60;
  const formattedClock = `${String(displayMins).padStart(2, '0')}:${String(displaySecs).padStart(2, '0')}`;

  return (
    <>
      <div 
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 overflow-hidden animate-in fade-in duration-150"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div 
          className="bg-white w-full sm:max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[92vh] rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-neutral-200 flex flex-col relative overflow-hidden transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ========================================================= */}
          {/* 1. TOP HEADER (100% FIXO - NUNCA SOME NO SCROLL)          */}
          {/* ========================================================= */}
          <header className="bg-white border-b border-neutral-200 px-3.5 sm:px-5 py-3 shrink-0 z-20 shadow-2xs">
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                {/* Top badges */}
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  {allLeads.length > 0 && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      Lead {currentLeadIndex + 1} de {allLeads.length}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                    ID: {lead.id}
                  </span>
                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                    Etapa: {selectedColumn}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    <Briefcase className="w-2.5 h-2.5 text-amber-600" />
                    <span>Nicho: {getLeadNiche(lead)}</span>
                  </span>
                </div>

                {/* Lead Name */}
                <h2 className="text-base sm:text-lg font-bold text-neutral-900 leading-tight truncate">
                  {lead.name}
                </h2>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 shrink-0">
                {onDeleteLead && (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (window.confirm(`Tem certeza que deseja excluir o lead "${lead.name}" da base de dados?`)) {
                        await onDeleteLead(lead.id);
                        onClose();
                      }
                    }}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title="Excluir este Lead da base"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                {/* Close Button */}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Direct Quick Action Bar (Discar, WhatsApp, Site da Nyroh) */}
            <div className="flex flex-wrap items-center gap-2 mt-2.5 pt-2.5 border-t border-neutral-100">
              {/* Dial Button */}
              {lead.phoneNumber && lead.phoneNumber !== '(Sem telefone)' ? (
                <a
                  href={getDialerTelLink(lead.phoneNumber)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartCall(true);
                  }}
                  className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs shadow-xs transition-all touch-manipulation"
                  title="Discar no celular com 0 automático na frente"
                >
                  <PhoneCall className="w-4 h-4 text-emerald-100 animate-bounce" />
                  <span className="font-mono">{lead.phoneNumber}</span>
                </a>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-neutral-100 text-neutral-400 font-medium text-xs border border-neutral-200">
                  <PhoneOff className="w-4 h-4" />
                  <span>Sem telefone</span>
                </div>
              )}

              {/* WhatsApp Button + Quick Indicator */}
              <div className="flex items-center rounded-xl bg-emerald-50 border border-emerald-200 overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartCall(false);
                    const template = getStoredWhatsAppTemplate();
                    const msgText = formatWhatsAppMessage(template, {
                      name: lead.name,
                      site: lead.publicUrl || '',
                      salesperson: lead.salespersonName || 'Thomas'
                    });
                    openWhatsApp(lead.phoneNumber, msgText);
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 hover:bg-emerald-100 text-emerald-800 font-bold text-xs transition-colors shrink-0 touch-manipulation"
                  title={`Abrir conversa no ${getStoredWhatsAppAppType() === 'business' ? 'WhatsApp Business' : getStoredWhatsAppAppType() === 'normal' ? 'WhatsApp Normal' : 'WhatsApp'}`}
                >
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  <span>WhatsApp</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-200/80 text-emerald-900">
                    {getStoredWhatsAppAppType() === 'business' ? 'Business' : getStoredWhatsAppAppType() === 'normal' ? 'Normal' : 'App'}
                  </span>
                </button>
              </div>

              {/* Site Nyroh Link */}
              {lead.publicUrl && (
                <a
                  href={lead.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs transition-colors shrink-0 touch-manipulation"
                  title="Abrir Novo Site criado pela Nyroh"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-white" />
                  <span>Site Nyroh</span>
                </a>
              )}

              {/* Site Antigo Link */}
              {lead.website && (
                <a
                  href={lead.website}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-2xs transition-colors shrink-0 touch-manipulation"
                  title={`Abrir Site Antigo do Cliente: ${lead.website}`}
                >
                  <Globe className="w-3.5 h-3.5 text-white" />
                  <span>Site Antigo ↗</span>
                </a>
              )}

              {/* Botão Diagnóstico & Laudo PDF (Exclusivo para quem possui site antigo e permissão liberada pelo Admin) */}
              {showAuditButton && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenAuditModal();
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-2xs transition-all shrink-0 touch-manipulation cursor-pointer"
                  title={`Executar auditoria técnica cirúrgica do site antigo (${lead.website}) e emitir laudo em PDF`}
                >
                  <FileSearch className="w-3.5 h-3.5 text-purple-200" />
                  <span>Diagnóstico & PDF</span>
                </button>
              )}

              {/* QR Code */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartCall(false);
                  setShowQrModal(true);
                }}
                className="hidden md:flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium text-xs transition-colors shrink-0"
              >
                <QrCode className="w-3.5 h-3.5 text-neutral-600" />
                <span>QR</span>
              </button>
            </div>
          </header>

          {/* ========================================================= */}
          {/* 2. BODY CONTENT (SCROLL SUAVE E ISOLADO)                  */}
          {/* ========================================================= */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-3.5 sm:p-5 space-y-4">
            
            {/* Widget Compacto de Cronômetro de Chamada */}
            <div className="bg-neutral-950 text-white rounded-xl p-3 sm:p-4 shadow-sm border border-neutral-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                  isTimerRunning ? 'bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/40 animate-pulse' : 'bg-neutral-900 text-neutral-400'
                }`}>
                  <Clock className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                      Cronômetro
                    </span>
                    {isTimerRunning ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.2 rounded-full border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                        Em Ligação...
                      </span>
                    ) : timerSeconds > 0 ? (
                      <span className="text-[10px] font-semibold text-amber-400 bg-amber-950/80 px-2 py-0.2 rounded-full border border-amber-500/30">
                        Pausado
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-neutral-500">
                        Pronto
                      </span>
                    )}
                  </div>
                  <div className="text-xl sm:text-2xl font-mono font-bold tracking-tight text-white mt-0.5">
                    {formattedClock} <span className="text-xs text-neutral-400 font-sans font-normal">({formatDuration(timerSeconds)})</span>
                  </div>
                </div>
              </div>

              {/* Timer Controls */}
              <div className="flex items-center gap-1.5 shrink-0">
                {!isTimerRunning ? (
                  <button
                    type="button"
                    onClick={() => handleStartCall(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-xs touch-manipulation"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{timerSeconds > 0 ? 'Continuar' : 'Iniciar'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePauseTimer}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-xs touch-manipulation"
                  >
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>Pausar</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleResetTimer}
                  disabled={timerSeconds === 0 && !isTimerRunning}
                  className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors disabled:opacity-20 touch-manipulation"
                  title="Zerar Cronômetro"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Destaque de Agendamento Ativo de Follow-Up (se houver) */}
            {lead.nextFollowUpAt && (() => {
              const info = getFollowUpInfo(lead.nextFollowUpAt);
              if (info.status === 'NONE') return null;
              return (
                <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                  info.status === 'OVERDUE'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : info.status === 'TODAY'
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-blue-50 border-blue-200 text-blue-900'
                }`}>
                  <div className="flex items-center gap-2">
                    {info.status === 'OVERDUE' ? (
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    ) : (
                      <CalendarClock className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <div>
                      <span className="font-bold block text-[10px] uppercase tracking-wide">
                        {info.status === 'OVERDUE' ? '⚠️ Retorno Atrasado!' : info.status === 'TODAY' ? '🔔 Retorno para Hoje!' : '📅 Lembrete de Retorno'}
                      </span>
                      <span className="font-medium">{info.label}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Dica Rápida de Pitch & Gestão do Site Antigo */}
            <div className="bg-neutral-50/90 border border-neutral-200/90 rounded-xl px-3 py-2.5 text-xs shadow-2xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <p className="text-[11.5px] text-neutral-700 truncate">
                    {lead.website ? (
                      <span>
                        <strong className="text-amber-900 font-semibold">Cliente tem site antigo:</strong> Foque no pitch de <em>Redesign, velocidade e WhatsApp direto</em>.
                      </span>
                    ) : (
                      <span>
                        <strong className="text-blue-900 font-semibold">Cliente sem site cadastrado:</strong> Foque em <em>Presença profissional no Google e autoridade local</em>.
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {lead.website ? (
                    <>
                      <a
                        href={lead.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10.5px] font-bold text-amber-800 hover:text-amber-950 underline flex items-center gap-0.5"
                        title={lead.website}
                      >
                        <span>Ver site</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => setIsEditingWebsite(!isEditingWebsite)}
                        className="text-[10.5px] font-semibold text-neutral-500 hover:text-neutral-800 flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-neutral-200 transition-colors cursor-pointer"
                        title="Editar link do site antigo"
                      >
                        <Pencil className="w-2.5 h-2.5" />
                        <span>Editar</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditingWebsite(true)}
                      className="text-[10.5px] font-bold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                      title="Inserir link do site antigo do cliente"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>Inserir Site Antigo</span>
                    </button>
                  )}
                </div>
              </div>

              {isEditingWebsite && (
                <div className="flex items-center gap-2 pt-1 border-t border-neutral-200">
                  <input
                    type="text"
                    value={websiteDraft}
                    onChange={(e) => setWebsiteDraft(e.target.value)}
                    placeholder="https://exemplo.com.br ou www.exemplo.com.br"
                    className="flex-1 px-2.5 py-1 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveWebsite();
                      } else if (e.key === 'Escape') {
                        setIsEditingWebsite(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveWebsite}
                    disabled={isSavingWebsite}
                    className="px-2.5 py-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                  >
                    {isSavingWebsite ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWebsiteDraft(lead.website || '');
                      setIsEditingWebsite(false);
                    }}
                    className="px-2 py-1 text-xs text-neutral-600 hover:text-neutral-900 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>

            {/* Form de Registro da Ligação */}
            <form onSubmit={handleSubmitCallForm} className="bg-white border border-neutral-200 rounded-xl p-3.5 sm:p-4 shadow-2xs space-y-3.5">
              
              {/* 1. SELETOR DE ETAPA DO PIPELINE (5 COLUNAS MASTER + SUB-FUNIL) */}
              <div className="bg-neutral-50/80 p-3.5 rounded-xl border border-neutral-200/90 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>Mover para Etapa do Funil *</span>
                  </label>
                  <span className="text-[10.5px] font-semibold text-neutral-600">
                    Atual: <strong className="text-blue-700">{selectedColumn}</strong>
                    {selectedColumn === 'Interessado' && subStatus && (
                      <span className="ml-1 text-indigo-600">({subStatus})</span>
                    )}
                  </span>
                </div>

                {/* 5 Master Column Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {MASTER_COLUMNS_ORDER.map((colId) => {
                    const colConfig = MASTER_COLUMNS_CONFIG[colId];
                    const currentMaster = getMasterColumn({ columnStatus: selectedColumn });
                    const isSelected = currentMaster === colId;

                    return (
                      <button
                        type="button"
                        key={colId}
                        onClick={async () => {
                          const targetCol = resolveTargetColumnStatus(colId, lead || undefined);
                          setSelectedColumn(targetCol);
                          if (lead) {
                            try {
                              await fetch(`/api/leads/${lead.id}/status`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  columnStatus: targetCol,
                                  subStatus,
                                  lossReason
                                })
                              });
                              await onUpdateColumn(lead.id, targetCol);
                              onShowToast(`Etapa alterada para "${colConfig.title}"`);
                            } catch (err) {
                              console.error(err);
                            }
                          }
                        }}
                        className={`text-xs px-2 py-2 rounded-lg border font-semibold transition-all flex flex-col items-center justify-center gap-1 touch-manipulation text-center ${
                          isSelected
                            ? `${colConfig.theme.activeTabBg} shadow-xs border-transparent font-bold`
                            : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                        }`}
                      >
                        <span className="text-[11px] truncate w-full">{colConfig.title}</span>
                      </button>
                    );
                  })}
                </div>

                {/* SUB-FUNIL DE INTERESSADOS (QUANDO EM INTERESSADO) */}
                {selectedColumn === 'Interessado' && (
                  <div className="mt-2.5 pt-2.5 border-t border-neutral-200/80">
                    <label className="block text-[11px] font-bold text-indigo-900 mb-1.5 flex items-center gap-1">
                      <Star className="w-3 h-3 text-indigo-600" />
                      <span>Sub-Funil de Negociação (Etapa Interna):</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        'Contato Feito',
                        'Site Enviado',
                        'Site Visualizado',
                        'Em Decisão'
                      ].map((subOption) => {
                        const isSubSelected = (subStatus || 'Contato Feito') === subOption;
                        return (
                          <button
                            type="button"
                            key={subOption}
                            onClick={async () => {
                              setSubStatus(subOption);
                              if (lead) {
                                lead.subStatus = subOption;
                                try {
                                  await fetch(`/api/leads/${lead.id}/status`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ subStatus: subOption })
                                  });
                                  onShowToast(`Sub-estágio: "${subOption}"`);
                                } catch (e) {
                                  console.error(e);
                                }
                              }
                            }}
                            className={`text-[11px] px-2.5 py-1 rounded-md border font-semibold transition-all ${
                              isSubSelected
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                            }`}
                          >
                            {subOption}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* SUB-ESTÁGIOS DE TENTATIVAS DE LIGAÇÃO */}
                {(selectedColumn === 'Ligação 1' || selectedColumn === 'Ligação 2' || selectedColumn === 'Ligação 3' || selectedColumn === 'Ligação 4') && (
                  <div className="mt-2.5 pt-2.5 border-t border-neutral-200/80">
                    <label className="block text-[11px] font-bold text-amber-900 mb-1.5 flex items-center gap-1">
                      <PhoneCall className="w-3 h-3 text-amber-600" />
                      <span>Cadência da Ligação:</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(['Ligação 1', 'Ligação 2', 'Ligação 3', 'Ligação 4'] as ColumnStatus[]).map((ligCol, idx) => {
                        const isLigSelected = selectedColumn === ligCol;
                        return (
                          <button
                            type="button"
                            key={ligCol}
                            onClick={async () => {
                              setSelectedColumn(ligCol);
                              if (lead && ligCol !== lead.columnStatus) {
                                await onUpdateColumn(lead.id, ligCol);
                                onShowToast(`Avançado para "${ligCol}"`);
                              }
                            }}
                            className={`text-[11px] px-2.5 py-1 rounded-md border font-semibold transition-all ${
                              isLigSelected
                                ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                                : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                            }`}
                          >
                            {idx + 1}ª Ligação
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* MOTIVO DE RECUSA (QUANDO EM RECUSADO) */}
                {selectedColumn === 'Recusado' && (
                  <div className="mt-2.5 pt-2.5 border-t border-neutral-200/80">
                    <label className="block text-[11px] font-bold text-rose-900 mb-1.5 flex items-center gap-1">
                      <XCircle className="w-3 h-3 text-rose-600" />
                      <span>Motivo da Desqualificação:</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        'Sem Interesse',
                        'Sem Orçamento',
                        'Não Atendeu',
                        'Concorrente',
                        'Outro'
                      ].map((reason) => {
                        const isReasonSelected = (lossReason || 'Sem Interesse') === reason;
                        return (
                          <button
                            type="button"
                            key={reason}
                            onClick={async () => {
                              setLossReason(reason);
                              if (lead) {
                                lead.lossReason = reason;
                                try {
                                  await fetch(`/api/leads/${lead.id}/status`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ lossReason: reason })
                                  });
                                  onShowToast(`Motivo de perda: "${reason}"`);
                                } catch (e) {
                                  console.error(e);
                                }
                              }
                            }}
                            className={`text-[11px] px-2.5 py-1 rounded-md border font-semibold transition-all ${
                              isReasonSelected
                                ? 'bg-neutral-800 text-white border-neutral-800 shadow-2xs'
                                : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                            }`}
                          >
                            {reason}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Seletor de Etiquetas / Resultado da Ligação */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-neutral-800 flex items-center gap-1">
                    <TagIcon className="w-3.5 h-3.5 text-blue-600" />
                    <span>Resultado da Ligação (Tags) *</span>
                  </label>
                  <button
                    type="button"
                    onClick={onOpenTagsModal}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 underline"
                  >
                    + Gerenciar Tags
                  </button>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {tags.map((t) => {
                    const isSelected = selectedTags.includes(t.name);
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => handleToggleTag(t.name)}
                        style={
                          isSelected
                            ? { backgroundColor: t.bgColor, color: t.color, borderColor: t.color }
                            : undefined
                        }
                        className={`text-xs min-h-[38px] px-3 py-2 rounded-xl border transition-all flex items-center justify-between gap-1.5 touch-manipulation ${
                          isSelected
                            ? 'font-bold shadow-xs ring-2 ring-blue-500/20'
                            : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100 active:bg-neutral-200'
                        }`}
                      >
                        <span className="truncate">{t.name}</span>
                        <span className="text-xs font-mono shrink-0">
                          {isSelected ? '✓' : '+'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Agendamento de Retorno / Follow-Up */}
              <div className="bg-neutral-50/90 p-3 rounded-xl border border-neutral-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5 text-blue-600" />
                    <span>Agendar Retorno (Opcional)</span>
                  </label>

                  {followUpDateTime && (
                    <button
                      type="button"
                      onClick={() => setFollowUpDateTime('')}
                      className="text-[10px] text-rose-600 hover:underline font-bold"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                <input
                  type="datetime-local"
                  value={followUpDateTime}
                  onChange={(e) => setFollowUpDateTime(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white border border-neutral-300 rounded-lg text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                {/* Atalhos Rápidos com Scroll Horizontal */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider shrink-0">
                    Atalhos:
                  </span>
                  <button
                    type="button"
                    onClick={() => setPresetFollowUp('1h')}
                    className="text-[11px] font-semibold bg-white hover:bg-neutral-100 border border-neutral-200 px-2.5 py-1 rounded-lg text-neutral-700 shrink-0 shadow-2xs active:bg-neutral-200"
                  >
                    +1 Hora
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetFollowUp('today17')}
                    className="text-[11px] font-semibold bg-white hover:bg-neutral-100 border border-neutral-200 px-2.5 py-1 rounded-lg text-neutral-700 shrink-0 shadow-2xs active:bg-neutral-200"
                  >
                    Hoje 17:00
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetFollowUp('tomorrow9')}
                    className="text-[11px] font-semibold bg-white hover:bg-neutral-100 border border-neutral-200 px-2.5 py-1 rounded-lg text-neutral-700 shrink-0 shadow-2xs active:bg-neutral-200"
                  >
                    Amanhã 09:00
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetFollowUp('1d')}
                    className="text-[11px] font-semibold bg-white hover:bg-neutral-100 border border-neutral-200 px-2.5 py-1 rounded-lg text-neutral-700 shrink-0 shadow-2xs active:bg-neutral-200"
                  >
                    +1 Dia
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetFollowUp('2d')}
                    className="text-[11px] font-semibold bg-white hover:bg-neutral-100 border border-neutral-200 px-2.5 py-1 rounded-lg text-neutral-700 shrink-0 shadow-2xs active:bg-neutral-200"
                  >
                    +2 Dias
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetFollowUp('1w')}
                    className="text-[11px] font-semibold bg-white hover:bg-neutral-100 border border-neutral-200 px-2.5 py-1 rounded-lg text-neutral-700 shrink-0 shadow-2xs active:bg-neutral-200"
                  >
                    +1 Sem
                  </button>
                </div>
              </div>

              {/* 4. Comentários / Observações */}
              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  Comentários / Observações (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Ex: Cliente atendeu, pediu para retornar no final da tarde ou enviar proposta pelo WhatsApp..."
                  className="w-full text-xs p-2.5 bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-neutral-400"
                />
              </div>

              {/* 5. Vendedor Responsável (Restrito a Admin para reatribuir) */}
              {salespeople.length > 0 && (
                <div className="pt-2 border-t border-neutral-100">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-neutral-600">
                      Vendedor Responsável:
                    </label>
                    {currentUser?.role !== 'admin' && (
                      <span className="text-[10px] text-neutral-400 italic">
                        (Atribuído pela Diretoria)
                      </span>
                    )}
                  </div>
                  {currentUser?.role === 'admin' ? (
                    <select
                      value={lead.salespersonId || 'seller-thomas'}
                      onChange={async (e) => {
                        const newSellerId = e.target.value;
                        const target = salespeople.find((s) => s.id === newSellerId);
                        const newSellerName = target ? target.name : 'Thomas';
                        if (onReassignLead) {
                          await onReassignLead(lead.id, newSellerId, newSellerName);
                          onShowToast(`Lead atribuído a ${newSellerName}`);
                        }
                      }}
                      className="w-full text-xs bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 font-semibold text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      {salespeople.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.isDefault ? '(Principal)' : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-neutral-100/80 border border-neutral-200">
                      <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                      <span className="text-xs font-bold text-neutral-800">
                        {lead.salespersonName || 'Você'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </form>

            {/* Histórico Cronológico de Ligações */}
            <div className="pt-1">
              <h3 className="text-xs font-bold text-neutral-800 mb-2.5 flex items-center gap-1.5 uppercase tracking-wider">
                <History className="w-3.5 h-3.5 text-neutral-600" />
                <span>Histórico de Ligações ({calls.length})</span>
              </h3>

              {loadingCalls ? (
                <div className="text-xs text-neutral-400 py-3 text-center">
                  Carregando histórico...
                </div>
              ) : calls.length === 0 ? (
                <div className="text-xs text-neutral-400 py-4 text-center border border-dashed border-neutral-200 rounded-xl bg-neutral-50">
                  Nenhuma ligação registrada anteriormente para este lead.
                </div>
              ) : (
                <div className="space-y-2">
                  {calls.map((c) => {
                    const cTags = c.tag ? c.tag.split(',').map((t) => t.trim()).filter(Boolean) : [];
                    return (
                      <div
                        key={c.id}
                        className="p-3 bg-neutral-50/90 rounded-xl border border-neutral-200/80 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {cTags.map((tName, idx) => (
                              <span
                                key={idx}
                                style={getTagStyle(tName)}
                                className="px-2 py-0.5 rounded text-[10px] font-bold border border-black/5"
                              >
                                {tName}
                              </span>
                            ))}

                            {c.durationSeconds ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-neutral-700 bg-neutral-200/80 px-1.5 py-0.5 rounded font-mono">
                                <Clock className="w-3 h-3 text-neutral-500" />
                                {formatDuration(c.durationSeconds)}
                              </span>
                            ) : null}

                            {c.followUpAt ? (() => {
                              const fInfo = getFollowUpInfo(c.followUpAt);
                              return (
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                  fInfo.status === 'OVERDUE'
                                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                                    : fInfo.status === 'TODAY'
                                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                                    : 'bg-blue-100 text-blue-800 border-blue-200'
                                }`}>
                                  <CalendarClock className="w-3 h-3" />
                                  {fInfo.label}
                                </span>
                              );
                            })() : null}
                          </div>

                          <span className="text-[10px] text-neutral-400 font-mono">
                            {new Date(c.createdAt).toLocaleString('pt-BR')}
                          </span>
                        </div>

                        {c.comment && (
                          <p className="text-neutral-700 text-xs leading-relaxed bg-white p-2 rounded-lg border border-neutral-200/60">
                            {c.comment}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ========================================================= */}
          {/* 3. BOTTOM FOOTER DOCK (100% FIXO NA ZONA DO POLEGAR)      */}
          {/* ========================================================= */}
          <footer className="bg-white border-t border-neutral-200 px-3.5 sm:px-5 py-2.5 sm:py-3 shrink-0 z-20 shadow-lg space-y-2">
            
            {/* Auto-dial toggle checkbox */}
            <div className="flex items-center justify-between text-[11px] text-neutral-600 px-0.5">
              <label className="flex items-center gap-1.5 cursor-pointer font-medium select-none">
                <input
                  type="checkbox"
                  checked={autoDialOnNext}
                  onChange={(e) => setAutoDialOnNext(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                />
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                  Auto-discar e iniciar cronômetro no próximo lead
                </span>
              </label>

              {nextLead && (
                <span className="text-neutral-400 font-mono text-[10px] truncate max-w-[150px] hidden xs:inline">
                  Próximo: {nextLead.name}
                </span>
              )}
            </div>

            {/* Bottom Actions Row */}
            <div className="flex items-center gap-2">
              {/* Secondary: Just Save and Keep Open */}
              <button
                type="button"
                disabled={submittingCall}
                onClick={() => saveCallLog(false, false)}
                className="px-3 py-2.5 rounded-xl border border-neutral-300 hover:bg-neutral-100 text-neutral-700 font-semibold text-xs transition-colors shrink-0 disabled:opacity-50 touch-manipulation"
                title="Salvar registro e manter tela aberta"
              >
                Salvar
              </button>

              {/* Finish Current Lead Only */}
              <button
                type="button"
                disabled={submittingCall}
                onClick={() => saveCallLog(true, false)}
                className="flex-1 min-w-[90px] py-2.5 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 active:bg-black text-white font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 touch-manipulation"
                title="Salvar e fechar este lead"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Finalizar</span>
              </button>

              {/* PRIMARY ACTION: Finish & Advance to Next Lead (Disca na hora!) */}
              {nextLead && onSelectLead ? (
                <button
                  type="button"
                  disabled={submittingCall}
                  onClick={() => saveCallLog(true, true)}
                  className="flex-[1.5] py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:from-blue-800 active:to-indigo-800 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 touch-manipulation"
                  title={`Salvar e discar para o próximo lead: ${nextLead.name}`}
                >
                  <PhoneCall className="w-4 h-4 text-white animate-pulse" />
                  <span>Finalizar & Próximo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submittingCall}
                  onClick={() => saveCallLog(true, false)}
                  className="flex-[1.5] py-2.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 touch-manipulation"
                >
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>Finalizar Lista</span>
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>

      {/* QR Code Modal Auxiliar */}
      <QrCodeModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        leadName={lead.name}
        phoneNumber={lead.phoneNumber}
      />

      {/* Audit Report Modal & PDF Generator */}
      <AuditReportModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        report={auditReport}
        loading={loadingAudit}
        onRefresh={() => fetchWebsiteAudit(lead.id)}
        sellerName={currentSeller?.name || currentUser?.name || 'Especialista Nyroh'}
      />
    </>
  );
};
