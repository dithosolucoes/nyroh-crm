import React, { useState, useEffect } from 'react';
import { User, Salesperson, Lead, AuditLog } from '../types';
import { BulkCreateSalespeopleModal } from './BulkCreateSalespeopleModal';
import { AdminWhatsAppFluxoView } from './AdminWhatsAppFluxoView';
import {
  Shield,
  Users,
  UserCheck,
  UserX,
  UserPlus,
  KeyRound,
  Trash2,
  FileCode2,
  FileText,
  Download,
  Upload,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Eye,
  Database,
  Share2,
  FileArchive,
  Calendar,
  Layers,
  PhoneCall,
  TrendingUp,
  Clock,
  Briefcase,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  LayoutDashboard,
  Award,
  Zap,
  Activity,
  Target,
  MessageSquare,
  Send
} from 'lucide-react';
import { AdminCampaignDisparosView } from './AdminCampaignDisparosView';

interface AdminDashboardViewProps {
  currentUser: User;
  salespeople: Salesperson[];
  leads: Lead[];
  onOpenZipModal: () => void;
  onOpenSalesTeamModal: () => void;
  onNavigateToKanban: (salespersonId?: string) => void;
  onRefreshData: () => void;
  onShowToast: (msg: string) => void;
  activeSection?: 'cockpit' | 'usuarios' | 'carteiras' | 'auditoria' | 'blindagem' | 'whatsapp' | 'disparos';
  onChangeSection?: (section: string) => void;
  onSelectSalesperson?: (id: string) => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  currentUser,
  salespeople,
  leads,
  onOpenZipModal,
  onOpenSalesTeamModal,
  onNavigateToKanban,
  onRefreshData,
  onShowToast,
  activeSection,
  onChangeSection,
  onSelectSalesperson
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'cockpit' | 'usuarios' | 'carteiras' | 'auditoria' | 'blindagem' | 'whatsapp' | 'disparos'>(
    (activeSection as any) || 'cockpit'
  );

  useEffect(() => {
    if (activeSection) {
      if (
        activeSection === 'cockpit' ||
        activeSection === 'usuarios' ||
        activeSection === 'carteiras' ||
        activeSection === 'auditoria' ||
        activeSection === 'blindagem' ||
        activeSection === 'whatsapp' ||
        activeSection === 'disparos'
      ) {
        setActiveSubTab(activeSection);
      }
    }
  }, [activeSection]);
  
  // Users State
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'admin' | 'salesperson'>('ALL');
  
  // Create User Form
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'salesperson'>('salesperson');
  const [newUserSalespersonId, setNewUserSalespersonId] = useState('');
  const [submittingUser, setSubmittingUser] = useState(false);

  // Bulk Create Salespeople Modal
  const [showBulkCreateModal, setShowBulkCreateModal] = useState(false);

  // Reset Password Modal
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [submittingReset, setSubmittingReset] = useState(false);

  const handleDeleteSalesperson = async (seller: Salesperson) => {
    if (seller.isDefault || seller.id === 'seller-thomas') {
      onShowToast('O vendedor principal (Thomas) não pode ser excluído.');
      return;
    }
    if (!window.confirm(`Deseja realmente excluir o vendedor "${seller.name}"? Todos os leads deste vendedor serão transferidos de volta para Thomas.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/salespeople/${seller.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        onShowToast(data.message || `Vendedor "${seller.name}" excluído.`);
        onRefreshData();
        await fetchUsers();
      } else {
        onShowToast(data.error || 'Erro ao excluir vendedor.');
      }
    } catch (err) {
      onShowToast('Erro de conexão ao excluir vendedor.');
    }
  };

  const handleDeleteUser = async (userToDelete: User) => {
    if (userToDelete.id === currentUser.id) {
      onShowToast('Você não pode excluir seu próprio usuário logado.');
      return;
    }
    if (userToDelete.id === 'user-thomas' || userToDelete.email === 'admin@nyroh.com') {
      onShowToast('O usuário administrador principal não pode ser excluído.');
      return;
    }
    if (!window.confirm(`Deseja realmente excluir a conta do usuário "${userToDelete.name}" (${userToDelete.email})?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${userToDelete.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        onShowToast(data.message || `Usuário "${userToDelete.name}" excluído com sucesso.`);
        await fetchUsers();
      } else {
        onShowToast(data.error || 'Erro ao excluir usuário.');
      }
    } catch (err) {
      onShowToast('Erro de conexão ao excluir usuário.');
    }
  };

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logActionFilter, setLogActionFilter] = useState<string>('ALL');

