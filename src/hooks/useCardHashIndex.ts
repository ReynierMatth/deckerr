import { useQuery } from '@tanstack/react-query';
import { buildHashIndex, type HashIndex, type HashIndexFile } from '../utils/imageHash';

/**
 * Load the perceptual-hash index the scanner matches against. It's a static
 * asset (public/card-hashes.json) produced by scripts/build-hash-index.mjs, so
 * it's cached hard: fetched once, kept for the session, and served offline by
 * the PWA service worker on later visits. Returns null while loading or if the
 * index isn't present (the scanner then falls back to OCR-by-name).
 */
export function useCardHashIndex(): { index: HashIndex | null; isLoading: boolean } {
  const { data, isLoading } = useQuery<HashIndex | null>({
    queryKey: ['cardHashIndex'],
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    queryFn: async () => {
      const res = await fetch('/card-hashes.json');
      if (!res.ok) return null;
      const file = (await res.json()) as HashIndexFile;
      if (!file?.ids?.length) return null;
      return buildHashIndex(file);
    },
  });

  return { index: data ?? null, isLoading };
}
