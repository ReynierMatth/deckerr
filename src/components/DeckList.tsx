import React, { useEffect, useState } from 'react';
import { getCardById, getCardsByIds } from '../services/api';
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

      const decksWithCards = await Promise.all(decksData.map(async (deck) => {
        const { data: cardEntities, error: cardsError } = await supabase
          .from('deck_cards')
          .select('*')
          .eq('deck_id', deck.id);



        if (cardsError) {
          console.error(`Error fetching cards for deck ${deck.id}:`, cardsError);
          return { ...deck, cards: [] };
        }

        const cardIds = cardEntities.map((entity) => entity.card_id);
        const uniqueCardIds = [...new Set(cardIds)];

        if(deck.id === "410ed539-a8f4-4bc4-91f1-6c113b9b7e25"){
          console.log("uniqueCardIds", uniqueCardIds);
        }



        try {
          const scryfallCards = await getCardsByIds(uniqueCardIds);

          if (!scryfallCards) {
            console.error("scryfallCards is undefined after getCardsByIds");
            return { ...deck, cards: [] };
          }

          const cards = cardEntities.map((entity) => {
            const card = scryfallCards.find((c) => c.id === entity.card_id);
            return {
              card,
              quantity: entity.quantity,
              is_commander: entity.is_commander,
            };
          });

          return {
            ...deck,
            cards,
            createdAt: new Date(deck.created_at),
            updatedAt: new Date(deck.updated_at),
          };
        } catch (error) {
          console.error("Error fetching cards from Scryfall:", error);
          return { ...deck, cards: [] };
        }
      }));

      setDecks(decksWithCards);
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
