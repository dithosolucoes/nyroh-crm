import MetaStatusStrip from './MetaStatusStrip';
import { Zap, Radio, FileText, Sparkles } from 'lucide-react';
import { AdminWhatsAppFluxoViewProps, SHOW_LAB } from '../features/whatsappFluxo/base';
import { useFluxo } from '../features/whatsappFluxo/useFluxo';
import { InstanciasTab } from '../features/whatsappFluxo/abas/InstanciasTab';
import { ModelosTab } from '../features/whatsappFluxo/abas/ModelosTab';
import { SandboxTab } from '../features/whatsappFluxo/abas/SandboxTab';
import { WebhooksTab } from '../features/whatsappFluxo/abas/WebhooksTab';

export const AdminWhatsAppFluxoView: React.FC<AdminWhatsAppFluxoViewProps> = (props) => {
  const f = useFluxo(props);
  const { activeSubTab, setActiveSubTab, instances, templates, fetchBmAccounts, webhookEvents, fetchInstances, fetchTemplates, onShowToast } = f;
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <MetaStatusStrip
        onShowToast={onShowToast}
        onChanged={() => { fetchInstances(); fetchTemplates(); fetchBmAccounts(); }}
      />

      {/* Sub-Aba Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('instances')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'instances'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>📡 Contas & Números</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-800 text-white font-mono">
            {instances.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('templates')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'templates'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>🎨 Modelos</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-neutral-200 text-neutral-800 font-mono">
            {templates.length}
          </span>
        </button>

        {SHOW_LAB && (
        <button
          onClick={() => setActiveSubTab('sandbox')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'sandbox'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>🧪 Laboratório de Testes & Chat Teste</span>
        </button>
        )}

        <button
          onClick={() => setActiveSubTab('webhooks')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'webhooks'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>⚡ Diagnóstico (webhooks & logs)</span>
          {webhookEvents.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-neutral-950 font-mono font-bold">
              {webhookEvents.length}
            </span>
          )}
        </button>
      </div>

      {activeSubTab === 'instances' && <InstanciasTab f={f} />}
      {activeSubTab === 'templates' && <ModelosTab f={f} />}
      {activeSubTab === 'sandbox' && <SandboxTab f={f} />}
      {activeSubTab === 'webhooks' && <WebhooksTab f={f} />}
    </div>
  );
};
