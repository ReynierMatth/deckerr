import { useState } from 'react';
import { X, Copy, Check, Download } from 'lucide-react';
import { Card } from '../../types';
import {
  buildDeckExport,
  ExportFormat,
  EXPORT_FILE_EXTENSIONS,
  EXPORT_MIME_TYPES,
} from '../../utils/deckExport';

interface DeckExportModalProps {
  cards: { card: Card; quantity: number; is_commander?: boolean; is_sideboard?: boolean }[];
  onClose: () => void;
  /** Used as the download filename base; defaults to "deck". */
  deckName?: string;
}

export default function DeckExportModal({ cards, onClose, deckName }: DeckExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('plain');
  const [copied, setCopied] = useState(false);
  const text = buildDeckExport(cards, format);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — user can still select the text manually */
    }
  };

  const handleDownload = () => {
    const base = (deckName ?? '').trim().replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-') || 'deck';
    const blob = new Blob([text], { type: EXPORT_MIME_TYPES[format] });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${base}.${EXPORT_FILE_EXTENSIONS[format]}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const tab = (value: ExportFormat, label: string) => (
    <button
      onClick={() => setFormat(value)}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        format === value ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Export deck</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {tab('plain', 'Plain / Moxfield')}
          {tab('arena', 'Arena')}
          {tab('csv', 'CSV')}
          {tab('mtgo', 'MTGO (.dek)')}
        </div>

        <textarea
          readOnly
          value={text}
          onFocus={(e) => e.target.select()}
          className="w-full h-64 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 font-mono resize-none"
        />

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 py-2.5 rounded-lg font-medium text-white transition-colors"
          >
            {copied ? <><Check size={18} /> Copied!</> : <><Copy size={18} /> Copy to clipboard</>}
          </button>
          <button
            onClick={handleDownload}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 py-2.5 rounded-lg font-medium text-white transition-colors"
          >
            <Download size={18} /> Download .{EXPORT_FILE_EXTENSIONS[format]}
          </button>
        </div>
      </div>
    </div>
  );
}
