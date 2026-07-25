/**
 * Tiny name-matching helpers shared by the scanners. Used to reconcile a noisy
 * OCR read of a card's title with candidate card names (e.g. to re-rank the
 * art-embedding matches by which one the title text actually agrees with).
 */

/** Significant words (3+ letters, lowercased) of a card-name-ish string. */
export const nameTokens = (s: string): Set<string> =>
  new Set(s.toLowerCase().split(/[^a-zà-ÿ]+/).filter((w) => w.length >= 3));

/** How many significant words two name-ish strings share. */
export const sharedTokenCount = (a: string, b: string): number => {
  const ta = nameTokens(a);
  let n = 0;
  for (const w of nameTokens(b)) if (ta.has(w)) n++;
  return n;
};
