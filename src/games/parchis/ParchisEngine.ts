import { EventEmitter } from 'events';
import type { ParchisPlayer, ParchisRules, ParchisGameState, ParchisPublicState } from './ParchisTypes.js';
import { ParchisTurnLogic } from './ParchisTurnLogic.js';
import { ParchisBoardLogic } from './ParchisBoardLogic.js';

export class ParchisEngine extends EventEmitter {
  public roomId: string;
  public players: ParchisPlayer[] = [];
  public rules: ParchisRules;
  public winner: string | null = null;
  public state: ParchisGameState = 'LOBBY';
  public currentTurnIndex: number = 0;
  public diceValue: number[] = [];
  public availableMoves: number[] = [];
  public consecutivePairs: number = 0;
  public lastMovedTokenId: string | null = null;
  public rollAttempts: number = 0;
  
  public initiativeRolls: Record<string, number> = {};
  public firstPickerUserId: string | null = null;
  public pickersQueue: string[] = [];
  public takenSeats: number[] = [];

  public get sides() { return this.rules.parchisBoardSize || 4; }
  public get trackLength() { return this.sides * 17; }
  public get maxPos() { return 105; }

  constructor(roomId: string) {
    super();
    this.roomId = roomId;
    this.rules = {
      diceCount: 1, tokensPerPlayer: 4, parchisBoardSize: 4,
      safeZones: [4, 11, 16, 21, 28, 33, 38, 45, 50, 55, 62, 67], exactMeta: true
    };
  }

  public addPlayer(userId: string, socketId: string, nickname: string, avatarId: number, color: string) {
    if (this.players.find(p => p.userId === userId)) return;
    this.players.push({ 
      userId, socketId, nickname, avatarId, color, tokens: [], isOffline: false, hasChosenFigure: false,
      stats: { eaten: 0, died: 0, crowned: 0 }
    });
  }

  public removePlayer(userId: string) {
    this.players = this.players.filter(p => p.userId !== userId);
    this.checkVictoryBySurrender();
    this.broadcastState();
  }

  public surrender(userId: string) {
    if (this.state !== 'PLAYING' && this.state !== 'CHOOSING_TOKENS') return;
    this.removePlayer(userId);
  }

  private checkVictoryBySurrender() {
    if ((this.state === 'PLAYING' || this.state === 'CHOOSING_TOKENS') && this.players.length === 1) {
      this.winner = this.players[0].userId;
      this.state = 'FINISHED';
      this.emit('player_won', this.winner);
    } else if (this.players.length === 0) {
      this.state = 'FINISHED';
    }
  }

  public setPlayerOffline(userId: string, isOffline: boolean) {
    const player = this.players.find(p => p.userId === userId);
    if (player) { player.isOffline = isOffline; this.broadcastState(); }
  }

  public startGame(rules?: Partial<ParchisRules>) {
    if (rules) this.rules = { ...this.rules, ...rules };
    if (!this.rules.parchisBoardSize) this.rules.parchisBoardSize = 4;

    if (this.players.length > this.rules.parchisBoardSize) {
      throw new Error(`Cannot start Parchis: ${this.players.length} players exceeds board size of ${this.rules.parchisBoardSize}.`);
    }

    const safeZones: number[] = [];
    for (let i = 0; i < this.rules.parchisBoardSize; i++) {
      const base = i * 17;
      safeZones.push(base + 4, base + 12, base + 16);
    }
    
    if (this.rules.parchisBoardSize === 4) this.rules.safeZones = [4, 11, 16, 21, 28, 33, 38, 45, 50, 55, 62, 67];
    else this.rules.safeZones = safeZones;

    this.players.forEach(p => { p.hasChosenFigure = false; p.selectedFigure = undefined; });
    Object.assign(this, { state: 'CHOOSING_TOKENS', currentTurnIndex: 0, diceValue: [], availableMoves: [], consecutivePairs: 0, lastMovedTokenId: null, rollAttempts: 0, pickersQueue: [], takenSeats: [] });
    this.broadcastState();
  }

