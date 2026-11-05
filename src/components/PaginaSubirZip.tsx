import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Upload, CheckCircle2, AlertTriangle, RefreshCw, FolderOpen } from 'lucide-react';
import type { ImportProgressData } from './ZipImportProgressModal';

export interface ZipUploadRegistro {
  id: string;
  batchId: string | null;
  batchName: string | null;
  fileName: string;
  fileSizeBytes: number;
  leadsInZip: number;
  leadsSaved: number;
  skippedContacted: number;
  skippedRepeated: number;
  validMobiles: number;
  landlines: number;
  createdAt: string;
}

interface Props {
  onVoltar: () => void;
  onEscolherArquivo: (file: File) => void;
  progresso: ImportProgressData | null;
  enviando: boolean;
  historico: ZipUploadRegistro[];
  carregandoHistorico: boolean;
  onAtualizarHistorico: () => void;
  onAbrirSafra: (batchId: string) => void;
}

const numero = (n: number | undefined | null) => (Number(n) || 0).toLocaleString('pt-BR');

const tamanho = (bytes: number) => {
  if (!bytes) return '—';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const dataHora = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const PaginaSubirZip: React.FC<Props> = ({
  onVoltar,
  onEscolherArquivo,
  progresso,
  enviando,
  historico,
  carregandoHistorico,
  onAtualizarHistorico,
  onAbrirSafra,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const terminou = progresso?.stage === 'completed';
  const erro = progresso?.stage === 'error';

  return (
    <div className="w-full min-h-full bg-neutral-50 p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onVoltar}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar para safras
          </button>
          <h2 className="text-lg font-bold text-neutral-900">Subir ZIP de leads</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Cada arquivo vira uma safra. Abaixo fica o histórico de tudo que já foi subido.
          </p>
        </div>
      </div>

      {/* Área de envio */}
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onEscolherArquivo(f);
        }}
        className={`rounded-2xl border-2 border-dashed p-6 md:p-8 bg-white text-center transition ${
          arrastando ? 'border-blue-500 bg-blue-50' : 'border-neutral-300'
        } ${enviando ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <Upload className="w-7 h-7 mx-auto text-blue-600" />
        <p className="mt-2 text-sm font-semibold text-neutral-900">Solte o arquivo .ZIP aqui</p>
        <p className="text-xs text-neutral-500">ou escolha no seu computador. Telefones inválidos e repetidos são separados automaticamente.</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
        >
          <FolderOpen className="w-3.5 h-3.5" /> Escolher arquivo
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,.json,application/zip,application/json,application/x-zip-compressed"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onEscolherArquivo(f);
            e.target.value = '';
          }}
        />
      </div>

      {/* Andamento / resultado do envio atual */}
      {progresso && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-neutral-500">Arquivo</p>
              <p className="text-sm font-bold text-neutral-900">{progresso.fileName || '—'}</p>
            </div>
            {terminou && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5" /> Concluído
              </span>
            )}
            {erro && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
                <AlertTriangle className="w-3.5 h-3.5" /> Erro
              </span>
            )}
          </div>

          {!terminou && !erro && (
            <>
              <p className="mt-3 text-xs text-neutral-600">{progresso.statusText}</p>
              <div className="mt-2 h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, progresso.percent || 0)}%` }} />
              </div>
            </>
          )}

          {erro && <p className="mt-3 text-sm text-red-700">{progresso.error || 'Não foi possível importar este arquivo.'}</p>}

          {terminou && (
            <>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <Resumo titulo="Leads no ZIP" valor={numero(progresso.totalLeadsFound)} />
                <Resumo titulo="Gravados na safra" valor={numero(progresso.savedLeads)} destaque />
                <Resumo titulo="Celulares" valor={numero(progresso.validMobiles)} />
                <Resumo titulo="Fixos / comerciais" valor={numero(progresso.landlines)} />
              </div>
              {progresso.batchId && (
                <button
                  type="button"
                  onClick={() => onAbrirSafra(progresso.batchId as string)}
                  className="mt-4 rounded-lg border border-neutral-300 px-4 py-2 text-xs font-bold text-neutral-800 hover:bg-neutral-50"
                >
                  Abrir esta safra
                </button>
              )}
            </>
          )}
        </div>
      )}

      <TabelaHistoricoZips
        historico={historico}
        carregando={carregandoHistorico}
        onAtualizar={onAtualizarHistorico}
        onAbrirSafra={onAbrirSafra}
      />
    </div>
  );
};


