import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Check, RotateCcw, Sparkles, Send, Info, Briefcase, Smartphone, HelpCircle } from 'lucide-react';
import { DEFAULT_WHATSAPP_TEMPLATE, getStoredWhatsAppTemplate, formatWhatsAppMessage, WhatsAppAppType, getStoredWhatsAppAppType, setStoredWhatsAppAppType } from '../lib/phone';
import { Salesperson } from '../types';

interface WhatsAppSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string) => void;
  currentSalesperson?: Salesperson | null;
  onRefreshSalespeople?: () => Promise<void> | void;
}

export const WhatsAppSettingsModal: React.FC<WhatsAppSettingsModalProps> = ({
  isOpen,
  onClose,
  onShowToast,
  currentSalesperson,
  onRefreshSalespeople
}) => {
  const [template, setTemplate] = useState<string>(getStoredWhatsAppTemplate());
  const [selectedAppType, setSelectedAppType] = useState<WhatsAppAppType>(
    currentSalesperson?.whatsappType || getStoredWhatsAppAppType()
  );
  const [saving, setSaving] = useState(false);
  const [approvedMetaTemplates, setApprovedMetaTemplates] = useState<any[]>([]);
  const [loadingMetaTemplates, setLoadingMetaTemplates] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTemplate(getStoredWhatsAppTemplate());
      setSelectedAppType(currentSalesperson?.whatsappType || getStoredWhatsAppAppType());

      // Puxar modelos oficiais aprovados na Meta
      setLoadingMetaTemplates(true);
      fetch('/api/whatsapp/approved-templates')
        .then(r => r.json())
        .then(d => {
          if (d.success && Array.isArray(d.templates)) {
            setApprovedMetaTemplates(d.templates);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingMetaTemplates(false));
    }
  }, [isOpen, currentSalesperson]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Salvar template no localStorage
      localStorage.setItem('crm_whatsapp_template', template.trim() || DEFAULT_WHATSAPP_TEMPLATE);

      // 2. Salvar preferência de app localmente
      setStoredWhatsAppAppType(selectedAppType);

      // 3. Persistir no PostgreSQL para o vendedor atual se logado / selecionado
      if (currentSalesperson?.id) {
        const res = await fetch(`/api/salespeople/${currentSalesperson.id}/whatsapp-type`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ whatsappType: selectedAppType })
        });

        if (res.ok && onRefreshSalespeople) {
          await onRefreshSalespeople();
        }
      }

      const typeLabel =
        selectedAppType === 'business'
          ? 'WhatsApp Business'
          : selectedAppType === 'normal'
          ? 'WhatsApp Normal'
          : 'Perguntar no Celular';

      onShowToast(`Configurações salvas! App padrão: ${typeLabel}`);
      onClose();
    } catch (err) {
      console.error('Erro ao salvar preferências de WhatsApp:', err);
      onShowToast('Configuração salva localmente.');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setTemplate(DEFAULT_WHATSAPP_TEMPLATE);
    localStorage.setItem('crm_whatsapp_template', DEFAULT_WHATSAPP_TEMPLATE);
    onShowToast('Modelo restaurado para o padrão.');
  };

  const insertVariable = (tag: string) => {
    setTemplate(prev => prev + ' ' + tag);
  };

  const previewText = formatWhatsAppMessage(template, {
    name: 'João Silva',
    site: 'https://seusiteexemplo.com.br',
    salesperson: currentSalesperson?.name || 'Thomas'
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-neutral-200 max-w-lg w-full p-6 relative max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 p-1 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-1">
          <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-neutral-900">
              Configurações de WhatsApp
            </h3>
            <p className="text-xs text-neutral-500">
              {currentSalesperson
                ? `Preferências de envio de ${currentSalesperson.name} (Salvo no banco de dados)`
                : 'Defina o aplicativo padrão e a mensagem rápida'}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          {/* 1. Escolha do Aplicativo WhatsApp (Normal vs Business) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                Qual aplicativo abrir ao clicar em WhatsApp?
              </label>
              {currentSalesperson && (
                <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-semibold border border-blue-200">
                  {currentSalesperson.name}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* WhatsApp Business */}
              <button
                type="button"
                onClick={() => setSelectedAppType('business')}
                className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  selectedAppType === 'business'
                    ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500 shadow-xs'
                    : 'border-neutral-200 bg-white hover:border-neutral-300'
                }`}
              >
                <div className="flex items-start justify-between gap-1 mb-1.5">
                  <div className="p-1.5 rounded-lg bg-emerald-600 text-white shadow-2xs">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  {selectedAppType === 'business' && (
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">
                      ✓
                    </span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-neutral-900">WPP Business</span>
                  </div>
                  <p className="text-[10px] text-neutral-500 leading-tight mt-0.5">
                    Abre direto no WhatsApp Business
                  </p>
                </div>
                <span className="mt-2 text-[9px] font-bold text-emerald-800 bg-emerald-100/90 px-1.5 py-0.5 rounded inline-block w-max">
                  Recomendado
                </span>
              </button>

              {/* WhatsApp Normal */}
              <button
                type="button"
                onClick={() => setSelectedAppType('normal')}
                className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  selectedAppType === 'normal'
                    ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500 shadow-xs'
                    : 'border-neutral-200 bg-white hover:border-neutral-300'
                }`}
              >
                <div className="flex items-start justify-between gap-1 mb-1.5">
                  <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  {selectedAppType === 'normal' && (
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">
                      ✓
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-xs font-bold text-neutral-900">WPP Normal</span>
                  <p className="text-[10px] text-neutral-500 leading-tight mt-0.5">
                    Abre direto no WhatsApp pessoal/padrão
                  </p>
                </div>
                <span className="mt-2 text-[9px] font-medium text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded inline-block w-max">
                  Pessoal
                </span>
              </button>

              {/* Perguntar sempre */}
              <button
                type="button"
                onClick={() => setSelectedAppType('ask')}
                className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  selectedAppType === 'ask'
                    ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500 shadow-xs'
                    : 'border-neutral-200 bg-white hover:border-neutral-300'
                }`}
              >
                <div className="flex items-start justify-between gap-1 mb-1.5">
                  <div className="p-1.5 rounded-lg bg-neutral-100 text-neutral-700">
                    <HelpCircle className="w-4 h-4" />
                  </div>
                  {selectedAppType === 'ask' && (
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">
                      ✓
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-xs font-bold text-neutral-900">Perguntar</span>
                  <p className="text-[10px] text-neutral-500 leading-tight mt-0.5">
                    Exibe a janela de escolha no celular
                  </p>
                </div>
                <span className="mt-2 text-[9px] font-medium text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded inline-block w-max">
                  Seletor Nativo
                </span>
              </button>
            </div>
          </div>

          {/* Template Input */}
          <div className="pt-2 border-t border-neutral-100 space-y-2">
            {/* Seletor Rápido de Templates Aprovados na Meta */}
            {approvedMetaTemplates.length > 0 && (
              <div className="p-2.5 bg-blue-50/60 rounded-xl border border-blue-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-blue-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    Templates Oficiais Aprovados na Meta:
                  </span>
                  <span className="text-[9px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full">
                    {approvedMetaTemplates.length} ativos
                  </span>
                </div>
                <p className="text-[10px] text-blue-700/80 leading-tight">
                  Clique para preencher o texto da mensagem com o modelo aprovado pelo WhatsApp:
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                  {approvedMetaTemplates.map(t => (
                    <button
                      key={t.id || t.name}
                      type="button"
                      onClick={() => {
                        let filled = t.bodyText || '';
                        filled = filled.replace(/\{\{1\}\}/g, '{nome}').replace(/\{\{2\}\}/g, '{site}').replace(/\{\{3\}\}/g, '{vendedor}');
                        setTemplate(filled);
                        onShowToast(`Modelo "${t.name}" aplicado!`);
                      }}
                      className="text-[11px] font-medium px-2.5 py-1 bg-white hover:bg-blue-100/70 border border-blue-200 rounded-lg text-blue-900 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title={t.bodyText}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span className="font-mono text-[10px] font-bold">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-neutral-700">
                Texto do Modelo de Mensagem:
              </label>
              <button
                type="button"
                onClick={handleReset}
                className="text-[11px] text-neutral-500 hover:text-neutral-800 flex items-center gap-1 hover:underline font-medium"
              >
                <RotateCcw className="w-3 h-3" />
                Restaurar Padrão
              </button>
            </div>

            <textarea
              rows={3}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Aqui, o site que te falei: {site}"
              className="w-full text-xs font-mono p-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent leading-relaxed"
            />

            {/* Quick insert variables */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-[10px] text-neutral-400 font-semibold uppercase">Variáveis dinâmicas:</span>
              <button
                type="button"
                onClick={() => insertVariable('{site}')}
                className="px-2 py-0.5 text-[11px] font-mono bg-blue-50 text-blue-700 hover:bg-blue-100 rounded border border-blue-200 font-semibold transition-colors"
                title="Insere o link do site do lead"
              >
                + &#123;site&#125;
              </button>
              <button
                type="button"
                onClick={() => insertVariable('{nome}')}
                className="px-2 py-0.5 text-[11px] font-mono bg-purple-50 text-purple-700 hover:bg-purple-100 rounded border border-purple-200 font-semibold transition-colors"
                title="Insere o nome da empresa ou lead"
              >
                + &#123;nome&#125;
              </button>
              <button
                type="button"
                onClick={() => insertVariable('{vendedor}')}
                className="px-2 py-0.5 text-[11px] font-mono bg-amber-50 text-amber-800 hover:bg-amber-100 rounded border border-amber-200 font-semibold transition-colors"
                title="Insere o nome do vendedor responsável"
              >
                + &#123;vendedor&#125;
              </button>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-neutral-600">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                Pré-visualização da Mensagem no WhatsApp:
              </span>
            </div>

            <div className="bg-emerald-50/80 p-3 rounded-lg border border-emerald-200 text-xs text-neutral-800 font-sans leading-relaxed relative">
              <div className="flex items-start gap-2">
                <Send className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="whitespace-pre-wrap">{previewText || <span className="text-neutral-400 italic">Mensagem vazia</span>}</p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 text-[11px] text-neutral-500 bg-neutral-100/70 p-2.5 rounded-lg border border-neutral-200">
            <Info className="w-3.5 h-3.5 text-neutral-500 shrink-0 mt-0.5" />
            <span>
              Ao selecionar <strong>WhatsApp Business</strong> ou <strong>WhatsApp Normal</strong>, o sistema aciona diretamente o aplicativo escolhido no celular via comando nativo, evitando que fique preso no aplicativo padrão do navegador.
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-md transition-colors shadow-2xs"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{saving ? 'Gravando no banco...' : 'Salvar Preferências'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
