# Collection API Documentation

## Overview

This document describes the backend API implementation for managing user card collections in the Deckerr application. The implementation uses Supabase as the backend service with Row Level Security (RLS) enabled to ensure users can only access their own collection data.

## Architecture

### Database Schema

The collection feature uses the existing `collections` table with the following structure:

```sql
CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  card_id text NOT NULL,
  quantity integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### Security

- **Authentication**: All endpoints require the user to be authenticated via Supabase Auth
- **Authorization**: Row Level Security (RLS) policies ensure users can only access their own collections
- **Validation**: Input validation is performed on all operations to prevent invalid data

## API Service

### Location

- **Service File**: `/home/node/projects/deckerr/src/services/collectionService.ts`
- **Hook File**: `/home/node/projects/deckerr/src/hooks/useCollection.ts`

### Core Functions

#### 1. getUserCollection()

Get all cards in the authenticated user's collection.

**Returns**: `Promise<CollectionCard[]>`

**Example**:
```typescript
import { getUserCollection } from '../services/collectionService';

const collection = await getUserCollection();
// Returns: [{ id, user_id, card_id, quantity, created_at, updated_at }, ...]
```

---

#### 2. getCardInCollection(cardId: string)

Check if a single card exists in the user's collection.

**Parameters**:
- `cardId` (string): The Scryfall card ID

**Returns**: `Promise<CollectionCard | null>`

**Example**:
```typescript
import { getCardInCollection } from '../services/collectionService';

const card = await getCardInCollection('card-uuid-123');
// Returns: { id, user_id, card_id, quantity, created_at, updated_at } or null
```

---

#### 3. checkCardsOwnership(cardIds: string[])

Check ownership status for multiple cards at once.

**Parameters**:
- `cardIds` (string[]): Array of Scryfall card IDs

**Returns**: `Promise<Map<string, number>>`

**Example**:
```typescript
import { checkCardsOwnership } from '../services/collectionService';

const ownership = await checkCardsOwnership(['card-1', 'card-2', 'card-3']);
// Returns: Map { 'card-1' => 4, 'card-2' => 2, 'card-3' => 0 }
```

---

#### 4. getDeckCardOwnership(deckId: string)

Get detailed ownership information for all cards in a specific deck.

**Parameters**:
- `deckId` (string): The deck ID

**Returns**: `Promise<CardOwnershipInfo[]>`

**Response Type**:
```typescript
interface CardOwnershipInfo {
  card_id: string;
  owned: boolean;                    // true if user has enough copies
  quantity_in_collection: number;    // how many user owns
  quantity_in_deck: number;          // how many needed for deck
  quantity_needed: number;           // how many more needed
}
```

**Example**:
```typescript
import { getDeckCardOwnership } from '../services/collectionService';

const ownership = await getDeckCardOwnership('deck-uuid-123');
// Returns: [
//   { card_id: 'card-1', owned: true, quantity_in_collection: 4, quantity_in_deck: 2, quantity_needed: 0 },
//   { card_id: 'card-2', owned: false, quantity_in_collection: 1, quantity_in_deck: 3, quantity_needed: 2 }
// ]
```

**Security**: Verifies that the user owns the deck before returning ownership info.

---

#### 5. getMissingCardsFromDeck(deckId: string)

Get only the cards that are missing from a deck (quantity needed > 0).

**Parameters**:
- `deckId` (string): The deck ID

**Returns**: `Promise<MissingCardInfo[]>`

**Response Type**:
```typescript
interface MissingCardInfo {
  card_id: string;
  quantity_needed: number;
  quantity_in_collection: number;
}
```

**Example**:
```typescript
import { getMissingCardsFromDeck } from '../services/collectionService';

const missingCards = await getMissingCardsFromDeck('deck-uuid-123');
// Returns: [
//   { card_id: 'card-2', quantity_needed: 2, quantity_in_collection: 1 },
//   { card_id: 'card-5', quantity_needed: 4, quantity_in_collection: 0 }
// ]
```

---

#### 6. addCardToCollection(cardId: string, quantity?: number)

Add a single card to the user's collection. If the card already exists, increments the quantity.

**Parameters**:
- `cardId` (string): The Scryfall card ID
- `quantity` (number, optional): Quantity to add (default: 1)

**Returns**: `Promise<CollectionCard>`

**Validation**:
- Card ID must be a non-empty string
- Quantity must be at least 1

**Example**:
```typescript
import { addCardToCollection } from '../services/collectionService';

