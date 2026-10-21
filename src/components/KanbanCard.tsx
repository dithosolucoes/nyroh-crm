import React, { useState } from 'react';
import { Lead, ColumnStatus, CustomTag, MasterColumnId } from '../types';
import { Copy, QrCode, Phone, ExternalLink, MessageCircle, ChevronLeft, ChevronRight, Check, CalendarClock, AlertTriangle, Clock, PhoneCall, Sparkles, CheckCircle, Globe } from 'lucide-react';
import { openWhatsApp, getStoredWhatsAppAppType, getQrTelLink, getStoredWhatsAppTemplate, formatWhatsAppMessage } from '../lib/phone';
import { QrCodeModal } from './QrCodeModal';
import { getFollowUpInfo } from '../lib/followUp';
import { getLeadNiche } from '../lib/niche';
import { 
  getMasterColumn, 
  getPrevMasterColumn, 
  getNextMasterColumn, 
  resolveTargetColumnStatus, 
  getAttemptLevel,
  MASTER_COLUMNS_CONFIG 
} from '../lib/pipeline';

interface KanbanCardProps {
  lead: Lead;
  tags?: CustomTag[];
  onOpenDetails: (lead: Lead) => void;
  onMoveColumn: (leadId: string, newColumn: ColumnStatus) => void;
  onShowToast: (message: string) => void;
  onUpdateSubStatus?: (leadId: string, subStatus: string) => void;
}

