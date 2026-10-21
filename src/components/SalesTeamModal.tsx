import React, { useState, useEffect } from 'react';
import { Salesperson, Lead, CustomTag } from '../types';
import { 
  X, UserPlus, Users, Share2, Shield, Trash2, Edit3, Check, 
  Sparkles, AlertCircle, ArrowRight, UserCheck, CheckCircle2, Percent, Hash,
  Link, ExternalLink, MessageCircle, Copy, Code2, RotateCw, Sliders, ShieldCheck, RefreshCw
} from 'lucide-react';
import { getSalespersonAppUrl, getSalespersonSlug } from '../lib/salesperson';
import { openWhatsApp, WhatsAppAppType } from '../lib/phone';
import { BulkCreateSalespeopleModal } from './BulkCreateSalespeopleModal';

interface SalesTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  salespeople: Salesperson[];
  leads: Lead[];
  onRefreshSalespeople: () => Promise<void>;
  onRefreshLeads: () => Promise<void>;
  onShowToast: (msg: string) => void;
  onSelectSalespersonRoute?: (seller: Salesperson) => void;
}

const COLOR_PALETTES = [
  { name: 'Azul Céu', color: '#0284c7', bgColor: '#e0f2fe' },
  { name: 'Esmeralda', color: '#059669', bgColor: '#d1fae5' },
  { name: 'Púrpura', color: '#7c3aed', bgColor: '#ede9fe' },
  { name: 'Rosa / Carmim', color: '#db2777', bgColor: '#fce7f3' },
  { name: 'Âmbar / Dourado', color: '#d97706', bgColor: '#fef3c7' },
  { name: 'Índigo', color: '#4f46e5', bgColor: '#e0e7ff' },
  { name: 'Ciano', color: '#0891b2', bgColor: '#cffafe' },
  { name: 'Grafite', color: '#475569', bgColor: '#f1f5f9' },
];

