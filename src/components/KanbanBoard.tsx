import React, { useState, useMemo } from 'react';
import { Lead, ColumnStatus, CustomTag, MasterColumnId } from '../types';
import { KanbanCard } from './KanbanCard';
import { 
  MASTER_COLUMNS_ORDER, 
  MASTER_COLUMNS_CONFIG, 
  getMasterColumn, 
  matchesSubFilter, 
  resolveTargetColumnStatus,
  ColumnSubTab 
} from '../lib/pipeline';
import { 
  Inbox, 
  PhoneCall, 
  Star, 
  Trophy, 
  XCircle, 
  SlidersHorizontal, 
  Columns, 
  Smartphone, 
  Zap,
  Filter,
  CheckCircle2
} from 'lucide-react';

interface KanbanBoardProps {
  leads: Lead[];
  tags?: CustomTag[];
  onOpenDetails: (lead: Lead) => void;
  onMoveColumn: (leadId: string, newColumn: ColumnStatus) => void;
  onShowToast: (msg: string) => void;
  onUpdateSubStatus?: (leadId: string, subStatus: string) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  leads,
  tags = [],
  onOpenDetails,
  onMoveColumn,
  onShowToast,
  onUpdateSubStatus
}) => {
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<MasterColumnId | null>(null);

  // Active sub-tab filter for each master column (e.g. { tentativas: 'ALL', interessados: 'ALL', recusados: 'ALL' })
  const [subFilters, setSubFilters] = useState<Record<MasterColumnId, string>>({
    novos: 'ALL',
    tentativas: 'ALL',
    interessados: 'ALL',
    fechados: 'ALL',
    recusados: 'ALL'
  });

  // Mobile / Tablet column focus: 'ALL' shows horizontal scroll, or a specific MasterColumnId shows full width
  const [activeMobileColumn, setActiveMobileColumn] = useState<MasterColumnId | 'ALL'>('novos');

  // View layout mode: 'grid' fits all 5 columns on standard desktop screens (NO ZOOM NEEDED!), 'scroll' allows wide columns
  const [layoutMode, setLayoutMode] = useState<'fit' | 'scroll'>('fit');

  // Dynamic visible card limits per column for ultra-fast rendering on massive datasets
  const [visibleLimits, setVisibleLimits] = useState<Record<string, number>>({});

  const getColumnLimit = (col: string) => visibleLimits[col] || 35;

  const handleShowMore = (col: string) => {
    setVisibleLimits((prev) => ({
      ...prev,
      [col]: (prev[col] || 35) + 35
    }));
  };

  const handleShowAll = (col: string, total: number) => {
    setVisibleLimits((prev) => ({
      ...prev,
      [col]: total
    }));
  };

  const handleSubFilterChange = (columnId: MasterColumnId, subId: string) => {
    setSubFilters((prev) => ({
      ...prev,
      [columnId]: subId
    }));
  };

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('text/plain', leadId);
    setDraggedLeadId(leadId);
  };

  const handleDragOver = (e: React.DragEvent, col: MasterColumnId) => {
    e.preventDefault();
    if (dragOverColumn !== col) {
      setDragOverColumn(col);
    }
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetCol: MasterColumnId) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain') || draggedLeadId;
    if (leadId) {
      const draggedLead = leads.find((l) => l.id === leadId);
      const targetStatus = resolveTargetColumnStatus(targetCol, draggedLead);
      onMoveColumn(leadId, targetStatus);
      onShowToast(`Lead movido para "${MASTER_COLUMNS_CONFIG[targetCol].title}"`);
    }
    setDraggedLeadId(null);
    setDragOverColumn(null);
  };

  // Group leads into the 5 Master Columns
  const leadsByMaster = useMemo(() => {
    const map: Record<MasterColumnId, Lead[]> = {
      novos: [],
      tentativas: [],
      interessados: [],
      fechados: [],
      recusados: []
    };

    for (const lead of leads) {
      const mCol = getMasterColumn(lead);
      map[mCol].push(lead);
    }

    return map;
  }, [leads]);

  // Icons map for headers
  const renderColumnIcon = (id: MasterColumnId) => {
    switch (id) {
      case 'novos':
        return <Inbox className="w-3.5 h-3.5 text-blue-600 shrink-0" />;
      case 'tentativas':
        return <PhoneCall className="w-3.5 h-3.5 text-amber-600 shrink-0" />;
      case 'interessados':
        return <Star className="w-3.5 h-3.5 text-indigo-600 shrink-0" />;
      case 'fechados':
        return <Trophy className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
      case 'recusados':
        return <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />;
    }
  };

  return (
    <div className="w-full pb-8 pt-1">
      {/* ========================================================================= */}
      {/* TOP CONTROL BAR: Mobile Tabs & Desktop Layout Switcher                    */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-2.5 mb-3 border-b border-neutral-200/90">
        
        {/* MOBILE / TABLET COLUMN TABS (< xl) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none xl:hidden">
          <button
            onClick={() => setActiveMobileColumn('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors shrink-0 flex items-center gap-1.5 ${
              activeMobileColumn === 'ALL'
                ? 'bg-neutral-900 text-white shadow-2xs'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            <span>Ver Todas ({leads.length})</span>
          </button>

          {MASTER_COLUMNS_ORDER.map((colId) => {
            const colConfig = MASTER_COLUMNS_CONFIG[colId];
            const colCount = leadsByMaster[colId].length;
            const isActive = activeMobileColumn === colId;

            return (
              <button
                key={colId}
                onClick={() => setActiveMobileColumn(colId)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors shrink-0 flex items-center gap-1.5 ${
                  isActive
                    ? `${colConfig.theme.activeTabBg} shadow-2xs font-bold`
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                {renderColumnIcon(colId)}
                <span>{colConfig.shortTitle}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive ? 'bg-white/25 text-white' : 'bg-neutral-200/80 text-neutral-700'
                }`}>
                  {colCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* DESKTOP STATUS & VIEW TOGGLE (xl+) */}
        <div className="hidden xl:flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-xs text-neutral-600">
            <span className="inline-flex items-center gap-1 font-semibold text-neutral-800 bg-neutral-100 px-2.5 py-1 rounded-lg border border-neutral-200">
              <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span>Pipeline Otimizado: 5 Colunas Executivas</span>
            </span>
            <span className="text-neutral-400">•</span>
            <span className="text-neutral-500">
              Total de <strong>{leads.length}</strong> leads cadastrados
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-neutral-100 p-0.5 rounded-lg border border-neutral-200 text-xs">
            <button
              onClick={() => setLayoutMode('fit')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
                layoutMode === 'fit'
                  ? 'bg-white text-neutral-900 shadow-2xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
              title="Exibe todas as 5 colunas perfeitamente na tela sem precisar dar zoom ou rolar lateralmente"
            >
              <Columns className="w-3.5 h-3.5 text-blue-600" />
              <span>Ajustar à Tela (Sem Zoom)</span>
            </button>
            <button
              onClick={() => setLayoutMode('scroll')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                layoutMode === 'scroll'
                  ? 'bg-white text-neutral-900 shadow-2xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
              title="Colunas mais largas com rolagem horizontal"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-500" />
              <span>Colunas Largas</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5 MASTER KANBAN COLUMNS CONTAINER                                         */}
      {/* ========================================================================= */}
      <div className={`w-full ${layoutMode === 'scroll' ? 'overflow-x-auto' : ''}`}>
        <div className={`
          ${layoutMode === 'fit' 
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3' 
            : 'inline-flex gap-3.5 min-w-full xl:min-w-max items-start'
          }
        `}>
          {MASTER_COLUMNS_ORDER.map((colId) => {
            const config = MASTER_COLUMNS_CONFIG[colId];
            const allColLeads = leadsByMaster[colId];
            const activeSubFilter = subFilters[colId] || 'ALL';

            // Filter leads inside this column based on the active discreet sub-tab
            const filteredColLeads = allColLeads.filter((l) => matchesSubFilter(l, colId, activeSubFilter));

            const isOver = dragOverColumn === colId;

            // On narrow screens (< xl), if a specific column is selected, show only that column full-width
            const isHiddenOnMobile = activeMobileColumn !== 'ALL' && activeMobileColumn !== colId;

            return (
              <div
                key={colId}
                onDragOver={(e) => handleDragOver(e, colId)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, colId)}
                className={`
                  ${isHiddenOnMobile ? 'hidden xl:flex' : 'flex'}
                  ${layoutMode === 'scroll' ? 'w-full xl:w-76 xl:min-w-[280px] xl:max-w-[320px] shrink-0' : 'w-full min-w-0'}
                  rounded-xl p-2.5 transition-colors duration-150 flex-col min-h-[500px] xl:min-h-[580px] border-t-2 ${config.theme.borderAccent}
                  ${
                    isOver
                      ? 'bg-blue-50/80 border-2 border-dashed border-blue-400 shadow-md'
                      : 'bg-neutral-100/70 border-x border-b border-neutral-200/70'
                  }
                `}
              >
                {/* 1. Header da Coluna Master */}
                <div className="pb-2 mb-2 border-b border-neutral-200/80 px-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {renderColumnIcon(colId)}
                      <span className="text-xs font-bold text-neutral-800 truncate tracking-tight">
                        {config.title}
                      </span>
                    </div>

                    <span className={`inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 text-[10.5px] font-bold rounded-full border shadow-2xs font-mono ${config.theme.badgeBg} ${config.theme.badgeText}`}>
                      {filteredColLeads.length}{activeSubFilter !== 'ALL' ? `/${allColLeads.length}` : ''}
                    </span>
                  </div>

                  <p className="text-[10px] text-neutral-500 mt-0.5 truncate hidden sm:block">
                    {config.description}
                  </p>
                </div>

                {/* 2. SUB-MENU DE ABAS DISCRETO (O SUB-FUNIL DENTRO DA COLUNA) */}
                {config.subTabs && config.subTabs.length > 0 && (
                  <div className="mb-2.5 px-0.5">
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none bg-neutral-200/50 p-1 rounded-lg border border-neutral-200/70">
                      {config.subTabs.map((sub) => {
                        const isSubActive = activeSubFilter === sub.id;
                        // Count leads in this specific sub-stage
                        const subCount = allColLeads.filter((l) => matchesSubFilter(l, colId, sub.id)).length;

                        return (
                          <button
                            type="button"
                            key={sub.id}
                            onClick={() => handleSubFilterChange(colId, sub.id)}
                            className={`px-1.5 py-0.8 text-[9.5px] rounded-md font-semibold whitespace-nowrap transition-all flex items-center gap-1 shrink-0 ${
                              isSubActive
                                ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                                : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/50'
                            }`}
                            title={`Filtrar por ${sub.label} (${subCount} leads)`}
                          >
                            <span>{sub.shortLabel || sub.label}</span>
                            <span className={`text-[9px] px-1 py-0 rounded font-mono ${
                              isSubActive ? 'bg-neutral-100 text-neutral-800' : 'bg-neutral-200/60 text-neutral-600'
                            }`}>
                              {subCount}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. Cards Container com Scroll Independente */}
                <div className="flex-1 space-y-2 overflow-y-auto pr-0.5 min-h-[200px]">
                  {filteredColLeads.length === 0 ? (
                    <div className="h-32 border border-dashed border-neutral-300 rounded-lg flex flex-col items-center justify-center text-[11px] text-neutral-400 select-none p-3 text-center">
                      <span>Nenhum lead nesta etapa</span>
                      {activeSubFilter !== 'ALL' && (
                        <button
                          type="button"
                          onClick={() => handleSubFilterChange(colId, 'ALL')}
                          className="mt-1.5 text-[10px] text-blue-600 font-semibold hover:underline"
                        >
                          Limpar filtro ({allColLeads.length} no total)
                        </button>
                      )}
                    </div>
                  ) : (
                    (() => {
                      const limit = getColumnLimit(colId);
                      const visibleCards = filteredColLeads.slice(0, limit);
                      const hasMore = filteredColLeads.length > limit;

                      return (
                        <>
                          {visibleCards.map((lead) => (
                            <div
                              key={lead.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, lead.id)}
                              className="cursor-grab active:cursor-grabbing touch-manipulation"
                            >
                              <KanbanCard
                                lead={lead}
                                tags={tags}
                                onOpenDetails={onOpenDetails}
                                onMoveColumn={onMoveColumn}
                                onShowToast={onShowToast}
                                onUpdateSubStatus={onUpdateSubStatus}
                              />
                            </div>
                          ))}

                          {hasMore && (
                            <div className="pt-2 pb-1 flex flex-col items-center gap-1.5 border-t border-neutral-200/60 mt-2">
                              <span className="text-[10px] text-neutral-500 font-medium">
                                Mostrando {visibleCards.length} de {filteredColLeads.length} leads
                              </span>
                              <div className="flex items-center gap-1.5 w-full">
                                <button
                                  type="button"
                                  onClick={() => handleShowMore(colId)}
                                  className="flex-1 py-1.5 px-2 bg-white hover:bg-neutral-50 border border-neutral-200 text-neutral-700 text-[11px] font-semibold rounded-md shadow-2xs transition-colors"
                                >
                                  + Ver mais 35
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleShowAll(colId, filteredColLeads.length)}
                                  className="py-1.5 px-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[11px] font-medium rounded-md transition-colors"
                                >
                                  Ver todos
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
