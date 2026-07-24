import { useState } from 'react';
import { Card, Deck, DeckVisibility } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { validateDeck } from '../utils/deckValidation';

interface UseDeckSaveParams {
  initialDeck?: Deck;
  onSave?: () => void;
  deckName: string;
  deckFormat: string;
  selectedCards: { card: Card; quantity: number; is_commander: boolean }[];
  tags: string[];
  commander: Card | null;
}

/**
 * Owns deck persistence: the current deck id, the visibility (persisted
 * immediately for already-saved decks) and the save/update flow.
 */
export function useDeckSave({
  initialDeck,
  onSave,
  deckName,
  deckFormat,
  selectedCards,
  tags,
  commander,
}: UseDeckSaveParams) {
  const { user } = useAuth();
  const toast = useToast();
  const [currentDeckId, setCurrentDeckId] = useState<string | null>(initialDeck?.id || null);
  const [visibility, setVisibility] = useState<DeckVisibility>(initialDeck?.visibility ?? 'private');
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Changing visibility applies immediately for an already-saved deck: the
   * share link is shown (and likely copied) right away, so waiting for the
   * next explicit Save would hand out links to a still-private deck. Keeps the
   * derived is_public flag in sync in the same update.
   */
  const setVisibilityPersisted = (v: DeckVisibility) => {
    setVisibility(v);
    if (currentDeckId) {
      supabase
        .from('decks')
        .update({ visibility: v, is_public: v !== 'private' })
        .eq('id', currentDeckId)
        .then(({ error }) => {
          if (error) {
            console.error('Error updating deck visibility:', error);
            toast.error('Failed to update deck visibility');
          }
        });
    }
  };

  const saveDeck = async () => {
    if (!deckName.trim() || selectedCards.length === 0 || !user) return;

    setIsSaving(true);
    try {
      const deckId = currentDeckId || crypto.randomUUID();
      const deckToSave: Deck = {
        id: deckId,
        name: deckName,
        format: deckFormat,
        cards: selectedCards,
        userId: user.id,
        createdAt: initialDeck?.createdAt || new Date(),
        updatedAt: new Date(),
        tags,
      };

      // Calculate validation for storage
      const validation = validateDeck(deckToSave);

      // Determine cover card (commander or first card)
      const commanderCard = deckFormat === 'commander' ? selectedCards.find(c => c.card.id === commander?.id) : null;
      const coverCard = commanderCard?.card || selectedCards[0]?.card;
      const coverCardId = coverCard?.id || null;

      // Calculate total card count
      const totalCardCount = selectedCards.reduce((acc, curr) => acc + curr.quantity, 0);

      const deckData = {
        id: deckToSave.id,
        name: deckToSave.name,
        format: deckToSave.format,
        user_id: deckToSave.userId,
        created_at: deckToSave.createdAt,
        updated_at: deckToSave.updatedAt,
        cover_card_id: coverCardId,
        validation_errors: validation.errors,
        is_valid: validation.isValid,
        card_count: totalCardCount,
        tags,
        visibility,
        is_public: visibility !== 'private',
      };

      // Save or update the deck
      const { error: deckError } = await supabase
        .from('decks')
        .upsert([deckData])
        .select();

      if (deckError) throw deckError;

      // Update current deck ID if this was a new deck
      if (!currentDeckId) {
        setCurrentDeckId(deckId);
      }

      // Delete existing cards if updating
      if (currentDeckId) {
        await supabase.from('deck_cards').delete().eq('deck_id', currentDeckId);
      }

      // Save the deck cards
      const deckCards = selectedCards.map(card => ({
        deck_id: deckToSave.id,
        card_id: card.card.id,
        quantity: card.quantity,
        is_commander: card.card.id === commander?.id,
      }));

      const { error: cardsError } = await supabase
        .from('deck_cards')
        .insert(deckCards);

      if (cardsError) throw cardsError;

      toast.success('Deck saved successfully!');
      if (onSave) onSave();
    } catch (error) {
      console.error('Error saving deck:', error);
      toast.error('Failed to save deck.');
    } finally {
      setIsSaving(false);
    }
  };

  return { currentDeckId, visibility, setVisibilityPersisted, isSaving, saveDeck };
}
