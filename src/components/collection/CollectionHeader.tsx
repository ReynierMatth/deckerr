import { useRef } from 'react';
import { Loader2, RefreshCw, Download, Upload } from 'lucide-react';
import { CollectionItem } from './types';
import { getPrice } from '../../cards/domain/accessors/price';

interface CollectionHeaderProps {
  searchQuery: string;
  items: CollectionItem[];
  totalCount: number;
  totalCollectionValue: number;
  isLoadingTotalValue: boolean;
  isRefreshingPrices: boolean;
  isImporting: boolean;
  onRefreshPrices: () => void;
  onExportCsv: () => void;
  onImportCsv: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/** Title/value/actions row: card counts, collection value, refresh + CSV import/export. */
export default function CollectionHeader({
  searchQuery,
  items,
  totalCount,
  totalCollectionValue,
  isLoadingTotalValue,
  isRefreshingPrices,
  isImporting,
  onRefreshPrices,
  onExportCsv,
  onImportCsv,
}: CollectionHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
      <h2 className="text-xl font-semibold">
        {searchQuery ? `Found ${totalCount} card(s)` : `My Cards (${items.length} unique, ${items.reduce((acc, c) => acc + c.quantity, 0)} total)`}
      </h2>
      {/* Collection Value Summary */}
      <div className="flex items-center gap-2">
        <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2">
          <div className="text-xs text-gray-400 mb-0.5">
            {searchQuery ? 'Filtered Value' : 'Total Collection Value'}
          </div>
          <div className="text-lg font-bold text-green-400">
            {isLoadingTotalValue ? (
              <Loader2 className="animate-spin" size={20} />
            ) : searchQuery ? (
              // For search results, best-effort sum over currently-loaded results
              `$${items.reduce((total, { card, quantity }) => {
                const price = getPrice(card, 'tcgplayer');
                return total + (price * quantity);
              }, 0).toFixed(2)}`
            ) : (
              // For full collection, use pre-calculated total
              `$${totalCollectionValue.toFixed(2)}`
            )}
          </div>
        </div>
        <button
          onClick={onRefreshPrices}
          disabled={isRefreshingPrices}
          title="Refresh card prices"
          className="p-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={18} className={isRefreshingPrices ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={onExportCsv}
          disabled={items.length === 0}
          title="Export collection to CSV"
          className="p-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          <Download size={18} />
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
          title="Import collection from CSV"
          className="p-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {isImporting ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onImportCsv}
          className="hidden"
        />
      </div>
    </div>
  );
}
