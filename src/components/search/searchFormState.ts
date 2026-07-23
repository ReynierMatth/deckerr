type ColorKey = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

export interface SearchFormState {
  cardName: string;
  text: string;
  rulesText: string;
  typeLine: string;
  typeMatch: string;
  typeInclude: boolean;
  colors: Record<ColorKey, boolean>;
  colorMode: string;
  commanderColors: Record<ColorKey, boolean>;
  manaCost: Record<ColorKey, number>;
  manaValue: string;
  manaValueComparison: string;
  games: { paper: boolean; arena: boolean; mtgo: boolean };
  format: string;
  formatStatus: string;
  set: string;
  block: string;
  rarity: { common: boolean; uncommon: boolean; rare: boolean; mythic: boolean };
  criteria: string;
  criteriaMatch: string;
  criteriaInclude: boolean;
  price: string;
  currency: string;
  priceComparison: string;
  artist: string;
  flavorText: string;
  loreFinder: string;
  language: string;
  displayImages: boolean;
  order: string;
  showAllPrints: boolean;
  includeExtras: boolean;
}

export const initialSearchForm: SearchFormState = {
  cardName: '',
  text: '',
  rulesText: '',
  typeLine: '',
  typeMatch: 'partial',
  typeInclude: true,
  colors: { W: false, U: false, B: false, R: false, G: false, C: false },
  colorMode: 'exactly',
  commanderColors: { W: false, U: false, B: false, R: false, G: false, C: false },
  manaCost: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
  manaValue: '',
  manaValueComparison: '=',
  games: { paper: false, arena: false, mtgo: false },
  format: '',
  formatStatus: '',
  set: '',
  block: '',
  rarity: { common: false, uncommon: false, rare: false, mythic: false },
  criteria: '',
  criteriaMatch: 'partial',
  criteriaInclude: true,
  price: '',
  currency: 'usd',
  priceComparison: '=',
  artist: '',
  flavorText: '',
  loreFinder: '',
  language: 'en',
  displayImages: false,
  order: 'name',
  showAllPrints: false,
  includeExtras: false,
};

export type SearchFormAction =
  | { type: 'set'; field: keyof SearchFormState; value: SearchFormState[keyof SearchFormState] }
  | { type: 'reset' };

export function searchFormReducer(state: SearchFormState, action: SearchFormAction): SearchFormState {
  switch (action.type) {
    case 'set':
      return { ...state, [action.field]: action.value };
    case 'reset':
      return initialSearchForm;
    default:
      return state;
  }
}
