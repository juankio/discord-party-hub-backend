import type { CardColor } from './UnoTypes.js';
import type { UnoEngine } from './UnoEngine.js';

export class UnoSpecialLogic {
  static declareColor(engine: UnoEngine, userId: string, color: CardColor) {
    if (engine.state !== 'CHOOSING_COLOR' || engine.actionRequiredFrom !== userId) return;
    engine.currentColor = color; engine.state = 'PLAYING'; engine.actionRequiredFrom = '';
    engine.advanceTurn(1 + (engine.pendingSkips || 0));
    engine.pendingSkips = 0;
    engine.broadcastState();
  }

  static swapHands(engine: UnoEngine, userId: string, targetUserId: string) {
    if (engine.state !== 'CHOOSING_PLAYER' || engine.actionRequiredFrom !== userId) return;
    const p1 = engine.players.find(p => p.userId === userId);
    const p2 = engine.players.find(p => p.userId === targetUserId);
    if (p1 && p2) {
      const temp = p1.hand; p1.hand = p2.hand; p2.hand = temp;
      engine.broadcastMessage(`${p1.nickname} intercambió mano con ${p2.nickname}!`);
      engine.broadcastAction("action_swap", userId, { targetId: targetUserId });
    }
    engine.state = 'PLAYING'; engine.actionRequiredFrom = ''; engine.advanceTurn(1 + (engine.pendingSkips || 0)); engine.pendingSkips = 0; engine.broadcastState();
  }

  static challengeUno(engine: UnoEngine, challengerId: string, targetId: string) {
    const target = engine.players.find(p => p.userId === targetId);
    if (target && target.hand.length === 1 && !target.hasYelledUno) {
      target.hand.push(...engine.deckManager.drawCards(2));
      const challenger = engine.players.find(p => p.userId === challengerId);
      engine.broadcastMessage(`${challenger?.nickname} denunció a ${target.nickname}. ¡Roba 2 cartas!`);
      engine.broadcastAction("action_challenge", challengerId, { targetId: targetId, success: true });
      engine.broadcastState();
    }
  }

  static surrender(engine: UnoEngine, userId: string) {
    if (!['PLAYING', 'CHOOSING_COLOR', 'CHOOSING_PLAYER'].includes(engine.state)) return;
    const player = engine.players.find(p => p.userId === userId);
    if (!player) return;
    engine.broadcastMessage(`${player.nickname} se ha rendido.`);
    
    // removePlayer maneja automáticamente los estados de victoria si quedan < 2 jugadores
    engine.removePlayer(userId);
  }
}
