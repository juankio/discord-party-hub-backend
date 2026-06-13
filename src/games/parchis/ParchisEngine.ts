import type { ParchisPlayer, ParchisRules, ParchisGameState, ParchisPublicState } from './ParchisTypes.js';

export class ParchisEngine {
  public roomId: string;
  public players: ParchisPlayer[] = [];
  public rules: ParchisRules;
  public state: ParchisGameState = 'LOBBY';
  public currentTurnIndex: number = 0;
  private emitEvent: (event: string, payload?: any) => void;
  public diceValue: number[] = [];

  constructor(roomId: string, emitEvent: (event: string, payload?: any) => void) {
    this.roomId = roomId;
    this.emitEvent = emitEvent;
    this.rules = {
      diceCount: 1,
      tokensPerPlayer: 4,
      safeZones: [5, 12, 17, 22, 29, 34, 39, 46, 51, 56, 63, 68]
    };
  }

  public addPlayer(userId: string, socketId: string, nickname: string, avatarId: number, color: string) {
    if (this.players.find(p => p.userId === userId)) return;
    this.players.push({
      userId,
      socketId,
      nickname,
      avatarId,
      color,
      tokens: [],
      isOffline: false,
      hasChosenFigure: false
    });
  }

  public removePlayer(userId: string) {
    this.players = this.players.filter(p => p.userId !== userId);
    this.broadcastState();
  }

  public setPlayerOffline(userId: string, isOffline: boolean) {
    const player = this.players.find(p => p.userId === userId);
    if (player) {
      player.isOffline = isOffline;
      this.broadcastState();
    }
  }

  public startGame(rules?: Partial<ParchisRules>) {
    if (rules) {
      this.rules = { ...this.rules, ...rules };
    }
    
    // Reset figure choices
    this.players.forEach(player => {
      player.hasChosenFigure = false;
      player.selectedFigure = undefined;
    });

    this.state = 'CHOOSING_TOKENS';
    this.currentTurnIndex = 0;
    this.diceValue = [];
    
    this.broadcastState();
  }

  public chooseFigure(userId: string, figureId: string) {
    if (this.state !== 'CHOOSING_TOKENS') return;
    const player = this.players.find(p => p.userId === userId);
    if (!player || player.hasChosenFigure) return;

    player.selectedFigure = figureId;
    player.hasChosenFigure = true;

    const allActivePlayersChosen = this.players.every(p => p.isOffline || p.hasChosenFigure);

    if (allActivePlayersChosen) {
      // Initialize tokens
      this.players.forEach(p => {
        p.tokens = Array.from({ length: this.rules.tokensPerPlayer }, (_, i) => ({
          id: `${p.userId}-token-${i}`,
          color: p.color,
          ownerId: p.userId,
          position: -1,
          state: 'HOME'
        }));
      });
      this.state = 'PLAYING';
    }

    this.broadcastState();
  }

  public rollDice(userId: string) {
    if (this.state !== 'PLAYING') return;
    const player = this.players[this.currentTurnIndex];
    if (player?.userId !== userId) return;

    this.diceValue = Array.from({ length: this.rules.diceCount }, () => Math.floor(Math.random() * 6) + 1);
    
    // TODO: move validation and logic here, for now just emit
    this.emitEvent('parchis:dice_rolled', { userId, dice: this.diceValue });
    this.broadcastState();
  }

  public moveToken(userId: string, tokenId: string) {
    if (this.state !== 'PLAYING') return;
    const player = this.players[this.currentTurnIndex];
    if (player?.userId !== userId) return;

    // TODO: Implement complex movement logic here
    
    this.broadcastState();
  }

  public broadcastState() {
    const publicState: ParchisPublicState = {
      state: this.state,
      players: this.players,
      currentTurnIndex: this.currentTurnIndex,
      rules: this.rules,
      diceValue: this.diceValue
    };
    
    // Send state to everyone
    this.players.forEach(p => {
      this.emitEvent('game_state_update', { targetUserId: p.userId, state: publicState });
    });
  }
}