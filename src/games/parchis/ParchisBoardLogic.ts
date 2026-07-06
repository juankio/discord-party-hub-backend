import type { ParchisEngine } from './ParchisEngine.js';
import { ParchisTurnLogic } from './ParchisTurnLogic.js';
import { ParchisCaptureLogic } from './ParchisCaptureLogic.js';

export class ParchisBoardLogic {
  static moveToken(engine: ParchisEngine, userId: string, tokenId: string, diceValue: number) {
    if (engine.state !== 'PLAYING') return;
    const player = engine.players[engine.currentTurnIndex];
    if (player?.userId !== userId) return;

    const moveIndex = engine.availableMoves.indexOf(diceValue);
    if (moveIndex === -1) return;

    const token = player.tokens.find(t => t.id === tokenId);
    if (!token) return;

    const playerIndex = engine.players.findIndex(p => p.userId === userId);
    const tokensThatCouldCapture = ParchisCaptureLogic.getTokensThatCouldCapture(engine, playerIndex, userId, tokenId, diceValue);
    let enemyCaptured = false;

    if (token.state === 'HOME') {
      const startPos = (playerIndex * 17) + 4;
      if (engine.rules.diceCount === 2) {
        const isPairRoll = engine.diceValue.length === 2 && engine.diceValue[0] === engine.diceValue[1];
        const isPairIntact = isPairRoll && engine.availableMoves.filter(m => m === engine.diceValue[0]).length === 2;

        if (!isPairIntact) return;
        if (diceValue !== engine.diceValue[0]) return;
        if (ParchisCaptureLogic.isPositionBlocked(engine, startPos)) return;
        
        token.state = 'BOARD';
        token.position = startPos;
        engine.availableMoves.splice(moveIndex, 1);
      } else {
        if (diceValue !== 5) return;
        if (ParchisCaptureLogic.isPositionBlocked(engine, startPos)) return;
        token.state = 'BOARD';
        token.position = startPos;
        engine.availableMoves.splice(moveIndex, 1);
      }

      enemyCaptured = ParchisCaptureLogic.applyCaptureIfAny(engine, userId, startPos);
      if (enemyCaptured) engine.availableMoves.push(20);
      engine.lastMovedTokenId = tokenId;
    } else if (token.state === 'BOARD' || token.state === 'PATH' || token.state === 'META') {
      let newPos = token.position;
      let travelled = 0;
      let isMetaMove = false;

      if (token.state === 'META') {
        isMetaMove = true;
        travelled = engine.trackLength - 5 + token.position;
      } else {
        const startPos = (playerIndex * 17) + 4;
        travelled = token.position - startPos;
        if (travelled < 0) travelled += engine.trackLength;
      }

      const newTravelled = travelled + diceValue;
      const maxOnBoard = engine.trackLength - 5;
      
      if (newTravelled > maxOnBoard) {
        const metaPos = newTravelled - maxOnBoard;
        if (metaPos > 8) return;
        if (metaPos === 8) {
           token.state = 'FINISHED';
           token.position = 0;
           player.stats.crowned++;
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
        if (isMetaMove) return;
        
        newPos = (token.position + diceValue) % engine.trackLength;
        if (ParchisCaptureLogic.isPositionBlocked(engine, newPos)) return;
        token.position = newPos;
        const safeZone = engine.rules.safeZones.includes(token.position);
        if (!safeZone) {
          enemyCaptured = ParchisCaptureLogic.applyCaptureIfAny(engine, userId, token.position);
          if (enemyCaptured) engine.availableMoves.push(20);
        }
      }

      engine.availableMoves.splice(moveIndex, 1);
      engine.lastMovedTokenId = tokenId;
    }

    if (engine.rules.autoSoplar && !enemyCaptured) {
      tokensThatCouldCapture.forEach(t => { t.state = 'HOME'; t.position = -1; });
    }

    if (engine.availableMoves.length === 0) ParchisTurnLogic.nextTurn(engine);
    else engine.broadcastState();
  }
}
