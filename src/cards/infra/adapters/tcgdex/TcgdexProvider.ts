/**
 * Pokémon fallback provider — TCGdex v2 adapter (no API key, multilingual).
 *
 * Used behind pokemontcg.io via FallbackCardProvider. Search returns "brief"
 * cards (id/name/image only); a by-id fetch returns the full card with both
 * price sources. No batch endpoint — id/name lookups fan out per item.
 */

import { CardProvider, SetNumberRef } from '../../../domain/ports/CardProvider';
import { SearchQuery, SearchResult } from '../../../domain/ports/SearchQuery';
import { UnifiedCard } from '../../../domain/UnifiedCard';
import { TcgdexBrief, TcgdexCard } from './tcgdexTypes';
import { tcgdexToUnified, TCGDEX_PROVIDER_ID } from './tcgdexMapper';

export class TcgdexProvider implements CardProvider {
  readonly game = 'pokemon' as const;
  readonly id = TCGDEX_PROVIDER_ID;
  /** Default locale (from config); a search can override it per request. */
  constructor(private readonly lang = 'fr') {}

  // TCGdex localizes everything (names, text, images) by URL locale.
  private base(lang?: string): string {
    return `https://api.tcgdex.net/v2/${lang ?? this.lang}`;
  }

  private async get<T>(path: string, signal?: AbortSignal, lang?: string): Promise<T> {
    const res = await fetch(`${this.base(lang)}${path}`, { headers: { Accept: 'application/json' }, signal });
    if (!res.ok) throw new Error(`tcgdex request failed (${res.status})`);
    return (await res.json()) as T;
  }

  async search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResult> {
    const text = (typeof query.raw?.tcgdex === 'string' ? query.raw.tcgdex : query.text)?.trim();
    if (!text) return { cards: [], hasMore: false };
    const path = `/cards?name=${encodeURIComponent(text)}`;
    // Optional per-search language override (from the search UI).
    const lang = typeof query.raw?.lang === 'string' ? query.raw.lang : undefined;
    let briefs = await this.get<TcgdexBrief[]>(path, signal, lang);
    // A localized search misses cross-language names (e.g. "charizard" in the
    // French DB, where it's "Dracaufeu"). Retry in English — reliable, and
    // English names are the common denominator.
    const effectiveLang = lang ?? this.lang;
    if ((briefs?.length ?? 0) === 0 && effectiveLang !== 'en') {
      briefs = await this.get<TcgdexBrief[]>(path, signal, 'en');
    }
    return { cards: (briefs ?? []).map(tcgdexToUnified), hasMore: false };
  }

  async getCardById(rawId: string, signal?: AbortSignal): Promise<UnifiedCard | null> {
    try {
      const card = await this.get<TcgdexCard>(`/cards/${encodeURIComponent(rawId)}`, signal);
      return card?.id ? tcgdexToUnified(card) : null;
    } catch {
      return null;
    }
  }

  async getCardsByIds(rawIds: string[], signal?: AbortSignal): Promise<UnifiedCard[]> {
    const cards = await Promise.all([...new Set(rawIds)].map((id) => this.getCardById(id, signal)));
    const byId = new Map(cards.filter((c): c is UnifiedCard => Boolean(c)).map((c) => [c.rawId, c]));
    return rawIds.map((id) => byId.get(id)).filter((c): c is UnifiedCard => Boolean(c));
  }

  async getCardsByNames(names: string[], signal?: AbortSignal): Promise<Map<string, UnifiedCard>> {
    const byName = new Map<string, UnifiedCard>();
    for (const name of [...new Set(names.map((n) => n.trim()).filter(Boolean))]) {
      const briefs = await this.get<TcgdexBrief[]>(`/cards?name=${encodeURIComponent(name)}`, signal);
      const hit = briefs?.[0];
      if (hit) byName.set(name.toLowerCase(), tcgdexToUnified(hit));
    }
    return byName;
  }

  resolveCardsByNames(names: string[], signal?: AbortSignal): Promise<Map<string, UnifiedCard>> {
    return this.getCardsByNames(names, signal);
  }

  async getPrintings(card: UnifiedCard, signal?: AbortSignal): Promise<UnifiedCard[]> {
    const briefs = await this.get<TcgdexBrief[]>(`/cards?name=${encodeURIComponent(card.name)}`, signal);
    return (briefs ?? []).map(tcgdexToUnified);
  }

  async getCardsBySetNumber(
    refs: SetNumberRef[],
    signal?: AbortSignal,
  ): Promise<Map<string, UnifiedCard>> {
    const byKey = new Map<string, UnifiedCard>();
    for (const { set, collectorNumber } of refs) {
      if (!set || !collectorNumber) continue;
      const card = await this.getCardById(`${set}-${collectorNumber}`, signal);
      if (card) byKey.set(`${set.toLowerCase()}:${collectorNumber.toLowerCase()}`, card);
    }
    return byKey;
  }
}
