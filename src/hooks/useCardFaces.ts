import { useState, useCallback } from 'react';

/**
 * Tracks which face of each (double-faced) card is currently shown, keyed by
 * card id. Shared by every view that renders flippable cards.
 */
export const useCardFaces = () => {
  const [faceIndexById, setFaceIndexById] = useState<Map<string, number>>(new Map());

  const getCurrentFaceIndex = useCallback(
    (cardId: string): number => faceIndexById.get(cardId) ?? 0,
    [faceIndexById],
  );

  const toggleCardFace = useCallback((cardId: string, totalFaces: number): void => {
    setFaceIndexById((prev) => {
      const next = new Map(prev);
      const current = prev.get(cardId) ?? 0;
      next.set(cardId, (current + 1) % totalFaces);
      return next;
    });
  }, []);

  return { getCurrentFaceIndex, toggleCardFace };
};
