import React, { useState, useEffect } from 'react';
import { Lead, CustomTag, PIPELINE_COLUMNS, ColumnStatus, Salesperson } from '../types';
import {
  BarChart3,
  TrendingUp,
  PhoneCall,
  Clock,
  AlertTriangle,
  CalendarClock,
  Users,
  CheckCircle2,
  Tag,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  MessageCircle,
  Eye,
  Award,
  UserCheck,
  Briefcase
} from 'lucide-react';
import { openWhatsApp } from '../lib/phone';
import { getFollowUpInfo } from '../lib/followUp';
import { getLeadNiche } from '../lib/niche';

interface CallLogItem {
  id: string;
  leadId: string;
  leadName?: string;
  phoneNumber?: string;
  columnStatus?: string;
  salespersonId?: string;
  salespersonName?: string;
  tag: string;
  comment: string;
  durationSeconds?: number;
  followUpAt?: string;
  createdAt: string;
}

interface AnalyticsDashboardProps {
  leads: Lead[];
  allLeads?: Lead[];
  tags: CustomTag[];
  salespeople?: Salesperson[];
  selectedSalespersonId?: string;
  onOpenDetails: (lead: Lead) => void;
  onShowToast: (msg: string) => void;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  leads,
  allLeads = [],
  tags,
  salespeople = [],
  selectedSalespersonId = 'ALL',
  onOpenDetails,
  onShowToast
}) => {
  const [calls, setCalls] = useState<CallLogItem[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);

  useEffect(() => {
    fetchCalls();
  }, [leads, selectedSalespersonId]);

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
      console.error('Erro ao carregar histórico no Dashboard:', err);
    } finally {
      setLoadingCalls(false);
    }
  };

  // 1. Métricas Globais
  const totalLeads = leads.length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCalls = calls.filter((c) => c.createdAt && c.createdAt.slice(0, 10) === todayStr);

  const todayTotalSeconds = todayCalls.reduce((acc, c) => acc + (c.durationSeconds || 0), 0);

  const validDurations = calls.map((c) => c.durationSeconds || 0).filter((d) => d > 0);
  const totalSeconds = validDurations.reduce((acc, curr) => acc + curr, 0);
  const avgDuration = validDurations.length > 0 ? Math.round(totalSeconds / validDurations.length) : 0;

  const formatSeconds = (sec: number) => {
    if (sec <= 0) return '00m 00s';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  };

  // Conversão: Leads em 'Interessado' ou 'Fechado'
  const closedOrInterested = leads.filter(
    (l) => l.columnStatus === 'Fechado' || l.columnStatus === 'Interessado'
  ).length;
  const closedOnly = leads.filter((l) => l.columnStatus === 'Fechado').length;
  const conversionRate = totalLeads > 0 ? ((closedOnly / totalLeads) * 100).toFixed(1) : '0.0';

  // Leads Agendados & Atrasados
  const scheduledLeads = leads.filter((l) => {
    if (!l.nextFollowUpAt) return false;
    const info = getFollowUpInfo(l.nextFollowUpAt);
    return info.status === 'OVERDUE' || info.status === 'TODAY' || info.status === 'SCHEDULED';
  });

  const overdueLeads = leads.filter((l) => getFollowUpInfo(l.nextFollowUpAt).status === 'OVERDUE');

  // Leads Estagnados (>3 dias sem contato)
  const threeDaysAgoMs = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const stagnantLeads = leads.filter((l) => {
    if (!l.lastCallAt) return true;
    return new Date(l.lastCallAt).getTime() < threeDaysAgoMs;
  });

  // 2. Contagem do Funil de Vendas
  const funnelCounts = PIPELINE_COLUMNS.map((col) => {
    const count = leads.filter((l) => l.columnStatus === col).length;
    const pct = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
    return { name: col, count, pct };
  });

  // 3. Distribuição de Etiquetas / Resultados de Chamadas
  const tagCountsMap: Record<string, number> = {};
  calls.forEach((c) => {
    if (c.tag) {
      c.tag.split(',').forEach((tName) => {
        const clean = tName.trim();
        if (clean) {
          tagCountsMap[clean] = (tagCountsMap[clean] || 0) + 1;
        }
      });
    }
  });

  const tagStats = Object.entries(tagCountsMap)
    .map(([name, count]) => {
      const tagObj = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
      return {
        name,
        count,
        pct: calls.length > 0 ? Math.round((count / calls.length) * 100) : 0,
        color: tagObj?.color || '#3b82f6',
        bgColor: tagObj?.bgColor || '#eff6ff'
      };
    })
    .sort((a, b) => b.count - a.count);

  // 4. Distribuição de Nichos de Mercado
  const nicheCountsMap: Record<string, number> = {};
  leads.forEach((l) => {
    const n = getLeadNiche(l);
    nicheCountsMap[n] = (nicheCountsMap[n] || 0) + 1;
  });

  const nicheStats = Object.entries(nicheCountsMap)
    .map(([name, count]) => ({
      name,
      count,
      pct: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const getColumnBadgeStyle = (col: ColumnStatus) => {
    switch (col) {
      case 'Leads':
        return 'bg-neutral-100 text-neutral-700 border-neutral-200';
      case 'Ligação 1':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Ligação 2':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'Ligação 3':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Ligação 4':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Interessado':
        return 'bg-cyan-50 text-cyan-800 border-cyan-200 font-bold';
      case 'Fechado':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold';
      case 'Recusado':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-neutral-100 text-neutral-600 border-neutral-200';
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header com Atualização */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs">
        <div>
          <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Dashboard de Desempenho e Indicadores do CRM
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Visão consolidada de conversão, produtividade de chamadas e retornos pendentes.
          </p>
        </div>

        <button
          onClick={fetchCalls}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg border border-neutral-200 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingCalls ? 'animate-spin' : ''}`} />
          <span>Atualizar Relatório</span>
        </button>
      </div>

      {/* Grid de 5 Cards Principais de KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Total de Leads */}
        <div className="bg-white border border-neutral-200/80 rounded-xl p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-semibold uppercase tracking-wider">
            <span>Base Total de Leads</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 leading-none">{totalLeads}</div>
          <div className="text-[11px] text-neutral-500 flex items-center justify-between pt-1 border-t border-neutral-100">
            <span>Fechados / Interessados:</span>
            <span className="font-bold text-emerald-600">{closedOrInterested}</span>
          </div>
        </div>

        {/* Card 2: Ligações Hoje / Total */}
        <div className="bg-white border border-neutral-200/80 rounded-xl p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-semibold uppercase tracking-wider">
            <span>Ligações Realizadas</span>
            <PhoneCall className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-neutral-900 leading-none">{todayCalls.length}</span>
            <span className="text-xs text-neutral-500">hoje</span>
          </div>
          <div className="text-[11px] text-neutral-500 flex items-center justify-between pt-1 border-t border-neutral-100">
            <span>Histórico Total:</span>
            <span className="font-semibold text-neutral-800">{calls.length} chamadas</span>
          </div>
        </div>

        {/* Card 3: Tempo Falado Hoje */}
        <div className="bg-white border border-blue-200 bg-blue-50/20 rounded-xl p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-blue-700 text-xs font-semibold uppercase tracking-wider">
            <span>Tempo Falado Hoje</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-blue-900 leading-none font-mono">
            {formatSeconds(todayTotalSeconds)}
          </div>
          <div className="text-[11px] text-neutral-500 flex items-center justify-between pt-1 border-t border-blue-100">
            <span>Acumulado de Hoje:</span>
            <span className="font-bold text-blue-700">{todayCalls.length} ligação(ões)</span>
          </div>
        </div>

        {/* Card 4: Tempo Médio de Ligação */}
        <div className="bg-white border border-neutral-200/80 rounded-xl p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-semibold uppercase tracking-wider">
            <span>Tempo Médio / Ligação</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 leading-none font-mono">
            {formatSeconds(avgDuration)}
          </div>
          <div className="text-[11px] text-neutral-500 flex items-center justify-between pt-1 border-t border-neutral-100">
            <span>Duração Total Gravada:</span>
            <span className="font-semibold text-neutral-800">{formatSeconds(totalSeconds)}</span>
          </div>
        </div>

        {/* Card 5: Taxa de Conversão */}
        <div className="bg-white border border-neutral-200/80 rounded-xl p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-semibold uppercase tracking-wider">
            <span>Taxa de Conversão</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 leading-none">{conversionRate}%</div>
          <div className="text-[11px] text-neutral-500 flex items-center justify-between pt-1 border-t border-neutral-100">
            <span>Leads em 'Fechado':</span>
            <span className="font-bold text-emerald-600">{closedOnly} leads</span>
          </div>
        </div>
      </div>

      {/* Grid Principal: Funil de Vendas (Esq) + Distribuição de Tags (Direita) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Funil de Vendas por Etapas */}
        <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              Funil de Vendas (Distribuição do Pipeline)
            </h3>
            <span className="text-xs text-neutral-500">{totalLeads} leads ativos</span>
          </div>

          <div className="space-y-3">
            {funnelCounts.map((f) => (
              <div key={f.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${getColumnBadgeStyle(f.name as ColumnStatus)}`}>
                    {f.name}
                  </span>
                  <div className="flex items-center gap-2 font-mono text-neutral-600 text-xs">
                    <span className="font-bold text-neutral-900">{f.count}</span>
                    <span className="text-neutral-400">({f.pct}%)</span>
                  </div>
                </div>

                {/* Barra Proporcional */}
                <div className="w-full bg-neutral-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      f.name === 'Fechado'
                        ? 'bg-emerald-500'
                        : f.name === 'Interessado'
                        ? 'bg-cyan-500'
                        : f.name === 'Recusado'
                        ? 'bg-rose-400'
                        : 'bg-blue-600'
                    }`}
                    style={{ width: `${Math.max(f.pct, f.count > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resultado das Ligações (Tags) */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Tag className="w-4 h-4 text-indigo-600" />
              Resultado das Ligações
            </h3>
            <span className="text-xs text-neutral-500">{calls.length} logs</span>
          </div>

          {tagStats.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-400 italic">
              Nenhuma ligação registrada ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {tagStats.map((t) => (
                <div key={t.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span
                      style={{ backgroundColor: t.bgColor, color: t.color }}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold border border-black/5 truncate max-w-[160px]"
                    >
                      {t.name}
                    </span>
                    <span className="font-mono text-xs text-neutral-700">
                      <strong className="text-neutral-900">{t.count}</strong> ({t.pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(t.pct, 4)}%`,
                        backgroundColor: t.color
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Card de Distribuição por Nichos de Mercado */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-amber-600" />
              Distribuição por Nichos / Segmentos de Mercado
            </h3>
            <p className="text-[11px] text-neutral-500">Mapeamento dos leads por ramo de atividade</p>
          </div>
          <span className="text-xs font-semibold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded">
            {nicheStats.length} nichos detectados
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {nicheStats.map((n) => (
            <div key={n.name} className="p-3 rounded-lg border border-neutral-100 bg-neutral-50/50 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-neutral-800 truncate" title={n.name}>
                  {n.name}
                </span>
                <span className="font-mono font-bold text-neutral-900 shrink-0 ml-1">
                  {n.count} <span className="font-normal text-neutral-400">({n.pct}%)</span>
                </span>
              </div>
              <div className="w-full bg-neutral-200/80 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-500"
                  style={{ width: `${Math.max(n.pct, n.count > 0 ? 5 : 0)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grid de Tabelas de Ação: Agendamentos Pendentes e Retornos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Retornos & Follow-ups Agendados */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-amber-600" />
                Próximos Retornos Agendados
              </h3>
              <p className="text-[11px] text-neutral-500">Leads que requerem retorno agendado</p>
            </div>
            {overdueLeads.length > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-bold text-rose-800 bg-rose-100 rounded border border-rose-200">
                🚨 {overdueLeads.length} Atrasado(s)
              </span>
            )}
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {scheduledLeads.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-400 italic">
                Nenhum retorno agendado no momento.
              </div>
            ) : (
              scheduledLeads.map((lead) => {
                const fInfo = getFollowUpInfo(lead.nextFollowUpAt);
                return (
                  <div
                    key={lead.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-neutral-100 hover:bg-neutral-50 transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-neutral-900 truncate">
                          {lead.name}
                        </span>
                        <span className={`px-2 py-0.2 text-[10px] rounded font-medium border ${getColumnBadgeStyle(lead.columnStatus)}`}>
                          {lead.columnStatus}
                        </span>
                      </div>
                      <span className="text-[11px] text-neutral-500 font-mono block mt-0.5">
                        {lead.phoneNumber}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded border ${
                        fInfo.status === 'OVERDUE'
                          ? 'bg-rose-100 text-rose-800 border-rose-200'
                          : fInfo.status === 'TODAY'
                          ? 'bg-amber-100 text-amber-900 border-amber-200'
                          : 'bg-blue-50 text-blue-800 border-blue-200'
                      }`}>
                        {fInfo.label}
                      </span>

                      <button
                        onClick={() => openWhatsApp(lead.phoneNumber, lead.publicUrl ? `Olá! Vi seu site: ${lead.publicUrl}` : undefined)}
                        className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50"
                        title="Abrir WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => onOpenDetails(lead)}
                        className="p-1.5 rounded text-neutral-600 hover:bg-neutral-200"
                        title="Ver Detalhes do Lead"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Leads Estagnados (>3 Dias sem Contato) */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                Leads Estagnados (&gt;3 Dias sem Contato)
              </h3>
              <p className="text-[11px] text-neutral-500">Leads que não recebem ligação há mais de 72h</p>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-bold text-neutral-700 bg-neutral-100 rounded border border-neutral-200">
              {stagnantLeads.length} lead(s)
            </span>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {stagnantLeads.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-400 italic">
                Parabéns! Nenhum lead estagnado no momento.
              </div>
            ) : (
              stagnantLeads.slice(0, 10).map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-neutral-100 hover:bg-neutral-50 transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <span className="font-semibold text-xs text-neutral-900 truncate block">
                      {lead.name}
                    </span>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-500 font-mono mt-0.5">
                      <span>{lead.phoneNumber}</span>
                      <span>•</span>
                      <span className="text-rose-600 font-sans font-medium">
                        {lead.lastCallAt ? `Último contato em ${new Date(lead.lastCallAt).toLocaleDateString('pt-BR')}` : 'Nunca contatado'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onOpenDetails(lead)}
                      className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                    >
                      Ligar Agora
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Desempenho por Vendedor / Equipe */}
      {salespeople.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              Desempenho da Equipe de Vendas
            </h3>
            <span className="text-xs text-neutral-500 font-medium">{salespeople.length} vendedor(es) na equipe</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500 font-medium bg-neutral-50/50">
                  <th className="py-2.5 px-3">Vendedor</th>
                  <th className="py-2.5 px-3">Carteira Total</th>
                  <th className="py-2.5 px-3">Novos (Sem Contato)</th>
                  <th className="py-2.5 px-3">Em Andamento</th>
                  <th className="py-2.5 px-3">Fechados</th>
                  <th className="py-2.5 px-3">Taxa de Conversão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-800 font-medium">
                {salespeople.map((seller) => {
                  const baseLeads = allLeads.length > 0 ? allLeads : leads;
                  const sLeads = baseLeads.filter(l => (l.salespersonId || 'seller-thomas') === seller.id);
                  const uncontacted = sLeads.filter(l => l.columnStatus === 'Leads' && (!l.callCount || l.callCount === 0)).length;
                  const inProgress = sLeads.filter(l => ['Ligação 1', 'Ligação 2', 'Ligação 3', 'Ligação 4', 'Interessado'].includes(l.columnStatus)).length;
                  const closed = sLeads.filter(l => l.columnStatus === 'Fechado').length;
                  const rate = sLeads.length > 0 ? ((closed / sLeads.length) * 100).toFixed(1) : '0.0';

                  return (
                    <tr key={seller.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-3 h-3 rounded-full shrink-0" 
                            style={{ backgroundColor: seller.color || '#0284c7' }} 
                          />
                          <div>
                            <span className="font-bold text-neutral-900">{seller.name}</span>
                            {seller.isDefault && (
                              <span className="ml-1.5 text-[9px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-full uppercase">
                                Principal
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-bold text-neutral-900">{sLeads.length}</td>
                      <td className="py-3 px-3 text-neutral-600 font-mono">{uncontacted}</td>
                      <td className="py-3 px-3 text-blue-700 font-mono font-semibold">{inProgress}</td>
                      <td className="py-3 px-3 text-emerald-700 font-bold font-mono">+{closed}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {rate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Histórico Recente de Ligações Gravadas */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-blue-600" />
            Atividade Recente de Ligações
          </h3>
          <span className="text-xs text-neutral-500">Últimas {Math.min(calls.length, 15)} ligações registradas</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-500 font-medium bg-neutral-50/50">
                <th className="py-2 px-3">Data e Hora</th>
                <th className="py-2 px-3">Lead</th>
                <th className="py-2 px-3">Telefone</th>
                <th className="py-2 px-3">Resultado (Etiqueta)</th>
                <th className="py-2 px-3">Duração</th>
                <th className="py-2 px-3">Observação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {calls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-neutral-400 italic">
                    Nenhum registro de ligação ainda.
                  </td>
                </tr>
              ) : (
                calls.slice(0, 15).map((c) => {
                  const tagObj = tags.find((t) => t.name.toLowerCase() === c.tag.toLowerCase());
                  return (
                    <tr key={c.id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-2.5 px-3 text-neutral-500 font-mono text-[11px] whitespace-nowrap">
                        {new Date(c.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-neutral-900">
                        {c.leadName || 'Lead'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-neutral-600">
                        {c.phoneNumber || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          style={{
                            backgroundColor: tagObj?.bgColor || '#eff6ff',
                            color: tagObj?.color || '#1d4ed8'
                          }}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold border border-black/5"
                        >
                          {c.tag}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-neutral-700">
                        {c.durationSeconds ? formatSeconds(c.durationSeconds) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-neutral-600 max-w-xs truncate">
                        {c.comment || <span className="text-neutral-300 italic">Sem observações</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
