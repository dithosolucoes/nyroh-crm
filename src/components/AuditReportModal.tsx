import React, { useState } from 'react';
import { WebsiteAuditReport } from '../types/audit';
import { generateAuditPdf } from '../lib/pdfReportGenerator';
import { 
  X, FileText, Download, CheckCircle2, AlertTriangle, XCircle, 
  ExternalLink, Sparkles, Smartphone, Shield, Zap, Search, ArrowRight, RefreshCw, MessageSquare
} from 'lucide-react';

interface AuditReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: WebsiteAuditReport | null;
  loading: boolean;
  onRefresh: () => void;
  sellerName?: string;
}

export const AuditReportModal: React.FC<AuditReportModalProps> = ({
  isOpen,
  onClose,
  report,
  loading,
  onRefresh,
  sellerName = 'Consultor Nyroh'
}) => {
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  if (!isOpen) return null;

  const handleDownloadPdf = () => {
    if (!report) return;
    setDownloadingPdf(true);
    try {
      generateAuditPdf(report, sellerName);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score < 50) return 'text-rose-600 bg-rose-50 border-rose-200';
    if (score < 75) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-neutral-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-neutral-200 flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-neutral-950 text-white p-4 sm:p-5 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-blue-600 text-[10px] font-bold uppercase tracking-wider text-white">
                Diagnóstico Técnico
              </span>
              <span className="text-xs text-neutral-400 font-mono">100% Algorítmico</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white mt-1 truncate">
              {report ? report.leadName : 'Analisando Estrutura Digital...'}
            </h2>
            <p className="text-xs text-neutral-400 truncate">
              {report ? report.analyzedUrl : 'Inspecionando tags, tempo de resposta, WhatsApp e SEO...'}
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
              <p className="text-sm font-bold text-neutral-800">
                Auditoria ao Vivo em Andamento...
              </p>
              <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                Consultando tempo de resposta do servidor, checando tags de SEO e verificando gatilhos de WhatsApp.
              </p>
            </div>
          ) : report ? (
            <>
              {/* Overall Score Banner */}
              <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-4 ${getScoreColor(report.overallScore)}`}>
                <div className="flex items-center gap-3">
                  <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight">
                    {report.overallScore}<span className="text-sm font-sans font-normal opacity-70">/100</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold leading-tight">
                      {report.overallScore < 50
                        ? 'Saúde Digital Crítica (Gargalo Severo)'
                        : report.overallScore < 75
                        ? 'Saúde Digital Regular (Oportunidade Comercial)'
                        : 'Estrutura Estável'}
                    </h3>
                    <p className="text-xs opacity-80 mt-0.5">
                      {report.hasWebsite
                        ? `Site analisado em ${report.metrics.responseTimeMs ? (report.metrics.responseTimeMs / 1000).toFixed(1) : 0}s`
                        : 'Cliente sem página ativa na internet'}
                    </p>
                  </div>
                </div>

                {/* PDF Download Button */}
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4 text-blue-400" />
                  <span>{downloadingPdf ? 'Gerando Laudo...' : 'Baixar Laudo em PDF'}</span>
                </button>
              </div>

              {/* The 4 Pillars */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/70 text-center">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-neutral-600 mb-1">
                    <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                    <span>Conversão</span>
                  </div>
                  <div className="text-lg font-bold text-neutral-900">{report.scores.conversion}%</div>
                  <div className="text-[10px] text-neutral-400">WhatsApp & Fone</div>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/70 text-center">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-neutral-600 mb-1">
                    <Search className="w-3.5 h-3.5 text-purple-600" />
                    <span>SEO Local</span>
                  </div>
                  <div className="text-lg font-bold text-neutral-900">{report.scores.seo}%</div>
                  <div className="text-[10px] text-neutral-400">Busca Google</div>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/70 text-center">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-neutral-600 mb-1">
                    <Zap className="w-3.5 h-3.5 text-amber-600" />
                    <span>Velocidade</span>
                  </div>
                  <div className="text-lg font-bold text-neutral-900">{report.scores.performance}%</div>
                  <div className="text-[10px] text-neutral-400">Tempo de Carga</div>
                </div>

                <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/70 text-center">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-neutral-600 mb-1">
                    <Shield className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Segurança</span>
                  </div>
                  <div className="text-lg font-bold text-neutral-900">{report.scores.security}%</div>
                  <div className="text-[10px] text-neutral-400">Cadeado SSL</div>
                </div>
              </div>

              {/* Argumentos de Venda / Pontos Detectados */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                  Gargalos Técnicos & Argumentos de Venda Prontos
                </h4>

                <div className="space-y-2">
                  {report.checks.map((chk) => (
                    <div 
                      key={chk.id} 
                      className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                        chk.status === 'fail'
                          ? 'bg-rose-50/70 border-rose-200'
                          : chk.status === 'warning'
                          ? 'bg-amber-50/70 border-amber-200'
                          : 'bg-emerald-50/70 border-emerald-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-bold">
                          {chk.status === 'fail' ? (
                            <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          ) : chk.status === 'warning' ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          )}
                          <span className={chk.status === 'fail' ? 'text-rose-950' : chk.status === 'warning' ? 'text-amber-950' : 'text-emerald-950'}>
                            {chk.title}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono opacity-70">
                          {chk.observedValue}
                        </span>
                      </div>

                      <div className="p-2 rounded-lg bg-white/80 border border-neutral-200/60 text-neutral-700">
                        <span className="font-semibold text-neutral-900">💡 Como usar na ligação: </span>
                        {chk.salesPitch}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Comparativo Nyroh */}
              <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    Comparativo Imediato com Entrega Nyroh
                  </span>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Upgrade Score: 98/100
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {report.nyrohComparison.highlights.map((h, i) => (
                    <div key={i} className="p-2 rounded-lg bg-white border border-blue-100 space-y-1">
                      <span className="text-[10.5px] font-semibold text-neutral-500 block">{h.label}</span>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-rose-700 font-medium line-through">{h.current}</span>
                        <ArrowRight className="w-3 h-3 text-neutral-400" />
                        <span className="text-emerald-700 font-bold">{h.nyroh}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-neutral-400 text-xs">
              Nenhuma análise disponível no momento.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 sm:p-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:text-neutral-900 hover:bg-neutral-200 rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Reanalisar Site</span>
          </button>

          <div className="flex items-center gap-2">
            {report && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Gerar Laudo PDF</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-bold text-xs transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
