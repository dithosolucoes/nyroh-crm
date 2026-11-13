import React, { useState, useMemo } from 'react';
import { X, Code2, Sparkles, CheckCircle2, AlertCircle, RefreshCw, Copy, Check } from 'lucide-react';

interface BulkCreateSalespeopleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  onShowToast: (msg: string) => void;
}

const EXAMPLE_JSON = `[
  { "name": "Adriana" },
  { "name": "Tatiana Castro" },
  { "name": "Bruno Luiz" },
  { "name": "Claliver Geoching" },
  { "name": "Gabriel" },
  { "name": "Jeni Petrice" },
  { "name": "Luiz Paulo" },
  { "name": "Rubens Ramos" },
  { "name": "Yara Caroline" }
]`;

interface ParsedSeller {
  name: string;
  email?: string;
  phone?: string;
}

export const BulkCreateSalespeopleModal: React.FC<BulkCreateSalespeopleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onShowToast
}) => {
  const [jsonText, setJsonText] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedExample, setCopiedExample] = useState(false);

  // Real-time validation of JSON and detection of sellers
  const parseResult = useMemo(() => {
    const trimmed = jsonText.trim();
    if (!trimmed) {
      return { valid: false, items: [] as ParsedSeller[], error: null };
    }

    try {
      const parsed = JSON.parse(trimmed);
      let list: any[] = [];
      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (parsed && typeof parsed === 'object') {
        list = parsed.salespeople || parsed.vendedores || parsed.items || parsed.data || [];
      }

      if (!Array.isArray(list)) {
        return { valid: false, items: [] as ParsedSeller[], error: 'O JSON deve conter um array de vendedores.' };
      }

      const validSellers: ParsedSeller[] = [];
      for (const item of list) {
        if (typeof item === 'string' && item.trim()) {
          validSellers.push({ name: item.trim() });
        } else if (item && typeof item === 'object') {
          const sName = String(item.name || item.nome || item.fullName || '').trim();
          if (sName) {
            validSellers.push({
              name: sName,
              email: String(item.email || item.mail || '').trim(),
              phone: String(item.phone || item.telefone || item.whatsapp || item.celular || '').trim()
            });
          }
        }
      }

      return {
        valid: validSellers.length > 0,
        items: validSellers,
        error: validSellers.length === 0 ? 'Nenhum vendedor com campo "name" (ou "nome") encontrado.' : null
      };
    } catch (err: any) {
      return {
        valid: false,
        items: [] as ParsedSeller[],
        error: `Erro de sintaxe no JSON: ${err.message}`
      };
    }
  }, [jsonText]);

  if (!isOpen) return null;

  const handleFillExample = () => {
    setJsonText(EXAMPLE_JSON);
  };

  const handleCopyExample = () => {
    navigator.clipboard.writeText(EXAMPLE_JSON);
    setCopiedExample(true);
    setTimeout(() => setCopiedExample(false), 2000);
  };

  const handleSaveBatch = async () => {
    if (!parseResult.valid || parseResult.items.length === 0) {
      onShowToast(parseResult.error || 'Insira um JSON válido com pelo menos um vendedor.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/salespeople/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parseResult.items)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao cadastrar lote de vendedores.');
      }

      onShowToast(data.message || `${parseResult.items.length} vendedores cadastrados com sucesso!`);
      await onSuccess();
      setJsonText('');
      onClose();
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao cadastrar vendedores.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div 
        className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col my-auto transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-900 leading-tight">
                Criar Vários Vendedores em Lote (JSON)
              </h2>
              <p className="text-xs text-neutral-500">
                Cole uma lista em JSON para cadastrar toda a sua equipe de uma só vez
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3.5">
          {/* Action Bar */}
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            <span className="font-semibold text-neutral-700 flex items-center gap-1">
              <span>Estrutura JSON:</span>
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleFillExample}
                className="px-2.5 py-1 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium transition-colors flex items-center gap-1 text-[11px]"
              >
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Preencher Exemplo</span>
              </button>

              <button
                type="button"
                onClick={handleCopyExample}
                className="px-2.5 py-1 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium transition-colors flex items-center gap-1 text-[11px]"
                title="Copiar modelo JSON para área de transferência"
              >
                {copiedExample ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedExample ? 'Copiado!' : 'Copiar Modelo'}</span>
              </button>

              {jsonText && (
                <button
                  type="button"
                  onClick={() => setJsonText('')}
                  className="px-2 py-1 text-neutral-400 hover:text-rose-600 font-medium transition-colors text-[11px]"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Textarea */}
          <div className="relative">
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder={`Cole o JSON aqui, exemplo:\n[\n  { "name": "Mariana", "email": "mariana@empresa.com", "phone": "(31) 99999-9999" },\n  { "name": "Carlos", "email": "carlos@empresa.com" }\n]`}
              rows={9}
              className="w-full font-mono text-xs p-3 rounded-xl border border-neutral-300 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-neutral-900 text-neutral-100 resize-y leading-relaxed shadow-inner"
              spellCheck={false}
            />
          </div>

          {/* Feedback & Preview */}
          {jsonText.trim() && (
            <div>
              {parseResult.valid ? (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{parseResult.items.length} vendedor(es) detectado(s) prontos para cadastro:</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    {parseResult.items.slice(0, 10).map((s, idx) => (
                      <span 
                        key={idx} 
                        className="bg-white text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                      >
                        {s.name} {s.email ? `(${s.email})` : ''}
                      </span>
                    ))}
                    {parseResult.items.length > 10 && (
                      <span className="text-[11px] text-emerald-700 font-medium">
                        e mais {parseResult.items.length - 10}...
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="font-medium">{parseResult.error}</span>
                </div>
              )}
            </div>
          )}

          <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-blue-900 text-xs space-y-1">
            <p className="font-semibold flex items-center gap-1.5 text-blue-800">
              <span>🔐</span>
              <span>Geração Automática de Acessos & Logins:</span>
            </p>
            <p className="text-[11px] text-blue-700 leading-relaxed">
              Para cada vendedor cadastrado, o sistema cria automaticamente o login com o primeiro nome: 
              <strong className="font-mono text-blue-900"> primeironome@nyroh.com</strong> e senha inicial padrão 
              <strong className="font-mono text-blue-900"> primeironome123</strong>. O vendedor poderá alterar a senha a qualquer momento!
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-neutral-50 border-t border-neutral-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl border border-neutral-300 hover:bg-neutral-100 text-neutral-700 font-semibold text-xs transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSaveBatch}
            disabled={loading || !parseResult.valid}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Cadastrando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Salvar {parseResult.valid ? `${parseResult.items.length} Vendedores` : 'Vendedores'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