  public chooseFigure(userId: string, figureId: string) {
    if (this.state !== 'CHOOSING_TOKENS') return;
    const player = this.players.find(p => p.userId === userId);
    if (!player || player.hasChosenFigure) return;
    if (this.players.some(p => p.selectedFigure === figureId)) return;

    player.selectedFigure = figureId;
    player.hasChosenFigure = true;

    if (this.players.every(p => p.isOffline || p.hasChosenFigure)) {
      this.players.forEach(p => {
        p.tokens = Array.from({ length: this.rules.tokensPerPlayer }, (_, i) => ({
          id: `${p.userId}-token-${i}`, color: p.color, ownerId: p.userId, position: -1, state: 'HOME'
        }));
      });
      this.state = 'ROLLING_FOR_ORDER';
      this.initiativeRolls = {};
      this.firstPickerUserId = null;
      this.pickersQueue = [];
      this.takenSeats = [];
    }
    this.broadcastState();
  }

  public rollDice(userId: string) { ParchisTurnLogic.rollDice(this, userId); }
  public moveToken(userId: string, tokenId: string, diceValue: number) { ParchisBoardLogic.moveToken(this, userId, tokenId, diceValue); }
  public nextTurn() { ParchisTurnLogic.nextTurn(this); }

  public rollInitiative(userId: string) {
    if (this.state !== 'ROLLING_FOR_ORDER') return;
    const player = this.players.find(p => p.userId === userId);
    if (!player || player.isOffline) return;
    if (this.initiativeRolls[userId]) return;

    this.initiativeRolls[userId] = Math.floor(Math.random() * 6) + 1;

    const activePlayers = this.players.filter(p => !p.isOffline);
    if (activePlayers.every(p => this.initiativeRolls[p.userId])) {
      const sortedPlayers = [...activePlayers].sort((a, b) => {
        const diff = this.initiativeRolls[b.userId] - this.initiativeRolls[a.userId];
        return diff !== 0 ? diff : Math.random() - 0.5;
      });

      this.pickersQueue = sortedPlayers.map(p => p.userId);
      this.firstPickerUserId = this.pickersQueue[0] || null;
      this.state = 'CHOOSING_SEATS';
    }
    this.broadcastState();
  }

  public chooseSeat(userId: string, targetColorIndex: number) {
    if (this.state !== 'CHOOSING_SEATS') return;
    if (userId !== this.firstPickerUserId) return;
    
    const standardColors = ['green', 'yellow', 'blue', 'red'];
    if (this.sides === 6) standardColors.push('purple', 'orange');
    if (this.sides === 8) standardColors.push('purple', 'orange', 'cyan', 'pink');

    const actualTargetIndex = targetColorIndex % this.sides;

    if (this.takenSeats.includes(actualTargetIndex)) return;

    const player = this.players.find(p => p.userId === userId);
    if (!player) return;

    const newColor = standardColors[actualTargetIndex] || 'gray';
    player.color = newColor;
    player.tokens.forEach(t => t.color = newColor);

    this.takenSeats.push(actualTargetIndex);
    (player as any)._seatIndex = actualTargetIndex;

    this.pickersQueue.shift();

    if (this.pickersQueue.length > 0) {
      this.firstPickerUserId = this.pickersQueue[0];
    } else {
      const offlinePlayers = this.players.filter(p => p.isOffline);
      for (const offPlayer of offlinePlayers) {
        const availableSeats = [];
        for (let i = 0; i < this.sides; i++) {
          if (!this.takenSeats.includes(i)) availableSeats.push(i);
        }
        if (availableSeats.length > 0) {
          const randomSeatIndex = availableSeats[Math.floor(Math.random() * availableSeats.length)];
          const offColor = standardColors[randomSeatIndex] || 'gray';
          offPlayer.color = offColor;
          offPlayer.tokens.forEach(t => t.color = offColor);
          this.takenSeats.push(randomSeatIndex);
          (offPlayer as any)._seatIndex = randomSeatIndex;
        }
      }

      this.players.sort((a, b) => ((a as any)._seatIndex || 0) - ((b as any)._seatIndex || 0));
      this.players.forEach(p => delete (p as any)._seatIndex);

      this.currentTurnIndex = 0;
      this.state = 'PLAYING';
    }

    this.broadcastState();
  }

  public broadcastState() {
    const state: ParchisPublicState = {
      state: this.state, players: this.players, currentTurnIndex: this.currentTurnIndex,
      rules: this.rules, diceValue: this.diceValue, availableMoves: this.availableMoves,
      consecutivePairs: this.consecutivePairs, winner: this.winner,
      initiativeRolls: this.initiativeRolls, firstPickerUserId: this.firstPickerUserId,
      pickersQueue: this.pickersQueue, takenSeats: this.takenSeats
    };
    this.players.forEach(p => this.emit('game_state_update', { targetUserId: p.userId, state }));
  }
}
