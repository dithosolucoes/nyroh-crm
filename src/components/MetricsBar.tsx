import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Lead, CustomTag } from '../types';
import { getLeadNiche } from '../lib/niche';
import { PhoneCall, Clock, TrendingUp, AlertCircle, Download, Tag as TagIcon, Filter, RefreshCw, ChevronDown, Check, X, FileCode, Search, Briefcase, Globe, SlidersHorizontal } from 'lucide-react';

interface CallLogItem {
  id: string;
  leadId: string;
  salespersonId?: string;
  salespersonName?: string;
  tag: string;
  durationSeconds?: number;
  createdAt: string;
}

interface MetricsBarProps {
  leads: Lead[];
  allLeads?: Lead[];
  totalLeadsCount?: number;
  tags: CustomTag[];
  selectedSalespersonId?: string;
  selectedTagFilters: string[];
  onTagFilterChange: (tags: string[]) => void;
  selectedNicheFilter?: string;
  onNicheFilterChange?: (niche: string) => void;
  websiteFilter?: 'ALL' | 'PRIORITIZE_WITH' | 'PRIORITIZE_WITHOUT' | 'ONLY_WITH' | 'ONLY_WITHOUT';
  onWebsiteFilterChange?: (filter: 'ALL' | 'PRIORITIZE_WITH' | 'PRIORITIZE_WITHOUT' | 'ONLY_WITH' | 'ONLY_WITHOUT') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onShowToast: (msg: string) => void;
  onOpenJsonBatchModal: () => void;
}

