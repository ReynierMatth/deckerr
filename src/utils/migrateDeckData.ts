import { supabase } from '../lib/supabase';
import { getCardsByIds } from '../services/api';
import { validateDeck } from './deckValidation';
import { Deck, Card } from '../types';

/**
 * Migrate existing decks to include optimization fields
 * This should be run once to update all existing decks
 */
export async function migrateExistingDecks() {
  console.log('Starting deck migration...');

  // Get all decks
  const { data: decksData, error: decksError } = await supabase
    .from('decks')
    .select('*');

  if (decksError) {
    console.error('Error fetching decks:', decksError);
    return;
  }

  console.log(`Found ${decksData.length} decks to migrate`);

  for (const deck of decksData) {
    // Skip if already migrated
    if (deck.cover_card_id && deck.card_count !== null) {
      console.log(`Deck ${deck.name} already migrated, skipping`);
      continue;
    }

    console.log(`Migrating deck: ${deck.name}`);

    // Get deck cards
    const { data: cardEntities, error: cardsError } = await supabase
      .from('deck_cards')
      .select('*')
      .eq('deck_id', deck.id);

    if (cardsError || !cardEntities || cardEntities.length === 0) {
      console.error(`Error fetching cards for deck ${deck.id}:`, cardsError);
      continue;
    }

    const cardIds = cardEntities.map(entity => entity.card_id);
    const uniqueCardIds = [...new Set(cardIds)];

    try {
      // Fetch cards from Scryfall
      const scryfallCards = await getCardsByIds(uniqueCardIds);

      if (!scryfallCards) {
        console.error(`Failed to fetch cards for deck ${deck.id}`);
        continue;
      }

      const cards = cardEntities
        .map(entity => {
          const card = scryfallCards.find(c => c.id === entity.card_id);
          if (!card) return null;
          return {
            card,
            quantity: Number(entity.quantity),
            is_commander: Boolean(entity.is_commander),
          };
        })
        .filter((c): c is { card: Card; quantity: number; is_commander: boolean } => c !== null);

      // Create deck object for validation
      const deckToValidate: Deck = {
        id: deck.id,
        name: deck.name,
        format: deck.format,
        cards,
        userId: deck.user_id,
        createdAt: new Date(deck.created_at),
        updatedAt: new Date(deck.updated_at),
      };

      // Calculate validation
      const validation = validateDeck(deckToValidate);

      // Determine cover card (commander or first card)
      const commanderCard = deck.format === 'commander'
        ? cardEntities.find(c => c.is_commander)
        : null;
      const coverCardId = commanderCard
        ? commanderCard.card_id
        : cardEntities[0]?.card_id || null;

      // Calculate total card count
      const totalCardCount = cardEntities.reduce((acc, curr) => acc + curr.quantity, 0);

      // Update deck with optimization fields
      const { error: updateError } = await supabase
        .from('decks')
        .update({
          cover_card_id: coverCardId,
          validation_errors: validation.errors,
          is_valid: validation.isValid,
          card_count: totalCardCount,
        })
        .eq('id', deck.id);

      if (updateError) {
        console.error(`Error updating deck ${deck.id}:`, updateError);
      } else {
        console.log(`✓ Migrated deck: ${deck.name}`);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error processing deck ${deck.id}:`, error);
    }
  }

  console.log('Migration complete!');
}