interface TabelaProps {
  historico: ZipUploadRegistro[];
  carregando: boolean;
  onAtualizar: () => void;
  onAbrirSafra?: (batchId: string) => void;
}

export const TabelaHistoricoZips: React.FC<TabelaProps> = ({ historico, carregando, onAtualizar, onAbrirSafra }) => (
  <div className="rounded-2xl border border-neutral-200 bg-white">
    <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100">
      <div>
        <h3 className="text-sm font-bold text-neutral-900">Histórico de ZIPs subidos</h3>
        <p className="text-[11px] text-neutral-500">Do mais recente para o mais antigo.</p>
      </div>
      <button
        type="button"
        onClick={onAtualizar}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
      </button>
    </div>
    {historico.length === 0 ? (
      <div className="px-5 py-10 text-center text-xs text-neutral-500">
        {carregando ? 'Carregando histórico...' : 'Nenhum ZIP subido ainda. Os próximos aparecem aqui.'}
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr className="text-left">
              <th className="px-4 py-2 font-semibold">Data</th>
              <th className="px-4 py-2 font-semibold">Nome do ZIP</th>
              <th className="px-4 py-2 font-semibold">Safra</th>
              <th className="px-4 py-2 font-semibold text-right">Leads no ZIP</th>
              <th className="px-4 py-2 font-semibold text-right">Gravados</th>
              <th className="px-4 py-2 font-semibold text-right">Já disparados</th>
              <th className="px-4 py-2 font-semibold text-right">Repetidos</th>
              <th className="px-4 py-2 font-semibold text-right">Celulares</th>
              <th className="px-4 py-2 font-semibold text-right">Fixos</th>
              <th className="px-4 py-2 font-semibold text-right">Tamanho</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {historico.map((h) => (
              <tr key={h.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2.5 whitespace-nowrap text-neutral-700">{dataHora(h.createdAt)}</td>
                <td className="px-4 py-2.5 font-semibold text-neutral-900 max-w-[260px] truncate" title={h.fileName}>{h.fileName}</td>
                <td className="px-4 py-2.5 text-neutral-600 max-w-[200px] truncate" title={h.batchName || ''}>{h.batchName || '—'}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-neutral-900">{numero(h.leadsInZip)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-emerald-700">{numero(h.leadsSaved)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-neutral-600">{numero(h.skippedContacted)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-neutral-600">{numero(h.skippedRepeated)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-neutral-700">{numero(h.validMobiles)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-neutral-700">{numero(h.landlines)}</td>
                <td className="px-4 py-2.5 text-right text-neutral-500">{tamanho(h.fileSizeBytes)}</td>
                <td className="px-4 py-2.5 text-right">
                  {h.batchId && onAbrirSafra && (
                    <button type="button" onClick={() => onAbrirSafra(h.batchId as string)} className="text-xs font-semibold text-blue-700 hover:underline">
                      Abrir safra
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

// Versão autônoma: busca o histórico sozinha (usada dentro de outras telas)
export const HistoricoZipsAutoCarregado: React.FC<{ chave?: string; onAbrirSafra?: (batchId: string) => void }> = ({ chave, onAbrirSafra }) => {
  const [historico, setHistorico] = useState<ZipUploadRegistro[]>([]);
  const [carregando, setCarregando] = useState<boolean>(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      const r = await fetch('/api/campaign/uploads');
      const d = await r.json();
      setHistorico(Array.isArray(d.uploads) ? d.uploads : []);
    } catch {
      setHistorico([]);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [chave]);

  return <TabelaHistoricoZips historico={historico} carregando={carregando} onAtualizar={carregar} onAbrirSafra={onAbrirSafra} />;
};

const Resumo: React.FC<{ titulo: string; valor: string; destaque?: boolean }> = ({ titulo, valor, destaque }) => (
  <div className={`rounded-xl border p-3 ${destaque ? 'border-emerald-200 bg-emerald-50' : 'border-neutral-200 bg-neutral-50'}`}>
    <p className="text-[11px] text-neutral-500">{titulo}</p>
    <p className={`text-xl font-bold font-mono ${destaque ? 'text-emerald-800' : 'text-neutral-900'}`}>{valor}</p>
  </div>
);

export default PaginaSubirZip;