export const MetricsBar: React.FC<MetricsBarProps> = ({
  leads,
  allLeads,
  totalLeadsCount = 0,
  tags,
  selectedSalespersonId = 'ALL',
  selectedTagFilters,
  onTagFilterChange,
  selectedNicheFilter = 'ALL',
  onNicheFilterChange,
  websiteFilter = 'ALL',
  onWebsiteFilterChange,
  searchQuery,
  onSearchChange,
  onShowToast,
  onOpenJsonBatchModal
}) => {
  const [calls, setCalls] = useState<CallLogItem[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Nichos disponíveis a partir dos leads
  const targetLeadsForNiches = allLeads || leads;
  const availableNiches = useMemo(() => {
    const counts: Record<string, number> = {};
    targetLeadsForNiches.forEach((l) => {
      const niche = getLeadNiche(l);
      counts[niche] = (counts[niche] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([niche, count]) => ({ niche, count }))
      .sort((a, b) => b.count - a.count);
  }, [targetLeadsForNiches]);

  // Estatísticas de leads com e sem site original
  const websiteStats = useMemo(() => {
    const list = targetLeadsForNiches;
    let withCount = 0;
    let withoutCount = 0;
    list.forEach((l) => {
      if (l.website && l.website.trim()) {
        withCount++;
      } else {
        withoutCount++;
      }
    });
    return { withCount, withoutCount, total: list.length };
  }, [targetLeadsForNiches]);

  useEffect(() => {
    fetchCalls();
  }, [leads, selectedSalespersonId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsTagDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchCalls = async () => {
    setLoadingCalls(true);
    try {
      const url = selectedSalespersonId && selectedSalespersonId !== 'ALL'
        ? `/api/calls?salespersonId=${encodeURIComponent(selectedSalespersonId)}`
        : '/api/calls';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setCalls(data);
      }
    } catch (err) {
      console.error('Erro ao buscar chamadas para métricas:', err);
    } finally {
      setLoadingCalls(false);
    }
  };

  // 1. Ligações Hoje (isolado por vendedor)
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCalls = calls.filter((c) => {
    if (!c.createdAt) return false;
    return c.createdAt.slice(0, 10) === todayStr;
  });

  const todayTotalSeconds = todayCalls.reduce((acc, c) => acc + (c.durationSeconds || 0), 0);
  const formatTodayTime = (totalSec: number) => {
    if (totalSec <= 0) return '00m 00s';
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  };

  // 2. Tempo Médio por Chamada
  const validDurations = calls.map((c) => c.durationSeconds || 0).filter((d) => d > 0);
  const totalDuration = validDurations.reduce((acc, curr) => acc + curr, 0);
  const avgDuration = validDurations.length > 0 ? Math.round(totalDuration / validDurations.length) : 0;

  const formatAvgTime = (totalSec: number) => {
    if (totalSec <= 0) return '00m 00s';
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  };

  // 3. Taxa de Conversão (% de Leads em 'Fechado' ou 'Ganha / Fechado')
  const totalLeads = leads.length;
  const closedLeads = leads.filter((l) => l.columnStatus === 'Fechado' || (l.columnStatus as string) === 'Ganha / Fechado').length;
  const conversionRate = totalLeads > 0 ? ((closedLeads / totalLeads) * 100).toFixed(1) : '0.0';

  // 4. Leads Estagnados (sem ligações ou sem contato nos últimos 3 dias)
  const threeDaysAgoMs = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const stagnantLeads = leads.filter((l) => {
    if (!l.lastCallAt) return true; // Nunca contatado
    const lastCallDateMs = new Date(l.lastCallAt).getTime();
    return lastCallDateMs < threeDaysAgoMs;
  });

  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const res = await fetch('/api/export/csv');
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio_vendas_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        onShowToast('Relatório CSV baixado com sucesso!');
      } else {
        onShowToast('Erro ao gerar CSV.');
      }
    } catch (err) {
      console.error(err);
      onShowToast('Erro ao exportar CSV.');
    } finally {
      setExportingCsv(false);
    }
  };

  return (
    <div className="bg-white border-b border-neutral-200 px-3 md:px-6 py-2.5 md:py-3.5 space-y-2.5 md:space-y-3 shrink-0 shadow-2xs">
      {/* Cards de Métricas Principais (Scrollable Horizontal até telas xl: 1280px+) */}
      <div className="flex xl:grid overflow-x-auto xl:overflow-x-visible grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5 xl:gap-3 pb-1 xl:pb-0 scrollbar-none">
        {/* Card 1: Ligações Hoje */}
        <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-2.5 xl:p-3 flex items-center justify-between min-w-[160px] xl:min-w-0 shrink-0 xl:shrink">
          <div>
            <span className="text-[10px] xl:text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block whitespace-nowrap">
              Ligações Hoje
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-base xl:text-xl font-bold text-neutral-900 leading-tight">
                {todayCalls.length}
              </span>
              <span className="text-[9px] xl:text-[10px] text-neutral-500 whitespace-nowrap">
                ({calls.length} total)
              </span>
            </div>
          </div>
          <div className="p-2 xl:p-2.5 bg-blue-50 text-blue-600 rounded-lg shrink-0 ml-2">
            <PhoneCall className="w-4 h-4 xl:w-5 xl:h-5" />
          </div>
        </div>

        {/* Card 2: Tempo Falado Hoje */}
        <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-2.5 xl:p-3 flex items-center justify-between min-w-[160px] xl:min-w-0 shrink-0 xl:shrink">
          <div>
            <span className="text-[10px] xl:text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block whitespace-nowrap">
              Tempo Falado Hoje
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-base xl:text-xl font-bold text-blue-700 font-mono leading-tight whitespace-nowrap">
                {formatTodayTime(todayTotalSeconds)}
              </span>
            </div>
          </div>
          <div className="p-2 xl:p-2.5 bg-blue-100/60 text-blue-700 rounded-lg shrink-0 ml-2">
            <Clock className="w-4 h-4 xl:w-5 xl:h-5" />
          </div>
        </div>

        {/* Card 3: Tempo Médio */}
        <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-2.5 xl:p-3 flex items-center justify-between min-w-[150px] xl:min-w-0 shrink-0 xl:shrink">
          <div>
            <span className="text-[10px] xl:text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block whitespace-nowrap">
              Tempo Médio
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-base xl:text-xl font-bold text-neutral-900 leading-tight whitespace-nowrap">
                {formatAvgTime(avgDuration)}
              </span>
            </div>
          </div>
          <div className="p-2 xl:p-2.5 bg-purple-50 text-purple-600 rounded-lg shrink-0 ml-2">
            <Clock className="w-4 h-4 xl:w-5 xl:h-5" />
          </div>
        </div>

        {/* Card 4: Taxa de Conversão */}
        <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-2.5 xl:p-3 flex items-center justify-between min-w-[160px] xl:min-w-0 shrink-0 xl:shrink">
          <div>
            <span className="text-[10px] xl:text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block whitespace-nowrap">
              Taxa de Conversão
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base xl:text-xl font-bold text-emerald-700 leading-tight">
                {conversionRate}%
              </span>
              <span className="text-[9px] text-neutral-500 font-mono whitespace-nowrap">
                ({closedLeads}/{totalLeads})
              </span>
            </div>
          </div>
          <div className="p-2 xl:p-2.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0 ml-2">
            <TrendingUp className="w-4 h-4 xl:w-5 xl:h-5" />
          </div>
        </div>

        {/* Card 5: Leads Estagnados */}
        <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-2.5 xl:p-3 flex items-center justify-between min-w-[160px] xl:min-w-0 shrink-0 xl:shrink">
          <div>
            <span className="text-[10px] xl:text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block whitespace-nowrap">
              Leads Estagnados (&gt;3d)
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className={`text-base xl:text-xl font-bold leading-tight ${stagnantLeads.length > 0 ? 'text-amber-700' : 'text-neutral-900'}`}>
                {stagnantLeads.length}
              </span>
            </div>
          </div>
          <div className="p-2 xl:p-2.5 bg-amber-50 text-amber-600 rounded-lg shrink-0 ml-2">
            <AlertCircle className="w-4 h-4 xl:w-5 xl:h-5" />
          </div>
        </div>
      </div>

      {/* Barra de Busca e Filtros Inteligentes (Compacta e ergonômica no Mobile) */}
      <div className="pt-2 border-t border-neutral-100 space-y-2">
        {/* Linha Principal: Busca + Botão Filtros no Mobile + Ações Rápidas */}
        <div className="flex items-center gap-2">
          {/* Campo de Busca Global Rápida */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar por nome, telefone, site Nyroh..."
              className="w-full text-xs pl-8 pr-7 py-1.5 bg-neutral-50 hover:bg-white focus:bg-white border border-neutral-300 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5 rounded-full"
                title="Limpar busca"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Botão de Toggle de Filtros no Mobile (com indicador de filtros ativos) */}
          <button
            type="button"
            onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
            className={`md:hidden shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border shadow-2xs transition-colors ${
              (selectedNicheFilter !== 'ALL' || websiteFilter !== 'ALL' || selectedTagFilters.length > 0)
                ? 'bg-blue-50 text-blue-700 border-blue-300'
                : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filtros</span>
            {(selectedNicheFilter !== 'ALL' || websiteFilter !== 'ALL' || selectedTagFilters.length > 0) && (
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            )}
          </button>

          {/* Botão CSV rápido */}
          <button
            onClick={handleExportCsv}
            disabled={exportingCsv}
            className="shrink-0 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs transition-all disabled:opacity-50"
            title="Exportar dados para planilha CSV"
          >
            {exportingCsv ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>

        {/* Linha de Filtros Avançados: Aberta no Desktop (md:flex), Colapsável no Mobile */}
        <div className={`${isMobileFiltersOpen ? 'flex' : 'hidden'} md:flex flex-wrap items-center gap-2 pt-1`}>
          {/* Filtro por Nicho do Lead */}
          <div className="flex items-center gap-1.5 bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 shadow-2xs hover:bg-neutral-50 transition-colors w-full sm:w-auto">
            <Briefcase className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-xs text-neutral-500 font-medium whitespace-nowrap">Nicho:</span>
            <select
              value={selectedNicheFilter}
              onChange={(e) => onNicheFilterChange?.(e.target.value)}
              className="bg-transparent text-xs font-semibold text-neutral-800 outline-none cursor-pointer flex-1 sm:max-w-[200px] truncate"
              title="Filtrar leads por nicho/segmento"
            >
              <option value="ALL">
                Todos os Nichos ({totalLeadsCount || leads.length})
              </option>
              {availableNiches.map(({ niche, count }) => (
                <option key={niche} value={niche}>
                  {niche} ({count})
                </option>
              ))}
            </select>
            {selectedNicheFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => onNicheFilterChange?.('ALL')}
                className="text-neutral-400 hover:text-neutral-700 p-0.5"
                title="Remover filtro de nicho"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filtro / Priorização por Site Antigo */}
          <div className="flex items-center gap-1.5 bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 shadow-2xs hover:bg-neutral-50 transition-colors w-full sm:w-auto">
            <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="text-xs text-neutral-500 font-medium whitespace-nowrap">Site Antigo:</span>
            <select
              value={websiteFilter}
              onChange={(e) => onWebsiteFilterChange?.(e.target.value as any)}
              className="bg-transparent text-xs font-semibold text-neutral-800 outline-none cursor-pointer flex-1 sm:max-w-[210px] truncate"
              title="Filtrar ou priorizar no Kanban clientes que já têm site vs clientes sem site"
            >
              <option value="ALL">Todos os Leads ({websiteStats.total})</option>
              <option value="PRIORITIZE_WITH">⚡ Topo: Com Site Antigo ({websiteStats.withCount})</option>
              <option value="PRIORITIZE_WITHOUT">⚡ Topo: Sem Site ({websiteStats.withoutCount})</option>
              <option value="ONLY_WITH">🌐 Apenas Com Site ({websiteStats.withCount})</option>
              <option value="ONLY_WITHOUT">⚪ Apenas Sem Site ({websiteStats.withoutCount})</option>
            </select>
            {websiteFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => onWebsiteFilterChange?.('ALL')}
                className="text-neutral-400 hover:text-neutral-700 p-0.5"
                title="Resetar filtro de site"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Menu Dropdown de Seleção Múltipla de Etiquetas */}
          <div className="relative w-full sm:w-auto" ref={dropdownRef}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsTagDropdownOpen(!isTagDropdownOpen)}
                className="w-full sm:w-auto inline-flex items-center justify-between sm:justify-start gap-2 px-3 py-1.5 text-xs font-medium text-neutral-800 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 shadow-2xs transition-all"
              >
                <div className="flex items-center gap-2 truncate">
                  <Filter className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span className="truncate">
                    {selectedTagFilters.length === 0
                      ? `Todas as Etiquetas (${leads.length})`
                      : `${selectedTagFilters.length} etiqueta(s)`}
                  </span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform shrink-0 ${isTagDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {selectedTagFilters.length > 0 && (
                <button
                  type="button"
                  onClick={() => onTagFilterChange([])}
                  className="text-[11px] text-rose-600 hover:text-rose-700 hover:underline font-semibold flex items-center gap-0.5 shrink-0"
                >
                  <X className="w-3 h-3" />
                  Limpar
                </button>
              )}
            </div>

            {/* Menu Popover com Caixas de Seleção (Checkboxes) */}
            {isTagDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-full sm:w-72 bg-white border border-neutral-200 rounded-xl shadow-xl z-50 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2 py-1.5 border-b border-neutral-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                    Filtrar por Etiqueta
                  </span>
                  {selectedTagFilters.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onTagFilterChange([])}
                      className="text-[10px] text-rose-600 hover:underline font-semibold"
                    >
                      Desmarcar todas
                    </button>
                  )}
                </div>

                <div className="max-h-60 overflow-y-auto space-y-0.5 py-1">
                  <label
                    onClick={() => onTagFilterChange([])}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                      selectedTagFilters.length === 0
                        ? 'bg-neutral-100 text-neutral-900 font-semibold'
                        : 'hover:bg-neutral-50 text-neutral-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedTagFilters.length === 0}
                        onChange={() => onTagFilterChange([])}
                        className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                      />
                      <span>Todas as Etiquetas</span>
                    </div>
                    <span className="text-[10px] bg-neutral-200 text-neutral-600 px-1.5 py-0.2 rounded-full font-mono">
                      {leads.length}
                    </span>
                  </label>

                  <div className="border-t border-neutral-100 my-1"></div>

                  {tags.map((t) => {
                    const isChecked = selectedTagFilters.includes(t.name);
                    const count = leads.filter((l) => {
                      if (!l.lastCallTag) return false;
                      return l.lastCallTag.split(',').map((x) => x.trim()).includes(t.name);
                    }).length;

                    const toggleTag = () => {
                      if (isChecked) {
                        onTagFilterChange(selectedTagFilters.filter((name) => name !== t.name));
                      } else {
                        onTagFilterChange([...selectedTagFilters, t.name]);
                      }
                    };

                    return (
                      <label
                        key={t.id}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-neutral-50 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={toggleTag}
                            className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 shrink-0"
                          />
                          <span
                            style={{ backgroundColor: t.bgColor, color: t.color }}
                            className="px-2 py-0.5 rounded text-[11px] font-semibold border border-black/5 truncate max-w-[140px]"
                          >
                            {t.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-neutral-400 font-mono shrink-0 ml-1">
                          {count} {count === 1 ? 'lead' : 'leads'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Botões Utilitários Secundários */}
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={async () => {
                try {
                  onShowToast('Varrendo banco de dados para recuperar sites antigos...');
                  const res = await fetch('/api/leads/recover-websites', { method: 'POST' });
                  const data = await res.json();
                  if (data.recoveredCount > 0) {
                    onShowToast(`🎉 ${data.recoveredCount} sites antigos recuperados com sucesso! Atualizando...`);
                    setTimeout(() => window.location.reload(), 1200);
                  } else {
                    onShowToast('Varredura concluída. Nenhum site adicional identificado.');
                  }
                } catch (e) {
                  onShowToast('Erro ao varrer banco para recuperar sites.');
                }
              }}
              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-lg shadow-2xs transition-all cursor-pointer"
              title="Varre o banco e recupera links de sites antigos de clientes"
            >
              <Globe className="w-3.5 h-3.5 text-amber-600" />
              <span>Restaurar Sites</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                try {
                  onShowToast('Varrendo banco de dados para recuperar telefones...');
                  const res = await fetch('/api/leads/recover-phones', { method: 'POST' });
                  const data = await res.json();
                  if (data.recoveredCount > 0) {
                    onShowToast(`🎉 ${data.recoveredCount} telefones recuperados com sucesso! Atualizando...`);
                    setTimeout(() => window.location.reload(), 1200);
                  } else {
                    onShowToast('Varredura concluída. Nenhum número adicional encontrado nos históricos.');
                  }
                } catch (e) {
                  onShowToast('Erro ao varrer banco para recuperar telefones.');
                }
              }}
              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 rounded-lg shadow-2xs transition-all"
              title="Recupera números de telefone a partir de históricos"
            >
              <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
              <span>Restaurar Fones</span>
            </button>

            <button
              type="button"
              onClick={onOpenJsonBatchModal}
              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg shadow-2xs transition-all"
              title="Colar JSON para atualizar status ou sites em lote"
            >
              <FileCode className="w-3.5 h-3.5 text-blue-600" />
              <span>JSON</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
