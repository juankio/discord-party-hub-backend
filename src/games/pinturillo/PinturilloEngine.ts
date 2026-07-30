import type { Server } from 'socket.io';
import { BaseGameEngine } from '../../shared/BaseGameEngine.js';
import { PinturilloState, PinturilloPlayer, DrawEvent } from './PinturilloTypes.js';
import { calculateDrawerPoints, getPublicState, processChatAttempt } from './PinturilloChatLogic.js';

export class PinturilloEngine extends BaseGameEngine<PinturilloPlayer> {
  public state: PinturilloState = PinturilloState.LOBBY;
  public currentDrawerId: string | null = null;
  public secretWord: string | null = null;
  public wordChoices: string[] = [];
  public round: number = 0;
  public maxRounds: number = 3;
  
  private turnQueue: string[] = [];
  private stateTimer: ReturnType<typeof setTimeout> | null = null;
  private roundStartTime: number = 0;
  private roundTimeMs: number = 80000;
  private drawHistory: DrawEvent[] = [];

  constructor(roomId: string, io: Server) { super(roomId, io); }

  public addPlayer(userId: string, socketId: string, nickname: string, avatarId: number, color: string) {
    const existing = this.getPlayer(userId);
    if (existing) {
      Object.assign(existing, { isConnected: true, socketId, nickname, avatarId, color });
    } else {
      this.players.push({
        userId, socketId, nickname, avatarId, color, name: nickname, id: userId, 
        score: 0, hasGuessed: false, isConnected: true, isOffline: false
      });
      this.turnQueue.push(userId);
      this.emit('chat_message', { isSystem: true, text: `${nickname} se unió a la sala.` });
    }
    this.broadcastState();
  }

  public removePlayer(userId: string) {
    const player = this.getPlayer(userId);
    if (!player) return;
    player.isConnected = false;
    player.isOffline = true;
    this.emit('chat_message', { isSystem: true, text: `${player.nickname} se ha desconectado.` });
    
    const activePlayersCount = this.players.filter(p => p.isConnected).length;
    if (activePlayersCount < 2 && this.state !== PinturilloState.LOBBY && this.state !== PinturilloState.FINISHED) {
      this.endGame();
      return;
    }

    if (this.state === PinturilloState.DRAWING && this.currentDrawerId === userId) {
      this.endRoundEarly("El dibujante se ha desconectado.");
    } else {
      this.checkAllGuessed();
    }
    this.broadcastState();
  }

  public startGame(maxRounds: number = 3) {
    if (this.players.length < 2) throw new Error("Se necesitan al menos 2 jugadores.");
    this.maxRounds = maxRounds;
    this.round = 1;
    this.players.forEach(p => p.score = 0);
    this.startNextTurn();
  }

  private startNextTurn(): void {
    this.drawHistory = [];
    this.players.forEach(p => p.hasGuessed = false);
    
    if (this.turnQueue.length === 0) {
      this.turnQueue = this.players.filter(p => p.isConnected).map(p => p.userId);
      if (this.turnQueue.length === 0 || ++this.round > this.maxRounds) return this.endGame();
    }
    
    this.currentDrawerId = this.turnQueue.shift() || null;
    if (!this.currentDrawerId || !this.getPlayer(this.currentDrawerId)?.isConnected) {
      return this.startNextTurn();
    }

    this.state = PinturilloState.CHOOSING_WORD;
    this.secretWord = null;
    this.wordChoices = ['Gato', 'Pirata', 'Espada']; 
    
    const drawer = this.getPlayer(this.currentDrawerId)!;
    this.emit('chat_message', { isSystem: true, text: `¡Es el turno de ${drawer.nickname}! Eligiendo palabra...` });
    
    this.setTimer(15000, () => this.chooseWord(this.currentDrawerId!, this.wordChoices[0]));
    this.broadcastState();
  }