  // Distribution State
  const [distributeTargetId, setDistributeTargetId] = useState<string>('');
  const [distributeSourceId, setDistributeSourceId] = useState<string>('ALL');
  const [distributeCount, setDistributeCount] = useState<number>(10);
  const [distributingLeads, setDistributingLeads] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchAuditLogs();
    if (salespeople.length > 0 && !distributeTargetId) {
      setDistributeTargetId(salespeople[0].id);
    }
  }, []);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Erro ao buscar usuários:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/admin/audit-logs');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Erro ao buscar logs de auditoria:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      onShowToast('Preencha todos os campos obrigatórios.');
      return;
    }

    setSubmittingUser(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName.trim(),
          email: newUserEmail.trim(),
          password: newUserPassword,
          role: newUserRole,
          salespersonId: newUserRole === 'salesperson' ? (newUserSalespersonId || undefined) : undefined
        })
      });

      const data = await res.json();
      if (res.ok) {
        onShowToast(`Usuário ${data.name} criado com sucesso!`);
        setShowCreateUserModal(false);
        setNewUserName('');
        setNewUserEmail('');
        setNewUserPassword('');
        fetchUsers();
        fetchAuditLogs();
      } else {
        onShowToast(data.error || 'Erro ao criar usuário.');
      }
    } catch (err) {
      console.error(err);
      onShowToast('Erro de conexão ao criar usuário.');
    } finally {
      setSubmittingUser(false);
    }
  };

  const handleToggleUserActive = async (user: User) => {
    if (user.id === currentUser.id) {
      onShowToast('Você não pode desativar seu próprio acesso de Super Admin.');
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !user.active })
      });

      if (res.ok) {
        onShowToast(`Usuário ${user.name} foi ${!user.active ? 'reativado' : 'bloqueado'}.`);
        fetchUsers();
        fetchAuditLogs();
      } else {
        onShowToast('Erro ao atualizar status do usuário.');
      }
    } catch (err) {
      onShowToast('Erro de conexão.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser || !resetNewPassword.trim()) {
      onShowToast('Informe a nova senha.');
      return;
    }

    setSubmittingReset(true);
    try {
      const res = await fetch(`/api/admin/users/${resettingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: resetNewPassword.trim() })
      });

      if (res.ok) {
        onShowToast(`Senha do usuário ${resettingUser.name} redefinida com sucesso!`);
        setResettingUser(null);
        setResetNewPassword('');
        fetchAuditLogs();
      } else {
        onShowToast('Erro ao redefinir senha.');
      }
    } catch (err) {
      onShowToast('Erro de conexão ao redefinir senha.');
    } finally {
      setSubmittingReset(false);
    }
  };

  const handleDistributeLeads = async () => {
    if (!distributeTargetId) {
      onShowToast('Selecione o vendedor de destino.');
      return;
    }
    if (distributeCount <= 0) {
      onShowToast('A quantidade de leads deve ser maior que zero.');
      return;
    }

    setDistributingLeads(true);
    try {
      const res = await fetch('/api/leads/distribute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || '',
          'x-user-email': currentUser?.email || '',
          'x-user-role': currentUser?.role || 'admin',
          'x-user-name': currentUser?.name || ''
        },
        credentials: 'include',
        body: JSON.stringify({
          targetSalespersonId: distributeTargetId,
          sourceSalespersonId: distributeSourceId === 'ALL' ? undefined : distributeSourceId,
          mode: 'count',
          value: distributeCount,
          userId: currentUser?.id,
          userEmail: currentUser?.email,
          userRole: currentUser?.role
        })
      });

      const data = await res.json();
      if (res.ok) {
        onShowToast(data.message || `${distributeCount} leads distribuídos com sucesso!`);
        onRefreshData();
        fetchAuditLogs();
      } else {
        onShowToast(data.error || 'Erro ao distribuir leads.');
      }
    } catch (err) {
      console.error(err);
      onShowToast('Erro ao processar distribuição.');
    } finally {
      setDistributingLeads(false);
    }
  };

  const handleExportCsv = () => {
    onShowToast('Gerando exportação segura com log de auditoria...');
    window.location.href = '/api/export/csv';
    setTimeout(fetchAuditLogs, 2000);
  };

  // Metrics calculations
  const totalLeadsCount = leads.length;
  const closedLeadsCount = leads.filter(l => l.columnStatus === 'Fechado').length;
  const uncontactedLeadsCount = leads.filter(l => l.columnStatus === 'Leads' && (!l.callCount || l.callCount === 0)).length;
  const conversionRate = totalLeadsCount > 0 ? ((closedLeadsCount / totalLeadsCount) * 100).toFixed(1) : '0.0';
  const totalCallsCount = leads.reduce((acc, l) => acc + (l.callCount || 0), 0);

  const inNegotiationCount = leads.filter(l => 
    l.columnStatus === 'Ligação 1' || 
    l.columnStatus === 'Ligação 2' || 
    l.columnStatus === 'Ligação 3' || 
    l.columnStatus === 'Ligação 4' || 
    l.columnStatus === 'Interessado'
  ).length;

  const funnelStages = [
    { label: 'Novos / Sem Contato', status: 'Leads', count: leads.filter(l => l.columnStatus === 'Leads').length, color: 'bg-neutral-500', barColor: '#64748b' },
    { label: 'Ligação 1 Realizada', status: 'Ligação 1', count: leads.filter(l => l.columnStatus === 'Ligação 1').length, color: 'bg-blue-500', barColor: '#3b82f6' },
    { label: 'Ligação 2 Realizada', status: 'Ligação 2', count: leads.filter(l => l.columnStatus === 'Ligação 2').length, color: 'bg-indigo-500', barColor: '#6366f1' },
    { label: 'Ligação 3 Realizada', status: 'Ligação 3', count: leads.filter(l => l.columnStatus === 'Ligação 3').length, color: 'bg-violet-500', barColor: '#8b5cf6' },
    { label: 'Ligação 4 Realizada', status: 'Ligação 4', count: leads.filter(l => l.columnStatus === 'Ligação 4').length, color: 'bg-purple-500', barColor: '#a855f7' },
    { label: 'Qualificados / Interessados', status: 'Interessado', count: leads.filter(l => l.columnStatus === 'Interessado').length, color: 'bg-amber-500', barColor: '#f59e0b' },
    { label: 'Vendas Concluídas (Fechados)', status: 'Fechado', count: leads.filter(l => l.columnStatus === 'Fechado').length, color: 'bg-emerald-500', barColor: '#10b981' },
    { label: 'Contatos Recusados / Perdidos', status: 'Recusado', count: leads.filter(l => l.columnStatus === 'Recusado').length, color: 'bg-rose-500', barColor: '#f43f5e' },
  ];

  const sellerPerformance = salespeople.map(seller => {
    const sellerLeads = leads.filter(l => l.salespersonId === seller.id);
    const sellerClosed = sellerLeads.filter(l => l.columnStatus === 'Fechado').length;
    const sellerUncontacted = sellerLeads.filter(l => l.columnStatus === 'Leads' && (!l.callCount || l.callCount === 0)).length;
    const sellerNegotiation = sellerLeads.filter(l => 
      l.columnStatus === 'Ligação 1' || 
      l.columnStatus === 'Ligação 2' || 
      l.columnStatus === 'Ligação 3' || 
      l.columnStatus === 'Ligação 4' || 
      l.columnStatus === 'Interessado'
    ).length;
    const sellerCalls = sellerLeads.reduce((acc, l) => acc + (l.callCount || 0), 0);
    const sellerConversion = sellerLeads.length > 0 ? ((sellerClosed / sellerLeads.length) * 100).toFixed(1) : '0.0';
    return {
      ...seller,
      totalLeads: sellerLeads.length,
      closedLeads: sellerClosed,
      uncontactedLeads: sellerUncontacted,
      negotiationLeads: sellerNegotiation,
      totalCalls: sellerCalls,
      conversionRate: sellerConversion
    };
  }).sort((a, b) => b.closedLeads - a.closedLeads || b.totalLeads - a.totalLeads);

  // Filtered Users
  const filteredUsers = users.filter(u => {
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (userSearchQuery.trim()) {
      const q = userSearchQuery.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    return true;
  });

  // Filtered Audit Logs
  const filteredAuditLogs = auditLogs.filter(log => {
    if (logActionFilter !== 'ALL' && log.action !== logActionFilter) return false;
    if (logSearchQuery.trim()) {
      const q = logSearchQuery.toLowerCase();
      return (
        (log.userName && log.userName.toLowerCase().includes(q)) ||
        (log.action && log.action.toLowerCase().includes(q)) ||
        (log.details && log.details.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8f9fa] overflow-y-auto">
      {/* Top Executive Header */}
      <div className="bg-white border-b border-neutral-200 px-4 sm:px-6 py-4 shrink-0 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                <Shield className="w-3 h-3 text-amber-600" />
                Área Exclusiva Super Admin
              </span>
              <span className="text-[10px] font-mono text-neutral-400">
                Sessão: {currentUser.name} ({currentUser.email})
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-neutral-900 tracking-tight">
              Central de Comando & Governança da Operação
            </h1>
            <p className="text-xs text-neutral-500 mt-0.5">
              Gestão de equipe, divisão de carteiras de leads, controle de acessos (RBAC) e auditoria caixa-preta.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onNavigateToKanban()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-semibold shadow-xs transition-colors"
              title="Abrir o Pipeline de Vendas (Kanban)"
            >
              <Layers className="w-3.5 h-3.5 text-neutral-300" />
              <span>Ver Kanban de Vendas</span>
            </button>

            <button
              onClick={onOpenZipModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-semibold transition-colors"
              title="Subir arquivo ZIP com novos leads"
            >
              <FileArchive className="w-3.5 h-3.5 text-blue-600" />
              <span>Upload ZIP</span>
            </button>

            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-semibold transition-colors"
              title="Exportar base completa de leads em CSV com auditoria"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Exportar CSV</span>
            </button>

            <button
              onClick={() => {
                fetchUsers();
                fetchAuditLogs();
                onRefreshData();
                onShowToast('Dados administrativos atualizados!');
              }}
              className="p-2 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-50 transition-colors"
              title="Atualizar dados"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Executive Metrics Overview Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4 pt-4 border-t border-neutral-100">
          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
            <div className="flex items-center justify-between text-[11px] text-neutral-500 font-medium">
              <span>Total de Leads</span>
              <Database className="w-3.5 h-3.5 text-neutral-400" />
            </div>
            <div className="text-lg font-bold text-neutral-900 mt-1">
              {totalLeadsCount.toLocaleString('pt-BR')}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              {uncontactedLeadsCount} sem contato inicial
            </div>
          </div>

          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
            <div className="flex items-center justify-between text-[11px] text-neutral-500 font-medium">
              <span>Vendedores Ativos</span>
              <Users className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="text-lg font-bold text-neutral-900 mt-1">
              {salespeople.length}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              {users.length} usuários cadastrados
            </div>
          </div>

          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
            <div className="flex items-center justify-between text-[11px] text-neutral-500 font-medium">
              <span>Total de Ligações</span>
              <PhoneCall className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="text-lg font-bold text-neutral-900 mt-1">
              {totalCallsCount.toLocaleString('pt-BR')}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              Registradas na base
            </div>
          </div>

          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
            <div className="flex items-center justify-between text-[11px] text-neutral-500 font-medium">
              <span>Taxa de Conversão</span>
              <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="text-lg font-bold text-neutral-900 mt-1">
              {conversionRate}%
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              {closedLeadsCount} vendas fechadas
            </div>
          </div>

          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-[11px] text-neutral-500 font-medium">
              <span>Auditoria & Blindagem</span>
              <Shield className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="text-lg font-bold text-neutral-900 mt-1">
              {auditLogs.length} eventos
            </div>
            <div className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Isolamento 100% ativo
            </div>
          </div>
        </div>

        {/* Inner Admin Navigation Tabs */}
        <div className="flex items-center gap-2 mt-4 pt-2 overflow-x-auto">
          <button
            onClick={() => {
              setActiveSubTab('cockpit');
              onChangeSection?.('cockpit');
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
              activeSubTab === 'cockpit'
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                : 'bg-white text-neutral-600 hover:bg-neutral-50 border-neutral-200'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Cockpit Geral da Operação</span>
          </button>

          <button
            onClick={() => {
              setActiveSubTab('usuarios');
              onChangeSection?.('usuarios');
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
              activeSubTab === 'usuarios'
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                : 'bg-white text-neutral-600 hover:bg-neutral-50 border-neutral-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Gestão da Equipe ({users.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveSubTab('carteiras');
              onChangeSection?.('carteiras');
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
              activeSubTab === 'carteiras'
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                : 'bg-white text-neutral-600 hover:bg-neutral-50 border-neutral-200'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Divisão de Leads & Carteiras ({salespeople.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveSubTab('auditoria');
              onChangeSection?.('auditoria');
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
              activeSubTab === 'auditoria'
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                : 'bg-white text-neutral-600 hover:bg-neutral-50 border-neutral-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Caixa-Preta de Auditoria ({auditLogs.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveSubTab('blindagem');
              onChangeSection?.('blindagem');
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
              activeSubTab === 'blindagem'
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                : 'bg-white text-neutral-600 hover:bg-neutral-50 border-neutral-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Blindagem & Infraestrutura</span>
          </button>

          <button
            onClick={() => {
              setActiveSubTab('whatsapp');
              onChangeSection?.('whatsapp');
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
              activeSubTab === 'whatsapp'
                ? 'bg-emerald-950 text-white border-emerald-900 shadow-2xs'
                : 'bg-white text-emerald-900 hover:bg-emerald-50/60 border-emerald-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
            <span>WhatsApp Oficial (FluxoAPI)</span>
            <span className="text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-bold">
              META
            </span>
          </button>

          <button
            onClick={() => {
              setActiveSubTab('disparos');
              onChangeSection?.('disparos');
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
              activeSubTab === 'disparos'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                : 'bg-white text-emerald-900 hover:bg-emerald-50/60 border-emerald-200'
            }`}
          >
            <Send className="w-3.5 h-3.5 text-emerald-500" />
            <span>Disparos & Campanhas</span>
            <span className="text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-bold">
              NOVO
            </span>
          </button>
        </div>
      </div>

      {/* Main Tab Content Area */}
      <div className="p-4 sm:p-6 space-y-6">
        {/* TAB 0: COCKPIT GERAL EXECUTIVO */}
        {activeSubTab === 'cockpit' && (
          <div className="space-y-6">
            {/* Top Operational Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-500">Base Sob Gestão</span>
                  <Database className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-neutral-900 mt-2">
                  {totalLeadsCount.toLocaleString('pt-BR')} <span className="text-xs font-normal text-neutral-400">leads</span>
                </div>
                <div className="text-xs text-neutral-500 mt-1 flex items-center gap-1">
                  <span className="text-blue-600 font-semibold">{salespeople.length} vendedores</span> com carteiras ativas
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-500">Leads Sem Contato (Virgens)</span>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-2xl font-bold text-amber-600 mt-2">
                  {uncontactedLeadsCount.toLocaleString('pt-BR')}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  {totalLeadsCount > 0 ? ((uncontactedLeadsCount / totalLeadsCount) * 100).toFixed(0) : 0}% aguardando primeira ligação
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-500">Em Negociação Ativa</span>
                  <Activity className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="text-2xl font-bold text-indigo-600 mt-2">
                  {inNegotiationCount.toLocaleString('pt-BR')}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  Leads entre Ligação 1 a 4 e Interessados
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-500">Vendas Fechadas</span>
                  <Award className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold text-emerald-600 mt-2">
                  {closedLeadsCount.toLocaleString('pt-BR')}
                </div>
                <div className="text-xs text-emerald-700 font-semibold mt-1">
                  Taxa de conversão: {conversionRate}%
                </div>
              </div>
            </div>

            {/* Funil Visual de Conversão */}
            <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-neutral-100">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-600" />
                    <span>Funil Comercial & Gargalos de Venda</span>
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Visão cronológica dos leads distribuídos por cada etapa do pipeline comercial
                  </p>
                </div>
                <span className="text-xs font-mono font-semibold bg-neutral-100 px-2.5 py-1 rounded-lg text-neutral-700">
                  Total de Ligações: {totalCallsCount.toLocaleString('pt-BR')}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {funnelStages.map((stage) => {
                  const pct = totalLeadsCount > 0 ? ((stage.count / totalLeadsCount) * 100).toFixed(1) : '0.0';
                  return (
                    <div key={stage.status} className="p-3.5 rounded-xl border border-neutral-100 bg-neutral-50/70">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-semibold text-neutral-700 truncate">{stage.label}</span>
                        <span className="font-mono font-bold text-neutral-900">{stage.count}</span>
                      </div>
                      <div className="w-full bg-neutral-200 rounded-full h-2 overflow-hidden mb-1.5">
                        <div
                          className="h-2 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(Number(pct), stage.count > 0 ? 4 : 0)}%`,
                            backgroundColor: stage.barColor
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                        <span>{pct}% da base</span>
                        {stage.status === 'Fechado' && (
                          <span className="text-emerald-600 font-bold">Meta Final</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Leaderboard dos Closers */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xs overflow-hidden">
              <div className="p-5 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500" />
                    <span>Placar dos Closers (Leaderboard de Produção)</span>
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Acompanhamento individual de cada vendedor em tempo real
                  </p>
                </div>
                <button
                  onClick={onOpenSalesTeamModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-800 transition-colors"
                >
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                  <span>Configurar Vendedores & Divisão</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-neutral-50/80 border-b border-neutral-200 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Posição</th>
                      <th className="py-3 px-4">Closer</th>
                      <th className="py-3 px-4 text-center">Carteira Total</th>
                      <th className="py-3 px-4 text-center">Leads Virgens</th>
                      <th className="py-3 px-4 text-center">Em Negociação</th>
                      <th className="py-3 px-4 text-center">Total Ligações</th>
                      <th className="py-3 px-4 text-center">Vendas Fechadas</th>
                      <th className="py-3 px-4 text-center">Conversão</th>
                      <th className="py-3 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {sellerPerformance.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-8 text-neutral-400 text-xs">
                          Nenhum vendedor cadastrado ainda.
                        </td>
                      </tr>
                    ) : (
                      sellerPerformance.map((seller, index) => (
                        <tr key={seller.id} className="hover:bg-neutral-50/80 transition-colors">
                          <td className="py-3 px-4 font-bold text-neutral-600">
                            {index === 0 ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-black border border-amber-300">
                                🥇
                              </span>
                            ) : index === 1 ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-black border border-slate-300">
                                🥈
                              </span>
                            ) : index === 2 ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 text-amber-900 text-xs font-black border border-amber-200">
                                🥉
                              </span>
                            ) : (
                              <span className="font-mono text-neutral-400 pl-2">#{index + 1}</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                                style={{ backgroundColor: seller.color || '#3b82f6' }}
                              >
                                {seller.name.charAt(0).toUpperCase()}
                              </span>
                              <div>
                                <div className="font-bold text-neutral-900 flex items-center gap-1.5">
                                  {seller.name}
                                  {seller.isDefault && (
                                    <span className="text-[9px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded font-mono font-medium">
                                      Principal
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-neutral-400 font-mono">
                                  ID: {seller.id}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-neutral-900 font-mono">
                            {seller.totalLeads}
                          </td>
                          <td className="py-3 px-4 text-center font-mono">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              seller.uncontactedLeads > 0 ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-500'
                            }`}>
                              {seller.uncontactedLeads}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-medium text-indigo-700">
                            {seller.negotiationLeads}
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-neutral-600">
                            {seller.totalCalls}
                          </td>
                          <td className="py-3 px-4 text-center font-mono">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                              {seller.closedLeads}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-neutral-800">
                            {seller.conversionRate}%
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                onNavigateToKanban(seller.id);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-neutral-900 text-white hover:bg-black transition-colors"
                              title={`Abrir o Pipeline Kanban focado em ${seller.name}`}
                            >
                              <span>Abrir Carteira</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Blindagem & Infraestrutura Info Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-white rounded-2xl border border-neutral-200 shadow-2xs flex items-start gap-3">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-neutral-900">Isolamento de Dados Blindado</h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Vendedores acessam exclusivamente os leads de sua própria carteira. Bloqueio nativo por token e sessão no PostgreSQL.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-neutral-200 shadow-2xs flex items-start gap-3">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-neutral-900">Alta Performance Indexada</h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Índices de banco otimizados para operações com centenas de milhares e até 1M+ de leads sem perda de responsividade.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-neutral-200 shadow-2xs flex items-start gap-3">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600 shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-neutral-900">Auditoria Completa (Caixa-Preta)</h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Todas as ações de criação, distribuição, login e exclusão são rastreadas cronologicamente com IP e autor.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* TAB 1: GESTÃO DE USUÁRIOS & RBAC */}
        {activeSubTab === 'usuarios' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Buscar usuário por nome ou e-mail..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as any)}
                  className="text-xs bg-neutral-50 border border-neutral-200 rounded-xl px-2.5 py-1.5 font-medium text-neutral-700 focus:outline-none"
                >
                  <option value="ALL">Todos os Cargos</option>
                  <option value="admin">Apenas Admins</option>
                  <option value="salesperson">Apenas Vendedores</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowBulkCreateModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors"
                  title="Cadastrar vários vendedores colando uma lista em JSON"
                >
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span>Importar em Lote (JSON)</span>
                </button>
                <button
                  onClick={() => setShowCreateUserModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold shadow-xs transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Novo Usuário / Vendedor</span>
                </button>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-neutral-50/80 border-b border-neutral-200 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Usuário</th>
                      <th className="py-3 px-4">Cargo (RBAC)</th>
                      <th className="py-3 px-4">Carteira Vinculada</th>
                      <th className="py-3 px-4">Data de Cadastro</th>
                      <th className="py-3 px-4">Status de Acesso</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {loadingUsers ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-neutral-400 text-xs">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-neutral-400" />
                          Carregando usuários do sistema...
                        </td>
                      </tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-neutral-400 text-xs">
                          Nenhum usuário encontrado com os filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const seller = salespeople.find((s) => s.id === u.salespersonId);
                        const isSelf = u.id === currentUser.id;

                        return (
                          <tr key={u.id} className="hover:bg-neutral-50/60 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                                  u.role === 'admin'
                                    ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                    : 'bg-blue-100 text-blue-900 border border-blue-200'
                                }`}>
                                  {u.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-neutral-900 truncate flex items-center gap-1.5">
                                    <span>{u.name}</span>
                                    {isSelf && (
                                      <span className="text-[9px] bg-neutral-200 text-neutral-700 px-1.5 py-0.2 rounded font-mono font-bold">
                                        VOCÊ
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-neutral-500 font-mono truncate">
                                    {u.email}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              {u.role === 'admin' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                  <Shield className="w-3 h-3 text-amber-600" />
                                  Super Admin
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                  <Users className="w-3 h-3 text-blue-600" />
                                  Vendedor(a)
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              {seller ? (
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: seller.color || '#0284c7' }}
                                  />
                                  <span className="font-medium text-neutral-800">{seller.name}</span>
                                  <button
                                    onClick={() => onNavigateToKanban(seller.id)}
                                    className="text-neutral-400 hover:text-blue-600 p-0.5 rounded"
                                    title={`Inspecionar Kanban de ${seller.name}`}
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-neutral-400 font-mono text-[11px]">
                                  {u.role === 'admin' ? 'Acesso Global' : 'Sem Carteira'}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-neutral-500 text-[11px] font-mono">
                              {u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '—'}
                            </td>

                            <td className="py-3 px-4">
                              {u.active ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Ativo
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-800 border border-red-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                  Bloqueado
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    setResettingUser(u);
                                    setResetNewPassword('');
                                  }}
                                  className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                                  title="Redefinir senha do usuário"
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                </button>

                                {!isSelf && (
                                  <>
                                    <button
                                      onClick={() => handleToggleUserActive(u)}
                                      className={`p-1.5 rounded-lg transition-colors ${
                                        u.active
                                          ? 'text-neutral-400 hover:text-red-600 hover:bg-red-50'
                                          : 'text-neutral-400 hover:text-emerald-600 hover:bg-emerald-50'
                                      }`}
                                      title={u.active ? 'Bloquear acesso do usuário' : 'Reativar acesso do usuário'}
                                    >
                                      {u.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                                    </button>

                                    {u.id !== 'user-thomas' && u.email !== 'admin@nyroh.com' && (
                                      <button
                                        onClick={() => handleDeleteUser(u)}
                                        className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title={`Excluir conta do usuário ${u.name}`}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
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

        {/* TAB 2: CARTEIRAS & DIVISÃO DE LEADS */}
        {activeSubTab === 'carteiras' && (
          <div className="space-y-6">
            {/* Quick Action Bar for Carteiras */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-neutral-200 shadow-2xs">
              <div>
                <h3 className="text-xs font-bold text-neutral-900">Carteiras de Vendedores ({salespeople.length})</h3>
                <p className="text-[11px] text-neutral-500">Gestão de integrantes e divisão balanceada de novos leads</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowBulkCreateModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors"
                  title="Cadastrar vários vendedores colando uma lista em JSON"
                >
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span>Importar em Lote (JSON)</span>
                </button>
                <button
                  onClick={() => setShowCreateUserModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold shadow-xs transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Novo Integrante</span>
                </button>
              </div>
            </div>

            {/* Painel Centralizado de Controle: Diagnóstico & Laudo PDF por Vendedor */}
            <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0 mt-0.5">
                  <FileText className="w-4.5 h-4.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-neutral-900">
                      Controle de Acesso: Diagnóstico & Laudo em PDF
                    </h4>
                    <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                      {salespeople.filter(s => s.canGenerateAuditPdf !== false).length} de {salespeople.length} liberados
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Define quem na equipe pode gerar relatórios em PDF para clientes com site antigo.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await Promise.all(
                        salespeople.map(s => 
                          fetch(`/api/salespeople/${s.id}/toggle-audit-pdf`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ canGenerateAuditPdf: true })
                          })
                        )
                      );
                      onShowToast('Laudo PDF liberado para todos os vendedores!');
                      onRefreshData();
                    } catch (err) {
                      onShowToast('Erro ao liberar permissões em lote.');
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors cursor-pointer"
                  title="Liberar emissão de laudo PDF para todos os vendedores"
                >
                  Liberar Todos
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await Promise.all(
                        salespeople.map(s => 
                          fetch(`/api/salespeople/${s.id}/toggle-audit-pdf`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ canGenerateAuditPdf: false })
                          })
                        )
                      );
                      onShowToast('Laudo PDF desativado para todos os vendedores!');
                      onRefreshData();
                    } catch (err) {
                      onShowToast('Erro ao desativar permissões em lote.');
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition-colors cursor-pointer"
                  title="Bloquear emissão de laudo PDF para todos os vendedores"
                >
                  Desativar Todos
                </button>
              </div>
            </div>

            {/* Salespeople Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {salespeople.map((seller) => {
                const sellerLeads = leads.filter(l => (l.salespersonId || 'seller-thomas') === seller.id);
                const sellerTotal = sellerLeads.length;
                const uncontacted = sellerLeads.filter(l => l.columnStatus === 'Leads' && (!l.callCount || l.callCount === 0)).length;
                const closed = sellerLeads.filter(l => l.columnStatus === 'Fechado').length;
                const inProgress = sellerTotal - uncontacted - closed;
                const rate = sellerTotal > 0 ? ((closed / sellerTotal) * 100).toFixed(1) : '0.0';

                return (
                  <div
                    key={seller.id}
                    className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-2xs hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs text-white"
                          style={{ backgroundColor: seller.color || '#0284c7' }}
                        >
                          {seller.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-neutral-900 text-sm flex items-center gap-1.5">
                            <span>{seller.name}</span>
                            {seller.isDefault && (
                              <span className="text-[9px] bg-neutral-100 text-neutral-600 px-1.5 py-0.2 rounded font-mono">
                                Principal
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-neutral-400 font-mono">
                            Rota: /v/{seller.id.replace(/^seller-/, '')}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => onNavigateToKanban(seller.id)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Ver no Kanban"
                      >
                        <span>Ver Kanban</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 my-3 text-center">
                      <div className="p-2 bg-neutral-50 rounded-xl">
                        <span className="text-[10px] text-neutral-400 block font-medium">Total</span>
                        <span className="text-base font-bold text-neutral-900">{sellerTotal}</span>
                      </div>
                      <div className="p-2 bg-neutral-50 rounded-xl">
                        <span className="text-[10px] text-neutral-400 block font-medium">Sem Contato</span>
                        <span className="text-base font-bold text-amber-600">{uncontacted}</span>
                      </div>
                      <div className="p-2 bg-neutral-50 rounded-xl">
                        <span className="text-[10px] text-neutral-400 block font-medium">Fechados</span>
                        <span className="text-base font-bold text-emerald-600">{closed}</span>
                      </div>
                    </div>

                    {/* Linha de Conversão e Exclusão */}
                    <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
                      <div className="flex items-center gap-1.5">
                        <span>Conversão:</span>
                        <span className="font-bold text-neutral-900 font-mono">{rate}%</span>
                      </div>
                      {!seller.isDefault && seller.id !== 'seller-thomas' && (
                        <button
                          onClick={() => handleDeleteSalesperson(seller)}
                          className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          title={`Excluir vendedor "${seller.name}" e transferir leads para Thomas`}
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Excluir</span>
                        </button>
                      )}
                    </div>

                    {/* Controle Direto: Permissão de Laudo PDF para este Vendedor */}
                    <div className="mt-2.5 pt-2 border-t border-neutral-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="font-semibold text-neutral-700">Laudo PDF:</span>
                        <span className={`px-2 py-0.2 rounded-full font-bold text-[10px] ${
                          seller.canGenerateAuditPdf !== false
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-neutral-100 text-neutral-500'
                        }`}>
                          {seller.canGenerateAuditPdf !== false ? 'Liberado' : 'Desativado'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const nextVal = seller.canGenerateAuditPdf === false ? true : false;
                          try {
                            const res = await fetch(`/api/salespeople/${seller.id}/toggle-audit-pdf`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ canGenerateAuditPdf: nextVal })
                            });
                            if (res.ok) {
                              onShowToast(`Laudo PDF ${nextVal ? 'liberado' : 'desativado'} para ${seller.name}`);
                              onRefreshData();
                            } else {
                              onShowToast('Erro ao alternar permissão de laudo.');
                            }
                          } catch (err) {
                            onShowToast('Erro ao atualizar permissão.');
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold border transition-all cursor-pointer ${
                          seller.canGenerateAuditPdf !== false
                            ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                            : 'bg-neutral-900 hover:bg-black text-white border-neutral-900'
                        }`}
                        title="Controlar se este vendedor pode emitir laudo em PDF para leads com site antigo"
                      >
                        {seller.canGenerateAuditPdf !== false ? 'Desativar' : 'Liberar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Batch Lead Reassignment Tool */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-2xs">
              <div className="flex items-center gap-2 mb-2">
                <Share2 className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-neutral-900">
                  Ferramenta Executiva de Divisão de Novos Leads
                </h3>
              </div>
              <p className="text-xs text-neutral-500 mb-4">
                Transfira lotes de leads virgens (sem contato inicial) entre vendedores de forma balanceada.
                Leads já em negociação nunca são movidos.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 uppercase tracking-wider mb-1">
                    Origem dos Leads
                  </label>
                  <select
                    value={distributeSourceId}
                    onChange={(e) => setDistributeSourceId(e.target.value)}
                    className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 font-medium text-neutral-800 focus:outline-none"
                  >
                    <option value="ALL">Qualquer Carteira com Leads Novos</option>
                    {salespeople.map((s) => (
                      <option key={s.id} value={s.id}>
                        Apenas de {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 uppercase tracking-wider mb-1">
                    Destino dos Leads
                  </label>
                  <select
                    value={distributeTargetId}
                    onChange={(e) => setDistributeTargetId(e.target.value)}
                    className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 font-medium text-neutral-800 focus:outline-none"
                  >
                    {salespeople.map((s) => (
                      <option key={s.id} value={s.id}>
                        Transferir para {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 uppercase tracking-wider mb-1">
                    Quantidade de Leads
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={distributeCount}
                    onChange={(e) => setDistributeCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 font-medium text-neutral-800 focus:outline-none"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={handleDistributeLeads}
                    disabled={distributingLeads}
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{distributingLeads ? 'Distribuindo...' : 'Executar Divisão'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CAIXA-PRETA DE AUDITORIA */}
        {activeSubTab === 'auditoria' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    placeholder="Filtrar por ação, operador ou detalhe..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none"
                  />
                </div>
                <select
                  value={logActionFilter}
                  onChange={(e) => setLogActionFilter(e.target.value)}
                  className="text-xs bg-neutral-50 border border-neutral-200 rounded-xl px-2.5 py-1.5 font-medium text-neutral-700 focus:outline-none"
                >
                  <option value="ALL">Todas as Ações</option>
                  <option value="EXCLUIR_LEAD">Exclusão de Lead</option>
                  <option value="EXPORTAR_CSV">Exportação de CSV</option>
                  <option value="TENTATIVA_EXPORT_BLOQUEADA">Tentativa Bloqueada</option>
                  <option value="LOGIN_SUCESSO">Logins com Sucesso</option>
                  <option value="USUARIO_CRIADO">Criação de Usuário</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchAuditLogs}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-xs font-semibold text-neutral-700 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
                  <span>Recarregar Logs</span>
                </button>
              </div>
            </div>

            {/* Audit Logs Table */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-neutral-50/80 border-b border-neutral-200 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Data & Horário</th>
                      <th className="py-3 px-4">Operação</th>
                      <th className="py-3 px-4">Operador</th>
                      <th className="py-3 px-4">Detalhes do Evento</th>
                      <th className="py-3 px-4 text-right">IP de Origem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 font-mono text-[11px]">
                    {loadingLogs ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-neutral-400 font-sans text-xs">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-neutral-400" />
                          Consultando caixa-preta de auditoria...
                        </td>
                      </tr>
                    ) : filteredAuditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-neutral-400 font-sans text-xs">
                          Nenhum evento registrado no filtro selecionado.
                        </td>
                      </tr>
                    ) : (
                      filteredAuditLogs.map((log) => {
                        const isSevere = log.action.includes('EXCLUIR') || log.action.includes('BLOQUEAD');
                        const isExport = log.action.includes('EXPORT');

                        return (
                          <tr key={log.id} className="hover:bg-neutral-50/60 transition-colors">
                            <td className="py-3 px-4 text-neutral-500 whitespace-nowrap">
                              {log.createdAt ? new Date(log.createdAt).toLocaleString('pt-BR') : '—'}
                            </td>

                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                isSevere
                                  ? 'bg-red-100 text-red-900 border border-red-200'
                                  : isExport
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                  : 'bg-neutral-100 text-neutral-800'
                              }`}>
                                {log.action}
                              </span>
                            </td>

                            <td className="py-3 px-4 font-sans font-medium text-neutral-800">
                              {log.userName || 'Sistema Automático'}
                            </td>

                            <td className="py-3 px-4 font-sans text-neutral-600 max-w-md truncate">
                              {log.details || '—'}
                            </td>

                            <td className="py-3 px-4 text-right text-neutral-400">
                              {log.ip || '127.0.0.1'}
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

        {/* TAB 4: BLINDAGEM & INFRAESTRUTURA */}
        {activeSubTab === 'blindagem' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-sm text-neutral-900">Camadas de Segurança Ativas</h3>
              </div>
              <p className="text-xs text-neutral-500">
                O sistema opera com blindagem nativa sem dependência de serviços externos ou bibliotecas terceiras de login.
              </p>

              <div className="space-y-2 pt-2 text-xs">
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-neutral-50 border border-neutral-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-neutral-900 block">Autenticação Nativa Blindada</strong>
                    <span className="text-neutral-500">
                      Zero Auth0/Clerk. Senhas com hash criptográfico SHA-256 e Salt de 32 bytes randômicos.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-neutral-50 border border-neutral-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-neutral-900 block">Sessões em Cookies HttpOnly + SameSite</strong>
                    <span className="text-neutral-500">
                      Imune a roubo de sessão via JavaScript (XSS) e requisições cruzadas (CSRF).
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-neutral-50 border border-neutral-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-neutral-900 block">Isolamento Estrito de Carteira (RBAC)</strong>
                    <span className="text-neutral-500">
                      O backend filtra as queries por ID do vendedor autenticado. Vendedores não conseguem acessar leads de colegas.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-neutral-50 border border-neutral-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-neutral-900 block">Bloqueio Anti-Vazamento de Base</strong>
                    <span className="text-neutral-500">
                      A rota de exportação CSV rejeita vendedores comuns e gera alerta imediato na caixa-preta de auditoria.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-neutral-900">Capacidade & Arquitetura Railway</h3>
              </div>
              <p className="text-xs text-neutral-500">
                Dimensionamento preparado para até 1.000.000 de leads e 100 vendedores simultâneos.
              </p>

              <div className="space-y-2 pt-2 text-xs font-mono">
                <div className="p-3 bg-neutral-900 text-neutral-200 rounded-xl text-[11px] space-y-1.5">
                  <div className="text-emerald-400 font-bold"># ESQUEMA RELACIONAL POSTGRESQL (RAILWAY):</div>
                  <div>- users (id, name, email, password_hash, role, active)</div>
                  <div>- auth_sessions (token, user_id, expires_at)</div>
                  <div>- leads (id, name, phone, column_status, salesperson_id)</div>
                  <div>- calls (id, lead_id, salesperson_id, tag, comment, duration)</div>
                  <div>- audit_logs (id, user_name, action, details, ip, created_at)</div>
                </div>

                <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-600 font-sans text-xs">
                  <strong>Pronto para Deploy:</strong> Basta conectar a variável <code className="text-blue-600 bg-blue-50 px-1 py-0.5 rounded">DATABASE_URL</code> no Railway para ativar a persistência definitiva com pool de conexões otimizado.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: WHATSAPP CLOUD API OFICIAL (FLUXOAPI) */}
        {activeSubTab === 'whatsapp' && (
          <AdminWhatsAppFluxoView
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}

        {/* TAB 6: DISPAROS & CAMPANHAS EM MASSA (META API & STAGING) */}
        {activeSubTab === 'disparos' && (
          <div className="-m-4 sm:-m-6">
            <AdminCampaignDisparosView
              salespeople={salespeople}
              currentUser={currentUser}
              onLeadsUpdated={onRefreshData}
            />
          </div>
        )}
      </div>

      {/* Modal: Criar Novo Usuário */}
      {showCreateUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 max-w-md w-full shadow-xl animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-neutral-900" />
                <h3 className="font-bold text-sm text-neutral-900">Cadastrar Novo Usuário</h3>
              </div>
              <button
                onClick={() => setShowCreateUserModal(false)}
                className="text-neutral-400 hover:text-neutral-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3 mt-4 text-xs">
              <div>
                <label className="block font-bold text-neutral-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Ex: Carlos Oliveira"
                  className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 mb-1">E-mail Institucional</label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="Ex: carlos@empresa.com"
                  className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 mb-1">Senha Inicial Provisória</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Mínimo 4 caracteres"
                  className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 mb-1">Cargo / Papel no Sistema</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as any)}
                  className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-neutral-800 focus:outline-none"
                >
                  <option value="salesperson">Vendedor(a) — Acesso apenas à sua carteira</option>
                  <option value="admin">Super Admin — Acesso total e governança</option>
                </select>
              </div>

              {newUserRole === 'salesperson' && (
                <div>
                  <label className="block font-bold text-neutral-700 mb-1">Vincular a Vendedor Existente</label>
                  <select
                    value={newUserSalespersonId}
                    onChange={(e) => setNewUserSalespersonId(e.target.value)}
                    className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-neutral-800 focus:outline-none"
                  >
                    <option value="">Criar nova carteira com o nome do usuário</option>
                    {salespeople.map((s) => (
                      <option key={s.id} value={s.id}>
                        Vincular à carteira de: {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowCreateUserModal(false)}
                  className="px-3 py-2 rounded-xl text-neutral-600 hover:bg-neutral-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingUser}
                  className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-black text-white font-bold shadow-xs disabled:opacity-50"
                >
                  {submittingUser ? 'Cadastrando...' : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Redefinir Senha */}
      {resettingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 max-w-sm w-full shadow-xl animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-neutral-900" />
                <h3 className="font-bold text-sm text-neutral-900">Redefinir Senha</h3>
              </div>
              <button
                onClick={() => setResettingUser(null)}
                className="text-neutral-400 hover:text-neutral-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-3 mt-4 text-xs">
              <p className="text-neutral-500">
                Defina uma nova senha de acesso para o usuário <strong>{resettingUser.name}</strong>.
              </p>

              <div>
                <label className="block font-bold text-neutral-700 mb-1">Nova Senha</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="Digite a nova senha..."
                  className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setResettingUser(null)}
                  className="px-3 py-2 rounded-xl text-neutral-600 hover:bg-neutral-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingReset}
                  className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-black text-white font-bold shadow-xs disabled:opacity-50"
                >
                  {submittingReset ? 'Salvando...' : 'Salvar Nova Senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Cadastro de Vendedores em Lote (JSON) */}
      <BulkCreateSalespeopleModal
        isOpen={showBulkCreateModal}
        onClose={() => setShowBulkCreateModal(false)}
        onSuccess={async () => {
          onRefreshData();
          await fetchUsers();
        }}
        onShowToast={onShowToast}
      />
    </div>
  );
};
