import { Card } from '../types';

interface MagicCardProps {
  card: Card;
}

const MagicCard = ({ card }: MagicCardProps) => {
  // Handle both regular cards and double-faced cards (transform, modal_dfc, etc)
  const imageUri = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal;

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
      {card.prices?.usd && (
        <div className="absolute bottom-0 left-0 p-2 bg-gray-900 bg-opacity-50 text-white rounded-bl-lg rounded-tr-lg transition-smooth">
          ${card.prices.usd}
        </div>
      )}
    </div>
  );
};

export default MagicCard;
