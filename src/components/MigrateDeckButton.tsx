import { useState } from 'react';
import { Database, Loader2 } from 'lucide-react';
import { migrateExistingDecks } from '../utils/migrateDeckData';

export default function MigrateDeckButton() {
  const [isMigrating, setIsMigrating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleMigrate = async () => {
    if (!confirm('This will update all existing decks with optimization data. Continue?')) {
      return;
    }

    setIsMigrating(true);
    setResult(null);

    try {
      await migrateExistingDecks();
      setResult('Migration completed successfully!');
    } catch (error) {
      console.error('Migration error:', error);
      setResult('Migration failed. Check console for details.');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
        <Database size={20} />
        Deck Migration Tool
      </h3>
      <p className="text-sm text-gray-400 mb-4">
        Update existing decks with optimization fields (cover image, validation cache, card count).
        Run this once after the database migration.
      </p>

      <button
        onClick={handleMigrate}
        disabled={isMigrating}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 transition-colors"
      >
        {isMigrating ? (
          <>
            <Loader2 className="animate-spin" size={20} />
            Migrating...
          </>
        ) : (
          <>
            <Database size={20} />
            Migrate Decks
          </>
        )}
      </button>

      {result && (
        <p className={`mt-3 text-sm ${result.includes('success') ? 'text-green-400' : 'text-red-400'}`}>
          {result}
        </p>
      )}
    </div>
  );
}
