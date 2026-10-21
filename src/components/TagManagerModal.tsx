import React, { useState } from 'react';
import { CustomTag } from '../types';
import { X, Tag, Plus, Trash2, CheckCircle2 } from 'lucide-react';

interface TagManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tags: CustomTag[];
  onRefreshTags: () => Promise<void>;
  onShowToast: (msg: string) => void;
}

export const PRESET_COLORS = [
  { label: 'Verde (Atendeu/Sucesso)', color: '#15803d', bgColor: '#dcfce7' },
  { label: 'Vermelho (Não atendeu)', color: '#b91c1c', bgColor: '#fee2e2' },
  { label: 'Amarelo (Caixa postal)', color: '#b45309', bgColor: '#fef3c7' },
  { label: 'Laranja (Secretária/Impasse)', color: '#c2410c', bgColor: '#ffedd5' },
  { label: 'Azul (Proposta/Agendado)', color: '#1d4ed8', bgColor: '#dbeafe' },
  { label: 'Anil (WhatsApp)', color: '#4338ca', bgColor: '#e0e7ff' },
  { label: 'Roxo (Retorno solicitado)', color: '#7e22ce', bgColor: '#f3e8ff' },
  { label: 'Rosa (Interessado especial)', color: '#be185d', bgColor: '#fce7f3' },
  { label: 'Ciano (Horário específico)', color: '#0369a1', bgColor: '#e0f2fe' },
  { label: 'Cinza Escuro (Neutro)', color: '#374151', bgColor: '#f3f4f6' },
];

export const TagManagerModal: React.FC<TagManagerModalProps> = ({
  isOpen,
  onClose,
  tags,
  onRefreshTags,
  onShowToast
}) => {
  const [tagName, setTagName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(PRESET_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrim = tagName.trim();
    if (!nameTrim) {
      onShowToast('Digite o nome da etiqueta.');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameTrim,
          color: selectedPreset.color,
          bgColor: selectedPreset.bgColor
        })
      });

      if (res.ok) {
        onShowToast(`Etiqueta "${nameTrim}" criada com sucesso!`);
        setTagName('');
        await onRefreshTags();
      } else {
        const errData = await res.json().catch(() => ({}));
        onShowToast(errData.error || 'Erro ao criar etiqueta.');
      }
    } catch (err) {
      console.error(err);
      onShowToast('Erro de conexão ao criar etiqueta.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTag = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente excluir a etiqueta "${name}"?`)) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        onShowToast(`Etiqueta "${name}" removida.`);
        await onRefreshTags();
      } else {
        onShowToast('Erro ao remover etiqueta.');
      }
    } catch (err) {
      console.error(err);
      onShowToast('Erro de conexão ao remover etiqueta.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-xl border border-neutral-200 max-w-lg w-full p-6 relative my-8 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
              <Tag className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-900">Gerenciador de Tags Customizadas</h2>
              <p className="text-[11px] text-neutral-400">Crie e edite etiquetas personalizadas para suas ligações</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto space-y-5 pt-4 pr-1">
          {/* Form para Nova Tag */}
          <form onSubmit={handleCreateTag} className="bg-neutral-50 rounded-xl p-4 border border-neutral-200/80 space-y-3">
            <h3 className="text-xs font-semibold text-neutral-800 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-neutral-600" />
              Criar Nova Etiqueta
            </h3>

            <div>
              <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                Nome da Etiqueta *
              </label>
              <input
                type="text"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="Ex: Secretária barrou, WhatsApp enviado, Ligar após 14h..."
                className="w-full text-xs p-2 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />
            </div>

            {/* Presets de Cor */}
            <div>
              <label className="block text-[11px] font-medium text-neutral-600 mb-1.5">
                Escolha a Cor da Tag
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {PRESET_COLORS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedPreset(preset)}
                    style={{ backgroundColor: preset.bgColor, color: preset.color }}
                    className={`text-[10px] font-medium py-1 px-1.5 rounded-md border text-center truncate transition-all ${
                      selectedPreset.bgColor === preset.bgColor
                        ? 'ring-2 ring-neutral-900 font-bold border-transparent shadow-2xs scale-105'
                        : 'border-black/10 opacity-80 hover:opacity-100'
                    }`}
                    title={preset.label}
                  >
                    Exemplo
                  </button>
                ))}
              </div>
            </div>

            {/* Preview e Botão Salvar */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-neutral-400">Pré-visualização:</span>
                <span
                  style={{ backgroundColor: selectedPreset.bgColor, color: selectedPreset.color }}
                  className="px-2.5 py-0.5 rounded text-xs font-medium border border-black/10"
                >
                  {tagName.trim() || 'Sua Nova Tag'}
                </span>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {creating ? 'Criando...' : 'Salvar Tag'}
              </button>
            </div>
          </form>

          {/* Lista de Tags Existentes */}
          <div>
            <h3 className="text-xs font-semibold text-neutral-800 mb-2 flex items-center justify-between">
              <span>Etiquetas Cadastradas no Sistema ({tags.length})</span>
            </h3>

            {tags.length === 0 ? (
              <p className="text-xs text-neutral-400 italic text-center py-4 bg-neutral-50 rounded-lg border border-dashed border-neutral-200">
                Nenhuma etiqueta cadastrada ainda.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {tags.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-2.5 bg-white border border-neutral-200/80 rounded-lg hover:bg-neutral-50/50 transition-colors"
                  >
                    <span
                      style={{ backgroundColor: t.bgColor, color: t.color }}
                      className="px-2.5 py-1 rounded text-xs font-medium border border-black/5"
                    >
                      {t.name}
                    </span>

                    <button
                      onClick={() => handleDeleteTag(t.id, t.name)}
                      disabled={deletingId === t.id}
                      className="p-1 rounded text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                      title="Excluir etiqueta"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 mt-3 border-t border-neutral-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
