import { Card } from '../types';
import { getPrice, hasPrice } from '../cards/domain/accessors/price';

interface MagicCardProps {
  card: Card;
}

const MagicCard = ({ card }: MagicCardProps) => {
  // Handle both regular cards and double-faced cards (transform, modal_dfc, etc)
  const imageUri = card.images?.normal || card.faces?.[0]?.images?.normal;

  return (
    <div className="relative card-hover animate-fade-in">
      {imageUri ? (
        <img
          src={imageUri}
          alt={card.name}
          className="w-full h-auto rounded-lg transition-smooth"
        />
      ) : (
        <div className="w-full h-64 bg-gray-700 rounded-lg flex items-center justify-center text-gray-400 transition-smooth">
          No Image Available
        </div>
      )}
      {hasPrice(card, 'tcgplayer') && (
        <div className="absolute bottom-0 left-0 p-2 bg-gray-900 bg-opacity-50 text-white rounded-bl-lg rounded-tr-lg transition-smooth">
          ${getPrice(card, 'tcgplayer').toFixed(2)}
        </div>
      )}
    </div>
  );
};

export default MagicCard;
