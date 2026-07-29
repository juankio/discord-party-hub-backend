import type { UnoEngine } from './UnoEngine.js';
import type { UnoRules, CardColor } from './UnoTypes.js';

export class UnoGameManager {
  static removePlayer(engine: UnoEngine, userId: string) {
    engine.players = engine.players.filter(p => p.userId !== userId);
    if (engine.state !== 'WAITING' && engine.state !== 'FINISHED') {
      if (engine.players.length < 2) {
        engine.state = 'FINISHED';
        if (engine.players.length === 1) {
          engine.winner = engine.players[0].userId;
          engine.emit('player_won', engine.players[0].userId);
        }
        engine.broadcastState();
      } else {
        if (engine.actionRequiredFrom === userId) {
          engine.actionRequiredFrom = '';
          engine.state = 'PLAYING';
          engine.advanceTurn(1 + (engine.pendingSkips || 0));
          engine.pendingSkips = 0;
        }
        engine.currentTurnIndex = engine.currentTurnIndex % engine.players.length;
        engine.broadcastState();
      }
    }
  }

  static startGame(engine: UnoEngine, rules: UnoRules, lastWinnerUserId?: string) {
    if (engine.players.length < 2) return;
    engine.rules = rules;
    engine.deckManager.reset();
    engine.pendingDraws = 0; 
    engine.playDirection = 1;
    engine.winner = null;

    for (let i = engine.players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [engine.players[i], engine.players[j]] = [engine.players[j], engine.players[i]];
    }

    let startIndex = -1;
    if (lastWinnerUserId) {
      startIndex = engine.players.findIndex(p => p.userId === lastWinnerUserId);
    }
    
    if (startIndex !== -1) {
      engine.currentTurnIndex = startIndex;
    } else {
      engine.currentTurnIndex = Math.floor(Math.random() * engine.players.length);
    }
    
    for (const p of engine.players) { p.hand = engine.deckManager.drawCards(7); p.hasYelledUno = false; }

    let firstCard = engine.deckManager.drawCards(1)[0];
    if (!firstCard) return;
    while (['wild', 'reverse', 'skip', 'draw2'].includes(firstCard.value) || firstCard.color === 'wild') {
      engine.deckManager.deck.push(firstCard);
      engine.deckManager.shuffleDeck();
      firstCard = engine.deckManager.drawCards(1)[0] || firstCard;
    }
    engine.deckManager.discardPile.push(firstCard);
    engine.currentColor = firstCard.color;
    
    engine.state = 'PLAYING';
    engine.broadcastState();
    engine.broadcastMessage(`¡La partida ha comenzado!`);

    const firstPlayer = engine.players[engine.currentTurnIndex];
    if (firstPlayer?.isOffline) {
       setTimeout(() => {
         engine.autoPlayOfflinePlayer(firstPlayer.userId);
       }, 500);
    }
  }

  static executeZeroRule(engine: UnoEngine) {
    UnoGameManager.applyZeroRule(engine.players, engine.playDirection);
    engine.broadcastAction("action_zero", engine.players[engine.currentTurnIndex]?.userId || '');
  }

  static applyZeroRule(players: import('./UnoTypes.js').Player[], direction: 1 | -1) {
    const hands = players.map(p => p.hand);
    if (direction === 1) hands.unshift(hands.pop()!);
    else hands.push(hands.shift()!);
    players.forEach((p, i) => p.hand = hands[i] || []);
  }

  static advanceTurn(engine: UnoEngine, steps: number) {
    let rawIndex = engine.currentTurnIndex + (steps * engine.playDirection);
    while (rawIndex < 0) rawIndex += engine.players.length;
    engine.currentTurnIndex = rawIndex % engine.players.length;
    
    if (engine.players[engine.currentTurnIndex]) {
      engine.players[engine.currentTurnIndex].hasDrawnThisTurn = false;
    }

    // Auto-play if the new turn lands on an offline player
    const currentPlayer = engine.players[engine.currentTurnIndex];
    if (currentPlayer?.isOffline && engine.state === 'PLAYING') {
       setTimeout(() => {
         engine.autoPlayOfflinePlayer(currentPlayer.userId);
       }, 500);
    }
  }

  static yellUno(engine: UnoEngine, userId: string) {
    const player = engine.players.find(p => p.userId === userId);
    if (!player || player.hasYelledUno) return;

    if (player.hand.length === 1) {
      player.hasYelledUno = true;
      engine.broadcastMessage(`¡${player.nickname} gritó UNO!`);
    } else if (player.hand.length > 1) {
      player.hand.push(...engine.deckManager.drawCards(2));
      engine.broadcastMessage(`¡${player.nickname} cantó UNO en falso y roba 2 cartas!`);
      engine.broadcastAction("rival_drew", player.userId, { cardsCount: 2 });
      engine.broadcastState();
    }
  }
}
