import type { ParchisEngine } from './ParchisEngine.js';
import type { ParchisPlayer, ParchisToken } from './ParchisTypes.js';

export class ParchisCaptureLogic {
  static getTokensThatCouldCapture(engine: ParchisEngine, playerIndex: number, userId: string, tokenId: string, diceValue: number): ParchisToken[] {
    if (!engine.rules.autoSoplar) return [];
    const player = engine.players[playerIndex];
    if (!player) return [];

    return player.tokens.filter(t => {
      if (t.id === tokenId) return false;
      if (t.state !== 'BOARD') return false;
      
      const startPosForT = (playerIndex * 17) + 4;
      let travelled = t.position - startPosForT;
      if (travelled < 0) travelled += engine.trackLength;
      
      const newTravelled = travelled + diceValue;
      const maxOnBoard = engine.trackLength - 5;
      if (newTravelled > maxOnBoard) return false; 

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
    });
  }

  static applyCaptureIfAny(engine: ParchisEngine, userId: string, pos: number): boolean {
    let enemyCaptured = false;
    const attacker = engine.players.find(p => p.userId === userId);
    for (const otherPlayer of engine.players) {
      if (otherPlayer.userId === userId) continue;
      for (const otherToken of otherPlayer.tokens) {
        if (otherToken.state === 'BOARD' && otherToken.position === pos) {
          otherToken.state = 'HOME';
          otherToken.position = -1;
          enemyCaptured = true;
          otherPlayer.stats.died++;
          if (attacker) attacker.stats.eaten++;
        }
      }
    }
    return enemyCaptured;
  }

  static isPositionBlocked(engine: ParchisEngine, pos: number): boolean {
    if (engine.rules.safeBlocks === false) return false;
    for (const p of engine.players) {
      const tokensHere = p.tokens.filter(t => t.state === 'BOARD' && t.position === pos).length;
      if (tokensHere >= 2) return true;
    }
    return false;
  }
}
