import React, { useEffect, useState } from 'react';
import { getCardById, getCardsByIds } from '../services/api';
import { Deck } from '../types';
import { supabase } from "../lib/supabase";
import DeckCard from "./DeckCard";

interface DeckListProps {
  onDeckEdit?: (deckId: string) => void;
}

const DeckList = ({ onDeckEdit }: DeckListProps) => {
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

        const scryfallCards = await getCardsByIds(uniqueCardIds);

        const cards = cardEntities.map((entity) => {
          const card = scryfallCards.find((c) => c.id === entity.card_id);
          return {
            card,
            quantity: entity.quantity,
          };
        });

        return {
          ...deck,
          cards,
          createdAt: new Date(deck.created_at),
          updatedAt: new Date(deck.updated_at),
        };
      }));

      setDecks(decksWithCards);
      setLoading(false);
    };

    fetchDecks();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {decks.map((deck) => (
        <DeckCard key={deck.id} deck={deck} onEdit={onDeckEdit} />
      ))}
    </div>
  );
};

export default DeckList;
