import { useQuery } from '@tanstack/react-query';
import { Loader2, Sparkles, ArrowLeftRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getTradeSuggestions, FriendTradeSuggestion } from '../../services/tradeSuggestionsService';
import { getCardsByIds } from '../../services/api';
import { getCardImageUri } from '../../utils/cardFaces';
import { profileDisplayName, profileHandleLabel } from '../../utils/profileName';
import { Card } from '../../types';

interface TradeSuggestionsData {
  suggestions: FriendTradeSuggestion[];
  cardsById: Map<string, Card>;
}

const EMPTY_SUGGESTIONS: FriendTradeSuggestion[] = [];
const EMPTY_CARDS: Map<string, Card> = new Map();

/** A wrapping, tap-friendly grid of small card thumbnails. */
function CardGrid({ cardIds, cardsById }: { cardIds: string[]; cardsById: Map<string, Card> }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 sm:gap-2">
      {cardIds.map((id) => {
        const card = cardsById.get(id);
        const imageUri = card ? getCardImageUri(card) : undefined;
        const name = card?.name ?? 'Unknown card';
        return (
          <div key={id} className="min-w-0">
            <div className="relative rounded-lg overflow-hidden bg-gray-900 shadow aspect-[63/88]">
              {imageUri ? (
                <img src={imageUri} alt={name} loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center p-1 text-center text-[10px] text-gray-400">
                  {name}
                </div>
              )}
            </div>
            <div className="mt-1 truncate px-0.5 text-center text-[10px] sm:text-xs text-gray-300">
              {name}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Cross-matched trade suggestions with each friend, based on wishlists & collections. */
export default function TradeSuggestions() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery<TradeSuggestionsData>({
    queryKey: ['tradeSuggestions', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<TradeSuggestionsData> => {
      if (!user) return { suggestions: EMPTY_SUGGESTIONS, cardsById: EMPTY_CARDS };
      const suggestions = await getTradeSuggestions(user.id);

      const idSet = new Set<string>();
      suggestions.forEach((s) => {
        s.theyHaveIWant.forEach((id) => idSet.add(id));
        s.iHaveTheyWant.forEach((id) => idSet.add(id));
      });

      const cardsById = new Map<string, Card>();
      if (idSet.size > 0) {
        const cards = await getCardsByIds([...idSet]);
        cards.forEach((card) => cardsById.set(card.id, card));
      }

      return { suggestions, cardsById };
    },
  });

  const suggestions = data?.suggestions ?? EMPTY_SUGGESTIONS;
  const cardsById = data?.cardsById ?? EMPTY_CARDS;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-gray-400">
        <Sparkles size={40} className="text-gray-600" />
        <p className="text-sm max-w-xs">
          No trade matches yet — add cards to your wishlist and add friends.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {suggestions.map((suggestion) => (
        <div key={suggestion.friendId} className="rounded-lg bg-gray-800 p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-2">
            <ArrowLeftRight size={18} className="flex-shrink-0 text-blue-400" />
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold sm:text-lg">
                {profileDisplayName({
                  display_name: suggestion.friendDisplayName,
                  handle: suggestion.friendHandle,
                  username: suggestion.friendUsername,
                })}
              </h3>
              {profileHandleLabel({ handle: suggestion.friendHandle }) && (
                <p className="truncate text-xs text-gray-400">
                  {profileHandleLabel({ handle: suggestion.friendHandle })}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {suggestion.theyHaveIWant.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-green-400">
                  They have (in your wishlist)
                </p>
                <CardGrid cardIds={suggestion.theyHaveIWant} cardsById={cardsById} />
              </div>
            )}

            {suggestion.iHaveTheyWant.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-blue-400">
                  You have (in their wishlist)
                </p>
                <CardGrid cardIds={suggestion.iHaveTheyWant} cardsById={cardsById} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
