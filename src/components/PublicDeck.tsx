import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { User as UserIcon, Layers, Copy } from 'lucide-react';
import { Card } from '../types';
import { supabase } from '../lib/supabase';
import { getCardsByIds } from '../services/api';
import { getCardImageUri } from '../utils/cardFaces';
import { profileDisplayName, profileHandleLabel } from '../utils/profileName';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface PublicDeckProps {
  deckId: string;
}

interface PublicDeckData {
  name: string;
  format: string;
  tags: string[];
  cardCount: number;
  coverCardId: string | null;
  ownerName: string | null;
  ownerHandle: string | null;
  cards: { card: Card; quantity: number; is_commander: boolean; is_sideboard: boolean }[];
}

const fetchPublicDeck = async (deckId: string): Promise<PublicDeckData | null> => {
  // RLS returns the deck only when it is public (or owned by the viewer).
  const { data: deckData, error: deckError } = await supabase
    .from('decks')
    .select('*')
    .eq('id', deckId)
    .maybeSingle();
  if (deckError) throw deckError;
  if (!deckData) return null;

  const { data: cardEntities, error: cardsError } = await supabase
    .from('deck_cards')
    .select('*')
    .eq('deck_id', deckId);
  if (cardsError) throw cardsError;

  const entities = cardEntities ?? [];
  const uniqueCardIds = [...new Set(entities.map((entity) => entity.card_id as string))];
  const scryfallCards = uniqueCardIds.length > 0 ? await getCardsByIds(uniqueCardIds) : [];
  const cardById = new Map(scryfallCards.map((c) => [c.id, c]));

  const cards = entities
    .map((entity) => {
      const card = cardById.get(entity.card_id as string);
      if (!card) return null;
      return {
        card,
        quantity: entity.quantity as number,
        is_commander: Boolean(entity.is_commander),
        is_sideboard: Boolean(entity.is_sideboard),
      };
    })
    .filter((entry): entry is { card: Card; quantity: number; is_commander: boolean; is_sideboard: boolean } => entry !== null);

  let ownerName: string | null = null;
  let ownerHandle: string | null = null;
  if (deckData.user_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, display_name, handle')
      .eq('id', deckData.user_id)
      .maybeSingle();
    if (profile) {
      ownerName = profileDisplayName(profile);
      ownerHandle = profileHandleLabel(profile);
    }
  }

  return {
    name: deckData.name as string,
    format: deckData.format as string,
    tags: (deckData.tags as string[] | null) ?? [],
    cardCount: (deckData.card_count as number | null) ?? 0,
    coverCardId: (deckData.cover_card_id as string | null) ?? null,
    ownerName,
    ownerHandle,
    cards,
  };
};

/**
 * Copy a public deck into the viewer's own decks: a fresh deck row (private,
 * new uuid, "(copy)" suffix) plus a copy of every deck_cards row.
 */
const cloneDeck = async (deck: PublicDeckData, userId: string): Promise<string> => {
  const newDeckId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: deckError } = await supabase.from('decks').insert({
    id: newDeckId,
    name: `${deck.name} (copy)`,
    format: deck.format,
    user_id: userId,
    created_at: now,
    updated_at: now,
    cover_card_id: deck.coverCardId,
    card_count: deck.cardCount,
    tags: deck.tags,
    is_public: false,
  });
  if (deckError) throw deckError;

  if (deck.cards.length > 0) {
    const rows = deck.cards.map(({ card, quantity, is_commander, is_sideboard }) => ({
      deck_id: newDeckId,
      card_id: card.id,
      quantity,
      is_commander,
      is_sideboard,
    }));
    const { error: cardsError } = await supabase.from('deck_cards').insert(rows);
    if (cardsError) {
      // Best-effort cleanup so a half-cloned deck doesn't linger.
      await supabase.from('decks').delete().eq('id', newDeckId);
      throw cardsError;
    }
  }

  return newDeckId;
};

export default function PublicDeck({ deckId }: PublicDeckProps) {
  // Both providers wrap the router in App.tsx, so they are mounted even for
  // signed-out visitors on this public route (user is just null then).
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['publicDeck', deckId],
    queryFn: () => fetchPublicDeck(deckId),
  });

  const cloneMutation = useMutation({
    mutationFn: ({ deck, userId }: { deck: PublicDeckData; userId: string }) =>
      cloneDeck(deck, userId),
    onSuccess: (newDeckId) => {
      toast.success('Deck cloned to your decks!');
      // DeckList reads the ['decks'] key — refetch so the clone shows up there.
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      navigate({ to: '/decks/$deckId/edit', params: { deckId: newDeckId } });
    },
    onError: (error) => {
      console.error('Error cloning deck:', error);
      toast.error('Failed to clone deck.');
    },
  });

  const handleClone = () => {
    if (!data || cloneMutation.isPending) return;
    if (!user) {
      toast.info('Sign in to clone this deck');
      return;
    }
    cloneMutation.mutate({ deck: data, userId: user.id });
  };

  if (isLoading) {
    return (
      <div className="relative md:min-h-screen bg-gray-900 text-white p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="relative md:min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-md mx-auto mt-10 bg-gray-800 border border-gray-700 rounded-lg p-6 text-center">
          <h2 className="text-xl font-bold text-white mb-2">This deck isn't available</h2>
          <p className="text-gray-400 text-sm">
            It may be private, or the link may be incorrect.
          </p>
        </div>
      </div>
    );
  }

  const totalCards = data.cards.reduce((acc, { quantity }) => acc + quantity, 0);

  return (
    <div className="relative bg-gray-900 text-white p-3 sm:p-6 md:min-h-screen">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 sm:p-6">
          <h1 className="text-2xl sm:text-3xl font-bold break-words">{data.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
            <span className="inline-flex items-center gap-1.5 capitalize">
              <Layers size={16} /> {data.format}
            </span>
            {data.ownerName && (
              <span className="inline-flex items-center gap-1.5">
                <UserIcon size={16} /> {data.ownerName}
                {data.ownerHandle && <span className="text-gray-500">{data.ownerHandle}</span>}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">{totalCards} cards</span>
          </div>
          {data.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-blue-600/20 border border-blue-500/40 text-blue-200 rounded-full text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <button
            onClick={handleClone}
            disabled={cloneMutation.isPending}
            className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] px-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            <Copy size={18} />
            {cloneMutation.isPending ? 'Cloning...' : 'Clone to my decks'}
          </button>
        </div>

        {/* Card grid */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {data.cards.map(({ card, quantity }) => {
            const imageUri = getCardImageUri(card);
            return (
              <div key={card.id} className="relative">
                {imageUri ? (
                  <img
                    src={imageUri}
                    alt={card.name}
                    loading="lazy"
                    className="w-full rounded-lg border border-gray-700"
                  />
                ) : (
                  <div className="w-full aspect-[5/7] rounded-lg border border-gray-700 bg-gray-800 flex items-center justify-center p-2 text-center text-xs text-gray-300">
                    {card.name}
                  </div>
                )}
                <span className="absolute top-1.5 right-1.5 min-w-[1.5rem] px-1.5 py-0.5 text-center text-xs font-bold text-white bg-black/80 rounded-full">
                  {quantity}
                </span>
              </div>
            );
          })}
        </div>

        {data.cards.length === 0 && (
          <p className="mt-6 text-center text-gray-400">This deck has no cards.</p>
        )}
      </div>
    </div>
  );
}
