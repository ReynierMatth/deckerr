import { Card } from '../types';

export type DeckColorKey = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

export interface DeckStats {
  totalCards: number;
  landCount: number;
  nonLandCount: number;
  averageCmc: number;
  /** Non-land card counts bucketed by converted mana cost (7 = "7+"). */
  manaCurve: { cmc: number; label: string; count: number }[];
  /** Card counts per color (multicolour cards count once per colour; C = colourless). */
  colorCounts: Record<DeckColorKey, number>;
  /** Card counts per primary card type. */
  typeCounts: { type: string; count: number }[];
}

const TYPE_PRIORITY = [
  'Land',
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
];

const isLand = (card: Card): boolean => /\bLand\b/i.test(card.type_line ?? '');

/** The single card type a card is filed under (Land wins over Creature, etc.). */
export const primaryType = (card: Card): string => {
  const line = card.type_line ?? '';
  const match = TYPE_PRIORITY.find((t) => new RegExp(`\\b${t}\\b`, 'i').test(line));
  return match ?? 'Other';
};

/** Order card-type sections are shown in (Moxfield-style: spells first, lands last). */
export const TYPE_DISPLAY_ORDER = [
  'Creature',
  'Planeswalker',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Battle',
  'Land',
  'Other',
] as const;

export interface CardTypeGroup<T> {
  type: string;
  /** Sum of quantities in this group. */
  count: number;
  entries: T[];
}

/**
 * Group (card, quantity) entries by primary card type, in TYPE_DISPLAY_ORDER.
 * Within a group, entries keep their incoming order. Pure.
 */
export function groupCardsByType<T extends { card: Card; quantity: number }>(
  entries: T[],
): CardTypeGroup<T>[] {
  const groups = new Map<string, CardTypeGroup<T>>();
  for (const entry of entries) {
    if (entry.quantity <= 0) continue;
    const type = primaryType(entry.card);
    const group = groups.get(type) ?? { type, count: 0, entries: [] };
    group.count += entry.quantity;
    group.entries.push(entry);
    groups.set(type, group);
  }
  return TYPE_DISPLAY_ORDER.filter((t) => groups.has(t)).map((t) => groups.get(t)!);
}

/** Compute deck composition stats from (card, quantity) entries. Pure. */
export function computeDeckStats(cards: { card: Card; quantity: number }[]): DeckStats {
  const colorCounts: Record<DeckColorKey, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const typeMap = new Map<string, number>();
  const curveBuckets = new Map<number, number>();

  let totalCards = 0;
  let landCount = 0;
  let cmcWeightedSum = 0;
  let nonLandCount = 0;

  for (const { card, quantity } of cards) {
    if (quantity <= 0) continue;
    totalCards += quantity;

    // Types
    const type = primaryType(card);
    typeMap.set(type, (typeMap.get(type) ?? 0) + quantity);

    // Colors (a multicolour card counts in each of its colours; none => colourless)
    const colors = (card.colors ?? []).filter((c): c is DeckColorKey => c in colorCounts);
    if (colors.length === 0) {
      colorCounts.C += quantity;
    } else {
      for (const c of colors) colorCounts[c] += quantity;
    }

    if (isLand(card)) {
      landCount += quantity;
    } else {
      nonLandCount += quantity;
      const cmc = Math.max(0, Math.floor(card.cmc ?? 0));
      cmcWeightedSum += cmc * quantity;
      const bucket = Math.min(cmc, 7); // 7 = "7+"
      curveBuckets.set(bucket, (curveBuckets.get(bucket) ?? 0) + quantity);
    }
  }

  const manaCurve = Array.from({ length: 8 }, (_, cmc) => ({
    cmc,
    label: cmc === 7 ? '7+' : String(cmc),
    count: curveBuckets.get(cmc) ?? 0,
  }));

  const typeCounts = [...typeMap.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalCards,
    landCount,
    nonLandCount,
    averageCmc: nonLandCount > 0 ? cmcWeightedSum / nonLandCount : 0,
    manaCurve,
    colorCounts,
    typeCounts,
  };
}
