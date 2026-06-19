import type { ParchisPlayer, ParchisRules, ParchisGameState, ParchisPublicState } from './ParchisTypes.js';

export class ParchisEngine {
  public roomId: string;
  public players: ParchisPlayer[] = [];
  public rules: ParchisRules;
  public winner: string | null = null;
  public state: ParchisGameState = 'LOBBY';
  public currentTurnIndex: number = 0;
  private emitEvent: (event: string, payload?: any) => void;
  public diceValue: number[] = [];
  public availableMoves: number[] = [];
  public consecutivePairs: number = 0;
  public lastMovedTokenId: string | null = null;
  public rollAttempts: number = 0;

  public get sides() {
    return this.rules.parchisBoardSize || 4;
  }

  public get trackLength() {
    return this.sides * 17;
  }

  constructor(roomId: string, emitEvent: (event: string, payload?: any) => void) {
    this.roomId = roomId;
    this.emitEvent = emitEvent;
    this.rules = {
      diceCount: 1,
      tokensPerPlayer: 4,
      parchisBoardSize: 4,
      safeZones: [4, 11, 16, 21, 28, 33, 38, 45, 50, 55, 62, 67],
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
    this.checkVictoryBySurrender();
    this.broadcastState();
  }

  public surrender(userId: string) {
    if (this.state !== 'PLAYING' && this.state !== 'CHOOSING_TOKENS') return;
    const player = this.players.find(p => p.userId === userId);
    if (!player) return;
    
    // Broadcast text or just remove
    this.removePlayer(userId);
  }

  private checkVictoryBySurrender() {
    if ((this.state === 'PLAYING' || this.state === 'CHOOSING_TOKENS') && this.players.length === 1) {
      this.winner = this.players[0].userId;
      this.state = 'FINISHED';
    } else if (this.players.length === 0) {
      this.state = 'FINISHED';
    }
  }

  public setPlayerOffline(userId: string, isOffline: boolean) {
    const player = this.players.find(p => p.userId === userId);
    if (player) {
      player.isOffline = isOffline;
      this.broadcastState();
    }
  }

  public get maxPos() {
    return 105; // 97 + 8 squares in meta path
  }

  public startGame(rules?: Partial<ParchisRules>) {
    if (rules) {
      this.rules = { ...this.rules, ...rules };
    }
    
    if (!this.rules.parchisBoardSize) {
      this.rules.parchisBoardSize = 4; // defaults to 4 if missing
    }

    // Generate safe zones dynamically based on board size
    const safeZones: number[] = [];
    for (let i = 0; i < this.rules.parchisBoardSize; i++) {
      const base = i * 17;
      safeZones.push(base + 4); // Salida
      safeZones.push(base + 12); // Seguro (opposite to Salida on circular board)
      safeZones.push(base + 16); // Corner
    }
    
    // For classic 4-player board, the opposite of 4 is 11. For circular it's 12.
    // To match the frontend visual which is 11 for 4-player and 12 for 6/8-player:
    if (this.rules.parchisBoardSize === 4) {
      this.rules.safeZones = [4, 11, 16, 21, 28, 33, 38, 45, 50, 55, 62, 67];
    } else {
      this.rules.safeZones = safeZones;
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
    this.rollAttempts = 0;
    
    this.broadcastState();
  }

  public chooseFigure(userId: string, figureId: string) {
    console.log(`[PARCHIS] chooseFigure called: userId=${userId}, figureId=${figureId}`);
    if (this.state !== 'CHOOSING_TOKENS') return;
    const player = this.players.find(p => p.userId === userId);
    if (!player) {
      console.log(`[PARCHIS] chooseFigure failed: player not found`);
      return;
    }
    if (player.hasChosenFigure) {
      console.log(`[PARCHIS] chooseFigure failed: player already chose`);
      return;
    }

    player.selectedFigure = figureId;
    player.hasChosenFigure = true;

    const allActivePlayersChosen = this.players.every(p => p.isOffline || p.hasChosenFigure);
    console.log(`[PARCHIS] allActivePlayersChosen: ${allActivePlayersChosen}`);

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
    
    const isPair = this.rules.diceCount === 2 && this.diceValue[0] === this.diceValue[1];

    if (isPair) {
      this.consecutivePairs++;
      if (this.consecutivePairs === 3) {
        if (this.lastMovedTokenId) {
          const token = player.tokens.find(t => t.id === this.lastMovedTokenId);
          if (token && token.state !== 'META' && token.state !== 'FINISHED') {
            if (this.rules.threePairsRule === 'reward') {
              token.state = 'FINISHED';
              token.position = 0;
              if (player.tokens.every(t => t.state === 'FINISHED')) {
                this.winner = player.userId;
                this.state = 'FINISHED';
              }
            } else {
              token.state = 'HOME';
              token.position = -1;
            }
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
    
    const allTokensHome = player.tokens.every(t => t.state === 'HOME');
    const hasFive = this.rules.diceCount === 1 ? this.availableMoves.includes(5) : false;

    console.log(`--> rollDice by ${userId}: dice=${this.diceValue}, allTokensHome=${allTokensHome}, isPair=${isPair}`);

    if (allTokensHome) {
      if (this.rules.diceCount === 2 && !isPair) {
        this.rollAttempts++;
        if (this.rollAttempts < 3) {
          this.availableMoves = []; // Must roll again
          this.broadcastState();
          return;
        } else {
          this.broadcastState();
          setTimeout(() => {
            console.log("--> setTimeout firing auto nextTurn after 3 failed attempts...");
            this.availableMoves = [];
            this.nextTurn();
          }, 1500);
          return;
        }
      } else if (this.rules.diceCount === 1 && !hasFive) {
        this.broadcastState();
        setTimeout(() => {
          console.log("--> setTimeout firing auto nextTurn...");
          this.availableMoves = [];
          this.nextTurn();
        }, 1500);
        return;
      }
    }

    console.log("--> waiting for player to move");
    this.broadcastState();
  }

  private nextTurn() {
    console.log("--> nextTurn called! prev currentTurnIndex:", this.currentTurnIndex);
    this.availableMoves = [];
    this.rollAttempts = 0;
    if (this.rules.diceCount === 2 && this.consecutivePairs > 0 && this.consecutivePairs < 3) {
      // Gets another turn
      console.log("--> player gets another turn due to consecutivePairs:", this.consecutivePairs);
    } else {
      this.consecutivePairs = 0;
      this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
      console.log("--> new currentTurnIndex:", this.currentTurnIndex);
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

    const playerIndex = this.players.findIndex(p => p.userId === userId);

    // Auto-soplar calculation BEFORE move
    const tokensThatCouldCapture = this.rules.autoSoplar ? player.tokens.filter(t => {
      if (t.id === tokenId) return false;
      if (t.state !== 'BOARD') return false;
      
      const startPosForT = (playerIndex * 17) + 4;
      let travelled = t.position - startPosForT;
      if (travelled < 0) travelled += this.trackLength;
      
      const newTravelled = travelled + diceValue;
      const maxOnBoard = this.trackLength - 5;
      if (newTravelled > maxOnBoard) return false; // Cannot capture in meta

      const testPos = (t.position + diceValue) % this.trackLength;
      const isSafe = this.rules.safeZones.includes(testPos);
      if (isSafe) return false;
      
      let canCap = false;
      for (const op of this.players) {
        if (op.userId === userId) continue;
        const enemies = op.tokens.filter(et => et.state === 'BOARD' && et.position === testPos).length;
        if (enemies > 0) {
          if (this.rules.safeBlocks !== false && enemies >= 2) {
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

      if (this.rules.diceCount === 2) {
        if (this.diceValue[0] !== this.diceValue[1]) return; // Must be a pair to leave

        if (this.rules.safeBlocks !== false) {
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
          this.availableMoves = [];
        } else {
          this.availableMoves.splice(moveIndex, 1);
        }
      } else {
        if (diceValue !== 5) return; // Must be a 5 to leave
        
        if (this.rules.safeBlocks !== false) {
           const myTokensHere = player.tokens.filter(t => t.state === 'BOARD' && t.position === startPos).length;
           if (myTokensHere >= 2) {
             return; // Cannot exit because I already have a block there
           }
        }

        token.state = 'BOARD';
        token.position = startPos;
        this.availableMoves.splice(moveIndex, 1);
      }

      // Captura en Salida
      for (const otherPlayer of this.players) {
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
        this.availableMoves.push(20);
      }

      this.lastMovedTokenId = tokenId;

    } else if (token.state === 'BOARD' || token.state === 'PATH') {
      const newPos = (token.position + diceValue) % this.trackLength;
      
      // Simulate exact meta if applicable
      const startPos = (playerIndex * 17) + 4;
      let travelled = token.position - startPos;
      if (travelled < 0) travelled += this.trackLength;

      const newTravelled = travelled + diceValue;
      const maxOnBoard = this.trackLength - 5;
      
      if (newTravelled > maxOnBoard) {
        const metaPos = newTravelled - maxOnBoard;
        if (metaPos > 8) return; // Exact bounce / reject
        if (metaPos === 8) {
           token.state = 'FINISHED';
           token.position = 0;
           
           if (player.tokens.every(t => t.state === 'FINISHED')) {
               this.winner = player.userId;
               this.state = 'FINISHED';
           }
        } else {
           token.state = 'META';
           token.position = metaPos;
        }
      } else {
        // Block validation
        if (this.rules.safeBlocks !== false) {
          let blockExists = false;
          for (const p of this.players) {
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
        const safeZone = this.rules.safeZones.includes(token.position);
        if (!safeZone) {
          for (const otherPlayer of this.players) {
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
            this.availableMoves.push(20); // +20 bonus
          }
        }
      }

      this.availableMoves.splice(moveIndex, 1);
      this.lastMovedTokenId = tokenId;
    }

    // Process auto-soplar
    if (this.rules.autoSoplar && !enemyCaptured) {
      tokensThatCouldCapture.forEach(t => {
        t.state = 'HOME';
        t.position = -1;
      });
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
      consecutivePairs: this.consecutivePairs,
      winner: this.winner
    };
    
    // Send state to everyone
    this.players.forEach(p => {
      this.emitEvent('game_state_update', { targetUserId: p.userId, state: publicState });
    });
  }
}
