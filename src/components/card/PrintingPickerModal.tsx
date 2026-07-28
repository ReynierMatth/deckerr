import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import Modal from '../Modal';
import { Card } from '../../types';
import { getCardPrintings } from '../../services/scryfall';
import { getCardImageSmall } from '../../utils/cardFaces';
import { getPrice } from '../../cards/domain/accessors/price';
import { usePriceSource } from '../../contexts/PriceSourceContext';

interface PrintingPickerModalProps {
  /** The card whose printings are listed (its id marks the current printing). */
  card: Card;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (printing: Card) => void;
}

/**
 * Edition/printing picker: grid of every printing of a card (drawer on
 * mobile via Modal). Tapping a printing calls onSelect and closes.
 */
export default function PrintingPickerModal({
  card,
  isOpen,
  onClose,
  onSelect,
}: PrintingPickerModalProps) {
  const { source } = usePriceSource();
  // Printings are shared per card name (not per printing id).
  const { data, isPending, isError } = useQuery({
    queryKey: ['printings', card.name],
    enabled: isOpen,
    queryFn: () => getCardPrintings(card),
  });
  const printings = data ?? [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" labelledBy="printing-picker-title">
      <div className="p-4 pt-1 sm:pt-4">
        <h2 id="printing-picker-title" className="text-lg font-semibold text-white mb-1 pr-10">
          Choose a printing
        </h2>
        <p className="text-xs text-gray-400 mb-3 truncate">{card.name}</p>

        {isPending ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-blue-500" size={40} />
          </div>
        ) : isError ? (
          <div className="text-center text-red-400 py-12">Failed to load printings</div>
        ) : printings.length === 0 ? (
          <div className="text-center text-gray-400 py-12">No printings found</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {printings.map((printing) => {
              const isCurrent = printing.id === card.id;
              const imageUri = getCardImageSmall(printing);
              const usd = getPrice(printing, source);
              const usdFoil = getPrice(printing, source, { foil: true });
              return (
                <button
                  key={printing.id}
                  type="button"
                  aria-current={isCurrent ? 'true' : undefined}
                  onClick={() => {
                    onSelect(printing);
                    onClose();
                  }}
                  className={`min-h-[44px] text-left bg-gray-900 rounded-lg p-1.5 transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isCurrent ? 'ring-2 ring-blue-500' : ''
                  }`}
                >
                  {imageUri ? (
                    <img
                      src={imageUri}
                      alt={`${printing.name} — ${printing.setName ?? printing.setCode ?? ''}`}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-auto rounded"
                    />
                  ) : (
                    <div className="aspect-[5/7] bg-gray-700 rounded flex items-center justify-center p-1 text-center text-xs text-gray-300">
                      {printing.name}
                    </div>
                  )}
                  <div className="mt-1 space-y-0.5">
                    <div className="text-xs text-gray-200 truncate">{printing.setName}</div>
                    <div className="text-[11px] text-gray-400">
                      <span className="uppercase">{printing.setCode}</span>
                      {printing.collectorNumber ? ` #${printing.collectorNumber}` : ''}
                    </div>
                    {(usd > 0 || usdFoil > 0) && (
                      <div className="text-[11px]">
                        {usd > 0 && (
                          <span className="text-green-400">${usd.toFixed(2)}</span>
                        )}
                        {usd > 0 && usdFoil > 0 && (
                          <span className="text-gray-500"> · </span>
                        )}
                        {usdFoil > 0 && (
                          <span className="text-fuchsia-400">${usdFoil.toFixed(2)} foil</span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
