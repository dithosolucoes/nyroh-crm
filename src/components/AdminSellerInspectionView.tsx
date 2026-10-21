import React, { useState, useEffect, useMemo } from 'react';
import { Salesperson, Lead } from '../types';
import { getSalespersonSlug, matchSalespersonFromRoute } from '../lib/salesperson';
import {
  TrendingUp,
  Layers,
  PhoneCall,
  Shield,
  Briefcase,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Copy,
  Check,
  Lock,
  Unlock,
  Edit3,
  Trash2,
  ArrowRight,
  User,
  Mail,
  Phone,
  Palette,
  ExternalLink,
  ChevronRight
} from 'lucide-react';

interface AdminSellerInspectionViewProps {
  salespersonId: string;
  salespeople: Salesperson[];
  leads: Lead[];
  onSelectSalesperson: (id: string) => void;
  onNavigateToKanban: (sellerId?: string) => void;
  onRefreshData?: () => void;
  onLeadClick?: (lead: Lead) => void;
  onShowToast: (msg: string) => void;
}

const COLOR_PALETTE = [
  { name: 'Azul Executivo', color: '#0284c7', bgColor: '#e0f2fe' },
  { name: 'Roxo Royal', color: '#7c3aed', bgColor: '#ede9fe' },
  { name: 'Esmeralda', color: '#059669', bgColor: '#d1fae5' },
  { name: 'Âmbar Dourado', color: '#d97706', bgColor: '#fef3c7' },
  { name: 'Rosa Carmim', color: '#db2777', bgColor: '#fce7f3' },
  { name: 'Índigo Moderno', color: '#4f46e5', bgColor: '#e0e7ff' },
  { name: 'Teal Oceano', color: '#0d9488', bgColor: '#ccfbf1' },
  { name: 'Ardósia / Grafite', color: '#475569', bgColor: '#f1f5f9' },
];

