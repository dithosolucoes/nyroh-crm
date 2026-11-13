import React, { useCallback, useEffect, useRef, useState } from 'react';

type Entrada = { id: number; at: string; level: 'info' | 'warn' | 'error'; category: string; message: string };

const NIVEIS = [
  { v: 'todos', l: 'Todos' },
  { v: 'error', l: 'Erros' },
  { v: 'warn', l: 'Avisos' },
  { v: 'info', l: 'Info' }
];

const COR_NIVEL: Record<Entrada['level'], string> = {
  error: 'text-red-600',
  warn: 'text-amber-600',
  info: 'text-neutral-600'
};

/**
 * Painel de Logs do sistema: o que o servidor escreveu nos últimos minutos,
 * com filtro por nível, categoria e texto. Atualiza sozinho a cada 3 segundos.
 */
export const AdminLogsView: React.FC = () => {
  const [logs, setLogs] = useState<Entrada[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [nivel, setNivel] = useState('todos');
  const [categoria, setCategoria] = useState('');
  const [busca, setBusca] = useState('');
  const [aoVivo, setAoVivo] = useState(true);
  const [erro, setErro] = useState('');
  const ultimoId = useRef(0);

  const carregar = useCallback(async (completo: boolean) => {
    try {
      const params = new URLSearchParams({ level: nivel, category: categoria, q: busca, limit: '500' });
      const res = await fetch(`/api/admin/logs?${params.toString()}`);
      if (!res.ok) {
        setErro(res.status === 403 ? 'Acesso restrito ao Administrador.' : `Erro ${res.status} ao buscar os logs.`);
        return;
      }
      const data = await res.json();
      setErro('');
      setCategorias(Array.isArray(data.categories) ? data.categories : []);
      const lista: Entrada[] = Array.isArray(data.logs) ? data.logs : [];
      setLogs(lista);
      if (lista.length) ultimoId.current = lista[lista.length - 1].id;
      void completo;
    } catch {
      setErro('Falha de conexão ao buscar os logs.');
    }
  }, [nivel, categoria, busca]);

  useEffect(() => { carregar(true); }, [carregar]);

  useEffect(() => {
    if (!aoVivo) return;
    const t = setInterval(() => carregar(false), 3000);
    return () => clearInterval(t);
  }, [aoVivo, carregar]);

  const copiar = async () => {
    const texto = logs.map(l => `${l.at} [${l.level}] ${l.message}`).join('\n');
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      /* navegador sem permissão de área de transferência: ignora */
    }
  };

  const baixar = () => {
    const texto = logs.map(l => `${l.at} [${l.level}] [${l.category}] ${l.message}`).join('\n');
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-nyroh-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 bg-white p-4 rounded-2xl border border-neutral-200">
        <div className="flex flex-wrap gap-2">
          {NIVEIS.map(n => (
            <button
              key={n.v}
              onClick={() => setNivel(n.v)}
              className={`px-3 py-2 min-h-[44px] rounded-lg text-xs font-bold border ${nivel === n.v ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-300'}`}
            >
              {n.l}
            </button>
          ))}
          <select
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            className="px-3 py-2 min-h-[44px] rounded-lg text-xs border border-neutral-300 bg-white"
          >
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar no texto dos logs (ex.: audio, template, erro)"
          className="w-full px-3 py-2 min-h-[44px] rounded-lg text-sm border border-neutral-300"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setAoVivo(v => !v)} className="px-3 py-2 min-h-[44px] rounded-lg text-xs font-bold border border-neutral-300 bg-white">
            {aoVivo ? '⏸ Pausar atualização' : '▶ Ao vivo'}
          </button>
          <button onClick={() => carregar(true)} className="px-3 py-2 min-h-[44px] rounded-lg text-xs font-bold border border-neutral-300 bg-white">
            Atualizar agora
          </button>
          <button onClick={copiar} className="px-3 py-2 min-h-[44px] rounded-lg text-xs font-bold border border-neutral-300 bg-white">
            Copiar
          </button>
          <button onClick={baixar} className="px-3 py-2 min-h-[44px] rounded-lg text-xs font-bold border border-neutral-300 bg-white">
            Baixar .txt
          </button>
          <span className="text-[11px] text-neutral-500 ml-auto">{logs.length} linhas · máx. 3000 guardadas na memória</span>
        </div>
        {erro && <p className="text-xs text-red-600 font-bold">{erro}</p>}
      </div>

      <div className="bg-neutral-950 rounded-2xl p-3 max-h-[70vh] overflow-auto font-mono text-[11px] leading-relaxed">
        {logs.length === 0 ? (
          <p className="text-neutral-400 p-4">Nenhum log com esse filtro ainda.</p>
        ) : (
          logs.map(l => (
            <div key={l.id} className={`whitespace-pre-wrap break-all py-0.5 ${COR_NIVEL[l.level]}`}>
              <span className="text-neutral-500">{new Date(l.at).toLocaleTimeString('pt-BR')}</span>{' '}
              <span className="text-neutral-400">[{l.category}]</span>{' '}
              {l.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
