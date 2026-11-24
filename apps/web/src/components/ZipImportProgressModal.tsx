import React from 'react';
import {
  Upload,
  FileArchive,
  Database,
  Smartphone,
  Phone,
  Globe,
  ExternalLink,
  ShieldCheck,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  ArrowRight,
  Sparkles,
  Layers
} from 'lucide-react';

export interface ImportProgressData {
  jobId: string;
  batchId?: string;
  batchName?: string;
  fileName?: string;
  fileSizeBytes?: number;
  stage: 'uploading' | 'extracting' | 'parsing' | 'validating' | 'saving_db' | 'completed' | 'error';
  percent: number;
  statusText: string;
  processedFiles: number;
  totalFiles: number;
  totalLeadsFound: number;
  savedLeads: number;
  validMobiles: number;
  landlines: number;
  withNyrohUrl: number;
  withWebsite: number;
  currentBatchIndex?: number;
  totalBatches?: number;
  error?: string;
  logs: Array<{ timestamp: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }>;
  startedAt?: number;
  updatedAt?: number;
  completedAt?: number;
  // Client-side upload progress
  uploadBytesLoaded?: number;
  uploadBytesTotal?: number;
}

export interface ZipImportProgressModalProps {
  isOpen: boolean;
  progress?: ImportProgressData | null;
  progressData?: ImportProgressData | null;
  onClose: () => void;
  onCancelUpload?: () => void;
  onViewBatch?: (batchId?: string) => void;
  onGoToCampaign?: (batchId?: string) => void;
}

