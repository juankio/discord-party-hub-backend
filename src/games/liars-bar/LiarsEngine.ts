import type { Server } from 'socket.io';
import { BaseGameEngine } from '../../shared/BaseGameEngine.js';
import type { LiarsPlayer, LiarsGameState, Bid, LiarsRules } from './LiarsTypes.js';
import { LiarsPlayLogic } from './LiarsPlayLogic.js';

export class LiarsEngine extends BaseGameEngine<LiarsPlayer> {
    public state: LiarsGameState = 'WAITING';
    public currentTurnIndex: number = 0;
    public currentBid: Bid | null = null;
    public roundWinner: string | null = null;
    public roundLoser: string | null = null;
    public rules: LiarsRules = { initialDice: 5, onesAreWild: true };

    private lastRoundStarterIndex: number = 0;
    private stateTimeout: NodeJS.Timeout | null = null;

    constructor(roomId: string, io: Server) {
        super(roomId, io);
    }

    public addPlayer(userId: string, socketId: string, nickname: string, avatarId: number, color: string) {
        const existing = this.players.find(p => p.userId === userId);
        if (!existing) {
            if (this.state !== 'WAITING') return;
            this.players.push({ userId, socketId, nickname, avatarId, color, diceCount: this.rules.initialDice, dice: [], isEliminated: false });
        } else {
            Object.assign(existing, { socketId, nickname, avatarId, color });
        }
        this.broadcastState();
    }

    public removePlayer(userId: string) {
        const idx = this.players.findIndex(p => p.userId === userId);
        if (idx === -1) return;
        
        const isCurrentTurn = this.state === 'BETTING' && this.players[this.currentTurnIndex]?.userId === userId;

        if (this.state === 'WAITING') {
            this.players.splice(idx, 1);
        } else {
            this.players.splice(idx, 1);
            if (this.checkWinCondition()) {
                this.broadcastState();
                return;
            }
            if (this.players.length === 0) {
                this.state = 'FINISHED';
                this.broadcastState();
                return;
            }
            if (idx < this.currentTurnIndex) {
                this.currentTurnIndex--;
            }
            if (this.currentTurnIndex >= this.players.length) {
                this.currentTurnIndex = 0;
            }
            if (isCurrentTurn) {
                this.advanceTurn();
            }
        }
        this.broadcastState();
    }

    public override autoPlayOfflinePlayer(userId: string) {
        if (this.state !== 'BETTING' || this.players[this.currentTurnIndex]?.userId !== userId) return;
        this.currentBid ? this.callLiar(userId) : this.placeBid(userId, 1, 2);
    }

    public startGame(rules?: Partial<LiarsRules>) {
        if (rules) this.rules = { ...this.rules, ...rules };
        this.players.forEach(p => { p.diceCount = this.rules.initialDice; p.isEliminated = false; });
        this.winner = null;
        this.startRound(this.lastRoundStarterIndex = 0);
    }

    private startRound(starterIndex: number) {
        this.state = 'ROLLING';
        this.currentBid = this.roundWinner = this.roundLoser = null;
        
        LiarsPlayLogic.rollDiceForPlayers(this.players);
        
        let index = starterIndex;
        while (this.players[index]?.isEliminated) index = (index + 1) % this.players.length;
        this.currentTurnIndex = this.lastRoundStarterIndex = index;

        this.broadcastState();
        
        this.setTimer(3000, () => {
            if (this.state === 'ROLLING') {
                this.state = 'BETTING';
                this.broadcastState();
                if (this.players[this.currentTurnIndex]?.isOffline) {
                    this.autoPlayOfflinePlayer(this.players[this.currentTurnIndex].userId);
                }
            }
        });
    }

    public placeBid(userId: string, count: number, face: number) {
        if (this.state !== 'BETTING' || this.players[this.currentTurnIndex]?.userId !== userId) return;
        if (!LiarsPlayLogic.isValidBid(this.currentBid, count, face)) return;

        this.currentBid = { userId, count, face };
        this.broadcastAction('PLACED_BID', userId, { count, face });
        this.broadcastMessage(`${this.players[this.currentTurnIndex].nickname} ha apostado: ${count} dados con cara ${face}.`);
        
        this.advanceTurn();
    }

    public callLiar(userId: string) {
        if (this.state !== 'BETTING' || !this.currentBid || this.players[this.currentTurnIndex]?.userId !== userId) return;

        this.state = 'RESOLUTION';
        this.broadcastAction('CALLED_LIAR', userId);
        this.broadcastMessage(`${this.players[this.currentTurnIndex].nickname} duda de la apuesta.`);

        const result = LiarsPlayLogic.resolveCallLiar(this.players, this.currentBid, userId, this.rules);
        this.roundWinner = result.winnerId;
        this.roundLoser = result.loserId;
        this.broadcastMessage(result.message);
        
        this.broadcastState();

        this.setTimer(6000, () => {
            if (this.checkWinCondition()) return;
            let nextIdx = this.players.findIndex(p => p.userId === this.roundLoser);
            if (nextIdx === -1 || this.players[nextIdx].isEliminated) nextIdx = (nextIdx + 1) % this.players.length;
            this.startRound(nextIdx);
        });
    }

    private advanceTurn() {
        let nextIndex = (this.currentTurnIndex + 1) % this.players.length;
        while (this.players[nextIndex]?.isEliminated) nextIndex = (nextIndex + 1) % this.players.length;
        this.currentTurnIndex = nextIndex;
        this.broadcastState();

        if (this.players[this.currentTurnIndex]?.isOffline) {
            this.setTimer(1000, () => this.autoPlayOfflinePlayer(this.players[this.currentTurnIndex].userId));
        }
    }

    private checkWinCondition(): boolean {
        const active = this.players.filter(p => !p.isEliminated);
        if (active.length <= 1) {
            this.state = 'FINISHED';
            if (active.length === 1) {
                this.winner = active[0].userId;
                this.emit('player_won', this.winner);
                this.broadcastMessage(`¡${active[0].nickname} ha ganado el juego!`);
            }
            this.broadcastState();
            return true;
        }
        return false;
    }

    protected setTimer(ms: number, cb: () => void) {
        this.clearTimers();
        this.stateTimeout = setTimeout(cb, ms);
    }

    protected clearTimers() {
        if (this.stateTimeout) clearTimeout(this.stateTimeout);
        this.stateTimeout = null;
    }

    public override broadcastState() {
        for (const p of this.players) {
            this.emit("game_state_update", {
                targetUserId: p.userId,
                state: LiarsPlayLogic.getPublicState(
                    p.userId, this.state, this.players, 
                    this.players[this.currentTurnIndex]?.userId || '', 
                    this.currentBid, this.winner, this.roundWinner, this.roundLoser, this.rules
                )
            });
        }
    }

    public override destroy() {
        this.clearTimers();
        super.destroy();
    }
}
