import React, { useState, useRef } from 'react';
import { Upload, FileArchive, CheckCircle, AlertCircle, RefreshCw, X, FileCheck, Info, Users, UserCheck, Percent } from 'lucide-react';
import JSZip from 'jszip';
import { ImportResult, Salesperson } from '../types';
import { ZipImportProgressModal, ImportProgressData } from './ZipImportProgressModal';

interface ZipUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  onShowToast: (msg: string) => void;
  salespeople?: Salesperson[];
  onNavigateToDisparos?: () => void;
}

export const ZipUploadModal: React.FC<ZipUploadModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  onShowToast,
  salespeople = [
    { id: 'seller-thomas', name: 'Thomas', isDefault: true, color: '#0284c7', bgColor: '#e0f2fe' }
  ],
  onNavigateToDisparos
}) => {
  const [destination, setDestination] = useState<'campaign' | 'direct'>('campaign');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [campaignName, setCampaignName] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [campaignResult, setCampaignResult] = useState<{ totalProcessed: number; validMobiles: number; batchName: string } | null>(null);
  const [showCampaignProgressModal, setShowCampaignProgressModal] = useState<boolean>(false);
  const [campaignProgressData, setCampaignProgressData] = useState<ImportProgressData | null>(null);
  const campaignAbortRef = useRef<XMLHttpRequest | null>(null);
  
  // Salesperson assignment config
  const [distributionMode, setDistributionMode] = useState<'single' | 'split'>('single');
  const [singleSellerId, setSingleSellerId] = useState<string>(salespeople[0]?.id || 'seller-thomas');
  
  // Split percentages for each salesperson (id -> percentage)
  const [splitPercentages, setSplitPercentages] = useState<{ [sellerId: string]: number }>(() => {
    const initial: { [id: string]: number } = {};
    if (salespeople.length <= 1) {
      initial[salespeople[0]?.id || 'seller-thomas'] = 100;
    } else {
      const equalShare = Math.floor(100 / salespeople.length);
      salespeople.forEach((s, idx) => {
        initial[s.id] = idx === 0 ? 100 - equalShare * (salespeople.length - 1) : equalShare;
      });
    }
    return initial;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const totalPercentage = Object.values(splitPercentages).reduce((a: number, b: number) => a + (Number(b) || 0), 0);

  const handleEqualSplit = () => {
    if (salespeople.length === 0) return;
    const equalShare = Math.floor(100 / salespeople.length);
    const updated: { [id: string]: number } = {};
    salespeople.forEach((s, idx) => {
      updated[s.id] = idx === 0 ? 100 - equalShare * (salespeople.length - 1) : equalShare;
    });
    setSplitPercentages(updated);
  };

  const handlePercentageChange = (sellerId: string, val: number) => {
    setSplitPercentages(prev => ({
      ...prev,
      [sellerId]: Math.max(0, Math.min(100, val))
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.zip') || lower.endsWith('.json')) {
        setSelectedFile(file);
        setImportResult(null);
      } else {
        onShowToast('Por favor, selecione um arquivo no formato .ZIP ou .JSON');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.zip') || lower.endsWith('.json')) {
        setSelectedFile(file);
        setImportResult(null);
      } else {
        onShowToast('Selecione um arquivo .ZIP ou .JSON válido.');
      }
    }
  };

  const handleUploadZip = async () => {
    if (!selectedFile) return;

    if (destination === 'campaign') {
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const safraName = campaignName.trim() || selectedFile.name.replace(/\.[^/.]+$/, '');
      const fileSizeMB = (selectedFile.size / (1024 * 1024)).toFixed(1);

      const initialProgress: ImportProgressData = {
        jobId,
        batchName: safraName,
        fileName: selectedFile.name,
        fileSizeBytes: selectedFile.size,
        stage: 'uploading',
        percent: 5,
        statusText: `Enviando ${selectedFile.name} (${fileSizeMB} MB) para disco temporário...`,
        processedFiles: 0,
        totalFiles: 0,
        totalLeadsFound: 0,
        savedLeads: 0,
        validMobiles: 0,
        landlines: 0,
        withNyrohUrl: 0,
        withWebsite: 0,
        logs: [
          {
            timestamp: new Date().toLocaleTimeString('pt-BR'),
            text: `Iniciando upload de ${selectedFile.name} (${fileSizeMB} MB). Gravando diretamente em disco da Railway...`,
            type: 'info'
          }
        ],
        startedAt: Date.now(),
        updatedAt: Date.now()
      };

      setCampaignProgressData(initialProgress);
      setShowCampaignProgressModal(true);
      setIsUploading(true);
      setImportResult(null);
      setCampaignResult(null);

      // Notificar servidor da inicialização
      try {
        await fetch('/api/campaign/import-progress/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            fileName: selectedFile.name,
            fileSizeBytes: selectedFile.size
          })
        });
      } catch (e) {
        console.warn('Erro ao inicializar progresso:', e);
      }

      const pollInterval = setInterval(async () => {
        try {
          const pRes = await fetch(`/api/campaign/import-progress/${jobId}`);
          if (pRes.ok) {
            const pData: ImportProgressData = await pRes.json();
            setCampaignProgressData(prev => ({
              ...(prev || {}),
              ...pData
            }));
            if (pData.stage === 'completed' || pData.stage === 'error') {
              clearInterval(pollInterval);
              setIsUploading(false);
              if (pData.stage === 'completed') {
                onImportComplete();
              }
            }
          }
        } catch (err) {
          console.warn('Erro no polling:', err);
        }
      }, 600);

      const formData = new FormData();
      formData.append('zipFile', selectedFile);
      formData.append('safraName', safraName);
      formData.append('jobId', jobId);

      const xhr = new XMLHttpRequest();
      campaignAbortRef.current = xhr;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const uploadPercent = Math.min(99, Math.round((e.loaded / e.total) * 100));
          setCampaignProgressData(prev => {
            if (!prev || prev.stage !== 'uploading') return prev;
            return {
              ...prev,
              percent: Math.min(25, Math.floor(uploadPercent * 0.25)),
              statusText: `Enviando arquivo: ${((e.loaded) / (1024 * 1024)).toFixed(1)} MB de ${((e.total) / (1024 * 1024)).toFixed(1)} MB (${uploadPercent}%)...`
            };
          });
        }
      };

      xhr.onload = async () => {
        clearInterval(pollInterval);
        setIsUploading(false);
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText);
            if (data.success) {
              setCampaignProgressData(prev => ({
                ...(prev || initialProgress),
                stage: 'completed',
                percent: 100,
                savedLeads: data.totalProcessed,
                validMobiles: data.validMobiles,
                landlines: data.landlines,
                withNyrohUrl: data.withNyrohUrl,
                withWebsite: data.withWebsite,
                statusText: `Concluído com sucesso! ${data.totalProcessed.toLocaleString('pt-BR')} leads gravados no PostgreSQL.`
              }));
              setCampaignResult({
                totalProcessed: data.totalProcessed,
                validMobiles: data.validMobiles,
                batchName: safraName
              });
              onShowToast(`Safra enviada para a Área de Disparo! ${data.validMobiles} celulares aptos.`);
              onImportComplete();
            } else {
              setCampaignProgressData(prev => ({
                ...(prev || initialProgress),
                stage: 'error',
                error: data.error || 'Falha ao processar ZIP.'
              }));
              onShowToast(`Erro no envio: ${data.error || 'Falha ao processar ZIP'}`);
            }
          } else {
            let errTxt = 'Erro na resposta do servidor.';
            try {
              const parsed = JSON.parse(xhr.responseText);
              errTxt = parsed.error || errTxt;
            } catch {
              errTxt = `Erro HTTP ${xhr.status}: ${xhr.statusText}`;
            }
            setCampaignProgressData(prev => ({
              ...(prev || initialProgress),
              stage: 'error',
              error: errTxt
            }));
            onShowToast(errTxt);
          }
        } catch (err: any) {
          setCampaignProgressData(prev => ({
            ...(prev || initialProgress),
            stage: 'error',
            error: err.message
          }));
          onShowToast(`Erro: ${err.message}`);
        }
      };

      xhr.onerror = () => {
        clearInterval(pollInterval);
        setIsUploading(false);
        setCampaignProgressData(prev => ({
          ...(prev || initialProgress),
          stage: 'error',
          error: 'Falha de conexão com o servidor da Railway durante o upload.'
        }));
        onShowToast('Erro de conexão durante o upload.');
      };

      xhr.open('POST', '/api/campaign/upload-zip');
      xhr.send(formData);
      return;
    }

    if (distributionMode === 'split' && totalPercentage !== 100) {
      onShowToast(`A soma das porcentagens da equipe deve ser exatamente 100% (atual: ${totalPercentage}%).`);
      return;
    }

    setIsUploading(true);
    setImportResult(null);
    setProgressMessage('Lendo e extraindo arquivo no seu navegador...');

    try {
      const allItems: any[] = [];
      const errors: string[] = [];

      const isDirectJson = selectedFile.name.toLowerCase().endsWith('.json');

      if (isDirectJson) {
        try {
          const rawContent = await selectedFile.text();
          const cleanContent = rawContent.replace(/^\uFEFF/, '').trim();
          let parsed: any;
          try {
            parsed = JSON.parse(cleanContent);
          } catch {
            const stripped = cleanContent
              .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*/g, '$1')
              .replace(/,\s*([}\]])/g, '$1');
            parsed = JSON.parse(stripped);
          }

          if (Array.isArray(parsed)) {
            allItems.push(...parsed);
          } else if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.leads)) allItems.push(...parsed.leads);
            else if (Array.isArray(parsed.data)) allItems.push(...parsed.data);
            else if (Array.isArray(parsed.clients)) allItems.push(...parsed.clients);
            else if (Array.isArray(parsed.items)) allItems.push(...parsed.items);
            else if (Array.isArray(parsed.results)) allItems.push(...parsed.results);
            else allItems.push(parsed);
          }
        } catch (e: any) {
          errors.push(`Erro ao ler JSON: ${e.message}`);
        }
      } else {
        const zip = new JSZip();
        const contents = await zip.loadAsync(selectedFile);

        const entries = Object.entries(contents.files);
        for (const [relativePath, fileObj] of entries) {
          const normPath = relativePath.replace(/\\/g, '/');
          const fileName = normPath.split('/').pop() || '';

          if (
            !fileObj.dir &&
            !normPath.includes('__MACOSX') &&
            !fileName.startsWith('.') &&
            !fileName.startsWith('._')
          ) {
            try {
              const rawContent = await fileObj.async('string');
              const cleanContent = rawContent.replace(/^\uFEFF/, '').trim();

              const isJsonExt = normPath.toLowerCase().endsWith('.json');
              const isJsonContent = cleanContent.startsWith('{') || cleanContent.startsWith('[');

              if (cleanContent && (isJsonExt || isJsonContent)) {
                let parsed: any;
                try {
                  parsed = JSON.parse(cleanContent);
                } catch (err1) {
                  const stripped = cleanContent
                    .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*/g, '$1')
                    .replace(/,\s*([}\]])/g, '$1');
                  parsed = JSON.parse(stripped);
                }

                if (Array.isArray(parsed)) {
                  allItems.push(...parsed);
                } else if (parsed && typeof parsed === 'object') {
                  if (Array.isArray(parsed.leads)) allItems.push(...parsed.leads);
                  else if (Array.isArray(parsed.data)) allItems.push(...parsed.data);
                  else if (Array.isArray(parsed.clients)) allItems.push(...parsed.clients);
                  else if (Array.isArray(parsed.items)) allItems.push(...parsed.items);
                  else if (Array.isArray(parsed.results)) allItems.push(...parsed.results);
                  else allItems.push(parsed);
                }
              }
            } catch (e: any) {
              errors.push(`Erro ao ler ${normPath}: ${e.message}`);
            }
          }
        }
      }

      if (allItems.length === 0) {
        onShowToast('Nenhum dado válido de lead foi encontrado no arquivo.');
        setIsUploading(false);
        return;
      }

      // Distribute salespersons to each item
      if (distributionMode === 'single') {
        const targetSeller = salespeople.find(s => s.id === singleSellerId) || salespeople[0];
        allItems.forEach(item => {
          item.salespersonId = targetSeller.id;
          item.salespersonName = targetSeller.name;
        });
      } else {
        // Multi-seller distribution based on percentages
        // Build bucket ranges
        let cumulative = 0;
        const buckets: { seller: Salesperson; threshold: number }[] = [];
        salespeople.forEach(seller => {
          const pct = splitPercentages[seller.id] || 0;
          cumulative += pct;
          buckets.push({ seller, threshold: cumulative });
        });

        const totalItems = allItems.length;
        allItems.forEach((item, index) => {
          const itemPercentile = (index / totalItems) * 100;
          const assigned = buckets.find(b => itemPercentile < b.threshold) || buckets[buckets.length - 1];
          item.salespersonId = assigned.seller.id;
          item.salespersonName = assigned.seller.name;
        });
      }

      // Send extracted lead items in chunks of 200 to /api/leads/batch
      const chunkSize = 200;
      let totalInserted = 0;
      let totalDuplicates = 0;
      let totalProcessed = 0;

      for (let i = 0; i < allItems.length; i += chunkSize) {
        const chunk = allItems.slice(i, i + chunkSize);
        setProgressMessage(`Salvando leads no sistema... (${Math.min(i + chunkSize, allItems.length)} / ${allItems.length})`);

        const res = await fetch('/api/leads/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: chunk })
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Erro no servidor: ${text.substring(0, 100)}`);
        }

        const batchResult = await res.json();
        totalInserted += batchResult.insertedCount || 0;
        totalDuplicates += batchResult.skippedDuplicates || 0;
        totalProcessed += batchResult.totalProcessed || 0;
      }

      const finalResult: ImportResult = {
        totalProcessed,
        insertedCount: totalInserted,
        skippedDuplicates: totalDuplicates,
        errors
      };

      setImportResult(finalResult);

      if (totalInserted > 0) {
        onShowToast(`${totalInserted} novos leads importados e distribuídos com sucesso!`);
      } else if (totalDuplicates > 0) {
        onShowToast(`${totalDuplicates} leads atualizados do arquivo ZIP.`);
      } else {
        onShowToast('Nenhum novo lead inserido.');
      }

      onImportComplete();
    } catch (err: any) {
      console.error('ZIP processing error:', err);
      onShowToast(`Erro ao processar ZIP: ${err.message}`);
    } finally {
      setIsUploading(false);
      setProgressMessage('');
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-xl border border-neutral-200 max-w-lg w-full p-6 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 p-1 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <div className="p-2 rounded-lg bg-neutral-100 text-neutral-800">
            <FileArchive className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-neutral-900">
              Importar Leads via .ZIP
            </h3>
            <p className="text-xs text-neutral-500">
              Varredura recursiva de arquivos JSON e divisão automática por vendedor
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {/* Destino da Importação */}
          <div className="flex p-1 bg-neutral-100 rounded-xl border border-neutral-200">
            <button
              type="button"
              onClick={() => setDestination('campaign')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                destination === 'campaign'
                  ? 'bg-white text-neutral-900 shadow-2xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              🚀 Área de Disparos & Campanhas (Staging Oficial Meta)
            </button>
            <button
              type="button"
              onClick={() => setDestination('direct')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                destination === 'direct'
                  ? 'bg-white text-neutral-900 shadow-2xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              👥 Distribuir para Vendedores
            </button>
          </div>

          {destination === 'campaign' && (
            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-blue-950">
                Nome da Safra / Campanha:
              </label>
              <input
                type="text"
                placeholder={selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, '') : 'Ex: Safra Restaurantes Jardins - 17/09'}
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs text-neutral-900 focus:outline-none focus:border-blue-400 font-medium"
              />
              <p className="text-[11px] text-blue-800 leading-relaxed">
                🛡️ <strong>Isolamento Garantido:</strong> Os leads serão cadastrados em Staging exclusivo para disparos via Meta Cloud API. Vendedores comuns não terão acesso antes da quarentena.
              </p>
            </div>
          )}

          {/* Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all ${
              selectedFile
                ? 'border-neutral-400 bg-neutral-50'
                : 'border-neutral-300 hover:border-neutral-400 bg-white'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileChange}
              className="hidden"
            />

            {selectedFile ? (
              <div className="flex flex-col items-center">
                <FileCheck className="w-8 h-8 text-emerald-600 mb-2" />
                <span className="text-xs font-semibold text-neutral-800 max-w-xs truncate">
                  {selectedFile.name}
                </span>
                <span className="text-[11px] text-neutral-400 mt-0.5">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Clique para trocar arquivo
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Upload className="w-8 h-8 text-neutral-400 mb-2" />
                <span className="text-xs font-medium text-neutral-700">
                  Arraste e solte o arquivo .ZIP aqui
                </span>
                <span className="text-[11px] text-neutral-400 mt-1">
                  ou clique para selecionar do computador
                </span>
              </div>
            )}
          </div>

          {/* Atribuição de Vendedor & Divisão por Porcentagem */}
          {destination === 'direct' && (
          <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                Destinação dos Leads do ZIP
              </span>
              <span className="text-[10px] text-neutral-500 font-medium">
                {salespeople.length} vendedor(es) cadastrado(s)
              </span>
            </div>

            {/* Mode selection tabs */}
            <div className="grid grid-cols-2 gap-1.5 bg-neutral-200/70 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setDistributionMode('single')}
                className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-all ${
                  distributionMode === 'single'
                    ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                100% para um Vendedor
              </button>
              <button
                type="button"
                onClick={() => setDistributionMode('split')}
                disabled={salespeople.length <= 1}
                className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
                  distributionMode === 'split'
                    ? 'bg-white text-blue-700 shadow-2xs font-bold'
                    : salespeople.length <= 1
                    ? 'text-neutral-400 cursor-not-allowed'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
                title={salespeople.length <= 1 ? 'Cadastre outros vendedores primeiro' : 'Dividir por porcentagem'}
              >
                <Percent className="w-3 h-3" />
                <span>Dividir por % na Equipe</span>
              </button>
            </div>

            {distributionMode === 'single' ? (
              <div>
                <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                  Atribuir todos os novos leads para:
                </label>
                <select
                  value={singleSellerId}
                  onChange={(e) => setSingleSellerId(e.target.value)}
                  className="w-full bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                >
                  {salespeople.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.isDefault ? '(Principal)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-neutral-600">
                    Defina a porcentagem de novos leads para cada um:
                  </span>
                  <button
                    type="button"
                    onClick={handleEqualSplit}
                    className="text-[10px] text-blue-600 hover:underline font-semibold"
                  >
                    Dividir Igualmente
                  </button>
                </div>

                <div className="space-y-2">
                  {salespeople.map((seller) => {
                    const pct = splitPercentages[seller.id] || 0;
                    return (
                      <div key={seller.id} className="bg-white p-2.5 rounded-lg border border-neutral-200 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span 
                            className="w-2.5 h-2.5 rounded-full shrink-0" 
                            style={{ backgroundColor: seller.color || '#0284c7' }} 
                          />
                          <span className="text-xs font-semibold text-neutral-800 truncate">
                            {seller.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={pct}
                            onChange={(e) => handlePercentageChange(seller.id, Number(e.target.value))}
                            className="w-24 accent-blue-600 h-1.5 cursor-pointer"
                          />
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={pct}
                              onChange={(e) => handlePercentageChange(seller.id, Number(e.target.value))}
                              className="w-14 text-right pr-4 py-1 text-xs border border-neutral-300 rounded font-bold"
                            />
                            <span className="absolute right-1.5 text-[10px] text-neutral-500 pointer-events-none">%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total check indicator */}
                <div className={`flex items-center justify-between text-[11px] px-1 font-bold ${
                  totalPercentage === 100 ? 'text-emerald-600' : 'text-rose-600'
                }`}>
                  <span>Total alocado: {totalPercentage}%</span>
                  <span>{totalPercentage === 100 ? '✓ Soma exata 100%' : '⚠️ Precisa somar 100%'}</span>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Resultado de Envio para Campanha */}
          {campaignResult && (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-xs text-emerald-800 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-emerald-900 text-sm">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                Safra Carregada na Área de Disparo!
              </div>
              <p className="text-neutral-700 text-xs">
                Safra <strong>{campaignResult.batchName}</strong> criada com <strong>{campaignResult.totalProcessed}</strong> leads ({campaignResult.validMobiles} celulares com WhatsApp aptos).
              </p>
              {onNavigateToDisparos && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToDisparos();
                  }}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-2xs transition flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                >
                  <span>Ir para a Área de Disparo & Quarentena 🚀</span>
                </button>
              )}
            </div>
          )}

          {/* Progress Message */}
          {isUploading && progressMessage && (
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs text-blue-800 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
              <span>{progressMessage}</span>
            </div>
          )}

          {/* Dica de Segurança sobre Re-upload */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 text-[11px] text-neutral-600 flex items-start gap-2">
            <Info className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
            <span>
              <strong>Atualização Segura:</strong> Ao re-enviar um arquivo com leads já cadastrados, o sistema <strong>não duplica registros</strong> e <strong>mantém intacto</strong> o estágio no Kanban e histórico de ligações, apenas sincronizando o <strong>Site Antigo</strong> e dados cadastrais novos.
            </span>
          </div>

          {/* Resultado da Importação */}
          {importResult && (
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg text-xs text-emerald-800 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-900">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                Importação Concluída com Sucesso!
              </div>
              <div className="grid grid-cols-3 gap-2 text-center pt-2">
                <div className="bg-white/80 p-1.5 rounded border border-emerald-100">
                  <span className="block text-[10px] text-emerald-600">Total no ZIP</span>
                  <span className="font-semibold text-sm">{importResult.totalProcessed}</span>
                </div>
                <div className="bg-white/80 p-1.5 rounded border border-emerald-100">
                  <span className="block text-[10px] text-emerald-600">Novos Leads</span>
                  <span className="font-semibold text-sm text-emerald-700">+{importResult.insertedCount}</span>
                </div>
                <div className="bg-white/80 p-1.5 rounded border border-emerald-100">
                  <span className="block text-[10px] text-emerald-600">Atualizados</span>
                  <span className="font-semibold text-sm text-neutral-600">{importResult.skippedDuplicates}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors"
          >
            {importResult ? 'Fechar' : 'Cancelar'}
          </button>
          <button
            onClick={handleUploadZip}
            disabled={!selectedFile || isUploading || (distributionMode === 'split' && totalPercentage !== 100)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-md transition-colors disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Processando e Distribuindo...
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                Importar e Distribuir
              </>
            )}
          </button>
        </div>
      </div>

      <ZipImportProgressModal
        isOpen={showCampaignProgressModal}
        onClose={() => {
          setShowCampaignProgressModal(false);
          setCampaignProgressData(null);
          if (campaignProgressData?.stage === 'completed') {
            onClose();
          }
        }}
        progressData={campaignProgressData}
        onCancelUpload={() => {
          if (campaignAbortRef.current) {
            campaignAbortRef.current.abort();
            campaignAbortRef.current = null;
          }
          setIsUploading(false);
          setShowCampaignProgressModal(false);
          setCampaignProgressData(null);
        }}
        onViewBatch={() => {
          setShowCampaignProgressModal(false);
          onClose();
          if (onNavigateToDisparos) {
            onNavigateToDisparos();
          }
        }}
      />
    </div>
  );
};

