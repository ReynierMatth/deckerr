export interface ParsedDeckLine {
  name: string;
  quantity: number;
}

/**
 * Parse a pasted/exported decklist into { name, quantity } entries.
 *
 * Handles the common export shapes (MTGO / Arena / Moxfield / plain text):
 *   "4 Lightning Bolt"
 *   "4x Lightning Bolt"
 *   "1 Sauron, the Dark Lord (LTR) 224"
 *   "1 Barad-dûr (PLTR) 253s *F*"
 * Section headers ("Deck", "Sideboard", "Commander", ...) and comment lines
 * ("//", "#") are ignored. Set code / collector number / foil markers are
 * stripped so the name can be matched exactly against Scryfall.
 */
export function parseDeckList(text: string): ParsedDeckLine[] {
  const result: ParsedDeckLine[] = [];

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;

    // Must start with a quantity (optionally suffixed by "x"), else it's a header.
    const match = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (!match) continue;

    const quantity = parseInt(match[1], 10);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    let name = match[2].trim();
    // Drop trailing " (SET) <collector> [*F*] ..." metadata.
    name = name.replace(/\s+\([A-Za-z0-9]{2,6}\)(?:\s.*)?$/, '').trim();
    // Drop a leftover trailing "*F*"-style marker, if any.
    name = name.replace(/\s*\*[^*]+\*\s*$/, '').trim();

    if (name) result.push({ name, quantity });
  }

  return result;
}
