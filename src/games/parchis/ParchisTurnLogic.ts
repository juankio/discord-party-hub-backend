import type { ParchisEngine } from './ParchisEngine.js';

export class ParchisTurnLogic {
  static rollDice(engine: ParchisEngine, userId: string) {
    if (engine.state !== 'PLAYING') return;
    const player = engine.players[engine.currentTurnIndex];
    if (player?.userId !== userId) return;

    if (engine.availableMoves.length > 0) return; // Player still has moves left

    engine.diceValue = Array.from({ length: engine.rules.diceCount }, () => Math.floor(Math.random() * 6) + 1);
    engine.availableMoves = [...engine.diceValue];
    
    const isPair = engine.rules.diceCount === 2 && engine.diceValue[0] === engine.diceValue[1];

    if (isPair) {
      engine.consecutivePairs++;
      if (engine.consecutivePairs === 3) {
        if (engine.lastMovedTokenId) {
          const token = player.tokens.find(t => t.id === engine.lastMovedTokenId);
          if (token && token.state !== 'META' && token.state !== 'FINISHED') {
            if (engine.rules.threePairsRule === 'reward') {
              token.state = 'FINISHED';
              token.position = 0;
              if (player.tokens.every(t => t.state === 'FINISHED')) {
                engine.winner = player.userId;
                engine.state = 'FINISHED';
                engine.emit('player_won', engine.winner);
              }
            } else {
              token.state = 'HOME';
              token.position = -1;
            }
          }
        }
        // Turn ends immediately
        ParchisTurnLogic.nextTurn(engine);
        return;
      }
    } else {
      engine.consecutivePairs = 0;
    }

    engine.emit('parchis:dice_rolled', { userId, dice: engine.diceValue });
    
    const allTokensHome = player.tokens.every(t => t.state === 'HOME');
    const canExitHome = engine.rules.diceCount === 2 ? isPair : engine.availableMoves.includes(5);

    console.log(`--> rollDice by ${userId}: dice=${engine.diceValue}, allTokensHome=${allTokensHome}, isPair=${isPair}, canExitHome=${canExitHome}`);

    if (allTokensHome && !canExitHome) {
      if (engine.rules.diceCount === 2) {
        engine.rollAttempts++;
        if (engine.rollAttempts < 3) {
          engine.availableMoves = []; // Must roll again
          engine.diceValue = [];
          engine.broadcastState();
          return;
        } else {
          engine.availableMoves = []; // Limpiar para que el frontend no crea que tiene movimientos válidos
          engine.broadcastState();
          setTimeout(() => {
            console.log("--> setTimeout firing auto nextTurn after 3 failed attempts...");
            ParchisTurnLogic.nextTurn(engine);
          }, 1500);
          return;
        }
      } else if (engine.rules.diceCount === 1) {
        engine.availableMoves = []; // Limpiar de inmediato
        engine.broadcastState();
        setTimeout(() => {
          console.log("--> setTimeout firing auto nextTurn...");
          ParchisTurnLogic.nextTurn(engine);
        }, 1500);
        return;
      }
    }

    console.log("--> waiting for player to move");
    engine.broadcastState();
  }

  static nextTurn(engine: ParchisEngine) {
    console.log("--> nextTurn called! prev currentTurnIndex:", engine.currentTurnIndex);
    engine.availableMoves = [];
    engine.rollAttempts = 0;
    if (engine.rules.diceCount === 2 && engine.consecutivePairs > 0 && engine.consecutivePairs < 3) {
      // Gets another turn
      console.log("--> player gets another turn due to consecutivePairs:", engine.consecutivePairs);
    } else {
      engine.consecutivePairs = 0;
      engine.currentTurnIndex = (engine.currentTurnIndex + 1) % engine.players.length;
      console.log("--> new currentTurnIndex:", engine.currentTurnIndex);
    }
    engine.diceValue = [];
    engine.broadcastState();
  }
}
