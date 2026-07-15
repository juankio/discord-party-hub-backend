import type { ParchisEngine } from './ParchisEngine.js';
import type { ParchisPlayer } from './ParchisTypes.js';
import { ParchisCaptureLogic } from './ParchisCaptureLogic.js';

const AUTO_SKIP_DELAY_MS = 1500;

export class ParchisTurnLogic {
  static hasAnyValidMove(engine: ParchisEngine, player: ParchisPlayer): boolean {
    const playerIndex = engine.players.findIndex(p => p.userId === player.userId);
    const startPos = (playerIndex * 17) + 4;
    const maxOnBoard = engine.trackLength - 5;

    for (const diceValue of engine.availableMoves) {
      for (const token of player.tokens) {
        if (token.state === 'HOME') {
          if (engine.rules.diceCount === 2) {
            const isPairRoll = engine.diceValue.length === 2 && engine.diceValue[0] === engine.diceValue[1];
            const isPairIntact = isPairRoll && engine.availableMoves.filter(m => m === engine.diceValue[0]).length === 2;
            if (isPairIntact && diceValue === engine.diceValue[0] && !ParchisCaptureLogic.isPositionBlocked(engine, startPos)) {
              return true;
            }
          } else {
            if (diceValue === 5 && !ParchisCaptureLogic.isPositionBlocked(engine, startPos)) {
              return true;
            }
          }
        } else if (token.state === 'BOARD' || token.state === 'PATH' || token.state === 'META') {
          let travelled = 0;
          let isMetaMove = token.state === 'META';

          if (token.state === 'META') {
            travelled = maxOnBoard + token.position;
          } else {
            travelled = token.position - startPos;
            if (travelled < 0) travelled += engine.trackLength;
          }

          const newTravelled = travelled + diceValue;
          if (newTravelled > maxOnBoard) {
            const metaPos = newTravelled - maxOnBoard;
            if (metaPos <= 8) return true; // valid move
          } else {
            if (isMetaMove) continue; // cannot move backwards from META
            const newPos = (token.position + diceValue) % engine.trackLength;
            if (!ParchisCaptureLogic.isPositionBlocked(engine, newPos)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

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
    const hasValidMoves = ParchisTurnLogic.hasAnyValidMove(engine, player);
    const isBot = userId.startsWith('bot_');

    if (!hasValidMoves) {
      if (engine.rules.diceCount === 2 && allTokensHome && !isPair ) {
        engine.rollAttempts++;
        if (engine.rollAttempts < 3) {
          engine.availableMoves = []; // Must roll again
          engine.diceValue = [];
          engine.broadcastState();
          return;
        }
      }

      engine.availableMoves = []; // Limpiar para que el frontend no crea que tiene movimientos válidos
      engine.broadcastState();
      
      const expectedTurnIndex = engine.currentTurnIndex;
      const expectedPlayerId = player.userId;
      
      setTimeout(() => {
        if (engine.state !== 'PLAYING') return;
        if (engine.currentTurnIndex !== expectedTurnIndex) return;
        if (engine.players[engine.currentTurnIndex]?.userId !== expectedPlayerId) return;
        
        ParchisTurnLogic.nextTurn(engine);
      }, AUTO_SKIP_DELAY_MS);
      return;
    }

    engine.broadcastState();
  }

  static nextTurn(engine: ParchisEngine) {
    engine.availableMoves = [];
    engine.rollAttempts = 0;
    if (engine.rules.diceCount === 2 && engine.consecutivePairs > 0 && engine.consecutivePairs < 3) {
      // Gets another turn
    } else {
      engine.consecutivePairs = 0;
      engine.currentTurnIndex = (engine.currentTurnIndex + 1) % engine.players.length;
    }
    engine.diceValue = [];
    engine.broadcastState();
  }
}