export const SalesTeamModal: React.FC<SalesTeamModalProps> = ({
  isOpen,
  onClose,
  salespeople,
  leads,
  onRefreshSalespeople,
  onRefreshLeads,
  onShowToast,
  onSelectSalespersonRoute
}) => {
  const [activeTab, setActiveTab] = useState<'team' | 'distribute' | 'roulette'>('team');

  // Form states for new salesperson
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState(1); // default Emerald for 2nd seller
  const [newSellerWhatsAppType, setNewSellerWhatsAppType] = useState<WhatsAppAppType>('business');
  const [savingSeller, setSavingSeller] = useState(false);
  const [isBatchJsonModalOpen, setIsBatchJsonModalOpen] = useState(false);

  // Distribution states
  const [distSourceId, setDistSourceId] = useState<string>('ALL');
  const [distTargetId, setDistTargetId] = useState<string>('');
  const [distMode, setDistMode] = useState<'percentage' | 'count'>('percentage');
  const [distPercentage, setDistPercentage] = useState<number>(50);
  const [distCount, setDistCount] = useState<number>(10);
  const [distributing, setDistributing] = useState(false);

  // Roulette states
  const [rouletteSettings, setRouletteSettings] = useState<Record<string, {
    pctInteressados: number;
    pctNaoInteressados: number;
    limiteLeadsDiario: number;
    ativoRoleta: boolean;
  }>>({});
  const [savingRoulette, setSavingRoulette] = useState(false);
  const [resettingDaily, setResettingDaily] = useState(false);
  const [batchRouletteCount, setBatchRouletteCount] = useState(10);
  const [batchRouletteType, setBatchRouletteType] = useState<'novos' | 'interessados' | 'nao_interessados'>('novos');
  const [runningBatchRoulette, setRunningBatchRoulette] = useState(false);

  useEffect(() => {
    const initial: Record<string, any> = {};
    salespeople.forEach(s => {
      initial[s.id] = {
        pctInteressados: s.pctInteressados ?? 50,
        pctNaoInteressados: s.pctNaoInteressados ?? 50,
        limiteLeadsDiario: s.limiteLeadsDiario ?? 100,
        ativoRoleta: s.ativoRoleta ?? true
      };
    });
    setRouletteSettings(initial);
  }, [salespeople]);

  const handleSaveRoulette = async () => {
    setSavingRoulette(true);
    try {
      const updates = salespeople.map(s => {
        const conf = rouletteSettings[s.id] || {
          pctInteressados: 50,
          pctNaoInteressados: 50,
          limiteLeadsDiario: 100,
          ativoRoleta: true
        };
        return fetch(`/api/salespeople/${s.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pctInteressados: Number(conf.pctInteressados),
            pctNaoInteressados: Number(conf.pctNaoInteressados),
            limiteLeadsDiario: Number(conf.limiteLeadsDiario),
            ativoRoleta: Boolean(conf.ativoRoleta)
          })
        });
      });

      await Promise.all(updates);
      await onRefreshSalespeople();
      onShowToast('Configurações da roleta salvas com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar roleta:', err);
      onShowToast('Falha ao salvar parâmetros da roleta.');
    } finally {
      setSavingRoulette(false);
    }
  };

  const handleResetDaily = async () => {
    if (!confirm('Deseja zerar os contadores de leads recebidos hoje para todos os vendedores?')) return;
    setResettingDaily(true);
    try {
      const res = await fetch('/api/salespeople/reset-daily-leads', { method: 'POST' });
      if (res.ok) {
        await onRefreshSalespeople();
        onShowToast('Contadores diários zerados com sucesso!');
      } else {
        onShowToast('Erro ao zerar contadores.');
      }
    } catch (err) {
      onShowToast('Erro ao conectar com servidor.');
    } finally {
      setResettingDaily(false);
    }
  };

  const handleRunBatchRoulette = async () => {
    setRunningBatchRoulette(true);
    try {
      const res = await fetch('/api/salespeople/distribute-roulette', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: Number(batchRouletteCount),
          leadType: batchRouletteType
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await onRefreshLeads();
        await onRefreshSalespeople();
        onShowToast(`Roleta executada: ${data.distributedCount} leads distribuídos!`);
      } else {
        onShowToast(data.message || data.error || 'Nenhum lead elegível para distribuir.');
      }
    } catch (err) {
      onShowToast('Erro ao executar distribuição por roleta.');
    } finally {
      setRunningBatchRoulette(false);
    }
  };

  if (!isOpen) return null;

  // Calculate available leads for distribution (Column = 'Leads' AND callCount = 0)
  const availableUncontactedLeads = leads.filter(l => {
    if (l.columnStatus !== 'Leads') return false;
    if (l.callCount && l.callCount > 0) return false;
    if (distSourceId !== 'ALL') {
      return (l.salespersonId || 'seller-thomas') === distSourceId;
    }
    return true;
  });

  const totalEligibleCount = availableUncontactedLeads.length;

  // Target count calculation preview
  const calculatedTransferCount = distMode === 'percentage'
    ? Math.min(totalEligibleCount, Math.max(totalEligibleCount > 0 ? 1 : 0, Math.round((totalEligibleCount * distPercentage) / 100)))
    : Math.min(totalEligibleCount, Math.max(0, distCount));

  // Set default target if not chosen
  const defaultTarget = salespeople.find(s => s.id !== 'seller-thomas') || salespeople[0];
  const currentTargetId = distTargetId || (defaultTarget ? defaultTarget.id : '');

  const handleCreateSalesperson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      onShowToast('Informe o nome do vendedor(a).');
      return;
    }

    setSavingSeller(true);
    try {
      const palette = COLOR_PALETTES[selectedPaletteIndex] || COLOR_PALETTES[0];
      const res = await fetch('/api/salespeople', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          color: palette.color,
          bgColor: palette.bgColor,
          whatsappType: newSellerWhatsAppType
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao cadastrar vendedor.');
      }

      const created = await res.json();
      onShowToast(`Vendedor(a) "${created.name}" cadastrado(a) com sucesso!`);
      setName('');
      setEmail('');
      setPhone('');
      await onRefreshSalespeople();
      // Auto-select for distribution
      setDistTargetId(created.id);
      setActiveTab('distribute');
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao salvar vendedor.');
    } finally {
      setSavingSeller(false);
    }
  };

  const handleDeleteSalesperson = async (seller: Salesperson) => {
    if (seller.isDefault || seller.id === 'seller-thomas') {
      onShowToast('O vendedor principal (Thomas) não pode ser excluído.');
      return;
    }

    if (!confirm(`Deseja realmente remover "${seller.name}"? Todos os leads deste vendedor serão transferidos de volta para Thomas.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/salespeople/${seller.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao remover vendedor.');
      }
      onShowToast(`Vendedor "${seller.name}" removido. Leads atribuídos a Thomas.`);
      await onRefreshSalespeople();
      await onRefreshLeads();
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao excluir vendedor.');
    }
  };

  const handleExecuteDistribution = async () => {
    if (!currentTargetId) {
      onShowToast('Selecione o vendedor(a) de destino.');
      return;
    }

    if (totalEligibleCount === 0) {
      onShowToast('Não há leads novos na coluna "Leads" para distribuir.');
      return;
    }

    const targetSeller = salespeople.find(s => s.id === currentTargetId);
    const targetName = targetSeller?.name || 'Vendedor Selecionado';

    const valueToSend = distMode === 'percentage' ? distPercentage : distCount;

    setDistributing(true);
    try {
      const res = await fetch('/api/leads/distribute', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': 'admin'
        },
        credentials: 'include',
        body: JSON.stringify({
          targetSalespersonId: currentTargetId,
          mode: distMode,
          value: valueToSend,
          sourceSalespersonId: distSourceId,
          userRole: 'admin'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao distribuir leads.');
      }

      onShowToast(`🎉 ${data.transferredCount} novos leads foram transferidos para "${data.targetSalespersonName}"!`);
      await onRefreshLeads();
      await onRefreshSalespeople();
      onClose();
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao processar distribuição.');
    } finally {
      setDistributing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-xl shadow-2xl border border-neutral-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-900 leading-tight">
                Gestão de Vendedores & Distribuição de Leads
              </h2>
              <p className="text-xs text-neutral-500">
                Cadastre vendedores e divida os novos leads da coluna inicial
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-neutral-200 bg-white px-5 pt-2">
          <button
            onClick={() => setActiveTab('team')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'team'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Equipe de Vendas ({salespeople.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('distribute')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'distribute'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Share2 className="w-4 h-4" />
            <span>Distribuir Manual</span>
            {totalEligibleCount > 0 && (
              <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {totalEligibleCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('roulette')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'roulette'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <RotateCw className="w-4 h-4 text-emerald-600" />
            <span>Roleta Automática de Leads</span>
            <span className="bg-emerald-50 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-bold border border-emerald-200">
              Round-Robin
            </span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'team' ? (
            <>
              {/* List of Salespeople */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider block">
                  Vendedores Cadastrados
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {salespeople.map((seller) => {
                    const myLeads = leads.filter(l => (l.salespersonId || 'seller-thomas') === seller.id);
                    const uncontacted = myLeads.filter(l => l.columnStatus === 'Leads' && (!l.callCount || l.callCount === 0)).length;
                    const inProgress = myLeads.filter(l => ['Ligação 1', 'Ligação 2', 'Ligação 3', 'Ligação 4', 'Interessado'].includes(l.columnStatus)).length;
                    const closed = myLeads.filter(l => l.columnStatus === 'Fechado').length;

                    return (
                      <div 
                        key={seller.id}
                        className="p-3.5 rounded-xl border border-neutral-200 bg-white shadow-2xs hover:border-neutral-300 transition-all flex flex-col justify-between"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div 
                              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-xs"
                              style={{ backgroundColor: seller.bgColor, color: seller.color }}
                            >
                              {seller.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <h3 className="text-xs font-bold text-neutral-900 truncate">
                                  {seller.name}
                                </h3>
                                {seller.isDefault && (
                                  <span className="text-[9px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.2 rounded">
                                    Principal
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-neutral-500 truncate">
                                {seller.email || seller.phone || 'Vendedor Ativo'}
                              </p>
                            </div>
                          </div>

                          {!seller.isDefault && (
                            <button
                              onClick={() => handleDeleteSalesperson(seller)}
                              className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              title="Excluir vendedor e transferir leads para Thomas"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Stats Bar */}
                        <div className="mt-3 pt-2.5 border-t border-neutral-100 grid grid-cols-4 gap-1 text-center">
                          <div className="p-1 rounded bg-neutral-50">
                            <span className="block text-[10px] text-neutral-400 font-medium">Total</span>
                            <span className="text-xs font-bold text-neutral-800">{myLeads.length}</span>
                          </div>
                          <div className="p-1 rounded bg-blue-50/50">
                            <span className="block text-[10px] text-blue-600 font-medium">Novos</span>
                            <span className="text-xs font-bold text-blue-900">{uncontacted}</span>
                          </div>
                          <div className="p-1 rounded bg-amber-50/50">
                            <span className="block text-[10px] text-amber-600 font-medium">Fila</span>
                            <span className="text-xs font-bold text-amber-900">{inProgress}</span>
                          </div>
                          <div className="p-1 rounded bg-emerald-50/50">
                            <span className="block text-[10px] text-emerald-600 font-medium">Vendas</span>
                            <span className="text-xs font-bold text-emerald-900">{closed}</span>
                          </div>
                        </div>

                        {/* Dedicated Salesperson Route URL & Actions */}
                        <div className="mt-2.5 pt-2 border-t border-neutral-100/80 flex flex-wrap items-center justify-between gap-1.5 bg-neutral-50/80 -mx-3.5 -mb-3.5 p-2.5 rounded-b-xl">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="flex items-center gap-1 min-w-0 text-[11px] font-mono text-neutral-500 truncate">
                              <Link className="w-3 h-3 text-blue-600 shrink-0" />
                              <span className="truncate">/v/{getSalespersonSlug(seller)}</span>
                            </div>

                            {/* Toggle Permissão: Gerador de Laudo & PDF */}
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
                                    await onRefreshSalespeople();
                                  } else {
                                    onShowToast('Erro ao alternar permissão de laudo.');
                                  }
                                } catch (err) {
                                  onShowToast('Erro ao atualizar permissão.');
                                }
                              }}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                                seller.canGenerateAuditPdf !== false
                                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                                  : 'bg-neutral-100 text-neutral-400 border-neutral-200'
                              }`}
                              title="Clique para ativar/desativar o gerador de diagnóstico e laudo em PDF para este vendedor"
                            >
                              📄 Laudo PDF: {seller.canGenerateAuditPdf !== false ? 'Ativado' : 'Off'}
                            </button>

                            {/* WhatsApp Preference Toggle (Business / Normal / Perguntar) */}
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const current = seller.whatsappType || 'business';
                                const nextVal: WhatsAppAppType = current === 'business' ? 'normal' : current === 'normal' ? 'ask' : 'business';
                                try {
                                  const res = await fetch(`/api/salespeople/${seller.id}/whatsapp-type`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ whatsappType: nextVal })
                                  });
                                  if (res.ok) {
                                    const lbl = nextVal === 'business' ? 'Business' : nextVal === 'normal' ? 'Normal' : 'Perguntar';
                                    onShowToast(`Preferência de ${seller.name} atualizada para WhatsApp ${lbl}!`);
                                    await onRefreshSalespeople();
                                  } else {
                                    onShowToast('Erro ao atualizar preferência de WhatsApp.');
                                  }
                                } catch (err) {
                                  onShowToast('Erro de conexão ao salvar.');
                                }
                              }}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                                (seller.whatsappType || 'business') === 'business'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : (seller.whatsappType || 'business') === 'normal'
                                  ? 'bg-blue-50 text-blue-800 border-blue-300'
                                  : 'bg-neutral-100 text-neutral-600 border-neutral-300'
                              }`}
                              title="Clique para alternar o app de WhatsApp deste vendedor: Business, Normal ou Perguntar no celular"
                            >
                              💬 WPP: {(seller.whatsappType || 'business') === 'business' ? 'Business' : (seller.whatsappType || 'business') === 'normal' ? 'Normal' : 'Perguntar'}
                            </button>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const url = getSalespersonAppUrl(seller);
                                navigator.clipboard.writeText(url);
                                onShowToast(`Link da rota de ${seller.name} copiado!`);
                              }}
                              className="px-2 py-1 rounded bg-white hover:bg-neutral-100 text-neutral-700 text-[10px] font-semibold border border-neutral-200 shadow-2xs flex items-center gap-1 transition-colors"
                              title="Copiar link exclusivo do vendedor"
                            >
                              <Copy className="w-3 h-3" />
                              <span>Copiar Link</span>
                            </button>

                            {seller.phone && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const url = getSalespersonAppUrl(seller);
                                  const msg = `Olá ${seller.name}, aqui está o seu link exclusivo do CRM: ${url}`;
                                  openWhatsApp(seller.phone!, msg, seller.whatsappType || 'business');
                                }}
                                className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-semibold border border-emerald-200 flex items-center gap-1 transition-colors"
                                title="Enviar link do CRM via WhatsApp"
                              >
                                <MessageCircle className="w-3 h-3 text-emerald-600" />
                                <span>WhatsApp</span>
                              </button>
                            )}

                            {onSelectSalespersonRoute && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectSalespersonRoute(seller);
                                  onClose();
                                }}
                                className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold flex items-center gap-1 transition-colors"
                                title="Abrir painel deste vendedor"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Acessar</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add New Salesperson Form */}
              <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/60 space-y-3.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-bold text-neutral-900">
                      Cadastrar Novo(a) Vendedor(a)
                    </h3>
                  </div>

                  {/* Botão Discreto: Criar Vários via JSON */}
                  <button
                    type="button"
                    onClick={() => setIsBatchJsonModalOpen(true)}
                    className="px-2.5 py-1 text-[11px] font-semibold text-neutral-700 hover:text-blue-700 bg-white hover:bg-neutral-50 border border-neutral-300 rounded-lg shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer touch-manipulation"
                    title="Abrir popup para colar JSON e criar vários vendedores de uma só vez"
                  >
                    <Code2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Criar Vários via JSON</span>
                  </button>
                </div>

                <form onSubmit={handleCreateSalesperson} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                        Nome Completo *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Mariana Silva"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-neutral-300 focus:outline-none focus:border-blue-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                        E-mail (opcional)
                      </label>
                      <input
                        type="email"
                        placeholder="mariana@empresa.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-neutral-300 focus:outline-none focus:border-blue-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                        Telefone / WhatsApp (opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="(31) 99999-9999"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-neutral-300 focus:outline-none focus:border-blue-500 bg-white"
                      />
                    </div>
                  </div>

                  {/* Color Palette Picker */}
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1.5">
                      Cor do Crachá / Avatar
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {COLOR_PALETTES.map((pal, idx) => (
                        <button
                          key={pal.name}
                          type="button"
                          onClick={() => setSelectedPaletteIndex(idx)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                            selectedPaletteIndex === idx
                              ? 'ring-2 ring-blue-500 ring-offset-1 border-transparent shadow-xs'
                              : 'border-neutral-200 hover:border-neutral-300'
                          }`}
                          style={{ backgroundColor: pal.bgColor, color: pal.color }}
                        >
                          <span 
                            className="w-2.5 h-2.5 rounded-full inline-block"
                            style={{ backgroundColor: pal.color }}
                          />
                          <span>{pal.name}</span>
                          {selectedPaletteIndex === idx && <Check className="w-3 h-3 ml-0.5" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* WhatsApp App Preference */}
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1.5">
                      WhatsApp Padrão deste Vendedor
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setNewSellerWhatsAppType('business')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1 transition-all ${
                          newSellerWhatsAppType === 'business'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-500 ring-1 ring-emerald-500'
                            : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                        }`}
                      >
                        <span>Business</span>
                        {newSellerWhatsAppType === 'business' && <Check className="w-3 h-3 text-emerald-600" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setNewSellerWhatsAppType('normal')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1 transition-all ${
                          newSellerWhatsAppType === 'normal'
                            ? 'bg-blue-50 text-blue-800 border-blue-500 ring-1 ring-blue-500'
                            : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                        }`}
                      >
                        <span>Normal</span>
                        {newSellerWhatsAppType === 'normal' && <Check className="w-3 h-3 text-blue-600" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setNewSellerWhatsAppType('ask')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1 transition-all ${
                          newSellerWhatsAppType === 'ask'
                            ? 'bg-neutral-100 text-neutral-900 border-neutral-400 ring-1 ring-neutral-400'
                            : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                        }`}
                      >
                        <span>Perguntar</span>
                        {newSellerWhatsAppType === 'ask' && <Check className="w-3 h-3 text-neutral-700" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setIsBatchJsonModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold rounded-lg transition-colors border border-neutral-300"
                      title="Cadastrar vendedores colando uma lista em JSON"
                    >
                      <Code2 className="w-3.5 h-3.5 text-blue-600" />
                      <span>Importar em Lote (JSON)</span>
                    </button>

                    <button
                      type="submit"
                      disabled={savingSeller || !name.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{savingSeller ? 'Cadastrando...' : 'Cadastrar Vendedor(a)'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : activeTab === 'distribute' ? (
            <>
              {/* LEAD DISTRIBUTION TAB */}
              <div className="space-y-4">
                {/* Rule Callout */}
                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 flex items-start gap-3">
                  <Shield className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-950 space-y-1">
                    <h4 className="font-bold text-blue-900">
                      Regra de Proteção do Pipeline:
                    </h4>
                    <p className="text-blue-800 leading-relaxed">
                      Apenas os leads <strong className="underline">frescos na coluna inicial "Leads" com 0 ligações</strong> serão transferidos. Leads em andamento em Ligação 1, 2, 3, 4, Interessado ou Fechados <strong className="underline">permanecem intactos com seus vendedores atuais</strong>.
                    </p>
                  </div>
                </div>

                {/* Live Counter of Eligible Leads */}
                <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block">
                      Banco de Leads Novos Disponíveis
                    </span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-2xl font-black text-neutral-900">
                        {totalEligibleCount}
                      </span>
                      <span className="text-xs text-neutral-500">
                        leads não abordados (coluna "Leads", 0 chamadas)
                      </span>
                    </div>
                  </div>

                  {totalEligibleCount === 0 && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Nenhum lead novo para transferir no momento.</span>
                    </div>
                  )}
                </div>

                {/* Target & Source Salesperson Configuration */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                      1. Vendedor(a) de Destino (Receberá os leads) *
                    </label>
                    <select
                      value={currentTargetId}
                      onChange={(e) => setDistTargetId(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 rounded-lg border border-neutral-300 focus:outline-none focus:border-blue-500 bg-white"
                    >
                      {salespeople.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.isDefault ? '(Thomas - Principal)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                      2. Origem dos Leads
                    </label>
                    <select
                      value={distSourceId}
                      onChange={(e) => setDistSourceId(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 rounded-lg border border-neutral-300 focus:outline-none focus:border-blue-500 bg-white"
                    >
                      <option value="ALL">Todos os Leads Não Abordados ({leads.filter(l => l.columnStatus === 'Leads' && (!l.callCount || l.callCount === 0)).length})</option>
                      {salespeople.map((s) => {
                        const sellerUncontacted = leads.filter(l => (l.salespersonId || 'seller-thomas') === s.id && l.columnStatus === 'Leads' && (!l.callCount || l.callCount === 0)).length;
                        return (
                          <option key={s.id} value={s.id}>
                            Apenas de {s.name} ({sellerUncontacted} disponíveis)
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                {/* Distribution Mode: Percentage or Count */}
                <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900">
                      3. Escolha como quer dividir:
                    </span>

                    <div className="flex items-center p-0.5 bg-neutral-100 rounded-lg border border-neutral-200">
                      <button
                        type="button"
                        onClick={() => setDistMode('percentage')}
                        className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                          distMode === 'percentage'
                            ? 'bg-white text-blue-600 shadow-2xs'
                            : 'text-neutral-600 hover:text-neutral-900'
                        }`}
                      >
                        <Percent className="w-3.5 h-3.5" />
                        <span>Porcentagem (%)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDistMode('count')}
                        className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                          distMode === 'count'
                            ? 'bg-white text-blue-600 shadow-2xs'
                            : 'text-neutral-600 hover:text-neutral-900'
                        }`}
                      >
                        <Hash className="w-3.5 h-3.5" />
                        <span>Quantidade Exata</span>
                      </button>
                    </div>
                  </div>

                  {distMode === 'percentage' ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-neutral-600 font-medium">
                          Porcentagem a transferir:
                        </label>
                        <span className="text-sm font-black text-blue-600">
                          {distPercentage}%
                        </span>
                      </div>

                      {/* Slider */}
                      <input
                        type="range"
                        min="5"
                        max="100"
                        step="5"
                        value={distPercentage}
                        onChange={(e) => setDistPercentage(Number(e.target.value))}
                        className="w-full accent-blue-600 cursor-pointer h-2 bg-neutral-200 rounded-lg"
                      />

                      {/* Quick Percentage Presets */}
                      <div className="flex items-center gap-1.5">
                        {[10, 25, 33, 50, 75, 100].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => setDistPercentage(pct)}
                            className={`flex-1 py-1 rounded text-xs font-semibold border transition-all ${
                              distPercentage === pct
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-xs text-neutral-600 font-medium">
                        Quantidade exata de leads a transferir:
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max={totalEligibleCount || 1}
                          value={distCount}
                          onChange={(e) => setDistCount(Math.max(1, Number(e.target.value)))}
                          className="w-36 text-sm font-bold px-3 py-1.5 rounded-lg border border-neutral-300 focus:outline-none focus:border-blue-500 bg-white"
                        />
                        <span className="text-xs text-neutral-500">
                          de {totalEligibleCount} leads disponíveis
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Visual Calculation Preview */}
                  <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-blue-600" />
                      <span className="text-xs text-neutral-700">
                        Serão transferidos <strong>{calculatedTransferCount} leads</strong> para <strong>{salespeople.find(s => s.id === currentTargetId)?.name || 'o vendedor'}</strong>
                      </span>
                    </div>

                    <span className="text-xs font-bold text-neutral-500">
                      Restarão {totalEligibleCount - calculatedTransferCount} leads
                    </span>
                  </div>
                </div>

                {/* Action CTA */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleExecuteDistribution}
                    disabled={distributing || totalEligibleCount === 0 || calculatedTransferCount === 0}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>
                      {distributing ? 'Distribuindo Leads...' : `Confirmar e Transferir ${calculatedTransferCount} Leads`}
                    </span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* ROULETTE (ROLETA AUTOMÁTICA ROUND-ROBIN) TAB */}
              <div className="space-y-5">
                {/* Explain banner */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/80 flex items-start gap-3 shadow-2xs">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <RotateCw className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-bold text-emerald-950">
                        Roleta Automática de Leads (Round-Robin Ponderado)
                      </h4>
                      <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
                        Concorrência Segura (Atomic Lock)
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-900/80 mt-1 leading-relaxed">
                      Distribui os leads recebidos da Meta API e importações de acordo com os percentuais ponderados (%) e limites diários definidos para cada vendedor. Se o vendedor atingir o teto diário, a roleta pula para o próximo apto automaticamente.
                    </p>
                  </div>
                </div>

                {/* Top Action Bar: Save Settings & Reset Counters */}
                <div className="flex items-center justify-between gap-3 flex-wrap bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetDaily}
                      disabled={resettingDaily}
                      className="px-3 py-2 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 text-xs font-semibold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Zera a contagem de leads recebidos hoje para permitir novas entregas"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${resettingDaily ? 'animate-spin text-emerald-600' : 'text-neutral-500'}`} />
                      <span>{resettingDaily ? 'Zerando...' : 'Zerar Contadores Diários'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveRoulette}
                    disabled={savingRoulette}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>{savingRoulette ? 'Salvando...' : 'Salvar Regras da Roleta'}</span>
                  </button>
                </div>

                {/* Batch Distribution Trigger */}
                <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-emerald-600" />
                      Rodar Roleta em Lote (Distribuição Instantânea)
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      Disponíveis: <strong>{totalEligibleCount}</strong> leads novos
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                        Quantidade de Leads
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={totalEligibleCount || 100}
                        value={batchRouletteCount}
                        onChange={e => setBatchRouletteCount(Math.max(1, Number(e.target.value)))}
                        className="w-full text-xs px-3 py-2 rounded-lg border border-neutral-300 bg-neutral-50/50 focus:bg-white focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                        Tipo de Fila da Roleta
                      </label>
                      <select
                        value={batchRouletteType}
                        onChange={e => setBatchRouletteType(e.target.value as any)}
                        className="w-full text-xs px-3 py-2 rounded-lg border border-neutral-300 bg-neutral-50/50 focus:bg-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="novos">Leads Novos (Entrada / ZIP)</option>
                        <option value="interessados">Leads Qualificados (Interessados)</option>
                        <option value="nao_interessados">Leads Reengajamento (Não Interessados)</option>
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleRunBatchRoulette}
                        disabled={runningBatchRoulette || totalEligibleCount === 0}
                        className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${runningBatchRoulette ? 'animate-spin' : ''}`} />
                        <span>{runningBatchRoulette ? 'Processando...' : 'Executar Roleta Agora'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Salespeople Roulette Sliders & Daily Caps */}
                <div className="space-y-3">
                  <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider block">
                    Configurações Individuais por Vendedor
                  </span>

                  <div className="space-y-3">
                    {salespeople.map((seller) => {
                      const conf = rouletteSettings[seller.id] || {
                        pctInteressados: seller.pctInteressados ?? 50,
                        pctNaoInteressados: seller.pctNaoInteressados ?? 50,
                        limiteLeadsDiario: seller.limiteLeadsDiario ?? 100,
                        ativoRoleta: seller.ativoRoleta ?? true
                      };

                      const leadsHoje = seller.leadsRecebidosHoje ?? 0;
                      const limite = conf.limiteLeadsDiario || 100;
                      const pctConsumido = Math.min(100, Math.round((leadsHoje / limite) * 100));

                      return (
                        <div
                          key={seller.id}
                          className="p-4 rounded-xl border border-neutral-200 bg-white hover:border-neutral-300 transition-all shadow-2xs space-y-3"
                        >
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-xs"
                                style={{ backgroundColor: seller.bgColor, color: seller.color }}
                              >
                                {seller.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-xs font-bold text-neutral-900">{seller.name}</h4>
                                  {seller.isDefault && (
                                    <span className="text-[9px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.2 rounded">
                                      Principal
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-neutral-500">{seller.email || seller.phone || 'Vendedor'}</p>
                              </div>
                            </div>

                            {/* Daily Cap Progress */}
                            <div className="flex items-center gap-3 min-w-[200px]">
                              <div className="flex-1">
                                <div className="flex justify-between text-[10px] text-neutral-500 mb-1">
                                  <span>Teto Diário: <strong>{leadsHoje} / {limite}</strong></span>
                                  <span className="font-bold font-mono">{pctConsumido}%</span>
                                </div>
                                <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      pctConsumido >= 100 ? 'bg-rose-500' : pctConsumido >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${pctConsumido}%` }}
                                  />
                                </div>
                              </div>

                              <label className="flex items-center gap-1.5 text-xs text-neutral-700 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={conf.ativoRoleta}
                                  onChange={e => {
                                    setRouletteSettings(prev => ({
                                      ...prev,
                                      [seller.id]: {
                                        ...conf,
                                        ativoRoleta: e.target.checked
                                      }
                                    }));
                                  }}
                                  className="w-4 h-4 text-emerald-600 rounded border-neutral-300 focus:ring-emerald-500"
                                />
                                <span className="font-semibold text-[11px]">Ativo</span>
                              </label>
                            </div>
                          </div>

                          {/* Sliders and limits */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-neutral-100">
                            <div>
                              <div className="flex justify-between text-[11px] font-medium text-neutral-600 mb-1">
                                <span>% Leads Interessados</span>
                                <strong className="font-mono text-emerald-700">{conf.pctInteressados}%</strong>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={conf.pctInteressados}
                                onChange={e => {
                                  const val = Number(e.target.value);
                                  setRouletteSettings(prev => ({
                                    ...prev,
                                    [seller.id]: {
                                      ...conf,
                                      pctInteressados: val
                                    }
                                  }));
                                }}
                                className="w-full accent-emerald-600 cursor-pointer"
                              />
                            </div>

                            <div>
                              <div className="flex justify-between text-[11px] font-medium text-neutral-600 mb-1">
                                <span>% Leads Novos / Frios</span>
                                <strong className="font-mono text-blue-700">{conf.pctNaoInteressados}%</strong>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={conf.pctNaoInteressados}
                                onChange={e => {
                                  const val = Number(e.target.value);
                                  setRouletteSettings(prev => ({
                                    ...prev,
                                    [seller.id]: {
                                      ...conf,
                                      pctNaoInteressados: val
                                    }
                                  }));
                                }}
                                className="w-full accent-blue-600 cursor-pointer"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                                Limite Máximo Diário (leads/dia)
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={1000}
                                value={conf.limiteLeadsDiario}
                                onChange={e => {
                                  const val = Math.max(1, Number(e.target.value));
                                  setRouletteSettings(prev => ({
                                    ...prev,
                                    [seller.id]: {
                                      ...conf,
                                      limiteLeadsDiario: val
                                    }
                                  }));
                                }}
                                className="w-full text-xs px-2.5 py-1 rounded-lg border border-neutral-300 bg-neutral-50/50 focus:bg-white focus:outline-none focus:border-emerald-500 font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between text-xs text-neutral-500">
          <span>Sistema Multi-Vendedor Ativo</span>
          <button
            onClick={onClose}
            className="px-3 py-1 text-neutral-600 hover:text-neutral-900 font-semibold"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Popup de Criação de Vendedores em Lote (JSON) */}
      <BulkCreateSalespeopleModal
        isOpen={isBatchJsonModalOpen}
        onClose={() => setIsBatchJsonModalOpen(false)}
        onSuccess={onRefreshSalespeople}
        onShowToast={onShowToast}
      />
    </div>
  );
};
