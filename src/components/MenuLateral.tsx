import React, { useState } from 'react';
import { isUiFlagOn } from '../lib/uiFlags';
import { User } from '../types';
import { Destino } from '../lib/rotas';
import {
  LayoutGrid,
  Table,
  CalendarClock,
  BarChart3,
  MessageSquare,
  Briefcase,
  Rocket,
  Users,
  Clock,
  Database,
  Layers,
  Tag,
  FileArchive,
  KeyRound,
  LogOut,
  Shield,
  Menu,
  X
} from 'lucide-react';

const INFRA_ON = isUiFlagOn(import.meta.env.VITE_MOSTRAR_INFRA);

interface MenuLateralProps {
  currentUser: User;
  destinoAtual: Destino;
  podeVerConversas: boolean;
  totalLeads: number;
  onNavigate: (destino: Destino) => void;
  onOpenZipModal: () => void;
  onOpenTagsModal: () => void;
  onOpenWhatsAppSettings: () => void;
  onOpenChangePassword: () => void;
  onLogout: () => void;
}

interface ItemMenu {
  label: string;
  icon: React.ReactNode;
  destino?: Destino;
  acao?: () => void;
  badge?: string;
}

interface Grupo {
  titulo: string;
  itens: ItemMenu[];
}

const iconeCls = 'w-4 h-4 shrink-0';

function mesmoDestino(a: Destino, b: Destino): boolean {
  if (a.tab !== b.tab) return false;
  if (a.tab !== 'admin') return true;
  return (a.section ?? 'cockpit') === (b.section ?? 'cockpit');
}

/**
 * Menu único do NYROH (Fase 2). Mesmo componente para admin e vendedor:
 * o que cada perfil vê é decidido aqui, em um lugar só.
 */