export const AdminSellerInspectionView: React.FC<AdminSellerInspectionViewProps> = ({
  salespersonId,
  salespeople,
  leads,
  onSelectSalesperson,
  onNavigateToKanban,
  onRefreshData,
  onLeadClick,
  onShowToast
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'funil' | 'carteira' | 'historico' | 'acesso'>('funil');
  const [statsData, setStatsData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Bulk lead transfer state
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [batchTargetSellerId, setBatchTargetSellerId] = useState<string>('');
  const [isTransferringBatch, setIsTransferringBatch] = useState(false);

  // Subtab 4: Seller Edit Form State
  const isAll = salespersonId === 'ALL';
  const currentSeller = useMemo(() => {
    if (isAll) return null;
    const byId = salespeople.find((s) => s.id === salespersonId);
    if (byId) return byId;
    const byIdCase = salespeople.find((s) => s.id.toLowerCase() === (salespersonId || '').toLowerCase());
    if (byIdCase) return byIdCase;
    const byRoute = matchSalespersonFromRoute(salespersonId, salespeople);
    if (byRoute) return byRoute;
    return salespeople.length > 0 ? salespeople[0] : null;
  }, [salespeople, salespersonId, isAll]);

  const [editName, setEditName] = useState(currentSeller?.name || '');
  const [editEmail, setEditEmail] = useState(currentSeller?.email || '');
  const [editPhone, setEditPhone] = useState(currentSeller?.phone || '');
  const [editSlug, setEditSlug] = useState(currentSeller ? getSalespersonSlug(currentSeller) : '');
  const [editColor, setEditColor] = useState(currentSeller?.color || '#0284c7');
  const [editBgColor, setEditBgColor] = useState(currentSeller?.bgColor || '#e0f2fe');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Subtab 4: Password Reset State
  const [newPassword, setNewPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Subtab 4: Toggle Active State
  const [isTogglingActive, setIsTogglingActive] = useState(false);

  // Sync edit form when selected seller changes
  useEffect(() => {
    if (currentSeller) {
      setEditName(currentSeller.name || '');
      setEditEmail(currentSeller.email || '');
      setEditPhone(currentSeller.phone || '');
      setEditSlug(getSalespersonSlug(currentSeller));
      setEditColor(currentSeller.color || '#0284c7');
      setEditBgColor(currentSeller.bgColor || '#e0f2fe');
      setNewPassword('');
    }
    setSelectedLeadIds([]);
  }, [salespersonId, currentSeller]);

  useEffect(() => {
    fetchStats();
  }, [salespersonId]);

  const fetchStats = async () => {
    if (isAll) {
      setStatsData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/salesperson/${salespersonId}/stats`);
      if (res.ok) {
        const data = await res.json();
        setStatsData(data);
      }
    } catch (err) {
      console.error('Erro ao carregar estatísticas do vendedor:', err);
    } finally {
      setLoading(false);
    }
  };

  const sellerLeads = isAll
    ? leads
    : leads.filter((l) => (l.salespersonId || '').toLowerCase() === salespersonId.toLowerCase());

  const totalLeads = sellerLeads.length;
  const uncontacted = sellerLeads.filter((l) => l.columnStatus === 'Leads' && (!l.callCount || l.callCount === 0)).length;
  const inProgress = sellerLeads.filter((l) => l.columnStatus && l.columnStatus.startsWith('Ligação')).length;
  const closed = sellerLeads.filter((l) => l.columnStatus === 'Fechado').length;
  const lost = sellerLeads.filter((l) => l.columnStatus === 'Recusado').length;
  const totalCalls = sellerLeads.reduce((acc, l) => acc + (l.callCount || 0), 0);
  const conversionRate = totalLeads > 0 ? ((closed / totalLeads) * 100).toFixed(1) : '0.0';

  const filteredLeads = sellerLeads.filter((l) => {
    if (statusFilter !== 'ALL' && l.columnStatus !== statusFilter) return false;
    if (leadSearch.trim()) {
      const q = leadSearch.toLowerCase().trim();
      const phoneClean = (l.phoneNumber || '').replace(/\D/g, '');
      const searchClean = q.replace(/\D/g, '');
      return (
        l.name.toLowerCase().includes(q) ||
        (l.phoneNumber && l.phoneNumber.toLowerCase().includes(q)) ||
        (searchClean.length >= 3 && phoneClean.includes(searchClean)) ||
        (l.lastCallTag && l.lastCallTag.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Reassign single lead inline
  const handleReassignLead = async (leadId: string, newSalespersonId: string) => {
    if (!newSalespersonId) return;
    const target = salespeople.find((s) => s.id === newSalespersonId);
    try {
      const res = await fetch(`/api/leads/${leadId}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salespersonId: newSalespersonId,
          salespersonName: target?.name || 'Thomas'
        })
      });
      if (res.ok) {
        onShowToast(`Lead reatribuído para ${target?.name || 'novo vendedor'} com sucesso!`);
        if (onRefreshData) onRefreshData();
      } else {
        onShowToast('Erro ao reatribuir lead.');
      }
    } catch (err) {
      console.error(err);
      onShowToast('Falha na comunicação com o servidor.');
    }
  };

  // Bulk transfer selected leads
  const handleBatchTransfer = async () => {
    if (selectedLeadIds.length === 0) {
      onShowToast('Selecione ao menos um lead para transferir.');
      return;
    }
    if (!batchTargetSellerId) {
      onShowToast('Selecione o vendedor de destino.');
      return;
    }
    const target = salespeople.find((s) => s.id === batchTargetSellerId);
    setIsTransferringBatch(true);
    try {
      const res = await fetch('/api/leads/batch-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: selectedLeadIds,
          targetSalespersonId: batchTargetSellerId,
          targetSalespersonName: target?.name || 'Thomas'
        })
      });
      if (res.ok) {
        const data = await res.json();
        onShowToast(data.message || 'Leads transferidos com sucesso!');
        setSelectedLeadIds([]);
        if (onRefreshData) onRefreshData();
      } else {
        onShowToast('Erro ao transferir lote de leads.');
      }
    } catch (err) {
      console.error(err);
      onShowToast('Falha ao transferir leads.');
    } finally {
      setIsTransferringBatch(false);
    }
  };

  // Toggle Closer Active/Blocked status
  const handleToggleActive = async () => {
    if (!currentSeller) return;
    const nextStatus = currentSeller.active === false ? true : false;
    setIsTogglingActive(true);
    try {
      const res = await fetch(`/api/salespeople/${currentSeller.id}/toggle-active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextStatus })
      });
      if (res.ok) {
        onShowToast(
          nextStatus
            ? `Acesso de ${currentSeller.name} DESBLOQUEADO com sucesso!`
            : `Acesso de ${currentSeller.name} BLOQUEADO com sucesso!`
        );
        if (onRefreshData) onRefreshData();
      } else {
        onShowToast('Erro ao alterar status do vendedor.');
      }
    } catch (err) {
      console.error(err);
      onShowToast('Falha na conexão com o servidor.');
    } finally {
      setIsTogglingActive(false);
    }
  };

  // Save profile changes (Name, Email, Phone, Slug, Colors)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSeller) return;
    if (!editName.trim()) {
      onShowToast('O nome do vendedor é obrigatório.');
      return;
    }
    setIsSavingProfile(true);
    try {
      const res = await fetch(`/api/salespeople/${currentSeller.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          email: editEmail.trim(),
          phone: editPhone.trim(),
          slug: editSlug.trim().toLowerCase(),
          color: editColor,
          bgColor: editBgColor,
          active: currentSeller.active !== false
        })
      });
      if (res.ok) {
        onShowToast(`Perfil de ${editName.trim()} atualizado com sucesso!`);
        if (onRefreshData) onRefreshData();
      } else {
        const data = await res.json();
        onShowToast(data.error || 'Erro ao salvar alterações do vendedor.');
      }
    } catch (err) {
      console.error(err);
      onShowToast('Falha na comunicação ao salvar dados.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Reset or create password for salesperson
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSeller) return;
    if (!newPassword.trim() || newPassword.trim().length < 4) {
      onShowToast('A senha deve ter pelo menos 4 caracteres.');
      return;
    }
    setIsResettingPassword(true);
    try {
      const res = await fetch(`/api/salespeople/${currentSeller.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPassword.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        onShowToast(`Senha de ${currentSeller.name} definida com sucesso!`);
        setNewPassword('');
        if (onRefreshData) onRefreshData();
      } else {
        const data = await res.json();
        onShowToast(data.error || 'Erro ao redefinir senha do vendedor.');
      }
    } catch (err) {
      console.error(err);
      onShowToast('Falha ao conectar com o servidor.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Generate strong random password
  const generateStrongPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
    let pass = '';
    for (let i = 0; i < 8; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pass);
    onShowToast(`Senha sugerida gerada: ${pass}`);
  };

  const sellerSlug = currentSeller ? getSalespersonSlug(currentSeller) : '';
  const sellerLink = typeof window !== 'undefined' ? `${window.location.origin}/v/${sellerSlug}` : `/v/${sellerSlug}`;

  const copySellerLink = () => {
    navigator.clipboard.writeText(sellerLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    onShowToast('Link exclusivo copiado para a área de transferência!');
  };

  const copyCredsMessage = () => {
    if (!currentSeller) return;
    const text = `🔐 Olá ${currentSeller.name}, aqui estão seus acessos ao CRM:\n🔗 Link da sua Carteira: ${sellerLink}\n👤 Login: ${currentSeller.email || `${sellerSlug}@empresa.com`}\n🔑 Senha: (informada pela gerência)\nBoas vendas! 🚀`;
    navigator.clipboard.writeText(text);
    setCopiedCreds(true);
    setTimeout(() => setCopiedCreds(false), 2500);
    onShowToast('Mensagem pronta para WhatsApp copiada com sucesso!');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8f9fa] overflow-y-auto">
      {/* Top Header of Inspection View */}
      <div className="bg-white border-b border-neutral-200 px-6 py-4 shrink-0 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white text-base shadow-xs shrink-0"
              style={{ backgroundColor: isAll ? '#171717' : currentSeller?.color || '#0284c7' }}
            >
              {isAll ? <Briefcase className="w-5 h-5 text-neutral-300" /> : ((currentSeller?.name || 'C').charAt(0).toUpperCase())}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-neutral-900 tracking-tight">
                  {isAll ? 'Desempenho Geral Consolidado de Todos os Closers' : `Raio-X: ${currentSeller?.name || 'Closer'}`}
                </h1>
                {!isAll && currentSeller && (
                  <>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-bold">
                      ID: {currentSeller.id}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                        currentSeller.active !== false
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-red-50 text-red-800 border-red-200'
                      }`}
                    >
                      {currentSeller.active !== false ? '● Acesso Ativo' : '✕ Bloqueado'}
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                {isAll
                  ? 'Métricas somadas, funil macro de vendas e auditoria da carteira global com 684+ leads.'
                  : `Auditoria e controle total de ${currentSeller?.name || 'vendedor'}: funil, carteira individual, notas e credenciais de acesso.`}
              </p>
            </div>
          </div>

          {/* Quick Actions & Closer Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-neutral-50 border border-neutral-200 rounded-xl px-2 py-1">
              <span className="text-[10px] font-bold text-neutral-400 uppercase">Closer:</span>
              <select
                value={salespersonId}
                onChange={(e) => onSelectSalesperson(e.target.value)}
                className="text-xs font-bold bg-transparent text-neutral-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Visão Geral (Todos os Closers)</option>
                {salespeople.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.totalLeads || 0} leads)
                  </option>
                ))}
              </select>
            </div>

            {!isAll && (
              <button
                onClick={() => onNavigateToKanban(salespersonId)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors"
                title="Abrir o Kanban exclusivo desse vendedor"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Abrir Kanban Dele</span>
              </button>
            )}

            <button
              onClick={() => {
                fetchStats();
                if (onRefreshData) onRefreshData();
                onShowToast('Dados do vendedor atualizados!');
              }}
              className="p-2 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-600 transition-colors"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 4 Executive KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200/80">
            <span className="text-[11px] font-semibold text-neutral-500 block">Total de Leads na Carteira</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-extrabold text-neutral-900 font-mono">{totalLeads}</span>
              <span className="text-[11px] text-neutral-500">atribuídos</span>
            </div>
          </div>

          <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200/80">
            <span className="text-[11px] font-semibold text-neutral-500 block">Leads Sem Contato (Virgens)</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-xl font-extrabold font-mono ${uncontacted > 0 ? 'text-amber-600' : 'text-neutral-900'}`}>
                {uncontacted}
              </span>
              <span className="text-[11px] text-neutral-500">
                {totalLeads > 0 ? `${((uncontacted / totalLeads) * 100).toFixed(0)}% da base` : '0%'}
              </span>
            </div>
          </div>

          <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200/80">
            <span className="text-[11px] font-semibold text-neutral-500 block">Fechamentos Concretizados</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-extrabold text-emerald-600 font-mono">{closed}</span>
              <span className="text-[11px] text-neutral-500">taxa {conversionRate}%</span>
            </div>
          </div>

          <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200/80">
            <span className="text-[11px] font-semibold text-neutral-500 block">Ligações Registradas</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-extrabold text-blue-600 font-mono">{totalCalls}</span>
              <span className="text-[11px] text-neutral-500">toques gravados</span>
            </div>
          </div>
        </div>

        {/* 4 Distinct Sub-Tabs */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveSubTab('funil')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
              activeSubTab === 'funil'
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                : 'bg-white text-neutral-600 hover:bg-neutral-50 border-neutral-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>1. Funil & Conversão</span>
          </button>

          <button
            onClick={() => setActiveSubTab('carteira')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
              activeSubTab === 'carteira'
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                : 'bg-white text-neutral-600 hover:bg-neutral-50 border-neutral-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2. Carteira de Leads ({totalLeads})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('historico')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
              activeSubTab === 'historico'
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                : 'bg-white text-neutral-600 hover:bg-neutral-50 border-neutral-200'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>3. Histórico de Chamadas & Notas</span>
          </button>

          {!isAll && (
            <button
              onClick={() => setActiveSubTab('acesso')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                activeSubTab === 'acesso'
                  ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                  : 'bg-white text-neutral-600 hover:bg-neutral-50 border-neutral-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>4. Acesso & Credenciais do Closer</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Sub-Tab Body */}
      <div className="p-6 space-y-6">
        {/* SUB-TAB 1: FUNIL DE VENDAS */}
        {activeSubTab === 'funil' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-2xs">
              <h3 className="text-sm font-bold text-neutral-900 mb-1">
                Etapas do Funil de Conversão
              </h3>
              <p className="text-xs text-neutral-500 mb-4">
                Distribuição dos leads nas etapas do processo comercial de atendimento.
              </p>

              <div className="space-y-3 text-xs">
                {[
                  { label: 'Leads Virgens (Sem Contato)', count: uncontacted, color: 'bg-amber-500' },
                  { label: 'Ligação 1 (Primeiro Contato)', count: sellerLeads.filter(l => l.columnStatus === 'Ligação 1').length, color: 'bg-blue-400' },
                  { label: 'Ligação 2 (Follow-up)', count: sellerLeads.filter(l => l.columnStatus === 'Ligação 2').length, color: 'bg-blue-500' },
                  { label: 'Ligação 3 (Fechamento/Negociação)', count: sellerLeads.filter(l => l.columnStatus === 'Ligação 3').length, color: 'bg-blue-600' },
                  { label: 'Fechado (Venda Ganha)', count: closed, color: 'bg-emerald-500' },
                  { label: 'Recusado (Descartado/Sem Interesse)', count: lost, color: 'bg-neutral-400' }
                ].map((step, idx) => {
                  const pct = totalLeads > 0 ? ((step.count / totalLeads) * 100).toFixed(0) : '0';
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between font-semibold">
                        <span className="text-neutral-700">{step.label}</span>
                        <span className="text-neutral-900 font-mono">
                          {step.count} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-neutral-100 overflow-hidden">
                        <div
                          className={`h-full ${step.color} rounded-full transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold text-neutral-900 mb-1">
                Diagnóstico de Produtividade Comercial
              </h3>
              <p className="text-xs text-neutral-500">
                Avaliação dos pontos de gargalo e velocidade de atendimento.
              </p>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200">
                  <div className="font-bold text-neutral-800 mb-0.5">Leads Parados na Gaveta</div>
                  <div className="text-neutral-600">
                    {uncontacted > 0 ? (
                      <span className="text-amber-700 font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Atenção: existem {uncontacted} leads na carteira sem nenhuma ligação realizada.
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Excelente: zero leads virgens parados. Toda a carteira recebeu ao menos um toque.
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200">
                  <div className="font-bold text-neutral-800 mb-0.5">Taxa de Conversão</div>
                  <div className="text-neutral-600">
                    Conversão calculada em <strong className="text-neutral-900">{conversionRate}%</strong> com {closed} fechamentos concretizados.
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200">
                  <div className="font-bold text-neutral-800 mb-0.5">Intensidade de Contato</div>
                  <div className="text-neutral-600">
                    Média de{' '}
                    <strong className="text-neutral-900">
                      {totalLeads > 0 ? (totalCalls / totalLeads).toFixed(1) : '0'} ligações por lead
                    </strong>{' '}
                    na carteira deste closer.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 2: CARTEIRA DE LEADS */}
        {activeSubTab === 'carteira' && (
          <div className="space-y-4">
            {/* Action Bar & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs">
              <div className="flex items-center gap-2 flex-1 max-w-lg">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                    placeholder="Buscar lead por nome, telefone ou tag..."
                    className="w-full pl-8 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs bg-neutral-50 border border-neutral-200 rounded-xl px-2.5 py-2 font-medium text-neutral-700 focus:outline-none"
                >
                  <option value="ALL">Todas as Etapas</option>
                  <option value="Leads">Leads (Sem Contato)</option>
                  <option value="Ligação 1">Ligação 1</option>
                  <option value="Ligação 2">Ligação 2</option>
                  <option value="Ligação 3">Ligação 3</option>
                  <option value="Ligação 4">Ligação 4</option>
                  <option value="Interessado">Interessado</option>
                  <option value="Fechado">Fechado</option>
                  <option value="Recusado">Recusado</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-500 font-mono">
                  {filteredLeads.length} de {sellerLeads.length} lead(s)
                </span>
                <button
                  onClick={() => onNavigateToKanban(isAll ? undefined : salespersonId)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-800 transition-colors shadow-2xs"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Ver no Kanban</span>
                </button>
              </div>
            </div>

            {/* Batch Transfer Bar (shows when leads are selected) */}
            {selectedLeadIds.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-mono text-xs font-bold flex items-center justify-center">
                    {selectedLeadIds.length}
                  </span>
                  <span className="text-xs font-bold text-blue-950">
                    lead(s) selecionado(s) para transferência em lote:
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={batchTargetSellerId}
                    onChange={(e) => setBatchTargetSellerId(e.target.value)}
                    className="text-xs bg-white border border-blue-300 rounded-xl px-3 py-1.5 font-semibold text-neutral-800 focus:outline-none"
                  >
                    <option value="">Selecione o Vendedor de Destino...</option>
                    {salespeople.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={handleBatchTransfer}
                    disabled={isTransferringBatch || !batchTargetSellerId}
                    className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-colors"
                  >
                    {isTransferringBatch ? 'Transferindo...' : 'Transferir Agora'}
                  </button>

                  <button
                    onClick={() => setSelectedLeadIds([])}
                    className="text-xs text-neutral-500 hover:text-neutral-800 px-2 py-1"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Tabela de Leads */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-neutral-50/90 border-b border-neutral-200 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                      <th className="py-3 px-3 w-8 text-center">
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.length > 0 && selectedLeadIds.length === filteredLeads.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedLeadIds(filteredLeads.map((l) => l.id));
                            } else {
                              setSelectedLeadIds([]);
                            }
                          }}
                          className="rounded border-neutral-300 text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      </th>
                      <th className="py-3 px-4">Nome do Lead</th>
                      <th className="py-3 px-4">Telefone</th>
                      <th className="py-3 px-4">Etapa Atual</th>
                      <th className="py-3 px-4">Toques / Tag</th>
                      <th className="py-3 px-4">Vendedor Responsável (Reatribuir)</th>
                      <th className="py-3 px-4 text-right">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-neutral-400">
                          Nenhum lead encontrado com os filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.map((lead) => {
                        const seller = salespeople.find((s) => s.id === lead.salespersonId);
                        const isSelected = selectedLeadIds.includes(lead.id);

                        return (
                          <tr
                            key={lead.id}
                            className={`transition-colors ${isSelected ? 'bg-blue-50/50' : 'hover:bg-neutral-50/70'}`}
                          >
                            <td className="py-3 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedLeadIds((prev) => [...prev, lead.id]);
                                  } else {
                                    setSelectedLeadIds((prev) => prev.filter((id) => id !== lead.id));
                                  }
                                }}
                                className="rounded border-neutral-300 text-blue-600 focus:ring-0 cursor-pointer"
                              />
                            </td>

                            <td className="py-3 px-4">
                              <button
                                onClick={() => onLeadClick && onLeadClick(lead)}
                                className="text-left font-bold text-neutral-900 hover:text-blue-600 transition-colors flex items-center gap-1.5 group"
                              >
                                <span>{lead.name}</span>
                                <ChevronRight className="w-3 h-3 text-neutral-300 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all" />
                              </button>
                            </td>

                            <td className="py-3 px-4 text-neutral-600 font-mono text-[11px]">
                              {lead.phoneNumber ? (
                                <a
                                  href={`tel:${lead.phoneNumber}`}
                                  className="hover:text-blue-600 transition-colors"
                                >
                                  {lead.phoneNumber}
                                </a>
                              ) : (
                                <span className="text-neutral-400">Sem telefone</span>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  lead.columnStatus === 'Fechado'
                                    ? 'bg-emerald-100 text-emerald-900'
                                    : lead.columnStatus === 'Recusado'
                                    ? 'bg-neutral-100 text-neutral-700'
                                    : lead.columnStatus === 'Leads'
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-blue-100 text-blue-900'
                                }`}
                              >
                                {lead.columnStatus}
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-neutral-800 bg-neutral-100 px-1.5 py-0.5 rounded">
                                  {lead.callCount || 0}
                                </span>
                                {lead.lastCallTag && (
                                  <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-medium truncate max-w-[90px]">
                                    {lead.lastCallTag}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <select
                                value={lead.salespersonId || 'seller-thomas'}
                                onChange={(e) => handleReassignLead(lead.id, e.target.value)}
                                className="text-xs bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1 font-semibold text-neutral-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                              >
                                {salespeople.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => onLeadClick && onLeadClick(lead)}
                                className="text-blue-600 hover:text-blue-800 text-[11px] font-bold px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                              >
                                Ver Raio-X
                              </button>
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
        )}

        {/* SUB-TAB 3: HISTÓRICO DE LIGAÇÕES & NOTAS */}
        {activeSubTab === 'historico' && (
          <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">
                  Registro Caixa-Preta de Chamadas Realizadas
                </h3>
                <p className="text-xs text-neutral-500">
                  Acompanhamento de anotações, retornos e tags gravados pelos closers.
                </p>
              </div>
              <button
                onClick={fetchStats}
                className="p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-600"
                title="Recarregar histórico"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loading ? (
              <div className="text-center py-8 text-neutral-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                Carregando histórico de ligações...
              </div>
            ) : statsData?.recentCalls && statsData.recentCalls.length > 0 ? (
              <div className="space-y-3">
                {statsData.recentCalls.map((call: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-xs">
                    <div className="flex items-center justify-between pb-1.5 border-b border-neutral-200/60">
                      <span className="font-bold text-neutral-900">
                        Lead: {call.lead_name || 'Lead sem nome'} ({call.lead_phone || 'Sem fone'})
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">
                        {call.created_at ? new Date(call.created_at).toLocaleString('pt-BR') : '—'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900">
                        Tag: {call.tag || 'Sem tag'}
                      </span>
                      {call.duration && (
                        <span className="text-neutral-500 font-mono">
                          Duração: {call.duration}s
                        </span>
                      )}
                    </div>
                    {call.comment && (
                      <p className="mt-1.5 text-neutral-700 italic bg-white p-2.5 rounded-lg border border-neutral-200">
                        "{call.comment}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-neutral-400 text-xs">
                Nenhum registro de chamada gravado ainda para este vendedor.
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 4: ACESSO & CREDENCIAIS DO CLOSER */}
        {activeSubTab === 'acesso' && currentSeller && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card 1: Status & Controle de Acesso */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Status da Conta & Blindagem
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Controle se o closer pode ou não acessar o CRM e discar.
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    currentSeller.active !== false
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-red-100 text-red-900 border border-red-300'
                  }`}
                >
                  {currentSeller.active !== false ? '● ATIVO' : '✕ BLOQUEADO'}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <strong className="text-xs text-neutral-900 block">
                      {currentSeller.active !== false ? 'Acesso Liberado para Trabalho' : 'Acesso Bloqueado pela Diretoria'}
                    </strong>
                    <span className="text-[11px] text-neutral-500">
                      {currentSeller.active !== false
                        ? 'O vendedor pode acessar o Kanban, realizar ligações e mover leads.'
                        : 'Qualquer tentativa de login ou discagem deste vendedor está revogada.'}
                    </span>
                  </div>

                  <button
                    onClick={handleToggleActive}
                    disabled={isTogglingActive}
                    className={`px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0 flex items-center gap-1.5 ${
                      currentSeller.active !== false
                        ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {currentSeller.active !== false ? (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Bloquear Acesso</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Desbloquear Closer</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Permissão: Gerador de Laudo Técnico & PDF */}
                <div className="pt-3 border-t border-neutral-200 flex items-center justify-between gap-3">
                  <div>
                    <strong className="text-xs text-neutral-900 block flex items-center gap-1.5">
                      <span>📄 Gerador de Diagnóstico & Laudo PDF</span>
                      <span className={`text-[10px] px-2 py-0.2 rounded-full font-bold ${
                        currentSeller.canGenerateAuditPdf !== false
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-neutral-200 text-neutral-600'
                      }`}>
                        {currentSeller.canGenerateAuditPdf !== false ? 'Liberado' : 'Desativado'}
                      </span>
                    </strong>
                    <span className="text-[11px] text-neutral-500">
                      Permite que este vendedor analise o site do cliente e emita laudos executivos em PDF com comparativo Nyroh.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      const nextVal = currentSeller.canGenerateAuditPdf === false ? true : false;
                      try {
                        const res = await fetch(`/api/salespeople/${currentSeller.id}/toggle-audit-pdf`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ canGenerateAuditPdf: nextVal })
                        });
                        if (res.ok) {
                          onShowToast(`Laudo PDF ${nextVal ? 'liberado' : 'desativado'} para ${currentSeller.name}!`);
                          if (onRefreshData) onRefreshData();
                        } else {
                          onShowToast('Erro ao alternar permissão de laudo.');
                        }
                      } catch (err) {
                        onShowToast('Erro ao atualizar permissão.');
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs shrink-0 ${
                      currentSeller.canGenerateAuditPdf !== false
                        ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
                        : 'bg-neutral-800 hover:bg-neutral-900 text-white'
                    }`}
                  >
                    {currentSeller.canGenerateAuditPdf !== false ? 'Desativar Laudo' : 'Liberar Laudo'}
                  </button>
                </div>
              </div>

              {/* Rota Exclusiva Link Box */}
              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-950">Link Direto da Carteira do Vendedor</span>
                  <button
                    onClick={copySellerLink}
                    className="flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Copiado!' : 'Copiar Link'}</span>
                  </button>
                </div>
                <code className="text-xs font-mono text-blue-900 bg-white px-3 py-2 rounded-lg border border-blue-200 block truncate select-all">
                  {sellerLink}
                </code>
                <p className="text-[10px] text-blue-700">
                  O vendedor abre diretamente essa URL para trabalhar apenas na carteira atribuída a ele.
                </p>
              </div>

              {/* Botão Copiar WhatsApp */}
              <button
                onClick={copyCredsMessage}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold transition-all shadow-xs"
              >
                {copiedCreds ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCreds ? 'Mensagem Copiada!' : 'Copiar Acesso Formatado para WhatsApp'}</span>
              </button>
            </div>

            {/* Card 2: Edição Completa de Perfil & Slug */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">
                  Editar Dados & Identidade Visual do Closer
                </h3>
                <p className="text-xs text-neutral-500">
                  Atualize o nome, email, rota customizada e cor de identificação da carteira.
                </p>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-neutral-700 mb-1">Nome do Vendedor</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    placeholder="Ex: Lara Luiza"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-neutral-700 mb-1">E-mail Comercial</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="vendedor@empresa.com"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-neutral-700 mb-1">WhatsApp / Telefone</label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 mb-1">
                    Slug da URL Exclusiva (ex: /v/lara)
                  </label>
                  <div className="flex items-center">
                    <span className="px-3 py-2 bg-neutral-100 border border-r-0 border-neutral-200 rounded-l-xl text-neutral-500 font-mono text-xs">
                      /v/
                    </span>
                    <input
                      type="text"
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                      placeholder="nome-do-vendedor"
                      className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-r-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-semibold"
                    />
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-1">
                    Permite definir uma rota curta e profissional, como <code>/v/lara</code> ou <code>/v/pollyanna</code>.
                  </p>
                </div>

                {/* Seletor de Paleta Corporativa */}
                <div>
                  <label className="block font-bold text-neutral-700 mb-1.5">
                    Cor de Identificação da Carteira
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {COLOR_PALETTE.map((pal, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setEditColor(pal.color);
                          setEditBgColor(pal.bgColor);
                        }}
                        className={`flex items-center gap-1.5 p-1.5 rounded-xl border transition-all text-left ${
                          editColor === pal.color
                            ? 'ring-2 ring-neutral-900 border-transparent shadow-2xs font-bold'
                            : 'border-neutral-200 hover:bg-neutral-50'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: pal.color }} />
                        <span className="text-[10px] text-neutral-700 truncate">{pal.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{isSavingProfile ? 'Salvando Alterações...' : 'Salvar Alterações de Perfil'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Card 3: Redefinição de Senha do Closer */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">
                  Definir / Redefinir Senha do Closer
                </h3>
                <p className="text-xs text-neutral-500">
                  Crie ou atualize a senha de login de {currentSeller.name}. O acesso é sincronizado imediatamente no banco de dados.
                </p>
              </div>

              <form onSubmit={handleResetPassword} className="space-y-3 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-neutral-700">Nova Senha de Acesso</label>
                    <button
                      type="button"
                      onClick={generateStrongPassword}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800"
                    >
                      Gerar Senha Forte
                    </button>
                  </div>
                  <div className="relative">
                    <KeyRound className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Digite ou gere a senha..."
                      className="w-full pl-8 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isResettingPassword || !newPassword.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{isResettingPassword ? 'Atualizando Senha...' : `Salvar Nova Senha para ${currentSeller.name}`}</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
