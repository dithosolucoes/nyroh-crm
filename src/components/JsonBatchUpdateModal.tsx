import React, { useState } from 'react';
import { X, FileCode, CheckCircle2, RefreshCw, Sparkles, ArrowRight } from 'lucide-react';

interface JsonBatchUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdateComplete: () => void;
  onShowToast: (msg: string) => void;
}

export const JsonBatchUpdateModal: React.FC<JsonBatchUpdateModalProps> = ({
  isOpen,
  onClose,
  onUpdateComplete,
  onShowToast
}) => {
  const [jsonInput, setJsonInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultData, setResultData] = useState<{
    totalProcessed: number;
    updatedCount: number;
    notFoundCount: number;
    updatedLeads: { id: string; name: string; oldStatus: string; newStatus: string }[];
    notFoundIdentifiers: string[];
  } | null>(null);

  if (!isOpen) return null;

  const handleProcessJson = async () => {
    if (!jsonInput.trim()) {
      onShowToast('Por favor, cole um conteúdo JSON antes de continuar.');
      return;
    }

    setLoading(true);
    setResultData(null);

    try {
      const res = await fetch('/api/leads/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonPayload: jsonInput,
          defaultStatus: 'Recusado',
          addCallLog: true
        })
      });

      const data = await res.json();

      if (res.ok) {
        setResultData(data);
        if (data.updatedCount > 0) {
          onShowToast(`${data.updatedCount} lead(s) atualizado(s) com sucesso!`);
          onUpdateComplete();
        } else {
          onShowToast('Nenhum lead correspondente foi encontrado no sistema.');
        }
      } else {
        onShowToast(data.error || 'Erro ao processar JSON.');
      }
    } catch (err: any) {
      console.error(err);
      onShowToast(`Erro ao conectar com o servidor: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 leading-tight">
                Atualização de Leads via JSON
              </h3>
              <p className="text-[11px] text-neutral-500">
                Cole o JSON gerado no chat para atualizar os leads no sistema.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Textarea para colar o JSON */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-neutral-800">
                Cole seu JSON aqui:
              </label>
              {jsonInput && (
                <button
                  onClick={() => setJsonInput('')}
                  className="text-[11px] text-rose-600 hover:underline font-medium"
                >
                  Limpar
                </button>
              )}
            </div>
            <textarea
              rows={10}
              value={jsonInput}
              onChange={(e) => {
                setJsonInput(e.target.value);
                setResultData(null);
              }}
              placeholder="Cole aqui o JSON gerado no chat..."
              className="w-full font-mono text-xs p-3.5 bg-neutral-900 text-emerald-400 border border-neutral-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-y"
            />
          </div>

          {/* Painel de Resultados */}
          {resultData && (
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Resultado do Processamento:</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                    {resultData.updatedCount} atualizado(s)
                  </span>
                  {resultData.notFoundCount > 0 && (
                    <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">
                      {resultData.notFoundCount} não encontrado(s)
                    </span>
                  )}
                </div>
              </div>

              {/* Lista de Atualizados */}
              {resultData.updatedLeads.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-neutral-600 block">
                    Leads Modificados:
                  </span>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {resultData.updatedLeads.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-neutral-200"
                      >
                        <span className="font-semibold text-neutral-800 truncate max-w-[200px]">
                          {item.name}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded">
                            {item.oldStatus}
                          </span>
                          <ArrowRight className="w-3 h-3 text-neutral-400" />
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 font-bold rounded">
                            {item.newStatus}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lista de Não Encontrados */}
              {resultData.notFoundIdentifiers.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="text-[11px] font-bold text-amber-800 block">
                    Nomes Não Encontrados no CRM:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {resultData.notFoundIdentifiers.map((name, i) => (
                      <span
                        key={i}
                        className="text-[10px] bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded font-mono"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-neutral-200 bg-neutral-50/80 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleProcessJson}
            disabled={loading || !jsonInput.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-2xs transition-all disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>Aplicar Atualizações</span>
          </button>
        </div>
      </div>
    </div>
  );
};
