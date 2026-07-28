import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { PriceSource } from '../cards/domain/prices';
import { GameId, GameMeta, enabledGames, isGameId } from '../cards/domain/game';

/**
 * Per-user preferences (loaded once from the `profiles` row): price source,
 * the TCGs the user cares about, and whether they've completed onboarding.
 * Exposes `usePriceSource` (unchanged API) plus games/onboarding hooks.
 */
interface PreferencesContextType {
  loading: boolean;
  source: PriceSource;
  setSource: (s: PriceSource) => void;
  /** Raw preferred games (empty = the user hasn't narrowed it down). */
  games: GameId[];
  setGames: (games: GameId[]) => void;
  onboarded: boolean;
  completeOnboarding: (data: { displayName?: string; handle?: string; games: GameId[] }) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

const asSource = (v: unknown): PriceSource => (v === 'cardmarket' ? 'cardmarket' : 'tcgplayer');
const asGames = (v: unknown): GameId[] => (Array.isArray(v) ? v.filter(isGameId) : []);

export function PriceSourceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [source, setSourceState] = useState<PriceSource>('tcgplayer');
  const [games, setGamesState] = useState<GameId[]>([]);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    if (!user) {
      setSourceState('tcgplayer');
      setGamesState([]);
      setOnboarded(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from('profiles')
      .select('preferred_price_source, preferred_games, onboarded_at')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setSourceState(asSource(data?.preferred_price_source));
        setGamesState(asGames(data?.preferred_games));
        setOnboarded(Boolean(data?.onboarded_at));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const setSource = (s: PriceSource) => {
    setSourceState(s);
    if (user) {
      supabase.from('profiles').update({ preferred_price_source: s }).eq('id', user.id).then(({ error }) => {
        if (error) console.error('Error saving price source preference:', error);
      });
    }
  };

  const setGames = (next: GameId[]) => {
    setGamesState(next);
    if (user) {
      supabase.from('profiles').update({ preferred_games: next }).eq('id', user.id).then(({ error }) => {
        if (error) console.error('Error saving preferred games:', error);
      });
    }
  };

  const completeOnboarding = useCallback(
    async (data: { displayName?: string; handle?: string; games: GameId[] }) => {
      if (!user) return;
      // Upsert (not update) so a not-yet-created profile row is handled too.
      const { error } = await supabase.from('profiles').upsert(
        {
          id: user.id,
          display_name: data.displayName?.trim() || null,
          // Keep the legacy username column synced to the handle (as ProfileSettings does).
          ...(data.handle ? { handle: data.handle, username: data.handle } : {}),
          preferred_games: data.games,
          onboarded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
      if (error) throw error;
      setGamesState(data.games);
      setOnboarded(true);
    },
    [user],
  );

  return (
    <PreferencesContext.Provider
      value={{ loading, source, setSource, games, setGames, onboarded, completeOnboarding }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

function usePreferences(): PreferencesContextType {
  const ctx = useContext(PreferencesContext);
  if (ctx === undefined) throw new Error('usePreferences must be used within a PriceSourceProvider');
  return ctx;
}

/** Price source preference (kept as its own hook for existing call sites). */
export function usePriceSource() {
  const { source, setSource } = usePreferences();
  return { source, setSource };
}

/** Raw preferred games + setter + onboarding status/completer. */
export function usePreferredGames() {
  const { games, setGames, onboarded, completeOnboarding, loading } = usePreferences();
  return { games, setGames, onboarded, completeOnboarding, loading };
}

/**
 * The games whose UI should be shown to this user: their picked games (in the
 * app's canonical order), or all enabled games when they haven't narrowed it.
 */
export function useActiveGames(): GameMeta[] {
  const { games } = usePreferences();
  const all = enabledGames();
  if (games.length === 0) return all;
  return all.filter((g) => games.includes(g.id));
}