export const MenuLateral: React.FC<MenuLateralProps> = ({
  currentUser,
  destinoAtual,
  podeVerConversas,
  totalLeads,
  onNavigate,
  onOpenZipModal,
  onOpenTagsModal,
  onOpenWhatsAppSettings,
  onOpenChangePassword,
  onLogout
}) => {
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const isAdmin = currentUser.role === 'admin';

  const ir = (d: Destino) => {
    onNavigate(d);
    setGavetaAberta(false);
  };

  const grupos: Grupo[] = [];

  grupos.push({
    titulo: 'Hoje',
    itens: [
      {
        label: 'Hoje',
        icon: <CalendarClock className={`${iconeCls} text-neutral-500`} />,
        destino: isAdmin ? { tab: 'admin', section: 'cockpit' } : { tab: 'hoje' }
      }
    ]
  });

  const atendimento: ItemMenu[] = [];
  if (podeVerConversas) {
    atendimento.push({
      label: 'Conversas',
      icon: <MessageSquare className={`${iconeCls} text-emerald-600`} />,
      destino: { tab: 'whatsapp' }
    });
  }
  atendimento.push(
    { label: 'Pipeline', icon: <LayoutGrid className={`${iconeCls} text-neutral-500`} />, destino: { tab: 'kanban' }, badge: String(totalLeads) },
    { label: 'Lista de leads', icon: <Table className={`${iconeCls} text-neutral-500`} />, destino: { tab: 'table' } },
    { label: 'Relatórios', icon: <BarChart3 className={`${iconeCls} text-blue-600`} />, destino: { tab: 'dashboard' } }
  );
  grupos.push({ titulo: 'Atendimento', itens: atendimento });

  if (isAdmin) {
    grupos.push({
      titulo: 'Leads e disparos',
      itens: [
        { label: 'Leads e bloqueios', icon: <Briefcase className={`${iconeCls} text-neutral-500`} />, destino: { tab: 'admin', section: 'estrutura' } },
        { label: 'Importar leads (ZIP)', icon: <FileArchive className={`${iconeCls} text-neutral-500`} />, acao: onOpenZipModal },
        { label: 'Campanhas', icon: <Rocket className={`${iconeCls} text-blue-600`} />, destino: { tab: 'admin', section: 'disparos' } }
      ]
    });
    grupos.push({
      titulo: 'Equipe',
      itens: [
        { label: 'Vendedores', icon: <Users className={`${iconeCls} text-neutral-500`} />, destino: { tab: 'admin', section: 'vendedores' } },
        { label: 'Equipe e carteiras', icon: <Users className={`${iconeCls} text-neutral-500`} />, destino: { tab: 'admin', section: 'usuarios' } }
      ]
    });
    grupos.push({
      titulo: 'Configurações',
      itens: [
        { label: 'Configurações', icon: <Layers className={`${iconeCls} text-neutral-500`} />, destino: { tab: 'admin', section: 'configuracoes' } },
        { label: 'Etiquetas de ligação', icon: <Tag className={`${iconeCls} text-neutral-500`} />, acao: onOpenTagsModal },
        { label: 'Mensagem do WhatsApp', icon: <MessageSquare className={`${iconeCls} text-neutral-500`} />, acao: onOpenWhatsAppSettings },
        { label: 'Histórico', icon: <Clock className={`${iconeCls} text-neutral-500`} />, destino: { tab: 'admin', section: 'auditoria' } },
        ...(INFRA_ON
          ? [{ label: 'Infraestrutura', icon: <Database className={`${iconeCls} text-neutral-500`} />, destino: { tab: 'admin' as const, section: 'blindagem' as const } }]
          : [])
      ]
    });
  } else {
    grupos.push({
      titulo: 'Ferramentas',
      itens: [
        { label: 'Etiquetas de ligação', icon: <Tag className={`${iconeCls} text-neutral-500`} />, acao: onOpenTagsModal },
        { label: 'Mensagem do WhatsApp', icon: <MessageSquare className={`${iconeCls} text-neutral-500`} />, acao: onOpenWhatsAppSettings }
      ]
    });
  }

  const renderGrupos = () => (
    <div className="space-y-5">
      {grupos.map(g => (
        <div key={g.titulo}>
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block px-2 mb-1.5">{g.titulo}</span>
          <nav className="space-y-0.5">
            {g.itens.map(item => {
              const ativo = item.destino ? mesmoDestino(item.destino, destinoAtual) : false;
              return (
                <button
                  key={item.label}
                  onClick={() => (item.acao ? (item.acao(), setGavetaAberta(false)) : item.destino && ir(item.destino))}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                    ativo
                      ? 'bg-neutral-900 text-white font-bold'
                      : 'text-neutral-700 font-medium hover:bg-neutral-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0 ${ativo ? 'bg-white/20 text-white' : 'bg-neutral-200 text-neutral-700'}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );

  const rodape = (
    <div className="p-3 border-t border-neutral-200 bg-neutral-50/70 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-xs font-bold text-neutral-900 truncate">{currentUser.name}</div>
        <div className="text-[10px] text-neutral-500 font-mono truncate">{isAdmin ? 'Administrador' : 'Vendedor'}</div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onOpenChangePassword} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg cursor-pointer" title="Alterar minha senha">
          <KeyRound className="w-3.5 h-3.5" />
        </button>
        <button onClick={onLogout} className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer" title="Sair do sistema">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop (xl+): coluna fixa à esquerda */}
      <aside className="hidden xl:flex w-60 bg-white border-r border-neutral-200 flex-col h-screen shrink-0 select-none sticky top-0">
        <div className="p-4 border-b border-neutral-200 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center">
            <Shield className="w-4 h-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-neutral-900 text-sm tracking-tight">NYROH</div>
            <div className="text-[10px] text-neutral-400 truncate">{isAdmin ? 'Painel do administrador' : 'Meu painel de vendas'}</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">{renderGrupos()}</div>
        {rodape}
      </aside>

      {/* Celular e tablet: barra superior + gaveta */}
      <div className="xl:hidden bg-white border-b border-neutral-200 px-3 py-2 flex items-center justify-between sticky top-0 z-30 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-neutral-900 flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <span className="text-xs font-bold text-neutral-900">NYROH</span>
        </div>
        <button onClick={() => setGavetaAberta(true)} className="p-1.5 text-neutral-700 hover:bg-neutral-100 rounded-lg border border-neutral-200 cursor-pointer" aria-label="Abrir menu">
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {gavetaAberta && (
        <div className="xl:hidden fixed inset-0 z-50 bg-neutral-900/50 flex justify-end" onClick={() => setGavetaAberta(false)}>
          <div className="w-72 max-w-[85vw] bg-white h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-neutral-100">
              <span className="text-xs font-bold text-neutral-900">Menu</span>
              <button onClick={() => setGavetaAberta(false)} className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg cursor-pointer" aria-label="Fechar menu">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{renderGrupos()}</div>
            {rodape}
          </div>
        </div>
      )}
    </>
  );
};
