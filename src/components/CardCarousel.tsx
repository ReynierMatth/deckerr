import { useEffect, useState } from 'react';
import { Card } from '../types';
import { getRandomCards } from '../services/api';

export default function CardCarousel() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCards = async () => {
      try {
        const randomCards = await getRandomCards(6);
        setCards(randomCards);
      } catch (error) {
        console.error('Failed to load cards:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCards();
  }, []);

  if (loading) {
    return <div className="animate-pulse h-96 bg-gray-700/50 rounded-lg"></div>;
  }

  return (
    <div className="relative h-screen overflow-hidden">
      <div className="absolute inset-0 flex">
        {cards.map((card, index) => (
          <div
            key={card.id}
            className="min-w-full h-full transform transition-transform duration-1000"
            style={{
              backgroundImage: `url(${card.image_uris?.normal})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(8px)',
              opacity: 0.5
            }}
          />
        ))}
      </div>
    </div>
  );
}