const result = await addCardToCollection('card-uuid-123', 2);
// Returns: { id, user_id, card_id, quantity, created_at, updated_at }
```

---

#### 7. addCardsToCollectionBulk(cards: Array<{card_id: string, quantity: number}>)

Add multiple cards to the collection in a single operation. More efficient than multiple individual calls.

**Parameters**:
- `cards` (Array): Array of objects with `card_id` and `quantity`

**Returns**: `Promise<Array<{card_id: string, success: boolean, error?: string}>>`

**Features**:
- Automatically merges with existing collection entries
- Processes in batches of 1000 for optimal performance
- Returns individual success/failure status for each card

**Example**:
```typescript
import { addCardsToCollectionBulk } from '../services/collectionService';

const cards = [
  { card_id: 'card-1', quantity: 4 },
  { card_id: 'card-2', quantity: 2 },
  { card_id: 'card-3', quantity: 1 }
];

const results = await addCardsToCollectionBulk(cards);
// Returns: [
//   { card_id: 'card-1', success: true },
//   { card_id: 'card-2', success: true },
//   { card_id: 'card-3', success: false, error: 'Database error' }
// ]
```

---

#### 8. addMissingDeckCardsToCollection(deckId: string)

Convenience function to add all missing cards from a deck to the collection in one operation.

**Parameters**:
- `deckId` (string): The deck ID

**Returns**: `Promise<Array<{card_id: string, success: boolean, error?: string}>>`

**Security**: Verifies deck ownership before adding cards.

**Example**:
```typescript
import { addMissingDeckCardsToCollection } from '../services/collectionService';

const results = await addMissingDeckCardsToCollection('deck-uuid-123');
// Returns: [
//   { card_id: 'card-1', success: true },
//   { card_id: 'card-2', success: true }
// ]
```

---

#### 9. removeCardFromCollection(cardId: string, quantity?: number)

Remove a card from the collection, or decrease its quantity.

**Parameters**:
- `cardId` (string): The Scryfall card ID
- `quantity` (number, optional): Quantity to remove. If not specified or >= existing quantity, removes the card entirely.

**Returns**: `Promise<boolean>`

**Example**:
```typescript
import { removeCardFromCollection } from '../services/collectionService';

// Remove 2 copies
await removeCardFromCollection('card-uuid-123', 2);

// Remove card entirely
await removeCardFromCollection('card-uuid-123');
```

---

## React Hook: useCollection

A custom hook that wraps the collection service with state management, loading states, and error handling.

### Usage

```typescript
import { useCollection } from '../hooks/useCollection';

function MyComponent() {
  const {
    loading,
    error,
    clearError,
    getCollection,
    checkCardOwnership,
    checkMultipleCardsOwnership,
    getDeckOwnership,
    getMissingCards,
    addCard,
    addCardsBulk,
    addMissingDeckCards,
    removeCard
  } = useCollection();

  // Use the functions
  const handleAddCard = async (cardId: string) => {
    const success = await addCard(cardId, 1);
    if (success) {
      console.log('Card added successfully!');
    } else {
      console.error('Error:', error);
    }
  };

  return (
    <div>
      {loading && <p>Loading...</p>}
      {error && <p>Error: {error}</p>}
      {/* Your component UI */}
    </div>
  );
}
```

### Hook API

All functions from the service are available with the same signatures, plus:

- `loading` (boolean): True when any operation is in progress
- `error` (string | null): Error message if an operation failed
- `clearError` (() => void): Function to clear the error state

---

## Error Handling

All functions include comprehensive error handling:

1. **Authentication Errors**: Thrown if user is not authenticated
2. **Authorization Errors**: Thrown if user tries to access data they don't own
3. **Validation Errors**: Thrown if input parameters are invalid
4. **Database Errors**: Supabase errors are caught and wrapped with user-friendly messages

**Example Error Handling**:
```typescript
try {
  await addCardToCollection('invalid-card', -5);
} catch (error) {
  console.error(error.message); // "Quantity must be at least 1"
}
```

---

## Performance Considerations

1. **Bulk Operations**: Use `addCardsToCollectionBulk()` for adding multiple cards instead of calling `addCardToCollection()` in a loop.

2. **Batch Size**: Bulk operations are automatically batched at 1000 cards to optimize database performance.

3. **Caching**: Consider implementing client-side caching for collection data that doesn't change frequently.

4. **RLS Performance**: Supabase RLS policies are indexed on `user_id` for optimal query performance.

---

## Integration Examples

### Example 1: Show Missing Cards in Deck Editor

```typescript
import { useEffect, useState } from 'react';
import { useCollection } from '../hooks/useCollection';
import { CardOwnershipInfo } from '../services/collectionService';

