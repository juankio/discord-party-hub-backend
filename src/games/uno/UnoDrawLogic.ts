import type { UnoEngine } from './UnoEngine.js';
import { UnoRulesManager } from './UnoRules.js';

export class UnoDrawLogic {
  static drawFromDeck(engine: UnoEngine, userId: string) {
    if (engine.state !== 'PLAYING') return;
    const player = engine.players[engine.currentTurnIndex];
    if (!player || player.userId !== userId) return;

    if (engine.pendingDraws > 0) {
      const cards = engine.deckManager.drawCards(engine.pendingDraws);
      player.hand.push(...cards);
      engine.broadcastAction("rival_drew", player.userId, { cardsCount: engine.pendingDraws });
      engine.pendingDraws = 0;
      player.hasYelledUno = false;
      player.hasDrawnThisTurn = false;
      engine.advanceTurn(1);
    } else {
      // Normal draw
      if (player.hasDrawnThisTurn) return; // Ya robó una carta jugable, no puede robar otra vez

      const drawnCard = engine.deckManager.drawCards(1)[0];
      if (drawnCard) {
        player.hand.push(drawnCard);
      }
      
      engine.broadcastAction("rival_drew", player.userId, { cardsCount: 1 });
      player.hasYelledUno = false;

      // Check if the drawn card is playable
      const isPlayable = drawnCard && UnoRulesManager.canPlayCard(drawnCard, engine.deckManager.getTopDiscard(), engine.currentColor, 0, true, engine.rules, 1).valid;
      
      if (isPlayable) {
        // Robó una que sirve: Se le da la opción de jugarla o pasar
        player.hasDrawnThisTurn = true;
        // NO avanzamos el turno
      } else {
        // Robó una que NO sirve
        if (engine.rules.drawUntilPlayable) {
          // Si la regla está activa, debe seguir robando. NO avanzamos el turno.
          player.hasDrawnThisTurn = false;
        } else {
          // Si la regla no está activa, su turno termina.
          player.hasDrawnThisTurn = false;
          engine.advanceTurn(1);
        }
      }
    }
    
    engine.broadcastState();
  }

  static passTurn(engine: UnoEngine, userId: string) {
    if (engine.state !== 'PLAYING') return;
    const player = engine.players[engine.currentTurnIndex];
    if (!player || player.userId !== userId || !player.hasDrawnThisTurn) return;

    player.hasDrawnThisTurn = false;
    engine.advanceTurn(1);
    engine.broadcastState();
  }
}
