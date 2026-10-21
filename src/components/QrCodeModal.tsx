import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, X, ExternalLink, PhoneCall } from 'lucide-react';
import { getQrTelLink, extractDigits } from '../lib/phone';

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadName: string;
  phoneNumber: string;
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({
  isOpen,
  onClose,
  leadName,
  phoneNumber
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const telLink = getQrTelLink(phoneNumber);
  const digits = extractDigits(phoneNumber);

  useEffect(() => {
    if (isOpen && phoneNumber) {
      QRCode.toDataURL(telLink, {
        width: 240,
        margin: 2,
        color: {
          dark: '#1f2937',
          light: '#ffffff'
        }
      })
        .then(url => setQrDataUrl(url))
        .catch(err => console.error('Erro ao gerar QR Code:', err));
    }
  }, [isOpen, phoneNumber, telLink]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-xl shadow-xl border border-neutral-200 max-w-sm w-full p-6 text-center relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 p-1 rounded-full transition-colors"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-neutral-100 text-neutral-700 mb-3">
          <QrCode className="w-5 h-5" />
        </div>

        <h3 className="text-base font-semibold text-neutral-900 mb-1">
          QR Code de Discagem
        </h3>
        <p className="text-xs text-neutral-500 mb-4">
          {leadName}
        </p>

        {qrDataUrl ? (
          <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-100 inline-block mb-4">
            <img src={qrDataUrl} alt="QR Code Discagem" className="w-48 h-48 mx-auto" />
          </div>
        ) : (
          <div className="w-48 h-48 bg-neutral-100 rounded-lg animate-pulse mx-auto mb-4 flex items-center justify-center text-xs text-neutral-400">
            Gerando QR Code...
          </div>
        )}

        <div className="bg-neutral-50 rounded-md p-2.5 text-left mb-4 border border-neutral-200/80">
          <div className="flex items-center gap-1.5 text-xs font-mono text-neutral-700 font-medium">
            <PhoneCall className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            <span className="truncate">{telLink}</span>
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">
            * O dígito <strong className="text-neutral-800">0</strong> foi adicionado automaticamente na frente do DDD (<span className="font-mono">{digits}</span>) apenas para o QR Code.
          </p>
        </div>

        <div className="flex gap-2 justify-center">
          <a
            href={telLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Testar Link Tel
          </a>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-md transition-colors"
          >
            Concluído
          </button>
        </div>
      </div>
    </div>
  );
};
