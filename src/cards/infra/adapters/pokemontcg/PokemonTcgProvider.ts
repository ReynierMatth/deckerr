/**
 * Pokémon card provider — pokemontcg.io v2 adapter.
 *
 * Free API (keyless 1k/day, 20k/day with a key via `X-Api-Key`). No batch
 * endpoint, so id/name lookups use Lucene `OR` queries. Carries both TCGPlayer
 * and Cardmarket prices.
 */

import { CardProvider, SetNumberRef } from '../../../domain/ports/CardProvider';
import { SearchQuery, SearchResult } from '../../../domain/ports/SearchQuery';
import { UnifiedCard } from '../../../domain/UnifiedCard';
import { PokemonTcgCard, PokemonTcgList } from './pokemonTypes';
import { pokemonToUnified, POKEMONTCG_PROVIDER_ID } from './pokemonTcgMapper';

const API = 'https://api.pokemontcg.io/v2';
const PAGE_SIZE = 60;
const ID_CHUNK = 40;

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// Lucene value escaping for the q= grammar (quote phrases, escape quotes).
const quote = (v: string): string => `"${v.replace(/"/g, '\\"')}"`;

export class PokemonTcgProvider implements CardProvider {
  readonly game = 'pokemon' as const;
  readonly id = POKEMONTCG_PROVIDER_ID;

  constructor(private readonly apiKey?: string) {}

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      headers: {
        Accept: 'application/json',
        ...(this.apiKey ? { 'X-Api-Key': this.apiKey } : {}),
      },
      signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const detail = (body as { error?: { message?: string } } | null)?.error?.message;
      throw new Error(detail ?? `pokemontcg request failed (${res.status})`);
    }
    return (await res.json()) as T;
  }

  private async queryAll(q: string, signal?: AbortSignal): Promise<PokemonTcgCard[]> {
    const list = await this.get<PokemonTcgList>(
      `/cards?q=${encodeURIComponent(q)}&pageSize=${PAGE_SIZE}`,
      signal,
    );
    return list.data ?? [];
  }

  private buildQuery(query: SearchQuery): string {
    const raw = query.raw?.pokemon;
    if (typeof raw === 'string' && raw.trim()) return raw;
    const parts: string[] = [];
    const text = query.text?.trim();
    if (text) {
      // single token -> prefix wildcard; phrases -> quoted exact-ish
      parts.push(text.includes(' ') ? `name:${quote(text)}` : `name:${text}*`);
    }
    if (query.set) parts.push(`set.id:${query.set}`);
    return parts.join(' ');
  }

  async search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResult> {
    const q = this.buildQuery(query);
    if (!q) return { cards: [], hasMore: false };
    const page = query.page ?? 1;
    const list = await this.get<PokemonTcgList>(
      `/cards?q=${encodeURIComponent(q)}&page=${page}&pageSize=${PAGE_SIZE}&orderBy=name`,
      signal,
    );
    const total = list.totalCount ?? 0;
    return {
      cards: (list.data ?? []).map(pokemonToUnified),
      hasMore: (list.page ?? page) * (list.pageSize ?? PAGE_SIZE) < total,
      nextPage: page + 1,
    };
  }

  async getCardById(rawId: string, signal?: AbortSignal): Promise<UnifiedCard | null> {
    try {
      const res = await this.get<{ data: PokemonTcgCard }>(`/cards/${encodeURIComponent(rawId)}`, signal);
      return res.data ? pokemonToUnified(res.data) : null;
    } catch {
      return null;
    }
  }

  async getCardsByIds(rawIds: string[], signal?: AbortSignal): Promise<UnifiedCard[]> {
    const unique = [...new Set(rawIds)];
    const byId = new Map<string, UnifiedCard>();
    for (const ids of chunk(unique, ID_CHUNK)) {
      const q = `(${ids.map((id) => `id:${id}`).join(' OR ')})`;
      for (const raw of await this.queryAll(q, signal)) {
        byId.set(raw.id, pokemonToUnified(raw));
      }
    }
    return rawIds.map((id) => byId.get(id)).filter((c): c is UnifiedCard => Boolean(c));
  }

  async getCardsByNames(names: string[], signal?: AbortSignal): Promise<Map<string, UnifiedCard>> {
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    const byName = new Map<string, UnifiedCard>();
    for (const group of chunk(unique, ID_CHUNK)) {
      const q = `(${group.map((n) => `name:${quote(n)}`).join(' OR ')})`;
      for (const raw of await this.queryAll(q, signal)) {
        byName.set(raw.name.toLowerCase(), pokemonToUnified(raw));
      }
    }
    return byName;
  }

  // pokemontcg name lookups are exact enough; no separate fuzzy pass needed.
  resolveCardsByNames(names: string[], signal?: AbortSignal): Promise<Map<string, UnifiedCard>> {
    return this.getCardsByNames(names, signal);
  }

  async getPrintings(card: UnifiedCard, signal?: AbortSignal): Promise<UnifiedCard[]> {
    const cards = await this.queryAll(`name:${quote(card.name)}`, signal);
    return cards.map(pokemonToUnified);
  }

  async getCardsBySetNumber(
    refs: SetNumberRef[],
    signal?: AbortSignal,
  ): Promise<Map<string, UnifiedCard>> {
    const byKey = new Map<string, UnifiedCard>();
    for (const { set, collectorNumber } of refs) {
      if (!set || !collectorNumber) continue;
      const q = `set.id:${set} number:${collectorNumber}`;
      const [hit] = await this.queryAll(q, signal);
      if (hit) byKey.set(`${set.toLowerCase()}:${collectorNumber.toLowerCase()}`, pokemonToUnified(hit));
    }
    return byKey;
  }
}
