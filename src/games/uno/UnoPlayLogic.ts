import type { Card } from './UnoTypes.js';
import type { UnoEngine } from './UnoEngine.js';
import { UnoRulesManager } from './UnoRules.js';

export class UnoPlayLogic {
  static playCards(engine: UnoEngine, userId: string, cardIds: string[]) {
    if (engine.state !== 'PLAYING') return;
    const player = engine.players.find(p => p.userId === userId);
    if (!player) return;

    const cardsToPlay = player.hand.filter(c => cardIds.includes(c.id));
    if (cardsToPlay.length === 0 || cardsToPlay.length !== cardIds.length) return;
    if (cardsToPlay.length > 1 && (!engine.rules.playMultipleSame || !cardsToPlay.every(c => c.value === (cardsToPlay[0] as Card).value))) return;

    const topCard = engine.deckManager.getTopDiscard();
    const isMyTurn = engine.players[engine.currentTurnIndex]?.userId === userId;
    const firstCard = cardsToPlay[0] as Card;
    if (!firstCard) return;

    const validation = UnoRulesManager.canPlayCard(firstCard, topCard, engine.currentColor, engine.pendingDraws, isMyTurn, engine.rules, cardsToPlay.length);
    if (!validation.valid) return;

    player.hasDrawnThisTurn = false;

    if (validation.isIntercept) {
      engine.currentTurnIndex = engine.players.findIndex(p => p.userId === userId);
      engine.broadcastMessage(`${player.nickname} interrumpió con un corte exacto!`);
      engine.broadcastAction("action_intercept", player.userId);
    }

    player.hand = player.hand.filter(h => !cardsToPlay.some(c => c.id === h.id));
    engine.deckManager.discard(cardsToPlay);
    
    engine.broadcastAction("rival_played", player.userId, { cardsCount: cardsToPlay.length });

    if (firstCard.color !== 'wild') engine.currentColor = firstCard.color;

    const { skips, draws } = UnoRulesManager.getSkipsAndDraws(cardsToPlay);
    engine.pendingDraws += draws;
    
    let totalSkips = skips;

    if (skips > 0 && engine.players.length === 2) {
      totalSkips = 1; // En 1v1, cualquier cantidad de skips te devuelve el turno (1 skip = juegas de nuevo).
    }

    if (skips > 0) {
      for (let i = 1; i <= skips; i++) {
        let victimIndex = (engine.currentTurnIndex + (i * engine.playDirection)) % engine.players.length;
        if (victimIndex < 0) victimIndex += engine.players.length;
        if (engine.players[victimIndex]) {
          engine.broadcastAction("action_skip", engine.players[victimIndex].userId);
        }
      }
    }

    if (cardsToPlay.some(c => c.value === 'reverse')) {
      if (engine.players.length === 2) {
        totalSkips += 1;
      } else {
        engine.playDirection *= -1;
      }
      engine.broadcastAction("action_reverse", player.userId);
    }

    if (engine.pendingDraws > 0 && !engine.rules.stackDrawCards) {
      // Determinamos quién es la víctima basándonos en la dirección
      let nextIndex = engine.currentTurnIndex + engine.playDirection;
      if (nextIndex >= engine.players.length) nextIndex = 0;
      if (nextIndex < 0) nextIndex = engine.players.length - 1;
      
      const victim = engine.players[nextIndex];
      if (victim) {
        // Le embutimos las cartas
        const drawn = engine.deckManager.drawCards(engine.pendingDraws);
        victim.hand.push(...drawn);
        engine.broadcastAction("rival_drew", victim.userId, { cardsCount: engine.pendingDraws });
        victim.hasYelledUno = false;
        
        // Reseteamos draws y nos saltamos su turno automáticamente
        engine.pendingDraws = 0;
        totalSkips += 1;
      }
    }

    if (player.hand.length === 0) {
      engine.state = 'FINISHED'; engine.winner = player.userId;
      engine.broadcastMessage(`¡${player.nickname} HA GANADO! 🎉`);
      
      engine.broadcastCallback('player_won', player.userId);
      return engine.broadcastState();
    }

    if (player.hand.length > 1) player.hasYelledUno = false;

    if (firstCard.color === 'wild') {
      engine.state = 'CHOOSING_COLOR'; engine.actionRequiredFrom = userId;
      engine.pendingSkips = totalSkips;
    } else if (engine.rules.zeroAndSevenRules && firstCard.value === '7' && cardsToPlay.length === 1) {
      engine.state = 'CHOOSING_PLAYER'; engine.actionRequiredFrom = userId;
      engine.pendingSkips = totalSkips;
    } else {
      if (engine.rules.zeroAndSevenRules && firstCard.value === '0') engine.applyZeroRule();
      engine.advanceTurn(1 + totalSkips);
    }
    engine.broadcastState();
  }
}
