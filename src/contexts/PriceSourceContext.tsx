import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { PriceSource } from '../cards/domain/prices';

/**
 * The user's preferred price source (TCGPlayer USD / Cardmarket EUR), persisted
 * to profiles.preferred_price_source. Affects per-card price DISPLAY only;
 * stored collection totals stay in USD (multi-currency totals are Phase 2).
 */
interface PriceSourceContextType {
  source: PriceSource;
  setSource: (s: PriceSource) => void;
}

const PriceSourceContext = createContext<PriceSourceContextType | undefined>(undefined);

const asSource = (v: unknown): PriceSource => (v === 'cardmarket' ? 'cardmarket' : 'tcgplayer');

export function PriceSourceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [source, setSourceState] = useState<PriceSource>('tcgplayer');

  useEffect(() => {
    if (!user) {
      setSourceState('tcgplayer');
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('preferred_price_source')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setSourceState(asSource(data.preferred_price_source));
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const setSource = (s: PriceSource) => {
    setSourceState(s);
    if (user) {
      supabase
        .from('profiles')
        .update({ preferred_price_source: s })
        .eq('id', user.id)
        .then(({ error }) => {
          if (error) console.error('Error saving price source preference:', error);
        });
    }
  };

  return (
    <PriceSourceContext.Provider value={{ source, setSource }}>{children}</PriceSourceContext.Provider>
  );
}

export function usePriceSource() {
  const context = useContext(PriceSourceContext);
  if (context === undefined) {
    throw new Error('usePriceSource must be used within a PriceSourceProvider');
  }
  return context;
}
