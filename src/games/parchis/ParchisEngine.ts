import type { ParchisPlayer, ParchisRules, ParchisGameState, ParchisPublicState } from './ParchisTypes.js';

export class ParchisEngine {
  public roomId: string;
  public players: ParchisPlayer[] = [];
  public rules: ParchisRules;
  public state: ParchisGameState = 'LOBBY';
  public currentTurnIndex: number = 0;
  private emitEvent: (event: string, payload?: any) => void;
  public diceValue: number[] = [];
  public availableMoves: number[] = [];
  public consecutivePairs: number = 0;
  public lastMovedTokenId: string | null = null;

  constructor(roomId: string, emitEvent: (event: string, payload?: any) => void) {
    this.roomId = roomId;
    this.emitEvent = emitEvent;
    this.rules = {
      diceCount: 1,
      tokensPerPlayer: 4,
      safeZones: [5, 12, 17, 22, 29, 34, 39, 46, 51, 56, 63, 68],
      exactMeta: true
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
    this.availableMoves = [];
    this.consecutivePairs = 0;
    this.lastMovedTokenId = null;
    
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

    if (this.availableMoves.length > 0) return; // Player still has moves left

    this.diceValue = Array.from({ length: this.rules.diceCount }, () => Math.floor(Math.random() * 6) + 1);
    this.availableMoves = [...this.diceValue];
    
    if (this.rules.diceCount === 2 && this.diceValue[0] === this.diceValue[1]) {
      this.consecutivePairs++;
      if (this.consecutivePairs === 3) {
        if (this.lastMovedTokenId) {
          const token = player.tokens.find(t => t.id === this.lastMovedTokenId);
          if (token && token.state !== 'META') {
            token.state = 'HOME';
            token.position = -1;
          }
        }
        // Turn ends immediately
        this.nextTurn();
        return;
      }
    } else {
      this.consecutivePairs = 0;
    }

    this.emitEvent('parchis:dice_rolled', { userId, dice: this.diceValue });
    
    // Check if player has any valid moves (e.g. no tokens out and no 5 rolled)
    // For skeleton, we skip complex auto-pass logic
    this.broadcastState();
  }

  private nextTurn() {
    this.availableMoves = [];
    if (this.rules.diceCount === 2 && this.consecutivePairs > 0 && this.consecutivePairs < 3) {
      // Gets another turn
    } else {
      this.consecutivePairs = 0;
      this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
    }
    this.diceValue = [];
    this.broadcastState();
  }

  public moveToken(userId: string, tokenId: string, diceValue: number) {
    if (this.state !== 'PLAYING') return;
    const player = this.players[this.currentTurnIndex];
    if (player?.userId !== userId) return;

    const moveIndex = this.availableMoves.indexOf(diceValue);
    if (moveIndex === -1) return; // Not a valid rolled number available

    const token = player.tokens.find(t => t.id === tokenId);
    if (!token) return;

    // Moving out of HOME
    if (token.state === 'HOME') {
      if (diceValue !== 5) return; // Must be a 5 to leave
      token.state = 'BOARD';
      // Set to player's start position (for skeleton, using arbitrary start, e.g., 0)
      token.position = 0; 
      this.availableMoves.splice(moveIndex, 1);
      this.lastMovedTokenId = tokenId;
    } else if (token.state === 'BOARD' || token.state === 'PATH') {
      // Barrier check logic goes here (simplification: checking if target has 2 tokens)
      const newPos = token.position + diceValue;
      
      // Simulate exact meta if applicable
      const maxPos = 68; // Dummy max board size
      if (newPos > maxPos) {
        if (this.rules.exactMeta) {
          const bounce = newPos - maxPos;
          token.position = maxPos - bounce;
        } else {
          token.position = maxPos;
        }
      } else {
        token.position = newPos;
      }

      if (token.position === maxPos) {
        token.state = 'META';
        this.availableMoves.push(10); // +10 bonus for reaching meta
      } else {
        // Capture logic
        const safeZone = this.rules.safeZones.includes(token.position);
        if (!safeZone) {
          let enemyCaptured = false;
          for (const otherPlayer of this.players) {
            if (otherPlayer.userId === userId) continue;
            for (const otherToken of otherPlayer.tokens) {
              if (otherToken.state === 'BOARD' && otherToken.position === token.position) {
                // Check barrier first (if 2 tokens here, can't capture or land, but we skipped full barrier validation)
                // Assuming simple capture
                otherToken.state = 'HOME';
                otherToken.position = -1;
                enemyCaptured = true;
              }
            }
          }
          if (enemyCaptured) {
            this.availableMoves.push(20); // +20 bonus
          }
        }
      }

      this.availableMoves.splice(moveIndex, 1);
      this.lastMovedTokenId = tokenId;
    }

    if (this.availableMoves.length === 0) {
      this.nextTurn();
    } else {
      this.broadcastState();
    }
  }

  public broadcastState() {
    const publicState: ParchisPublicState = {
      state: this.state,
      players: this.players,
      currentTurnIndex: this.currentTurnIndex,
      rules: this.rules,
      diceValue: this.diceValue,
      availableMoves: this.availableMoves,
      consecutivePairs: this.consecutivePairs
    };
    
    // Send state to everyone
    this.players.forEach(p => {
      this.emitEvent('game_state_update', { targetUserId: p.userId, state: publicState });
    });
  }
}