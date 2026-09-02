import type { ParchisEngine } from './ParchisEngine.js';
import type { ParchisPlayer } from './ParchisTypes.js';
import { ParchisCaptureLogic } from './ParchisCaptureLogic.js';

const AUTO_SKIP_DELAY_MS = 1500;

export class ParchisTurnLogic {
  static hasAnyValidMove(engine: ParchisEngine, player: ParchisPlayer): boolean {
    const colorIndex = engine.getPlayerColorIndex(player.userId);
    const startPos = ((colorIndex % engine.sides) * 17) + 12;
    const maxOnBoard = engine.trackLength - 1;

    for (const diceValue of engine.availableMoves) {
      for (const token of player.tokens) {
        if (token.state === 'HOME') {
          if (engine.rules.diceCount === 2) {
             const isPairRoll = engine.diceValue.length === 2 && engine.diceValue[0] === engine.diceValue[1];
             const isPairIntact = isPairRoll && engine.availableMoves.filter(m => m === engine.diceValue[0]).length === 2;
             
             if (isPairIntact && diceValue === engine.diceValue[0]) {
                const enemyBlock = engine.players.some(op => op.userId !== player.userId && op.tokens.filter(ot => ot.ownerId !== player.userId && ot.state === 'BOARD' && ot.position === startPos).length >= 2);
                if (!(enemyBlock && engine.rules.safeBlocks)) return true;
             }
          } else {
             // Si se juega con 1 solo dado, aplica la regla del 5
             if (diceValue === 5) {
                if (!ParchisCaptureLogic.isPositionBlocked(engine, startPos)) return true;
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
    if ((engine as any).isTurnTransitioning) return;
    const player = engine.players[engine.currentTurnIndex];
    if (player?.userId !== userId) return;

    if (engine.availableMoves.length > 0) return; // Player still has moves left

    engine.diceValue = Array.from({ length: engine.rules.diceCount }, () => (require('crypto').randomBytes(1)[0] % 6) + 1);
    engine.availableMoves = [...engine.diceValue];
    
    const isPair = engine.rules.diceCount === 2 && engine.diceValue[0] === engine.diceValue[1];

    if (isPair) {
      engine.consecutivePairs++;
      if (engine.consecutivePairs === 3) {
        if (engine.rules.threePairsRule === 'reward') {
          // Si es reward, solo ignoramos el castigo, y lo tratamos como si fuera su primer doble de la racha para que siga tirando.
          engine.consecutivePairs = 1;
        } else {
          // Penalty clásico
          if (engine.lastMovedTokenId) {
            const token = player.tokens.find(t => t.id === engine.lastMovedTokenId);
            if (token && token.state !== 'META' && token.state !== 'FINISHED') {
              token.state = 'HOME';
              token.position = -1;
            }
          }
          // Turn ends immediately
          ParchisTurnLogic.nextTurn(engine);
          return;
        }
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
          // engine.diceValue = []; // Dejar los dados visibles
          engine.broadcastState();
          return;
        }
      }

      engine.availableMoves = []; // Limpiar para que el frontend no crea que tiene movimientos válidos
      engine.broadcastState();
      
      const expectedTurnIndex = engine.currentTurnIndex;
      const expectedPlayerId = player.userId;
      
      (engine as any).isTurnTransitioning = true;
      setTimeout(() => {
        try {
          if (engine.state !== 'PLAYING') return;
          if (engine.currentTurnIndex !== expectedTurnIndex) return;
          if (engine.players[engine.currentTurnIndex]?.userId !== expectedPlayerId) return;
          
          ParchisTurnLogic.nextTurn(engine);
        } finally {
          (engine as any).isTurnTransitioning = false;
        }
      }, AUTO_SKIP_DELAY_MS);
      return;
    }

    engine.broadcastState();
  }

  static nextTurn(engine: ParchisEngine) {
    (engine as any).isTurnTransitioning = false;
    engine.availableMoves = [];
    engine.rollAttempts = 0;
    if (engine.rules.diceCount === 2 && engine.consecutivePairs > 0 && engine.consecutivePairs < 3) {
      // Gets another turn
    } else {
      engine.consecutivePairs = 0;
      engine.currentTurnIndex = (engine.currentTurnIndex + 1) % engine.players.length;
    }
    
    let skips = 0;
    while (engine.players[engine.currentTurnIndex]?.isOffline && engine.state === 'PLAYING' && skips < engine.players.length) {
      engine.currentTurnIndex = (engine.currentTurnIndex + 1) % engine.players.length;
      engine.consecutivePairs = 0;
      skips++;
    }

    if (skips >= engine.players.length) {
        engine.state = 'FINISHED';
    }

    engine.diceValue = [];
    engine.broadcastState();
  }
}
