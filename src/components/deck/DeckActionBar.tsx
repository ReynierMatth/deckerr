import { Save, Loader2, PackagePlus, Download, Heart } from 'lucide-react';

interface DeckActionBarProps {
  totalPrice: number;
  showMissingActions: boolean;
  isAddingAll: boolean;
  isAddingToWishlist: boolean;
  onAddAllMissing: () => void;
  onAddMissingToWishlist: () => void;
  exportDisabled: boolean;
  onExport: () => void;
  saveDisabled: boolean;
  isSaving: boolean;
  isUpdate: boolean;
  onSave: () => void;
}

/** Fixed footer with the deck's total price and its collection/export/save actions. */
export default function DeckActionBar({
  totalPrice,
  showMissingActions,
  isAddingAll,
  isAddingToWishlist,
  onAddAllMissing,
  onAddMissingToWishlist,
  exportDisabled,
  onExport,
  saveDisabled,
  isSaving,
  isUpdate,
  onSave,
}: DeckActionBarProps) {
  return (
    <div className="fixed bottom-16 left-0 right-0 md:left-auto md:right-4 md:bottom-4 md:w-80 z-20 bg-gray-800 border-t border-gray-700 md:border md:rounded-lg shadow-2xl">
      <div className="p-3 space-y-3">
        {/* Total Price */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-300">Total Price</span>
          <span className="text-xl font-bold text-green-400">${totalPrice.toFixed(2)}</span>
        </div>

        {/* Missing-cards actions on their own row so 4 buttons never overflow
            the narrow desktop bar (they wrap under Total Price instead). */}
        {showMissingActions && (
          <div className="flex gap-2">
            <button
              onClick={onAddAllMissing}
              disabled={isAddingAll}
              className="flex-1 min-w-0 px-3 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors"
              title="Add missing cards to your collection"
            >
              {isAddingAll ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  <PackagePlus size={18} className="shrink-0" />
                  <span className="hidden sm:inline truncate">Missing to collection</span>
                </>
              )}
            </button>
            <button
              onClick={onAddMissingToWishlist}
              disabled={isAddingToWishlist}
              className="flex-1 min-w-0 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors"
              title="Add missing cards to your wishlist"
            >
              {isAddingToWishlist ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  <Heart size={18} className="shrink-0" />
                  <span className="hidden sm:inline truncate">Missing to wishlist</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Export + Save */}
        <div className="flex gap-2">
          <button
            onClick={onExport}
            disabled={exportDisabled}
            title="Export deck"
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg flex items-center justify-center transition-colors"
          >
            <Download size={18} />
          </button>
          <button
            onClick={onSave}
            disabled={saveDisabled}
            className="flex-1 min-w-0 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg flex items-center justify-center gap-2 text-sm font-medium relative transition-colors"
          >
            {isSaving ? (
              <>
                <Loader2 className="animate-spin text-white" size={18} />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save size={18} />
                <span>{isUpdate ? 'Update' : 'Save'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
