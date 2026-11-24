import { ColumnStatus, Lead, MasterColumnId, InteressadoSubStage, LossReason } from '../types';

export interface ColumnSubTab {
  id: string;
  label: string;
  shortLabel?: string;
}

export interface MasterColumnConfig {
  id: MasterColumnId;
  title: string;
  shortTitle: string;
  description: string;
  defaultStatus: ColumnStatus;
  theme: {
    badgeBg: string;
    badgeText: string;
    borderAccent: string;
    headerDot: string;
    activeTabBg: string;
  };
  subTabs?: ColumnSubTab[];
}

export const MASTER_COLUMNS_ORDER: MasterColumnId[] = [
  'novos',
  'tentativas',
  'interessados',
  'fechados',
  'recusados'
];

export const MASTER_COLUMNS_CONFIG: Record<MasterColumnId, MasterColumnConfig> = {
  novos: {
    id: 'novos',
    title: 'Novos Leads',
    shortTitle: 'Novos',
    description: 'Leads virgens aguardando 1ª abordagem',
    defaultStatus: 'Leads',
    theme: {
      badgeBg: 'bg-blue-50 border-blue-200',
      badgeText: 'text-blue-700',
      borderAccent: 'border-t-blue-500',
      headerDot: 'bg-blue-500',
      activeTabBg: 'bg-blue-600 text-white'
    }
  },
  tentativas: {
    id: 'tentativas',
    title: 'Em Tentativas',
    shortTitle: 'Tentativas',
    description: 'Cadência de ligações e contato ativo',
    defaultStatus: 'Ligação 1',
    theme: {
      badgeBg: 'bg-amber-50 border-amber-200',
      badgeText: 'text-amber-700',
      borderAccent: 'border-t-amber-500',
      headerDot: 'bg-amber-500',
      activeTabBg: 'bg-amber-600 text-white'
    },
    subTabs: [
      { id: 'ALL', label: 'Todas' },
      { id: '1', label: '1ª Lig', shortLabel: '1ª' },
      { id: '2', label: '2ª Lig', shortLabel: '2ª' },
      { id: '3', label: '3ª Lig', shortLabel: '3ª' },
      { id: '4', label: '4ª+ Lig', shortLabel: '4ª+' }
    ]
  },
  interessados: {
    id: 'interessados',
    title: 'Interessados',
    shortTitle: 'Interesse',
    description: 'Oportunidades em negociação e envio de site',
    defaultStatus: 'Interessado',
    theme: {
      badgeBg: 'bg-indigo-50 border-indigo-200',
      badgeText: 'text-indigo-700',
      borderAccent: 'border-t-indigo-500',
      headerDot: 'bg-indigo-500',
      activeTabBg: 'bg-indigo-600 text-white'
    },
    subTabs: [
      { id: 'ALL', label: 'Todos' },
      { id: 'Contato Feito', label: 'Contato Feito', shortLabel: 'Contato' },
      { id: 'Site Enviado', label: 'Site Enviado', shortLabel: 'Site Env' },
      { id: 'Site Visualizado', label: 'Site Visualizado', shortLabel: 'Visto' },
      { id: 'Em Decisão', label: 'Em Decisão', shortLabel: 'Decisão' }
    ]
  },
  fechados: {
    id: 'fechados',
    title: 'Fechados 🏆',
    shortTitle: 'Fechados',
    description: 'Vendas concretizadas com sucesso',
    defaultStatus: 'Fechado',
    theme: {
      badgeBg: 'bg-emerald-50 border-emerald-200',
      badgeText: 'text-emerald-700',
      borderAccent: 'border-t-emerald-500',
      headerDot: 'bg-emerald-500',
      activeTabBg: 'bg-emerald-600 text-white'
    }
  },
  recusados: {
    id: 'recusados',
    title: 'Perdidos / Recusados',
    shortTitle: 'Perdidos',
    description: 'Leads desqualificados ou sem interesse',
    defaultStatus: 'Recusado',
    theme: {
      badgeBg: 'bg-neutral-100 border-neutral-300',
      badgeText: 'text-neutral-700',
      borderAccent: 'border-t-rose-400',
      headerDot: 'bg-rose-500',
      activeTabBg: 'bg-neutral-800 text-white'
    },
    subTabs: [
      { id: 'ALL', label: 'Todos' },
      { id: 'Sem Interesse', label: 'Sem Interesse', shortLabel: 'Sem Inter' },
      { id: 'Sem Orçamento', label: 'Sem Orçamento', shortLabel: 'Orçamento' },
      { id: 'Não Atendeu', label: 'Não Atendeu', shortLabel: 'Não Atende' },
      { id: 'Outro', label: 'Outros', shortLabel: 'Outros' }
    ]
  }
};

