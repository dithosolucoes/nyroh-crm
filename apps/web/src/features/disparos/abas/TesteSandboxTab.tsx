import { apiFetch } from '../../../api/client';
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
import { AdminDispatchTestSandbox } from '../../../components/AdminDispatchTestSandbox';
import { ZipImportProgressModal, ImportProgressData } from '../../../components/ZipImportProgressModal';
import { PaginaSubirZip, ZipUploadRegistro } from '../../../components/PaginaSubirZip';
import { isUiFlagOn } from '@shared/lib/uiFlags';
import type { RespostaListaUploads, RespostaListaModelosFluxo, RespostaInstanciasFluxo, RespostaListaCopias, RespostaCopiaSalva, CopiaCampanha, RespostaListaLotes, RespostaVelocidadeDisparo, LoteCampanha, RespostaLiberacaoQuarentena, RespostaDevolucaoLeads } from '@shared/contracts/rotas';
import type { DisparosVM } from '../useDisparos';


export function TesteSandboxTab({ d }: { d: DisparosVM }) {
  const { salespeople, onLeadsUpdated, onNavigateToKanban, onNavigateToWhatsApp, activeTab, availableTemplates, copyTemplates, showNotification } = d;
  return (
    <>
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
    </>
  );
}
