import type { ParchisEngine } from './ParchisEngine.js';
import { ParchisTurnLogic } from './ParchisTurnLogic.js';

export class ParchisBoardLogic {
  static moveToken(engine: ParchisEngine, userId: string, tokenId: string, diceValue: number) {
    if (engine.state !== 'PLAYING') return;
    const player = engine.players[engine.currentTurnIndex];
    if (player?.userId !== userId) return;

    const moveIndex = engine.availableMoves.indexOf(diceValue);
    if (moveIndex === -1) return; // Not a valid rolled number available

    const token = player.tokens.find(t => t.id === tokenId);
    if (!token) return;

    const playerIndex = engine.players.findIndex(p => p.userId === userId);

    // Auto-soplar calculation BEFORE move
    const tokensThatCouldCapture = engine.rules.autoSoplar ? player.tokens.filter(t => {
      if (t.id === tokenId) return false;
      if (t.state !== 'BOARD') return false;
      
      const startPosForT = (playerIndex * 17) + 4;
      let travelled = t.position - startPosForT;
      if (travelled < 0) travelled += engine.trackLength;
      
      const newTravelled = travelled + diceValue;
      const maxOnBoard = engine.trackLength - 5;
      if (newTravelled > maxOnBoard) return false; // Cannot capture in meta

      const testPos = (t.position + diceValue) % engine.trackLength;
      const isSafe = engine.rules.safeZones.includes(testPos);
      if (isSafe) return false;
      
      let canCap = false;
      for (const op of engine.players) {
        if (op.userId === userId) continue;
        const enemies = op.tokens.filter(et => et.state === 'BOARD' && et.position === testPos).length;
        if (enemies > 0) {
          if (engine.rules.safeBlocks !== false && enemies >= 2) {
             // Blocked, cannot capture
          } else {
             canCap = true;
          }
        }
      }
      return canCap;
    }) : [];

    let enemyCaptured = false;

    // Moving out of HOME
    if (token.state === 'HOME') {
      const startPos = (playerIndex * 17) + 4;

      if (engine.rules.diceCount === 2) {
        if (engine.diceValue[0] !== engine.diceValue[1]) return; // Must be a pair to leave

        if (engine.rules.safeBlocks !== false) {
           const myTokensHere = player.tokens.filter(t => t.state === 'BOARD' && t.position === startPos).length;
           if (myTokensHere >= 2) {
             return; // Cannot exit because I already have a block there
           }
        }

        token.state = 'BOARD';
        token.position = startPos;
        
        if (diceValue === 1 || diceValue === 6) {
          // Salen todas!
          player.tokens.forEach(t => {
            if (t.state === 'HOME') {
              t.state = 'BOARD';
              t.position = startPos;
            }
          });
          engine.availableMoves = [];
        } else {
          engine.availableMoves.splice(moveIndex, 1);
        }
      } else {
        if (diceValue !== 5) return; // Must be a 5 to leave
        
        if (engine.rules.safeBlocks !== false) {
           const myTokensHere = player.tokens.filter(t => t.state === 'BOARD' && t.position === startPos).length;
           if (myTokensHere >= 2) {
             return; // Cannot exit because I already have a block there
           }
        }

        token.state = 'BOARD';
        token.position = startPos;
        engine.availableMoves.splice(moveIndex, 1);
      }

      // Captura en Salida
      for (const otherPlayer of engine.players) {
        if (otherPlayer.userId === userId) continue;
        for (const otherToken of otherPlayer.tokens) {
          if (otherToken.state === 'BOARD' && otherToken.position === startPos) {
            otherToken.state = 'HOME';
            otherToken.position = -1;
            enemyCaptured = true;
          }
        }
      }
      
      if (enemyCaptured) {
        engine.availableMoves.push(20);
      }

      engine.lastMovedTokenId = tokenId;

    } else if (token.state === 'BOARD' || token.state === 'PATH') {
      const newPos = (token.position + diceValue) % engine.trackLength;
      
      // Simulate exact meta if applicable
      const startPos = (playerIndex * 17) + 4;
      let travelled = token.position - startPos;
      if (travelled < 0) travelled += engine.trackLength;

      const newTravelled = travelled + diceValue;
      const maxOnBoard = engine.trackLength - 5;
      
      if (newTravelled > maxOnBoard) {
        const metaPos = newTravelled - maxOnBoard;
        if (metaPos > 8) return; // Exact bounce / reject
        if (metaPos === 8) {
           token.state = 'FINISHED';
           token.position = 0;
           
           if (player.tokens.every(t => t.state === 'FINISHED')) {
               engine.winner = player.userId;
               engine.state = 'FINISHED';
               engine.emit('player_won', engine.winner);
           }
        } else {
           token.state = 'META';
           token.position = metaPos;
        }
      } else {
        // Block validation
        if (engine.rules.safeBlocks !== false) {
          let blockExists = false;
          for (const p of engine.players) {
            const tokensHere = p.tokens.filter(t => t.state === 'BOARD' && t.position === newPos).length;
            if (tokensHere >= 2) {
              blockExists = true;
              break;
            }
          }
          if (blockExists) return; // Ignore move
        }

        token.position = newPos;
        
        // Capture logic
        const safeZone = engine.rules.safeZones.includes(token.position);
        if (!safeZone) {
          for (const otherPlayer of engine.players) {
            if (otherPlayer.userId === userId) continue;
            for (const otherToken of otherPlayer.tokens) {
              if (otherToken.state === 'BOARD' && otherToken.position === token.position) {
                otherToken.state = 'HOME';
                otherToken.position = -1;
                enemyCaptured = true;
              }
            }
          }
          if (enemyCaptured) {
            engine.availableMoves.push(20); // +20 bonus
          }
        }
      }

      engine.availableMoves.splice(moveIndex, 1);
      engine.lastMovedTokenId = tokenId;
    }

    // Process auto-soplar
    if (engine.rules.autoSoplar && !enemyCaptured) {
      tokensThatCouldCapture.forEach(t => {
        t.state = 'HOME';
        t.position = -1;
      });
    }

    if (engine.availableMoves.length === 0) {
      ParchisTurnLogic.nextTurn(engine);
    } else {
      engine.broadcastState();
    }
  }
}
