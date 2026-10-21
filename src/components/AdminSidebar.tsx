import React, { useState } from 'react';
import { User, Salesperson } from '../types';
import {
  LayoutDashboard,
  Users,
  Share2,
  Briefcase,
  Clock,
  Database,
  Layers,
  LogOut,
  ChevronRight,
  Shield,
  KeyRound,
  MessageSquare,
  Rocket,
  Menu,
  X
} from 'lucide-react';

export type AdminViewSection = 
  | 'cockpit'
  | 'disparos'
  | 'usuarios'
  | 'carteiras'
  | 'vendedores'
  | 'auditoria'
  | 'blindagem'
  | 'whatsapp';

interface AdminSidebarProps {
  currentSection: AdminViewSection;
  onChangeSection: (section: AdminViewSection) => void;
  selectedSalespersonId?: string;
  onSelectSalesperson: (id: string) => void;
  currentUser: User;
  salespeople: Salesperson[];
  totalLeadsCount: number;
  isKanbanActive?: boolean;
  onNavigateToKanban: () => void;
  onOpenChangePassword?: () => void;
  onLogout: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentSection,
  onChangeSection,
  selectedSalespersonId,
  onSelectSalesperson,
  currentUser,
  salespeople,
  totalLeadsCount,
  isKanbanActive = false,
  onNavigateToKanban,
  onOpenChangePassword,
  onLogout
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      {/* DESKTOP SIDEBAR - Visível em telas lg (1024px+) */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-neutral-200 flex-col justify-between h-screen shrink-0 select-none z-20 sticky top-0">
        {/* Top Brand Header */}
        <div className="p-4 border-b border-neutral-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-neutral-900 flex items-center justify-center text-white shadow-xs font-bold text-sm shrink-0">
              <Shield className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-neutral-900 text-sm tracking-tight truncate">
                  Super Admin
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300 shrink-0">
                  GOVERNANÇA
                </span>
              </div>
              <p className="text-[10px] text-neutral-400 truncate">
                Gestão Comercial & Diretoria
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Groups */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {/* Gestão Estratégica */}
          <div>
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block px-2 mb-1.5">
              Comando Executivo
            </span>

            <nav className="space-y-1">
              <button
                onClick={() => onChangeSection('cockpit')}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  currentSection === 'cockpit'
                    ? 'bg-neutral-900 text-white font-bold shadow-xs'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <LayoutDashboard className="w-4 h-4 text-neutral-400" />
                  <span>Cockpit Geral</span>
                </div>
              </button>

              <button
                id="admin-nav-disparos"
                onClick={() => onChangeSection('disparos')}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  currentSection === 'disparos'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-neutral-700 hover:bg-blue-50/80 hover:text-blue-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Rocket className={`w-4 h-4 ${currentSection === 'disparos' ? 'text-white' : 'text-blue-600'}`} />
                  <span>Disparos & Campanhas</span>
                </div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  currentSection === 'disparos'
                    ? 'bg-white text-blue-700 font-extrabold'
                    : 'bg-blue-100 text-blue-800 border border-blue-300'
                }`}>
                  ESTEIRA
                </span>
              </button>

              <button
                onClick={() => onChangeSection('usuarios')}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  currentSection === 'usuarios'
                    ? 'bg-neutral-900 text-white font-bold shadow-xs'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-neutral-400" />
                  <span>Gestão da Equipe</span>
                </div>
              </button>

              <button
                onClick={() => onChangeSection('carteiras')}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  currentSection === 'carteiras'
                    ? 'bg-neutral-900 text-white font-bold shadow-xs'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Share2 className="w-4 h-4 text-neutral-400" />
                  <span>Divisão de Carteiras</span>
                </div>
              </button>
            </nav>
          </div>

          {/* Raio-X Individual dos Vendedores */}
          <div>
            <div className="flex items-center justify-between px-2 mb-1.5">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                Raio-X do Closer
              </span>
              <span className="text-[9px] font-mono text-neutral-400 font-bold">
                {salespeople.length} ativos
              </span>
            </div>

            <div className="space-y-1">
              <button
                onClick={() => {
                  onSelectSalesperson('ALL');
                  onChangeSection('vendedores');
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  currentSection === 'vendedores' && selectedSalespersonId === 'ALL'
                    ? 'bg-neutral-900 text-white font-bold shadow-xs'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Todos os Closers</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>

              {salespeople.length === 0 ? (
                <div className="px-2.5 py-2 text-[11px] text-neutral-400 italic">
                  Nenhum vendedor cadastrado ainda no banco.
                </div>
              ) : (
                salespeople.map((seller) => {
                  const isCurrent = currentSection === 'vendedores' && selectedSalespersonId === seller.id;
                  return (
                    <button
                      key={seller.id}
                      onClick={() => {
                        onSelectSalesperson(seller.id);
                        onChangeSection('vendedores');
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-blue-50 text-blue-900 font-bold border border-blue-200 shadow-2xs'
                          : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: seller.color || '#0284c7' }}
                        />
                        <span className="truncate">{seller.name}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Governança & Auditoria */}
          <div>
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block px-2 mb-1.5">
              Auditoria & Infra
            </span>

            <nav className="space-y-1">
              <button
                onClick={() => onChangeSection('auditoria')}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  currentSection === 'auditoria'
                    ? 'bg-neutral-900 text-white font-bold shadow-xs'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-neutral-400" />
                  <span>Caixa-Preta de Logs</span>
                </div>
              </button>

              <button
                onClick={() => onChangeSection('blindagem')}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  currentSection === 'blindagem'
                    ? 'bg-neutral-900 text-white font-bold shadow-xs'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Database className="w-4 h-4 text-neutral-400" />
                  <span>Infraestrutura Railway</span>
                </div>
              </button>

              <button
                onClick={() => onChangeSection('whatsapp')}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  currentSection === 'whatsapp'
                    ? 'bg-emerald-950 text-white font-bold shadow-xs border border-emerald-800'
                    : 'text-neutral-700 hover:bg-emerald-50/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="w-4 h-4 text-emerald-500" />
                  <span>WhatsApp Oficial (Fluxo)</span>
                </div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  currentSection === 'whatsapp'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}>
                  META
                </span>
              </button>
            </nav>
          </div>
        </div>

        {/* Bottom Switch to Operational Field (Kanban) & Session */}
        <div className="p-3 border-t border-neutral-200 bg-neutral-50/70 space-y-2 shrink-0">
          <button
            onClick={onNavigateToKanban}
            className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              isKanbanActive
                ? 'bg-blue-50 border-blue-300 text-blue-900 shadow-2xs ring-1 ring-blue-300'
                : 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-800 shadow-2xs'
            }`}
            title="Alternar para visão operacional de atendimento (Kanban)"
          >
            <div className="flex items-center gap-2">
              <Layers className={`w-4 h-4 ${isKanbanActive ? 'text-blue-600' : 'text-neutral-500'}`} />
              <span>{isKanbanActive ? 'Kanban (Auditando)' : 'Visão Kanban de Vendas'}</span>
            </div>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
              isKanbanActive ? 'bg-blue-600 text-white' : 'bg-neutral-100 text-neutral-600'
            }`}>
              {totalLeadsCount}
            </span>
          </button>

          <div className="flex items-center justify-between pt-1">
            <div className="min-w-0 pr-2">
              <div className="text-xs font-bold text-neutral-900 truncate">
                {currentUser.name}
              </div>
              <div className="text-[10px] text-neutral-400 font-mono truncate">
                {currentUser.email}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onOpenChangePassword && (
                <button
                  onClick={onOpenChangePassword}
                  className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors shrink-0 cursor-pointer"
                  title="Alterar minha senha"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={onLogout}
                className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0 cursor-pointer"
                title="Sair do sistema"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* MOBILE TOP BAR (Visível apenas em telas < lg) */}
      <div className="lg:hidden bg-white border-b border-neutral-200 px-3 py-2 flex items-center justify-between sticky top-0 z-30 shadow-2xs shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs font-bold text-neutral-900 leading-tight truncate">
              Central do Super Admin
            </h1>
            <p className="text-[10px] text-neutral-500 font-mono truncate">
              {currentSection.toUpperCase()} • {totalLeadsCount} leads
            </p>
          </div>
        </div>

        {/* Quick View Switcher Tabs for Mobile Admin */}
        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg">
          <button
            onClick={() => onChangeSection('cockpit')}
            className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
              currentSection === 'cockpit' ? 'bg-white text-neutral-900 shadow-2xs font-bold' : 'text-neutral-600'
            }`}
          >
            <LayoutDashboard className="w-3 h-3" />
            <span>Cockpit</span>
          </button>

          <button
            onClick={() => onChangeSection('disparos')}
            className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
              currentSection === 'disparos' ? 'bg-blue-600 text-white shadow-2xs font-bold' : 'text-blue-700'
            }`}
          >
            <Rocket className="w-3 h-3" />
            <span>Disparos</span>
          </button>

          <button
            onClick={onNavigateToKanban}
            className={`p-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
              isKanbanActive ? 'bg-white text-blue-600 shadow-2xs font-bold' : 'text-neutral-600'
            }`}
            title="Ver Kanban"
          >
            <Layers className="w-4 h-4" />
          </button>
        </div>

        {/* Hamburger Menu Toggle Button */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-1.5 text-neutral-700 hover:bg-neutral-100 rounded-lg shrink-0 border border-neutral-200 cursor-pointer"
          aria-label="Abrir Menu Administrativo"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* MOBILE DRAWER / SLIDE-OVER MENU FOR ADMIN */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-neutral-900/50 backdrop-blur-xs flex justify-end animate-in fade-in duration-200"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-72 bg-white h-full shadow-2xl flex flex-col justify-between p-4 animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center font-bold text-xs">
                    <Shield className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-neutral-900">Governança Admin</h2>
                    <p className="text-[10px] text-neutral-400">Controle Operacional</p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block px-2 mb-1">
                    Painéis de Gestão
                  </span>
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        onChangeSection('cockpit');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-medium cursor-pointer ${
                        currentSection === 'cockpit' ? 'bg-neutral-900 text-white font-bold' : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      <span>Cockpit Geral</span>
                    </button>

                    <button
                      onClick={() => {
                        onChangeSection('disparos');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-medium cursor-pointer ${
                        currentSection === 'disparos' ? 'bg-blue-600 text-white font-bold' : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      <Rocket className="w-4 h-4" />
                      <span>Disparos & Campanhas</span>
                    </button>

                    <button
                      onClick={() => {
                        onChangeSection('usuarios');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-medium cursor-pointer ${
                        currentSection === 'usuarios' ? 'bg-neutral-900 text-white font-bold' : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      <span>Gestão da Equipe</span>
                    </button>

                    <button
                      onClick={() => {
                        onChangeSection('carteiras');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-medium cursor-pointer ${
                        currentSection === 'carteiras' ? 'bg-neutral-900 text-white font-bold' : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Divisão de Carteiras</span>
                    </button>

                    <button
                      onClick={() => {
                        onChangeSection('auditoria');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-medium cursor-pointer ${
                        currentSection === 'auditoria' ? 'bg-neutral-900 text-white font-bold' : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      <span>Caixa-Preta de Logs</span>
                    </button>

                    <button
                      onClick={() => {
                        onChangeSection('blindagem');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-medium cursor-pointer ${
                        currentSection === 'blindagem' ? 'bg-neutral-900 text-white font-bold' : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      <Database className="w-4 h-4" />
                      <span>Infraestrutura Railway</span>
                    </button>

                    <button
                      onClick={() => {
                        onChangeSection('whatsapp');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-medium cursor-pointer ${
                        currentSection === 'whatsapp' ? 'bg-emerald-800 text-white font-bold' : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4 text-emerald-500" />
                      <span>WhatsApp Oficial</span>
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block px-2 mb-1">
                    Closers & Vendedores
                  </span>
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        onSelectSalesperson('ALL');
                        onChangeSection('vendedores');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer ${
                        currentSection === 'vendedores' && selectedSalespersonId === 'ALL'
                          ? 'bg-neutral-900 text-white font-bold'
                          : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      <span>Todos os Closers</span>
                      <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                    </button>

                    {salespeople.map((seller) => (
                      <button
                        key={seller.id}
                        onClick={() => {
                          onSelectSalesperson(seller.id);
                          onChangeSection('vendedores');
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer ${
                          currentSection === 'vendedores' && selectedSalespersonId === seller.id
                            ? 'bg-blue-50 text-blue-900 font-bold'
                            : 'text-neutral-700 hover:bg-neutral-100'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: seller.color || '#0284c7' }}
                          />
                          <span className="truncate">{seller.name}</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile User Profile & Logout */}
            <div className="pt-3 border-t border-neutral-100 space-y-2 shrink-0">
              <button
                onClick={() => {
                  onNavigateToKanban();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-xl border border-neutral-200 bg-neutral-50 text-xs font-bold text-neutral-800 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>Ver Pipeline Kanban</span>
                </div>
                <span className="text-[10px] font-mono bg-neutral-200 px-2 py-0.5 rounded-full">
                  {totalLeadsCount}
                </span>
              </button>

              <div className="flex items-center justify-between p-2 rounded-xl bg-neutral-50 border border-neutral-200">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center text-xs font-bold shrink-0">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-neutral-900 truncate">
                      {currentUser.name}
                    </div>
                    <div className="text-[10px] text-neutral-500 truncate">
                      👑 Super Admin
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {onOpenChangePassword && (
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenChangePassword();
                      }}
                      className="p-1.5 text-neutral-400 hover:text-neutral-900 rounded-lg hover:bg-neutral-200 transition-colors cursor-pointer"
                      title="Alterar minha senha"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                  )}

                  {onLogout && (
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onLogout();
                      }}
                      className="p-1.5 text-neutral-400 hover:text-red-600 rounded-lg hover:bg-neutral-200 transition-colors cursor-pointer"
                      title="Sair da conta"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

