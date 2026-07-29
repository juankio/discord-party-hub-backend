import type { ParchisEngine } from "./ParchisEngine.js";
import type { ParchisRules } from "./ParchisTypes.js";

const INITIATIVE_REVEAL_DELAY_MS = 2500;

export class ParchisSetupLogic {
  public static startGame(engine: ParchisEngine, rules?: Partial<ParchisRules>) {
    if (rules) engine.rules = { ...engine.rules, ...rules };
    if (!engine.rules.parchisBoardSize) engine.rules.parchisBoardSize = 4;

    if (engine.players.length > engine.rules.parchisBoardSize) {
      throw new Error(`Cannot start Parchis: ${engine.players.length} players exceeds board size of ${engine.rules.parchisBoardSize}.`);
    }

    const safeZones: number[] = [];
    for (let i = 0; i < engine.rules.parchisBoardSize; i++) {
      const base = i * 17;
      safeZones.push(base + 4, base + 8, base + 12);
    }
    
    if (engine.rules.parchisBoardSize === 4) engine.rules.safeZones = [4, 8, 12, 21, 25, 29, 38, 42, 46, 55, 59, 63];
    else engine.rules.safeZones = safeZones;

    engine.players.forEach(p => { p.hasChosenFigure = false; p.selectedFigure = undefined; });
    Object.assign(engine, { 
      state: 'CHOOSING_TOKENS', currentTurnIndex: 0, diceValue: [], availableMoves: [], 
      consecutivePairs: 0, lastMovedTokenId: null, rollAttempts: 0, pickersQueue: [], takenSeats: [], winner: null
    });
    engine.broadcastState();
  }

  public static chooseFigure(engine: ParchisEngine, userId: string, figureId: string) {
    if (engine.state !== 'CHOOSING_TOKENS') return;
    const player = engine.players.find(p => p.userId === userId);
    if (!player || player.hasChosenFigure) return;
    if (engine.players.some(p => p.selectedFigure === figureId)) return;

    player.selectedFigure = figureId;
    player.hasChosenFigure = true;

    if (engine.players.every(p => p.isOffline || p.hasChosenFigure)) {
      engine.players.forEach(p => {
        p.tokens = Array.from({ length: engine.rules.tokensPerPlayer }, (_, i) => ({
          id: `${p.userId}-token-${i}`, color: p.color, ownerId: p.userId, position: -1, state: 'HOME'
        }));
      });
      engine.state = 'ROLLING_FOR_ORDER';
      engine.initiativeRolls = {};
      engine.firstPickerUserId = null;
      engine.pickersQueue = [];
      engine.takenSeats = [];
      
      setTimeout(() => {
        engine.players.filter(p => p.isOffline).forEach(p => engine.autoPlayOfflinePlayer(p.userId));
      }, 500);
    }
    engine.broadcastState();
  }

  public static rollInitiative(engine: ParchisEngine, userId: string) {
    if (engine.state !== 'ROLLING_FOR_ORDER') return;
    const player = engine.players.find(p => p.userId === userId);
    if (!player || player.isOffline) return;
    if (engine.initiativeRolls[userId]) return;

    // Asignar un nuevo objeto para forzar la reactividad en el frontend (Vue/Pinia)
    // Asegurar azar verdadero
    const crypto = require('crypto');
    const roll = (crypto.randomBytes(1)[0] % 6) + 1;
    engine.initiativeRolls = { ...engine.initiativeRolls, [userId]: roll };
    engine.diceValue = [roll];

    const activePlayers = engine.players.filter(p => !p.isOffline);
    if (activePlayers.every(p => engine.initiativeRolls[p.userId])) {
      // Todos han tirado, transmitimos el estado para que se vea el último dado tirado
      engine.broadcastState();

      // Esperamos 2.5s antes de cambiar de fase, para que el jugador vea su tirada
      setTimeout(() => {
        if (engine.state !== 'ROLLING_FOR_ORDER') return; // Safety check
        
        const sortedPlayers = [...activePlayers].sort((a, b) => {
          const diff = engine.initiativeRolls[b.userId] - engine.initiativeRolls[a.userId];
          return diff !== 0 ? diff : Math.random() - 0.5;
        });

        engine.state = 'CHOOSING_SEATS'; // Update immediately to prevent race conditions from other timeouts
        engine.pickersQueue = sortedPlayers.map(p => p.userId);
        engine.firstPickerUserId = engine.pickersQueue[0] || null;
        engine.broadcastState();
        
        if (engine.firstPickerUserId) {
          const firstPicker = engine.players.find(p => p.userId === engine.firstPickerUserId);
          if (firstPicker?.isOffline) {
            setTimeout(() => {
              engine.autoPlayOfflinePlayer(engine.firstPickerUserId!);
            }, 500);
          }
        }
      }, INITIATIVE_REVEAL_DELAY_MS);
      return;
    }
    engine.broadcastState();
  }

  public static chooseSeat(engine: ParchisEngine, userId: string, targetColorIndex: number) {
    if (engine.state !== 'CHOOSING_SEATS') return;
    if (engine.pickersQueue.length === 0) return;
    if (userId !== engine.firstPickerUserId) return;
    
    const standardColors = ['yellow', 'blue', 'red', 'green'];
    if (engine.sides === 6) standardColors.push('purple', 'orange');
    if (engine.sides === 8) standardColors.push('purple', 'orange', 'pink', 'cyan');

    const actualTargetIndex = targetColorIndex % engine.sides;

    if (engine.takenSeats.includes(actualTargetIndex)) return;

    const player = engine.players.find(p => p.userId === userId);
    if (!player) return;

    const newColor = standardColors[actualTargetIndex] || 'gray';
    player.color = newColor;
    player.tokens.forEach(t => t.color = newColor);

    engine.takenSeats.push(actualTargetIndex);
    player._seatIndex = actualTargetIndex;

    engine.pickersQueue.shift();

    if (engine.pickersQueue.length > 0) {
      engine.firstPickerUserId = engine.pickersQueue[0];
      const nextPicker = engine.players.find(p => p.userId === engine.firstPickerUserId);
      if (nextPicker?.isOffline) {
        setTimeout(() => {
          engine.autoPlayOfflinePlayer(engine.firstPickerUserId!);
        }, 500);
      }
    } else {
      const unseatedPlayers = engine.players.filter(p => p._seatIndex === undefined);
      for (const p of unseatedPlayers) {
        const availableSeats = [];
        for (let i = 0; i < engine.sides; i++) {
          if (!engine.takenSeats.includes(i)) availableSeats.push(i);
        }
        if (availableSeats.length > 0) {
          const randomSeatIndex = availableSeats[Math.floor(Math.random() * availableSeats.length)];
          const offColor = standardColors[randomSeatIndex] || 'gray';
          p.color = offColor;
          p.tokens.forEach(t => t.color = offColor);
          engine.takenSeats.push(randomSeatIndex);
          p._seatIndex = randomSeatIndex;
        }
      }

      engine.players.sort((a, b) => (a._seatIndex || 0) - (b._seatIndex || 0));
      engine.players.forEach(p => delete p._seatIndex);

      engine.currentTurnIndex = 0;
      engine.state = 'PLAYING';

      let skips = 0;
      while (engine.players[engine.currentTurnIndex]?.isOffline && engine.state === 'PLAYING' && skips < engine.players.length) {
        engine.currentTurnIndex = (engine.currentTurnIndex + 1) % engine.players.length;
        skips++;
      }
      if (skips >= engine.players.length) {
        engine.state = 'FINISHED';
      }
    }

    engine.broadcastState();
  }
}
