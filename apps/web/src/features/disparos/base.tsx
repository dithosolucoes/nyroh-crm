import { apiFetch } from '../../api/client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { RespostaUploadZip, RespostaErroApi } from '@shared/contracts/rotas';
import { parseTemplateBody, templateVarIndexes, renderTemplateBody } from '@shared/lib/templateSegments';
import { fillLeadTokens } from '@shared/lib/templateCopy';
import { distribuirQuantidade } from '@shared/lib/dispatchDistribuicao';

/** Acima deste total, o disparo pede confirmação extra. */
export const CONFIRMA_ACIMA_DE = 200;
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

export const SHOW_SIMULATE = isUiFlagOn(import.meta.env.VITE_MOSTRAR_SIMULAR);
/** Estado real do disparo: falhou (com motivo), lido/respondeu, ou ainda sem confirmação de entrega. */
export const DispatchStateLine: React.FC<{ lead: CampaignLead }> = ({ lead }) => {
  const motivoFalha = (lead.deliveryError || (lead.failureNote || '').replace(/^\s*\[?Falha[^:]*:\s*/i, '').replace(/\]\s*$/, '') || (lead as any).notes || '').trim();
  // ERRO_VARIAVEL = lead pulado porque a copy pedia um dado que ele não tem (ver server.ts, disparo)
  const estado = lead.status === 'FALHA' || lead.status === 'ERRO_VARIAVEL' || lead.deliveryStatus === 'failed' ? 'falhou'
    : lead.deliveryStatus === 'read' || lead.respondedAt ? 'lido'
    : lead.deliveryStatus === 'delivered' ? 'entregue'
    : 'enviado';
  if (estado === 'falhou') {
    return (
      <div className="p-1.5 bg-rose-50 rounded border border-rose-200 text-[10px] text-rose-800">
        <span className="flex items-center gap-1 font-bold"><AlertTriangle className="w-3 h-3" /> Falhou</span>
        <span className="block mt-0.5">{motivoFalha || 'Motivo não informado pela API.'}</span>
      </div>
    );
  }
  const visual = {
    lido: { label: 'Lido', cls: 'bg-emerald-50 border-emerald-200 text-emerald-800', icon: <CheckCircle2 className="w-3 h-3" /> },
    entregue: { label: 'Entregue', cls: 'bg-sky-50 border-sky-200 text-sky-800', icon: <CheckCircle2 className="w-3 h-3" /> },
    enviado: { label: 'Enviado à Meta', cls: 'bg-neutral-50 border-neutral-200 text-neutral-700', icon: <Send className="w-3 h-3" /> },
  }[estado];
  return (
    <div className={`p-1.5 rounded border text-[10px] flex items-center justify-between ${visual.cls}`}>
      <span className="flex items-center gap-1 font-semibold">{visual.icon} {visual.label}</span>
      {estado === 'enviado' && <span className="text-neutral-400">aguardando confirmação</span>}
    </div>
  );
};

export const SHOW_SANDBOX = isUiFlagOn(import.meta.env.VITE_MOSTRAR_SANDBOX);

export interface MetaTemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phoneNumber?: string;
}

export interface MetaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  buttons?: MetaTemplateButton[];
}

export interface MetaTemplateFull {
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

export interface AdminCampaignDisparosViewProps {
  salespeople: Salesperson[];
  currentUser?: { id: string; name: string; role: string };
  onLeadsUpdated?: () => void;
  onNavigateToKanban?: (salespersonId?: string) => void;
  onNavigateToWhatsApp?: (leadId?: string, salespersonId?: string) => void;
}

export type SubPageTab = 'safras' | 'montador' | 'teste_sandbox' | 'quarentena' | 'kanban' | 'distribuicao';

/** 75 → "1 min 15 s"; 3700 → "1 h 02 min". No ritmo do plano um lote leva minutos/horas, não segundos. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  return sec > 0 ? `${m} min ${String(sec).padStart(2, '0')} s` : `${m} min`;
}

