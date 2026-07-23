import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { Card } from '../../types';
import { buildDeckExport, ExportFormat } from '../../utils/deckExport';

interface DeckExportModalProps {
  cards: { card: Card; quantity: number; is_commander?: boolean }[];
  onClose: () => void;
}

export default function DeckExportModal({ cards, onClose }: DeckExportModalProps) {
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

        <div className="flex gap-2">
          {tab('plain', 'Plain / Moxfield')}
          {tab('arena', 'Arena')}
        </div>

        <textarea
          readOnly
          value={text}
          onFocus={(e) => e.target.select()}
          className="w-full h-64 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 font-mono resize-none"
        />

        <button
          onClick={handleCopy}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 py-2.5 rounded-lg font-medium text-white transition-colors"
        >
          {copied ? <><Check size={18} /> Copied!</> : <><Copy size={18} /> Copy to clipboard</>}
        </button>
      </div>
    </div>
  );
}
