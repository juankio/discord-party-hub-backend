import type { CardColor } from './UnoTypes.js';
import type { UnoEngine } from './UnoEngine.js';
import { UnoPlayLogic } from './UnoPlayLogic.js';
import { UnoDrawLogic } from './UnoDrawLogic.js';
import { UnoSpecialLogic } from './UnoSpecialLogic.js';

export class UnoActions {
  static playCards(engine: UnoEngine, userId: string, cardIds: string[]) {
    return UnoPlayLogic.playCards(engine, userId, cardIds);
  }

  static drawFromDeck(engine: UnoEngine, userId: string) {
    return UnoDrawLogic.drawFromDeck(engine, userId);
  }

  static passTurn(engine: UnoEngine, userId: string) {
    return UnoDrawLogic.passTurn(engine, userId);
  }

  static declareColor(engine: UnoEngine, userId: string, color: CardColor) {
    return UnoSpecialLogic.declareColor(engine, userId, color);
  }

  static swapHands(engine: UnoEngine, userId: string, targetUserId: string) {
    return UnoSpecialLogic.swapHands(engine, userId, targetUserId);
  }

  static challengeUno(engine: UnoEngine, challengerId: string, targetId: string) {
    return UnoSpecialLogic.challengeUno(engine, challengerId, targetId);
  }

  static surrender(engine: UnoEngine, userId: string) {
    return UnoSpecialLogic.surrender(engine, userId);
  }
}