/**
 * Converte qualquer status de lead antigo ou novo na sua Coluna Master correspondente
 */
export function getMasterColumn(lead: { columnStatus: ColumnStatus }): MasterColumnId {
  const stat = lead.columnStatus;
  if (!stat || stat === 'Leads') return 'novos';
  if (stat === 'Ligação 1' || stat === 'Ligação 2' || stat === 'Ligação 3' || stat === 'Ligação 4') {
    return 'tentativas';
  }
  if (stat === 'Interessado') return 'interessados';
  if (stat === 'Fechado') return 'fechados';
  if (stat === 'Recusado') return 'recusados';
  return 'novos';
}

/**
 * Retorna o nível da tentativa (1, 2, 3 ou 4) com base no status ou callCount
 */
export function getAttemptLevel(lead: Lead): 1 | 2 | 3 | 4 {
  if (lead.columnStatus === 'Ligação 1') return 1;
  if (lead.columnStatus === 'Ligação 2') return 2;
  if (lead.columnStatus === 'Ligação 3') return 3;
  if (lead.columnStatus === 'Ligação 4') return 4;
  if (lead.callCount && lead.callCount > 0) {
    return Math.min(4, Math.max(1, lead.callCount)) as 1 | 2 | 3 | 4;
  }
  return 1;
}

/**
 * Verifica se o lead bate com o sub-filtro selecionado dentro da coluna
 */
export function matchesSubFilter(
  lead: Lead,
  masterCol: MasterColumnId,
  subFilter: string
): boolean {
  if (!subFilter || subFilter === 'ALL') return true;

  if (masterCol === 'tentativas') {
    const level = String(getAttemptLevel(lead));
    if (subFilter === '4') {
      return level === '4' || (lead.callCount !== undefined && lead.callCount >= 4);
    }
    return level === subFilter;
  }

  if (masterCol === 'interessados') {
    const currentSub = lead.subStatus || 'Contato Feito';
    return currentSub.toLowerCase() === subFilter.toLowerCase();
  }

  if (masterCol === 'recusados') {
    const reason = lead.lossReason || 'Outro';
    return reason.toLowerCase() === subFilter.toLowerCase();
  }

  return true;
}

/**
 * Resolve para qual ColumnStatus migrar quando um lead é arrastado para uma coluna Master
 */
export function resolveTargetColumnStatus(targetMasterCol: MasterColumnId, lead?: Lead): ColumnStatus {
  switch (targetMasterCol) {
    case 'novos':
      return 'Leads';
    case 'tentativas': {
      if (!lead || !lead.callCount || lead.callCount <= 1) return 'Ligação 1';
      if (lead.callCount === 2) return 'Ligação 2';
      if (lead.callCount === 3) return 'Ligação 3';
      return 'Ligação 4';
    }
    case 'interessados':
      return 'Interessado';
    case 'fechados':
      return 'Fechado';
    case 'recusados':
      return 'Recusado';
    default:
      return 'Leads';
  }
}

/**
 * Próxima coluna Master na ordem do pipeline
 */
export function getNextMasterColumn(current: MasterColumnId): MasterColumnId | null {
  const idx = MASTER_COLUMNS_ORDER.indexOf(current);
  if (idx < 0 || idx >= MASTER_COLUMNS_ORDER.length - 1) return null;
  return MASTER_COLUMNS_ORDER[idx + 1];
}

/**
 * Coluna Master anterior na ordem do pipeline
 */
export function getPrevMasterColumn(current: MasterColumnId): MasterColumnId | null {
  const idx = MASTER_COLUMNS_ORDER.indexOf(current);
  if (idx <= 0) return null;
  return MASTER_COLUMNS_ORDER[idx - 1];
}
