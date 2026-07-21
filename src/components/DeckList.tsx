import { useEffect, useState } from 'react';
import { getCardsByIds } from '../services/api';
import { Deck } from '../types';
import { supabase } from "../lib/supabase";
import DeckCard from "./DeckCard";
import { PlusCircle } from 'lucide-react';

interface DeckListProps {
  onDeckEdit?: (deckId: string) => void;
  onCreateDeck?: () => void;
}

const DeckList = ({ onDeckEdit, onCreateDeck }: DeckListProps) => {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDecks = async () => {
      const { data: decksData, error: decksError } = await supabase.from('decks').select('*');
      if (decksError) {
        console.error('Error fetching decks:', decksError);
        setLoading(false);
        return;
      }

      // Get all unique cover card IDs
      const coverCardIds = decksData
        .map(deck => deck.cover_card_id)
        .filter(Boolean);

      // Fetch only cover cards (much lighter!)
      const coverCards = coverCardIds.length > 0
        ? await getCardsByIds(coverCardIds)
        : [];

      // Map decks with their cover cards
      const decksWithCoverCards = decksData.map(deck => {
        const coverCard = deck.cover_card_id
          ? coverCards.find(c => c.id === deck.cover_card_id)
          : null;

        return {
          ...deck,
          cards: [], // Empty array, we don't load all cards here
          coverCard: coverCard || null,
          createdAt: new Date(deck.created_at),
          updatedAt: new Date(deck.updated_at),
          validationErrors: deck.validation_errors || [],
          isValid: deck.is_valid ?? true,
          cardCount: deck.card_count || 0,
          coverCardId: deck.cover_card_id,
        };
      });

      setDecks(decksWithCoverCards);
      setLoading(false);
    };

    fetchDecks();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="loading-spinner h-32 w-32"></div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
      {decks.map((deck) => (
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
  );
};

export default DeckList;
