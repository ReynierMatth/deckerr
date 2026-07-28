import { describe, it, expect } from 'vitest';
import { scryfallToUnified } from './scryfallMapper';
import { ScryfallCard } from './scryfallTypes';

const base: ScryfallCard = {
  id: '0000579f-7b35-4ed3-b44c-db2a538066fe',
  name: 'Fury Sliver',
  layout: 'normal',
  image_uris: { small: 's.jpg', normal: 'n.jpg', large: 'l.jpg', art_crop: 'a.jpg', border_crop: 'b.jpg' },
  mana_cost: '{5}{R}',
  cmc: 6,
  type_line: 'Creature — Sliver',
  oracle_text: 'All Slivers have double strike.',
  colors: ['R'],
  color_identity: ['R'],
  set: 'tsp',
  set_name: 'Time Spiral',
  rarity: 'uncommon',
  collector_number: '157',
  lang: 'en',
  artist: 'Paolo Parente',
  prints_search_uri: 'https://api.scryfall.com/x',
  prices: { usd: '0.47', usd_foil: '5.99', eur: '0.30', eur_foil: '4.20' },
};

describe('scryfallToUnified', () => {
  it('maps identity, images, mtg fields and both price sources', () => {
    const u = scryfallToUnified(base);
    expect(u.id).toBe('mtg:0000579f-7b35-4ed3-b44c-db2a538066fe');
    expect(u.rawId).toBe(base.id);
    expect(u.game).toBe('mtg');
    expect(u.providerId).toBe('scryfall');
    expect(u.images).toEqual({ small: 's.jpg', normal: 'n.jpg', large: 'l.jpg', artCrop: 'a.jpg', borderCrop: 'b.jpg' });
    expect(u.mtg?.manaCost).toBe('{5}{R}');
    expect(u.mtg?.cmc).toBe(6);
    expect(u.mtg?.colorIdentity).toEqual(['R']);
    expect(u.prices?.tcgplayer).toEqual({ market: 0.47, foil: 5.99 });
    expect(u.prices?.cardmarket).toEqual({ market: 0.3, foil: 4.2 });
  });

  it('does not populate faces for single-faced (normal layout) cards', () => {
    const u = scryfallToUnified(base);
    expect(u.faces).toBeUndefined();
  });

  it('populates faces only for flippable double-faced layouts', () => {
    const dfc: ScryfallCard = {
      id: 'x',
      name: 'Delver of Secrets // Insectile Aberration',
      layout: 'transform',
      card_faces: [
        { name: 'Delver of Secrets', image_uris: { normal: 'front.jpg' } },
        { name: 'Insectile Aberration', image_uris: { normal: 'back.jpg' } },
      ],
    };
    const u = scryfallToUnified(dfc);
    expect(u.faces).toHaveLength(2);
    expect(u.faces?.[1]).toEqual({ name: 'Insectile Aberration', text: undefined, typeLine: undefined, images: { small: undefined, normal: 'back.jpg', large: undefined, artCrop: undefined, borderCrop: undefined } });
  });

  it('omits price sources that are entirely absent', () => {
    const u = scryfallToUnified({ id: 'y', name: 'No Price', prices: { usd: '1.00' } });
    expect(u.prices?.tcgplayer).toEqual({ market: 1, foil: undefined });
    expect(u.prices?.cardmarket).toBeUndefined();
  });
});
