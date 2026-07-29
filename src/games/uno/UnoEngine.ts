import type { Server } from 'socket.io';
import { BaseGameEngine } from '../../shared/BaseGameEngine.js';
import type { Player, UnoRules, GameState, Card, CardColor } from './UnoTypes.js';
import { UnoDeckManager } from './UnoDeck.js';
import { UnoActions } from './UnoActions.js';
import { UnoGameManager } from './UnoGameManager.js';

export class UnoEngine extends BaseGameEngine<Player> {
  public state: GameState = 'WAITING';
  
  public deckManager = new UnoDeckManager();
  
  public currentTurnIndex: number = 0;
  public playDirection: 1 | -1 = 1;
  public currentColor: CardColor | '' = ''; 
  public pendingDraws: number = 0; 
  public actionRequiredFrom: string = ''; 
  public pendingSkips: number = 0;
  
  public rules: UnoRules = {
    stackDrawCards: false, drawUntilPlayable: false,
    playMultipleSame: false, interceptExact: false, zeroAndSevenRules: false
  };

  constructor(roomId: string, io: Server) {
    super(roomId, io);
  }

  public addPlayer(userId: string, socketId: string, nickname: string, avatarId: number, color: string) {
    const existing = this.players.find(p => p.userId === userId);
    if (!existing) {
      if (this.state !== 'WAITING') return;
      this.players.push({ userId, socketId, nickname, avatarId, color, hand: [], hasYelledUno: false });
    } else {
      existing.socketId = socketId; existing.nickname = nickname; existing.avatarId = avatarId; existing.color = color;
    }
  }

  public removePlayer(userId: string) {
    UnoGameManager.removePlayer(this, userId);
  }

  public override autoPlayOfflinePlayer(userId: string) {
    if (this.state === 'WAITING' || this.state === 'FINISHED') return;
    
    if (this.actionRequiredFrom === userId) {
        if (this.state === 'CHOOSING_COLOR') {
           this.declareColor(userId, 'red');
        } else if (this.state === 'CHOOSING_PLAYER') {
           const rival = this.players.find(p => p.userId !== userId && !p.isOffline) || this.players.find(p => p.userId !== userId);
           if (rival) this.swapHands(userId, rival.userId);
        }
    } else if (this.players[this.currentTurnIndex]?.userId === userId && this.state === 'PLAYING') {
        const player = this.players[this.currentTurnIndex];
        
        if (this.pendingDraws > 0) {
            this.drawFromDeck(userId);
        } else {
            if (!player.hasDrawnThisTurn) {
                this.drawFromDeck(userId);
            }
            
            // Re-evaluate since drawFromDeck might have advanced the turn
            if (this.players[this.currentTurnIndex]?.userId === userId) {
                if (player.hasDrawnThisTurn) {
                    this.passTurn(userId);
                } else if (this.rules.drawUntilPlayable) {
                    // To avoid infinite loops if offline player draws until playable forever:
                    // We just force an advance if they are offline.
                    this.advanceTurn(1);
                }
            }
        }
    }
  }

  public startGame(rules: UnoRules, lastWinnerUserId?: string) {
    UnoGameManager.startGame(this, rules, lastWinnerUserId);
  }

  public playCards(userId: string, cardIds: string[]) {
    UnoActions.playCards(this, userId, cardIds);
  }

  public drawFromDeck(userId: string) {
    UnoActions.drawFromDeck(this, userId);
  }

  public passTurn(userId: string) {
    UnoActions.passTurn(this, userId);
  }

  public declareColor(userId: string, color: CardColor) {
    UnoActions.declareColor(this, userId, color);
  }

  public swapHands(userId: string, targetUserId: string) {
    UnoActions.swapHands(this, userId, targetUserId);
  }

  public yellUno(userId: string) {
    UnoGameManager.yellUno(this, userId);
  }

  public challengeUno(challengerId: string, targetId: string) {
    UnoActions.challengeUno(this, challengerId, targetId);
  }

  public surrender(userId: string) {
    UnoActions.surrender(this, userId);
  }

  public applyZeroRule() {
    UnoGameManager.executeZeroRule(this);
  }

  public advanceTurn(steps: number) {
    UnoGameManager.advanceTurn(this, steps);
  }

  public override broadcastState() {
    for (const p of this.players) {
      const myIndex = this.players.findIndex(x => x.userId === p.userId);
      const orderedRivals = [];
      for (let i = 1; i < this.players.length; i++) {
        const rivalIndex = (myIndex + i) % this.players.length;
        orderedRivals.push(this.players[rivalIndex]);
      }

      this.emit("game_state_update", {
        targetUserId: p.userId,
        state: {
          state: this.state, currentTurnUserId: this.players[this.currentTurnIndex]?.userId || '',
          playDirection: this.playDirection, currentColor: this.currentColor,
          pendingDraws: this.pendingDraws, topCard: this.deckManager.getTopDiscard(),
          actionRequiredFrom: this.actionRequiredFrom, winner: this.winner, myHand: p.hand,
          hasDrawnThisTurn: !!p.hasDrawnThisTurn,
          rivals: orderedRivals.map(r => ({
            userId: r.userId, nickname: r.nickname, avatarId: r.avatarId, color: r.color,
            cardCount: r.hand.length, hasYelledUno: r.hasYelledUno, isOffline: r.isOffline
          }))
        }
      });
    }
  }
}
