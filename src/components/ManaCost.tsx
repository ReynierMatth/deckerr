
// Map mana symbols to their icon paths
const MANA_ICONS: Record<string, string> = {
  W: '/mana-color/plains.png',
  U: '/mana-color/island.png',
  B: '/mana-color/swamp.png',
  R: '/mana-color/moutain.png', // Note: filename has typo "moutain"
  G: '/mana-color/forest.png',
};

interface ManaSymbolProps {
  symbol: string;
  size?: number;
}

// Renders a single mana symbol (either as an icon or as text for numbers/other)
export function ManaSymbol({ symbol, size = 16 }: ManaSymbolProps) {
  const iconPath = MANA_ICONS[symbol];

  if (iconPath) {
    return (
      <img
        src={iconPath}
        alt={symbol}
        className="inline-block"
        style={{ width: size, height: size }}
      />
    );
  }

  // For numbers and other symbols, show as a circle with the symbol
  return (
    <span
      className="inline-flex items-center justify-center bg-gray-500 text-white font-bold rounded-full"
      style={{ width: size, height: size, fontSize: size * 0.6 }}
    >
      {symbol}
    </span>
  );
}

interface ManaCostProps {
  cost: string;
  size?: number;
}

// Parses and renders a full mana cost string like "{2}{W}{U}"
export function ManaCost({ cost, size = 16 }: ManaCostProps) {
  if (!cost) return null;

  // Parse mana cost string: {2}{W}{U} -> ['2', 'W', 'U']
  const symbols = cost.match(/\{([^}]+)\}/g)?.map(s => s.slice(1, -1)) || [];

  if (symbols.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-0.5">
      {symbols.map((symbol, index) => (
        <ManaSymbol key={index} symbol={symbol} size={size} />
      ))}
    </span>
  );
}

// Helper to get icon path for a color (for use in filters, etc.)
export function getManaIconPath(color: string): string | null {
  return MANA_ICONS[color] || null;
}

export default ManaCost;
