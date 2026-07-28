import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCardsByIds, deleteDeck } from '../services/api';
import { Deck } from '../types';
import { GameId, enabledGames } from '../cards/domain/game';
import { supabase } from "../lib/supabase";
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import DeckCard from "./DeckCard";
import ConfirmModal from './ConfirmModal';
import Modal from './Modal';
import { PlusCircle } from 'lucide-react';

interface DeckListProps {
  onDeckEdit?: (deckId: string) => void;
  /** Called with the game chosen for the new deck (fixed for its life). */
  onCreateDeck?: (game: GameId) => void;
}

const fetchDecks = async (userId: string): Promise<Deck[]> => {
  // Only the signed-in user's own decks. RLS also allows reading other people's
  // *public* decks (for sharing/Discover), so this filter is required or they'd
  // leak into "My Decks".
  const { data: decksData, error: decksError } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', userId);
  if (decksError) throw decksError;

  // Fetch only cover cards (much lighter than loading every card in every deck).
  const coverCardIds = decksData.map((deck) => deck.cover_card_id).filter(Boolean);
  const coverCards = coverCardIds.length > 0 ? await getCardsByIds(coverCardIds) : [];

  return decksData.map((deck) => ({
    ...deck,
    cards: [],
    coverCard: deck.cover_card_id ? coverCards.find((c) => c.id === deck.cover_card_id) ?? null : null,
    createdAt: new Date(deck.created_at),
    updatedAt: new Date(deck.updated_at),
    validationErrors: deck.validation_errors || [],
    isValid: deck.is_valid ?? true,
    cardCount: deck.card_count || 0,
    coverCardId: deck.cover_card_id,
    tags: deck.tags ?? [],
  }));
};

const DeckList = ({ onDeckEdit, onCreateDeck }: DeckListProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [choosingGame, setChoosingGame] = useState(false);
  const { data: decks = [], isLoading } = useQuery({
    queryKey: ['decks', user?.id],
    enabled: !!user,
    queryFn: () => fetchDecks(user!.id),
    staleTime: 0, // always refetch on mount so newly created/edited decks appear
  });

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [gameFilter, setGameFilter] = useState<GameId | 'all'>('all');
  const [pendingDelete, setPendingDelete] = useState<Deck | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteDeck(pendingDelete.id);
      await queryClient.invalidateQueries({ queryKey: ['decks', user?.id] });
      toast.success('Deck supprimé');
      setPendingDelete(null);
    } catch (err) {
      console.error('delete deck failed:', err);
      toast.error('Échec de la suppression du deck');
    } finally {
      setDeleting(false);
    }
  };

  // Distinct tags across all of the user's decks, sorted for stable order.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    decks.forEach((deck) => (deck.tags ?? []).forEach((tag) => set.add(tag)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [decks]);

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );

  // Filter by game (TCG), then by tags (ANY-match on the selected tags).
  const visibleDecks = decks
    .filter((deck) => gameFilter === 'all' || deck.game === gameFilter)
    .filter((deck) =>
      selectedTags.length === 0 ? true : (deck.tags ?? []).some((tag) => selectedTags.includes(tag)),
    );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="loading-spinner h-32 w-32"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {enabledGames().length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {[{ id: 'all' as const, label: 'All' }, ...enabledGames()].map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGameFilter(g.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                gameFilter === g.id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400 mr-1">Filter (any):</span>
          {allTags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {tag}
              </button>
            );
          })}
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTags([])}
              className="px-3 py-1 rounded-full text-xs font-medium text-gray-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
        {visibleDecks.map((deck) => (
          <DeckCard key={deck.id} deck={deck} onEdit={onDeckEdit} onDelete={setPendingDelete} />
        ))}

        {/* Create New Deck Card */}
      <button
        onClick={() => {
          const games = enabledGames();
          if (games.length <= 1) onCreateDeck?.(games[0]?.id ?? 'mtg');
          else setChoosingGame(true);
        }}
        className="bg-gray-800 rounded-lg overflow-hidden shadow-lg hover:shadow-xl border-2 border-dashed border-gray-600 hover:border-blue-500 transition-all duration-300 hover:scale-105 cursor-pointer group aspect-[5/7] flex flex-col items-center justify-center gap-3 p-4"
      >
        <PlusCircle size={48} className="text-gray-600 group-hover:text-blue-500 transition-colors" />
        <div className="text-center">
          <h3 className="text-sm sm:text-base font-bold text-gray-400 group-hover:text-blue-400 transition-colors">
            Create New Deck
          </h3>
          <p className="text-xs text-gray-500 mt-1 hidden sm:block">
            Start building
          </p>
        </div>
        </button>
      </div>

      <Modal isOpen={choosingGame} onClose={() => setChoosingGame(false)} labelledBy="choose-game-title">
        <div className="p-4 space-y-3">
          <h2 id="choose-game-title" className="text-lg font-semibold text-white">New deck — choose a game</h2>
          <p className="text-sm text-gray-400">A deck belongs to one game; this can't be changed later.</p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            {enabledGames().map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  setChoosingGame(false);
                  onCreateDeck?.(g.id);
                }}
                className="p-4 rounded-lg border-2 border-gray-700 bg-gray-800 hover:border-blue-500 transition font-medium"
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Supprimer le deck ?"
        message={pendingDelete ? `« ${pendingDelete.name} » sera définitivement supprimé.` : ''}
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="danger"
        isLoading={deleting}
      />
    </div>
  );
};

export default DeckList;
