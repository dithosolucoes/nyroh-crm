import React, { useState, useEffect } from 'react';
import { QuickReply, Salesperson } from '../types';
import { X, Zap, Plus, Trash2, Edit3, Check, Sparkles, MessageSquare, Mic, FileText, Image as ImageIcon, Copy } from 'lucide-react';

interface QuickRepliesModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSalesperson?: Salesperson;
  onShowToast: (msg: string) => void;
  onSelectReply?: (content: string) => void;
}

export const QuickRepliesModal: React.FC<QuickRepliesModalProps> = ({
  isOpen,
  onClose,
  activeSalesperson,
  onShowToast,
  onSelectReply
}) => {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [shortcut, setShortcut] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<'text' | 'audio' | 'image' | 'document'>('text');
  const [mediaUrl, setMediaUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchReplies = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/quick-replies');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.quickReplies) ? data.quickReplies : (Array.isArray(data) ? data : []);
        setReplies(list);
      }
    } catch (err) {
      console.error('Erro ao buscar respostas rápidas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchReplies();
      setIsCreating(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shortcut.trim() || !title.trim() || !content.trim()) {
      onShowToast('Preencha atalho, título e conteúdo.');
      return;
    }

    const cleanShortcut = shortcut.startsWith('/') ? shortcut.trim() : `/${shortcut.trim()}`;

    setSaving(true);
    try {
      const res = await fetch('/api/quick-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shortcut: cleanShortcut,
          title: title.trim(),
          content: content.trim(),
          type,
          mediaUrl: mediaUrl.trim() || undefined,
          salespersonId: activeSalesperson?.id || null
        })
      });

      if (res.ok) {
        onShowToast(`Atalho ${cleanShortcut} cadastrado com sucesso!`);
        setShortcut('');
        setTitle('');
        setContent('');
        setMediaUrl('');
        setIsCreating(false);
        fetchReplies();
      } else {
        const err = await res.json();
        onShowToast(err.error || 'Erro ao salvar resposta rápida.');
      }
    } catch (err: any) {
      onShowToast('Falha na comunicação com o servidor.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, sc: string) => {
    if (!confirm(`Deseja excluir o atalho ${sc}?`)) return;

    try {
      const res = await fetch(`/api/quick-replies/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onShowToast(`Atalho ${sc} removido.`);
        setReplies(prev => prev.filter(r => r.id !== id));
      }
    } catch (err) {
      onShowToast('Erro ao excluir resposta rápida.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-neutral-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900">Respostas Rápidas & Atalhos</h2>
              <p className="text-xs text-neutral-500">
                Digite <strong className="font-mono text-emerald-700 bg-emerald-50 px-1 rounded">/atalho</strong> no chat para disparar mensagens instantâneas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action toolbar */}
        <div className="px-6 py-3 border-b border-neutral-100 flex items-center justify-between bg-white">
          <span className="text-xs font-medium text-neutral-500">
            Total: <strong>{replies.length}</strong> atalhos configurados
          </span>
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isCreating ? 'Cancelar' : 'Novo Atalho'}</span>
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Create Form */}
          {isCreating && (
            <form onSubmit={handleCreate} className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3 animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  Cadastrar Novo Atalho
                </span>
                <span className="text-[10px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-medium">
                  Variáveis: {'{nome}'}, {'{vendedor}'}, {'{site}'}, {'{empresa}'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Atalho (ex: /preco, /site)
                  </label>
                  <input
                    type="text"
                    required
                    value={shortcut}
                    onChange={e => setShortcut(e.target.value)}
                    placeholder="/atalho"
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Título descritivo
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Ex: Apresentação de Proposta"
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Texto ou Mensagem do Atalho
                </label>
                <textarea
                  required
                  rows={3}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Olá {nome}! Tomamos a iniciativa de desenvolver uma prévia do seu novo site..."
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-600 hover:bg-neutral-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{saving ? 'Salvando...' : 'Salvar Atalho'}</span>
                </button>
              </div>
            </form>
          )}

          {/* List of existing replies */}
          {loading ? (
            <div className="py-8 text-center text-xs text-neutral-400">Carregando atalhos...</div>
          ) : replies.length === 0 ? (
            <div className="py-12 text-center text-neutral-400">
              <Zap className="w-10 h-10 mx-auto mb-2 opacity-30 text-emerald-600" />
              <p className="text-xs font-medium text-neutral-600">Nenhum atalho cadastrado ainda.</p>
              <p className="text-[11px] text-neutral-400 mt-0.5">Clique em "Novo Atalho" para adicionar seu primeiro bloco de resposta rápida.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {replies.map(r => (
                <div
                  key={r.id}
                  className="p-3.5 rounded-xl border border-neutral-200 hover:border-neutral-300 bg-white hover:bg-neutral-50/50 transition-all flex items-start justify-between gap-3 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {r.shortcut}
                      </span>
                      <span className="text-xs font-bold text-neutral-800 truncate">
                        {r.title}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-600 line-clamp-2 leading-relaxed whitespace-pre-wrap">
                      {r.content}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {onSelectReply && (
                      <button
                        onClick={() => {
                          onSelectReply(r.content);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer"
                        title="Usar na mensagem"
                      >
                        Usar
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(r.id, r.shortcut)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Excluir atalho"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200 bg-neutral-50/60 flex items-center justify-between text-xs text-neutral-500">
          <span>Dica: No chat, digite <strong>/</strong> seguido de qualquer letra para filtrar os atalhos.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-xs font-bold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