export const KanbanCard: React.FC<KanbanCardProps> = ({
  lead,
  tags = [],
  onOpenDetails,
  onMoveColumn,
  onShowToast,
  onUpdateSubStatus
}) => {
  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  const currentMasterCol = getMasterColumn(lead);
  const prevMasterCol = getPrevMasterColumn(currentMasterCol);
  const nextMasterCol = getNextMasterColumn(currentMasterCol);

  const getTagStyle = (tagName: string) => {
    const found = tags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
    if (found) {
      return { color: found.color, backgroundColor: found.bgColor };
    }
    return { color: '#374151', backgroundColor: '#f3f4f6' };
  };

  const getTagsList = (tagStr?: string): string[] => {
    if (!tagStr) return [];
    return tagStr.split(',').map(t => t.trim()).filter(Boolean);
  };
  const leadTagsList = getTagsList(lead.lastCallTag);

  // 1. Copiar URL (dithoSitesMetadata.publicUrl)
  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!lead.publicUrl) {
      onShowToast('Este lead não possui URL cadastrada.');
      return;
    }
    navigator.clipboard.writeText(lead.publicUrl);
    setCopiedUrl(true);
    onShowToast('URL copiada para a área de transferência!');
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // 2. Copiar Número (Número Bruto exatamente como veio no JSON, ex: (31) 99150-3721)
  const handleCopyPhone = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(lead.phoneNumber);
    setCopiedPhone(true);
    onShowToast(`Número ${lead.phoneNumber} copiado!`);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  // 3. WhatsApp (Abre WhatsApp Business ou Normal conforme configurado)
  const handleOpenWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    const template = getStoredWhatsAppTemplate();
    const msgText = formatWhatsAppMessage(template, {
      name: lead.name,
      site: lead.publicUrl || '',
      salesperson: lead.salespersonName || 'Thomas'
    });
    openWhatsApp(lead.phoneNumber, msgText);
  };

  const handleMoveLeft = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (prevMasterCol) {
      const targetCol = resolveTargetColumnStatus(prevMasterCol, lead);
      onMoveColumn(lead.id, targetCol);
      onShowToast(`Movido para "${MASTER_COLUMNS_CONFIG[prevMasterCol].title}"`);
    }
  };

  const handleMoveRight = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (nextMasterCol) {
      const targetCol = resolveTargetColumnStatus(nextMasterCol, lead);
      onMoveColumn(lead.id, targetCol);
      onShowToast(`Avançado para "${MASTER_COLUMNS_CONFIG[nextMasterCol].title}"`);
    }
  };

  const followUpInfo = getFollowUpInfo(lead.nextFollowUpAt);

  const getBorderClasses = () => {
    if (followUpInfo.status === 'OVERDUE') {
      return 'border-l-4 border-l-rose-500 border-rose-200 bg-rose-50/20 shadow-xs';
    }
    if (followUpInfo.status === 'TODAY') {
      return 'border-l-4 border-l-amber-500 border-amber-200 bg-amber-50/20 shadow-xs';
    }
    if (followUpInfo.status === 'SCHEDULED') {
      return 'border-l-4 border-l-blue-400 border-neutral-200';
    }
    if (currentMasterCol === 'fechados') {
      return 'border-l-4 border-l-emerald-500 border-emerald-200 bg-emerald-50/20';
    }
    if (currentMasterCol === 'interessados') {
      return 'border-l-4 border-l-indigo-400 border-indigo-100';
    }
    return 'border-neutral-200';
  };

  const attemptLevel = getAttemptLevel(lead);

  return (
    <>
      <div 
        onClick={() => onOpenDetails(lead)}
        className={`group relative bg-white border hover:border-neutral-300 hover:shadow-xs rounded-lg p-3 transition-all duration-150 cursor-pointer select-none ${getBorderClasses()}`}
      >
        {/* Distintivo Visual de Follow-Up (Retorno) se existir */}
        {followUpInfo.status !== 'NONE' && (
          <div className="mb-2">
            {followUpInfo.status === 'OVERDUE' && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">
                <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                <span>⚠️ {followUpInfo.label}</span>
              </span>
            )}
            {followUpInfo.status === 'TODAY' && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                <CalendarClock className="w-3 h-3 text-amber-600 shrink-0" />
                <span>🔔 {followUpInfo.label}</span>
              </span>
            )}
            {followUpInfo.status === 'SCHEDULED' && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                <CalendarClock className="w-3 h-3 text-blue-600 shrink-0" />
                <span>📅 {followUpInfo.label}</span>
              </span>
            )}
          </div>
        )}

        {/* Header do Card: Nome em negrito sutil & Ações */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              {lead.salespersonName && (
                <span className="inline-block text-[9px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded max-w-full truncate border border-blue-100/80">
                  👤 {lead.salespersonName}
                </span>
              )}

              {/* Sub-estágio contextual elegante */}
              {currentMasterCol === 'tentativas' && (
                <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                  <Clock className="w-2.5 h-2.5 text-amber-600" />
                  <span>{attemptLevel}ª Ligação</span>
                </span>
              )}

              {currentMasterCol === 'interessados' && (
                <div className="inline-flex items-center" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={lead.subStatus || 'Contato Feito'}
                    onChange={(e) => {
                      const newSub = e.target.value;
                      if (onUpdateSubStatus) {
                        onUpdateSubStatus(lead.id, newSub);
                        onShowToast(`Sub-estágio alterado para "${newSub}"`);
                      }
                    }}
                    className="text-[9.5px] font-bold text-indigo-800 bg-indigo-50 hover:bg-indigo-100/80 px-1 py-0.2 rounded border border-indigo-200 cursor-pointer focus:outline-hidden transition-colors"
                    title="Clique para alterar a etapa de negociação deste lead"
                  >
                    <option value="Contato Feito">⭐ Contato Feito</option>
                    <option value="Site Enviado">🚀 Site Enviado</option>
                    <option value="Site Visualizado">👀 Site Visualizado</option>
                    <option value="Em Decisão">🤝 Em Decisão</option>
                  </select>
                </div>
              )}

              {currentMasterCol === 'fechados' && (
                <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                  <CheckCircle className="w-2.5 h-2.5 text-emerald-600" />
                  <span>Fechado</span>
                </span>
              )}

              {currentMasterCol === 'recusados' && lead.lossReason && (
                <span className="inline-block text-[9px] font-medium text-neutral-600 bg-neutral-100 px-1.5 py-0.2 rounded border border-neutral-200">
                  {lead.lossReason}
                </span>
              )}
            </div>

            <h4 className="text-xs font-semibold text-neutral-800 leading-snug group-hover:text-blue-600 transition-colors line-clamp-2">
              {lead.name}
            </h4>
            <div className="mt-1">
              <span className="inline-block px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[9px] font-medium border border-neutral-200/60">
                {getLeadNiche(lead)}
              </span>
            </div>
          </div>

          {/* Botão QR Code de Discagem */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowQrModal(true);
            }}
            className="p-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-colors shrink-0"
            title="Abrir QR Code de Discagem (tel:0...)"
          >
            <QrCode className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Número de Telefone Bruto + Botão de Discagem Direta no Mobile */}
        <div className="flex items-center justify-between gap-1 mb-2">
          <p className="text-[11px] font-mono text-neutral-500 flex items-center gap-1 min-w-0 truncate">
            <Phone className="w-3 h-3 text-neutral-400 shrink-0" />
            <span className="truncate">{lead.phoneNumber}</span>
          </p>

          {/* BOTÃO DISCAR DIRETO NO CELULAR (Apenas em telas pequenas < md) */}
          <a
            href={getQrTelLink(lead.phoneNumber)}
            onClick={(e) => e.stopPropagation()}
            className="md:hidden inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 active:bg-emerald-700 rounded-md shadow-2xs shrink-0"
            title="Ligar pelo discador do celular"
          >
            <PhoneCall className="w-3 h-3" />
            <span>LIGAR</span>
          </a>
        </div>

        {/* Exibição Visual de TODAS as Etiquetas (Tags) do Cliente */}
        {leadTagsList.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mb-2">
            {leadTagsList.map((tName, i) => (
              <span
                key={i}
                style={getTagStyle(tName)}
                className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded border border-black/5 shrink-0"
              >
                🏷️ {tName}
              </span>
            ))}
          </div>
        )}

        {/* Links dos Sites: Nyroh e/ou Site Antigo (apenas se existirem para não inchar o card) */}
        {(lead.publicUrl || (lead.website && lead.website.trim())) && (
          <div className="flex items-center gap-1.5 mb-2">
            {lead.publicUrl && (
              <a
                href={lead.publicUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50/80 hover:bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200/80 transition-colors"
                title="Abrir Novo Site criado pela Nyroh"
              >
                <ExternalLink className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                <span>Site Nyroh</span>
              </a>
            )}

            {lead.website && lead.website.trim() && (
              <a
                href={lead.website}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 truncate max-w-[140px] transition-colors"
                title={`Abrir Site Antigo do Cliente: ${lead.website}`}
              >
                <Globe className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                <span className="truncate">Site Antigo ↗</span>
              </a>
            )}
          </div>
        )}

        {/* Botões de Ação do Card */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-neutral-100">
          {/* 1. Copiar URL */}
          <button
            onClick={handleCopyUrl}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 rounded transition-colors"
            title="Copiar URL gerada"
          >
            {copiedUrl ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-neutral-500" />}
            <span>Copiar URL</span>
          </button>

          {/* 2. WhatsApp */}
          <button
            onClick={handleOpenWhatsApp}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 rounded transition-colors"
            title={`Abrir WhatsApp (${getStoredWhatsAppAppType() === 'business' ? 'Business' : getStoredWhatsAppAppType() === 'normal' ? 'Normal' : 'Celular'})`}
          >
            <MessageCircle className="w-3 h-3 text-emerald-600" />
            <span>WhatsApp</span>
          </button>

          {/* 3. Copiar Número Bruto */}
          <button
            onClick={handleCopyPhone}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 rounded transition-colors"
            title="Copiar Número Bruto (sem 0 adicional)"
          >
            {copiedPhone ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-neutral-500" />}
            <span>Copiar Número</span>
          </button>
        </div>

        {/* Rodapé do Card: Contagem de ligações e Avanço de Coluna */}
        <div className="mt-2.5 pt-2 border-t border-neutral-100 flex items-center justify-between text-[10px] text-neutral-400">
          <span>
            {lead.callCount && lead.callCount > 0 ? (
              <span className="text-neutral-600 font-medium">{lead.callCount} ligação(ões)</span>
            ) : (
              'Sem ligações'
            )}
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={handleMoveLeft}
              disabled={!prevMasterCol}
              className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title={prevMasterCol ? `Mover para ${MASTER_COLUMNS_CONFIG[prevMasterCol].title}` : 'Primeira coluna'}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleMoveRight}
              disabled={!nextMasterCol}
              className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title={nextMasterCol ? `Avançar para ${MASTER_COLUMNS_CONFIG[nextMasterCol].title}` : 'Última coluna'}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Popover / Modal do QR Code */}
      <QrCodeModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        leadName={lead.name}
        phoneNumber={lead.phoneNumber}
      />
    </>
  );
};