function DeckEditorWithCollection({ deckId }: { deckId: string }) {
  const { getDeckOwnership, loading } = useCollection();
  const [ownership, setOwnership] = useState<CardOwnershipInfo[]>([]);

  useEffect(() => {
    const fetchOwnership = async () => {
      const data = await getDeckOwnership(deckId);
      if (data) setOwnership(data);
    };
    fetchOwnership();
  }, [deckId]);

  return (
    <div>
      <h2>Deck Cards</h2>
      {loading && <p>Loading...</p>}
      {ownership.map(card => (
        <div key={card.card_id}>
          <p>Card: {card.card_id}</p>
          {!card.owned && (
            <p className="text-red-500">
              Missing {card.quantity_needed} copies
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Example 2: Add All Missing Cards Button

```typescript
import { useCollection } from '../hooks/useCollection';

function AddAllMissingButton({ deckId }: { deckId: string }) {
  const { addMissingDeckCards, loading, error } = useCollection();

  const handleAddAll = async () => {
    const results = await addMissingDeckCards(deckId);
    if (results) {
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      alert(`Added ${successCount} cards. ${failCount} failed.`);
    }
  };

  return (
    <div>
      <button onClick={handleAddAll} disabled={loading}>
        {loading ? 'Adding...' : 'Add All Missing Cards'}
      </button>
      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
}
```

### Example 3: Add Individual Card Button

```typescript
import { useCollection } from '../hooks/useCollection';

function AddCardButton({ cardId, quantity }: { cardId: string; quantity: number }) {
  const { addCard, loading } = useCollection();

  const handleAdd = async () => {
    const success = await addCard(cardId, quantity);
    if (success) {
      alert('Card added to collection!');
    }
  };

  return (
    <button onClick={handleAdd} disabled={loading}>
      {loading ? 'Adding...' : `Add ${quantity} to Collection`}
    </button>
  );
}
```

---

## Testing

The project currently has no automated tests configured. To manually test the collection API:

1. **Build the project**: `npm run build` - Verifies TypeScript compilation
2. **Run the linter**: `npm run lint` - Checks code quality
3. **Manual testing**: Start the dev server with `npm run dev` and test through the UI

### Manual Test Checklist

- [ ] Add a single card to collection
- [ ] Add the same card again (should increment quantity)
- [ ] Add multiple cards in bulk
- [ ] View collection
- [ ] Check card ownership for a deck
- [ ] Add missing cards from a deck
- [ ] Remove a card from collection
- [ ] Verify RLS: User A cannot see User B's collection

---

## Future Enhancements

1. **Caching**: Add client-side caching to reduce database queries
2. **Optimistic Updates**: Update UI immediately before server confirmation
3. **Websocket Updates**: Real-time collection updates using Supabase Realtime
4. **Import/Export**: Bulk import collection from CSV or other formats
5. **Statistics**: Track collection value, completion percentage, etc.
6. **Trade Lists**: Mark cards as available for trade
7. **Wishlists**: Separate table for cards user wants to acquire

---

## Support

For issues or questions:
- Check Supabase logs for backend errors
- Review browser console for client-side errors
- Verify authentication status
- Check RLS policies in Supabase dashboard
