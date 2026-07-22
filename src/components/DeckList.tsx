import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCardsByIds } from '../services/api';
import { Deck } from '../types';
import { supabase } from "../lib/supabase";
import DeckCard from "./DeckCard";
import { PlusCircle } from 'lucide-react';

interface DeckListProps {
  onDeckEdit?: (deckId: string) => void;
  onCreateDeck?: () => void;
}

const fetchDecks = async (): Promise<Deck[]> => {
  const { data: decksData, error: decksError } = await supabase.from('decks').select('*');
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
  const { data: decks = [], isLoading } = useQuery({
    queryKey: ['decks'],
    queryFn: fetchDecks,
    staleTime: 0, // always refetch on mount so newly created/edited decks appear
  });

  const [selectedTags, setSelectedTags] = useState<string[]>([]);

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

  // ANY-match: show decks that have at least one of the selected tags.
  const visibleDecks =
    selectedTags.length === 0
      ? decks
      : decks.filter((deck) =>
          (deck.tags ?? []).some((tag) => selectedTags.includes(tag))
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
          <DeckCard key={deck.id} deck={deck} onEdit={onDeckEdit} />
        ))}

        {/* Create New Deck Card */}
      <button
        onClick={onCreateDeck}
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
    </div>
  );
};

export default DeckList;