  public chooseWord(playerId: string, word: string) {
    if (this.state !== PinturilloState.CHOOSING_WORD || this.currentDrawerId !== playerId || !this.wordChoices.includes(word)) return;
    
    this.clearTimer();
    this.secretWord = word;
    this.state = PinturilloState.DRAWING;
    
    this.emit('chat_message', { isSystem: true, text: `¡El dibujante ha elegido una palabra! Adivinen.` });
    this.setTimer(80000, () => this.endRoundEarly("¡Se acabó el tiempo!"));
    this.broadcastState();
  }

  private endRoundEarly(reason: string) {
    this.clearTimer();
    this.state = PinturilloState.ROUND_RESULTS;
    this.emit('chat_message', { isSystem: true, text: `${reason} La palabra era: ${this.secretWord}` });
    
    if (this.currentDrawerId) {
      const drawer = this.getPlayer(this.currentDrawerId);
      if (drawer) drawer.score += calculateDrawerPoints(this.players, this.currentDrawerId);
    }
    
    this.broadcastState();
    this.setTimer(5000, () => this.startNextTurn());
  }

  private endGame() {
    this.clearTimer();
    this.state = PinturilloState.FINISHED;
    this.emit('chat_message', { isSystem: true, text: "¡El juego ha terminado!" });
    this.broadcastState();
  }

  public handleDrawEvent(playerId: string, event: DrawEvent) {
    if (this.state !== PinturilloState.DRAWING || this.currentDrawerId !== playerId) return;
    event.type === 'clear' ? (this.drawHistory = []) : this.drawHistory.push(event);
    this.emit('draw_broadcast', { senderId: playerId, event });
  }

  public handleChat(playerId: string, text: string) {
    const player = this.getPlayer(playerId);
    if (!player) return;

    const timeRemainingMs = Math.max(0, this.roundTimeMs - (Date.now() - this.roundStartTime));
    const action = processChatAttempt(player, text, this.state, this.currentDrawerId, this.secretWord, timeRemainingMs, this.roundTimeMs);

    switch (action.type) {
      case 'drawer_warning':
      case 'private_warning':
        if (action.type === 'private_warning') this.emit('chat_message', { playerId, playerName: player.nickname, text, isSystem: false });
        this.emit('private_message', { targetId: playerId, message: { text: action.message, isSystem: true } });
        break;
      case 'broadcast_chat':
        this.emit('chat_message', { playerId, playerName: player.nickname, text, isSystem: false });
        break;
      case 'ghost_chat':
        this.emit('ghost_chat', { playerId, playerName: player.nickname, text });
        break;
      case 'correct_guess':
        player.hasGuessed = true;
        player.score += action.points || 0;
        this.emit('chat_message', { isSystem: true, text: `¡${player.nickname} ha adivinado la palabra!` });
        this.broadcastState();
        this.checkAllGuessed();
        break;
    }
  }

  private checkAllGuessed() {
    if (this.state !== PinturilloState.DRAWING) return;
    const allGuessed = this.players.every(p => p.userId === this.currentDrawerId || !p.isConnected || p.hasGuessed);
    if (allGuessed) this.endRoundEarly("¡Todos han adivinado!");
  }

  private setTimer(ms: number, callback: () => void) {
    this.clearTimer();
    this.roundStartTime = Date.now();
    this.roundTimeMs = ms;
    this.stateTimer = setTimeout(callback, ms);
  }

  private clearTimer() {
    if (this.stateTimer) {
      clearTimeout(this.stateTimer);
      this.stateTimer = null;
    }
  }

  public override broadcastState() {
    const timeRemainingSec = this.stateTimer 
      ? Math.max(0, Math.floor((this.roundTimeMs - (Date.now() - this.roundStartTime)) / 1000))
      : 0;
      
    for (const p of this.players) {
      this.emit('game_state_update', {
        targetUserId: p.userId,
        state: getPublicState(p.userId, this.state, this.players, this.currentDrawerId, this.secretWord, this.wordChoices, this.round, this.maxRounds, this.drawHistory, timeRemainingSec)
      });
    }
  }
}