export const ZipImportProgressModal: React.FC<ZipImportProgressModalProps> = ({
  isOpen,
  progress: directProgress,
  progressData,
  onClose,
  onCancelUpload,
  onViewBatch,
  onGoToCampaign
}) => {
  const progress = directProgress || progressData;
  if (!isOpen || !progress) return null;

  const isCompleted = progress.stage === 'completed';
  const isError = progress.stage === 'error';
  const isRunning = !isCompleted && !isError;

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let val = bytes;
    let unitIdx = 0;
    while (val >= 1024 && unitIdx < units.length - 1) {
      val /= 1024;
      unitIdx++;
    }
    return `${val.toFixed(1)} ${units[unitIdx]}`;
  };

  const stagesList = [
    {
      id: 'upload',
      name: 'Upload para Disco',
      description: 'Stream contínuo sem ocupar RAM da Railway',
      icon: Upload,
      active: progress.stage === 'uploading',
      done: ['extracting', 'parsing', 'validating', 'saving_db', 'completed'].includes(progress.stage)
    },
    {
      id: 'extract',
      name: 'Descompactação & JSONs',
      description: 'Abertura do ZIP e leitura dos cadastros',
      icon: FileArchive,
      active: progress.stage === 'extracting' || progress.stage === 'parsing',
      done: ['validating', 'saving_db', 'completed'].includes(progress.stage)
    },
    {
      id: 'validate',
      name: 'Higienização & WhatsApp',
      description: 'Separação de celulares válidos e fixos',
      icon: Smartphone,
      active: progress.stage === 'validating',
      done: ['saving_db', 'completed'].includes(progress.stage)
    },
    {
      id: 'save',
      name: 'Gravação em Lote (Postgres)',
      description: 'Inserção em blocos com alta performance',
      icon: Database,
      active: progress.stage === 'saving_db',
      done: progress.stage === 'completed'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl border border-neutral-200 w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/10 text-emerald-400">
              {isRunning ? (
                <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
              ) : isCompleted ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">
                  {isCompleted
                    ? 'Importação Concluída com Sucesso!'
                    : isError
                    ? 'Aviso na Importação do Arquivo'
                    : 'Processando Arquivo de Leads...'}
                </h3>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3 h-3" />
                  Railway OOM Shield
                </span>
              </div>
              <p className="text-xs text-neutral-300 truncate max-w-md mt-0.5">
                {progress.fileName ? `Arquivo: ${progress.fileName}` : 'Pipeline Seguro de Ingestão de Leads'}
              </p>
            </div>
          </div>

          {!isRunning && (
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Progress Bar and Status */}
          <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-neutral-700 flex items-center gap-1.5">
                {isRunning && <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />}
                {progress.statusText || 'Aguardando processamento...'}
              </span>
              <span className="text-xs font-black text-neutral-900 bg-white px-2 py-0.5 rounded-md border border-neutral-200">
                {Math.round(progress.percent)}%
              </span>
            </div>

            {/* Main Progress Track */}
            <div className="w-full bg-neutral-200 rounded-full h-3 overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isError
                    ? 'bg-red-500'
                    : isCompleted
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                    : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 animate-pulse'
                }`}
                style={{ width: `${Math.min(100, Math.max(2, progress.percent))}%` }}
              />
            </div>

            {/* Sub text details */}
            <div className="flex items-center justify-between mt-2 text-[11px] text-neutral-500">
              <span className="flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-neutral-400" />
                {progress.uploadBytesLoaded && progress.uploadBytesTotal ? (
                  <>
                    Enviado: {formatBytes(progress.uploadBytesLoaded)} de {formatBytes(progress.uploadBytesTotal)}
                  </>
                ) : progress.fileSizeBytes ? (
                  <>Tamanho: {formatBytes(progress.fileSizeBytes)}</>
                ) : (
                  <>Stream de disco ativado</>
                )}
              </span>
              {progress.totalBatches && progress.totalBatches > 1 ? (
                <span className="font-semibold text-neutral-600">
                  Lote {progress.currentBatchIndex || 1} de {progress.totalBatches} no PostgreSQL
                </span>
              ) : (
                <span className="text-neutral-400">PostgreSQL Seguro</span>
              )}
            </div>
          </div>

          {/* Pipeline 4-Stage Stepper */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {stagesList.map((st) => {
              const IconComp = st.icon;
              return (
                <div
                  key={st.id}
                  className={`p-2.5 rounded-xl border transition-all text-left ${
                    st.done
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                      : st.active
                      ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20 text-blue-900'
                      : 'bg-neutral-50/50 border-neutral-200/70 text-neutral-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <IconComp
                      className={`w-4 h-4 ${
                        st.done
                          ? 'text-emerald-600'
                          : st.active
                          ? 'text-blue-600 animate-bounce'
                          : 'text-neutral-400'
                      }`}
                    />
                    {st.done ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : st.active ? (
                      <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-neutral-300" />
                    )}
                  </div>
                  <div className="text-[11px] font-bold truncate">{st.name}</div>
                  <div className="text-[9px] text-neutral-500 leading-tight truncate mt-0.5">
                    {st.description}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200">
              <div className="text-[11px] font-medium text-neutral-500 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-neutral-400" />
                Total de Leads
              </div>
              <div className="text-lg font-black text-neutral-900 mt-1">
                {progress.totalLeadsFound.toLocaleString('pt-BR')}
              </div>
              <div className="text-[10px] text-neutral-400 mt-0.5">
                {progress.savedLeads > 0 ? `${progress.savedLeads.toLocaleString('pt-BR')} salvos` : 'Lendo JSONs...'}
              </div>
            </div>

            <div className="bg-emerald-50/70 rounded-xl p-3 border border-emerald-200">
              <div className="text-[11px] font-semibold text-emerald-800 flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                Celulares (WhatsApp)
              </div>
              <div className="text-lg font-black text-emerald-700 mt-1">
                {progress.validMobiles.toLocaleString('pt-BR')}
              </div>
              <div className="text-[10px] text-emerald-600 mt-0.5">Aptos para Disparo</div>
            </div>

            <div className="bg-amber-50/60 rounded-xl p-3 border border-amber-200">
              <div className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-amber-600" />
                Telefones Fixos
              </div>
              <div className="text-lg font-black text-amber-700 mt-1">
                {progress.landlines.toLocaleString('pt-BR')}
              </div>
              <div className="text-[10px] text-amber-600 mt-0.5">Separados (Sem Disparo)</div>
            </div>

            <div className="bg-blue-50/60 rounded-xl p-3 border border-blue-200">
              <div className="text-[11px] font-semibold text-blue-800 flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                Com Link / Site
              </div>
              <div className="text-lg font-black text-blue-700 mt-1">
                {(progress.withNyrohUrl + progress.withWebsite).toLocaleString('pt-BR')}
              </div>
              <div className="text-[10px] text-blue-600 mt-0.5">
                {progress.withNyrohUrl} Nyroh | {progress.withWebsite} Web
              </div>
            </div>
          </div>

          {/* Real-Time Live Logs Terminal */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-neutral-600 flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-neutral-500" />
                Registro em Tempo Real (Console do Servidor)
              </span>
              <span className="text-[10px] text-neutral-400">
                {progress.logs.length} eventos registrados
              </span>
            </div>
            <div className="bg-neutral-950 text-neutral-200 rounded-xl p-3 font-mono text-[11px] max-h-36 overflow-y-auto space-y-1 border border-neutral-800">
              {progress.logs.length === 0 ? (
                <div className="text-neutral-500 italic">Iniciando pipeline de processamento...</div>
              ) : (
                progress.logs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2 leading-tight">
                    <span className="text-neutral-500 shrink-0 select-none">[{log.timestamp}]</span>
                    <span
                      className={
                        log.type === 'success'
                          ? 'text-emerald-400'
                          : log.type === 'warn'
                          ? 'text-amber-400'
                          : log.type === 'error'
                          ? 'text-red-400 font-bold'
                          : 'text-neutral-300'
                      }
                    >
                      {log.text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Error Banner if any */}
          {isError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-start gap-2.5 text-red-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Falha no processamento:</span>
                <span className="mt-0.5 block">{progress.error || 'Ocorreu um erro ao processar o arquivo.'}</span>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {isCompleted && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-3 text-emerald-800">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="text-xs">
                  <span className="font-bold text-emerald-900 block text-sm">
                    Tudo Pronto! {progress.validMobiles.toLocaleString('pt-BR')} Celulares em Staging
                  </span>
                  <span className="text-emerald-700 text-[11px] mt-0.5 block">
                    Todos os leads foram gravados com sucesso no banco PostgreSQL e o disco temporário da Railway foi limpo.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between gap-3">
          <div className="text-[11px] text-neutral-500">
            {isRunning ? (
              <span className="flex items-center gap-1.5 text-blue-600 font-medium">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Por favor, mantenha esta janela aberta enquanto os dados são gravados.
              </span>
            ) : (
              <span className="text-neutral-500">Operação concluída com segurança.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isError ? (
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-xs font-bold transition cursor-pointer"
              >
                Fechar
              </button>
            ) : isCompleted ? (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-700 text-xs font-bold transition cursor-pointer"
                >
                  Fechar
                </button>
                {(onViewBatch || onGoToCampaign) && (
                  <button
                    onClick={() => {
                      onClose();
                      if (onViewBatch) onViewBatch(progress.batchId);
                      else if (onGoToCampaign) onGoToCampaign(progress.batchId);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <span>Ver Leads no Disparo</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-400 font-medium italic">Processando no disco e banco...</span>
                {onCancelUpload && progress.stage === 'uploading' && (
                  <button
                    onClick={onCancelUpload}
                    className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition cursor-pointer"
                  >
                    Cancelar Upload
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
