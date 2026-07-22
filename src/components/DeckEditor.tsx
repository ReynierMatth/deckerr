import { useQuery } from '@tanstack/react-query';
import { Card, Deck } from '../types';
import DeckManager from './DeckManager';
import { supabase } from '../lib/supabase';
import { getCardsByIds } from '../services/api';

interface DeckEditorProps {
  deckId: string;
  onClose?: () => void;
}

const fetchDeck = async (deckId: string): Promise<Deck> => {
  const { data: deckData, error: deckError } = await supabase
    .from('decks')
    .select('*')
    .eq('id', deckId)
    .single();
  if (deckError) throw deckError;

  const { data: cardEntities, error: cardsError } = await supabase
    .from('deck_cards')
    .select('*')
    .eq('deck_id', deckId);
  if (cardsError) throw cardsError;

  const uniqueCardIds = [...new Set(cardEntities.map((entity) => entity.card_id))];
  const scryfallCards = await getCardsByIds(uniqueCardIds);

  const cards = cardEntities.map((entity) => ({
    card: scryfallCards.find((c) => c.id === entity.card_id) as Card,
    quantity: entity.quantity,
    is_commander: entity.is_commander,
  }));

  return {
    ...deckData,
    cards,
    createdAt: new Date(deckData.created_at),
    updatedAt: new Date(deckData.updated_at),
  };
};

export default function DeckEditor({ deckId, onClose }: DeckEditorProps) {
  const { data: deck, isLoading: loading } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => fetchDeck(deckId),
    staleTime: 0, // refetch on mount so edits made elsewhere are reflected
  });

  if (loading) {
    return (
      <div className="relative md:min-h-screen bg-gray-900 text-white p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="relative md:min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
            <h2 className="text-xl font-bold text-red-500">Error</h2>
            <p className="text-red-400">Failed to load deck</p>
          </div>
        </div>
      </div>
    );
  }

  return <DeckManager initialDeck={deck} onSave={onClose} />;
}
