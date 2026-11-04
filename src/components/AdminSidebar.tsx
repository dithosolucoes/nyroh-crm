import React, { useState } from 'react';
import { isUiFlagOn } from '../lib/uiFlags';
const INFRA_ON = isUiFlagOn(import.meta.env.VITE_MOSTRAR_INFRA);
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
  | 'estrutura'
  | 'configuracoes'
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

type Tom = 'dark' | 'blue' | 'emerald';

const ItemMenu: React.FC<{
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  badge?: string;
  tom?: Tom;
}> = ({ label, icon, active, onClick, badge, tom = 'dark' }) => {
  const ativo =
    tom === 'blue'
      ? 'bg-blue-600 text-white font-bold shadow-xs'
      : tom === 'emerald'
        ? 'bg-emerald-950 text-white font-bold shadow-xs border border-emerald-800'
        : 'bg-neutral-900 text-white font-bold shadow-xs';
  const inativo =
    tom === 'blue'
      ? 'text-neutral-700 hover:bg-blue-50/80 hover:text-blue-900'
      : tom === 'emerald'
        ? 'text-neutral-700 hover:bg-emerald-50/60'
        : 'text-neutral-700 hover:bg-neutral-100';
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${active ? ativo : inativo}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      {badge && (
        <span
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
            active ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
};

const Grupo: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <div>
    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block px-2 mb-1.5">
      {titulo}
    </span>
    <nav className="space-y-1">{children}</nav>
  </div>
);

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

  // Menu oficial em 6 grupos (docs/BLUEPRINT-TELAS.md). Os IDs de seção continuam os mesmos.
  const menu = (depois?: () => void) => {
    const ir = (s: AdminViewSection) => {
      onChangeSection(s);
      depois?.();
    };
    const irVendedor = (id: string) => {
      onSelectSalesperson(id);
      onChangeSection('vendedores');
      depois?.();
    };

    return (
      <div className="space-y-5">
        <Grupo titulo="Hoje">
          <ItemMenu
            label="Cockpit"
            icon={<LayoutDashboard className="w-4 h-4 text-neutral-400" />}
            active={currentSection === 'cockpit'}
            onClick={() => ir('cockpit')}
          />
        </Grupo>

        <Grupo titulo="Pipeline">
          <ItemMenu
            label="Kanban de vendas"
            icon={<Layers className={`w-4 h-4 ${isKanbanActive ? 'text-white' : 'text-neutral-400'}`} />}
            active={isKanbanActive}
            badge={String(totalLeadsCount)}
            onClick={() => {
              onNavigateToKanban();
              depois?.();
            }}
          />
        </Grupo>

        <Grupo titulo="Conversas">
          <ItemMenu
            label="Conversas (WhatsApp)"
            icon={<MessageSquare className="w-4 h-4 text-emerald-500" />}
            active={currentSection === 'whatsapp'}
            badge="META"
            tom="emerald"
            onClick={() => ir('whatsapp')}
          />
        </Grupo>

        <Grupo titulo="Leads">
          <ItemMenu
            label="Leads, central e bloqueios"
            icon={<Briefcase className={`w-4 h-4 ${currentSection === 'estrutura' ? 'text-white' : 'text-neutral-400'}`} />}
            active={currentSection === 'estrutura'}
            onClick={() => ir('estrutura')}
          />
        </Grupo>

        <Grupo titulo="Disparos">
          <ItemMenu
            label="Campanhas"
            icon={<Rocket className={`w-4 h-4 ${currentSection === 'disparos' ? 'text-white' : 'text-blue-600'}`} />}
            active={currentSection === 'disparos'}
            badge="ESTEIRA"
            tom="blue"
            onClick={() => ir('disparos')}
          />
        </Grupo>

        <Grupo titulo="Configurações">
          <ItemMenu
            label="Marcas e números"
            icon={<Layers className="w-4 h-4 text-neutral-400" />}
            active={currentSection === 'configuracoes'}
            onClick={() => ir('configuracoes')}
          />
          <ItemMenu
            label="Equipe"
            icon={<Users className="w-4 h-4 text-neutral-400" />}
            active={currentSection === 'usuarios'}
            onClick={() => ir('usuarios')}
          />
          <ItemMenu
            label="Divisão de carteiras"
            icon={<Share2 className="w-4 h-4 text-neutral-400" />}
            active={currentSection === 'carteiras'}
            onClick={() => ir('carteiras')}
          />
          <ItemMenu
            label="Caixa-preta (logs)"
            icon={<Clock className="w-4 h-4 text-neutral-400" />}
            active={currentSection === 'auditoria'}
            onClick={() => ir('auditoria')}
          />
          {INFRA_ON && (
            <ItemMenu
              label="Infraestrutura"
              icon={<Database className="w-4 h-4 text-neutral-400" />}
              active={currentSection === 'blindagem'}
              onClick={() => ir('blindagem')}
            />
          )}
        </Grupo>

        <div>
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
              Vendedores
            </span>
            <span className="text-[9px] font-mono text-neutral-400 font-bold">{salespeople.length}</span>
          </div>
          <div className="space-y-1">
            <button
              onClick={() => irVendedor('ALL')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentSection === 'vendedores' && selectedSalespersonId === 'ALL'
                  ? 'bg-neutral-900 text-white font-bold shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <span>Todos os vendedores</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            </button>
            {salespeople.length === 0 ? (
              <div className="px-2.5 py-2 text-[11px] text-neutral-400 italic">Nenhum vendedor cadastrado ainda.</div>
            ) : (
              salespeople.map((seller) => {
                const atual = currentSection === 'vendedores' && selectedSalespersonId === seller.id;
                return (
                  <button
                    key={seller.id}
                    onClick={() => irVendedor(seller.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                      atual
                        ? 'bg-blue-50 text-blue-900 font-bold border border-blue-200 shadow-2xs'
                        : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seller.color || '#0284c7' }} />
                      <span className="truncate">{seller.name}</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* DESKTOP SIDEBAR - Visível em telas lg (1024px+) */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-neutral-200 flex-col justify-between h-screen shrink-0 select-none z-20 sticky top-0">
        <div className="p-4 border-b border-neutral-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-neutral-900 flex items-center justify-center text-white shadow-xs font-bold text-sm shrink-0">
              <Shield className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-neutral-900 text-sm tracking-tight truncate">Super Admin</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300 shrink-0">
                  GOVERNANÇA
                </span>
              </div>
              <p className="text-[10px] text-neutral-400 truncate">Gestão Comercial & Diretoria</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">{menu()}</div>

        <div className="p-3 border-t border-neutral-200 bg-neutral-50/70 shrink-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <div className="text-xs font-bold text-neutral-900 truncate">{currentUser.name}</div>
              <div className="text-[10px] text-neutral-400 font-mono truncate">{currentUser.email}</div>
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
            <h1 className="text-xs font-bold text-neutral-900 leading-tight truncate">Central do Super Admin</h1>
            <p className="text-[10px] text-neutral-500 font-mono truncate">{totalLeadsCount} leads</p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg">
          <button
            onClick={() => onChangeSection('cockpit')}
            className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
              currentSection === 'cockpit' ? 'bg-white text-neutral-900 shadow-2xs font-bold' : 'text-neutral-600'
            }`}
          >
            <LayoutDashboard className="w-3 h-3" />
            <span>Hoje</span>
          </button>
          <button
            onClick={onNavigateToKanban}
            className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
              isKanbanActive ? 'bg-white text-blue-600 shadow-2xs font-bold' : 'text-neutral-600'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Pipeline</span>
          </button>
        </div>

        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-1.5 text-neutral-700 hover:bg-neutral-100 rounded-lg shrink-0 border border-neutral-200 cursor-pointer"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* MOBILE DRAWER */}
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
              {menu(() => setMobileMenuOpen(false))}
            </div>

            <div className="pt-3 border-t border-neutral-100 flex items-center justify-between p-2 rounded-xl bg-neutral-50 border border-neutral-200 shrink-0">
              <div className="min-w-0">
                <div className="text-xs font-bold text-neutral-900 truncate">{currentUser.name}</div>
                <div className="text-[10px] text-neutral-500 truncate">Super Admin</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {onOpenChangePassword && (
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onOpenChangePassword();
                    }}
                    className="p-1.5 text-neutral-400 hover:text-neutral-900 rounded-lg hover:bg-neutral-200 cursor-pointer"
                    title="Alterar minha senha"
                  >
                    <KeyRound className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onLogout();
                  }}
                  className="p-1.5 text-neutral-400 hover:text-red-600 rounded-lg hover:bg-neutral-200 cursor-pointer"
                  title="Sair da conta"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
