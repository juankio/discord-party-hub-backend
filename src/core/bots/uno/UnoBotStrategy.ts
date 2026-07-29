import type { Card, CardColor } from "../../../games/uno/UnoTypes.js";

export class UnoBotStrategy {
  /**
   * Determine the best color to declare based on hand contents.
   */
  static getBestColorToDeclare(hand: Card[]): CardColor {
    const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
    const colorCounts: Record<string, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
    
    for (const card of hand) {
      if (card.color !== 'wild') {
        colorCounts[card.color] = (colorCounts[card.color] || 0) + 1;
      }
    }
    
    const bestColor = Object.keys(colorCounts).reduce((a, b) => 
      colorCounts[a] > colorCounts[b] ? a : b
    ) as CardColor;
    
    return colorCounts[bestColor] > 0 
      ? bestColor 
      : colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Determine the best player to swap hands with (usually the one with fewest cards).
   */
  static getBestPlayerToSwap(rivals: any[]): string | undefined {
    if (!rivals || rivals.length === 0) return undefined;
    const sortedRivals = [...rivals].sort((a: any, b: any) => 
      (a.cardCount ?? a.hand?.length ?? 0) - (b.cardCount ?? b.hand?.length ?? 0)
    );
    return sortedRivals[0].userId;
  }

  /**
   * Checks if a card is playable given the top card and current color.
   */
  static isCardPlayable(card: Card, topCard: Card, currentColor: string): boolean {
    if (card.color === 'wild') return true;
    if (card.color === currentColor) return true;
    if (card.value === topCard.value) return true;
    return false;
  }

  /**
   * Finds a card that can be stacked on top of pending draws.
   */
  static getCardToStack(hand: Card[], topCard: Card): Card | undefined {
    return hand.find(c => 
      c.value === topCard.value && (c.value === 'draw2' || c.value === 'wild_draw4')
    );
  }

  /**
   * Determine the best card to play from the hand.
   */
  static evaluateBestCardToPlay(hand: Card[], topCard: Card, currentColor: string, difficultyLevel: number): Card | undefined {
    let playableCards = hand.filter(c => this.isCardPlayable(c, topCard, currentColor));

    // Dumb move: sometimes act like we don't have a playable card if difficulty is low
    if (playableCards.length > 0 && difficultyLevel <= 3 && Math.random() < 0.2) {
      return undefined;
    }

    if (playableCards.length === 0) return undefined;

    // Simple strategy: play normal cards first, save wilds for later
    playableCards.sort((a, b) => {
      if (a.color === 'wild' && b.color !== 'wild') return 1;
      if (a.color !== 'wild' && b.color === 'wild') return -1;
      return 0;
    });

    return playableCards[0];
  }
}
