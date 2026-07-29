import { BaseBot, BotConfig } from "../BaseBot.js";
import type { ParchisPublicState } from "../../../games/parchis/ParchisTypes.js";
import type { ParchisEngine } from "../../../games/parchis/ParchisEngine.js";

export class ParchisBot extends BaseBot {
  private isChoosingFigure = false;
  private isChoosingSeat = false;
  private isThinkingTurn = false;

  constructor(config: BotConfig, nickname: string, avatarId: number, color: string) {
    super(config, nickname, avatarId, color);
  }

  public setEngine(engine: any) {
    super.setEngine(engine);
    this.isChoosingFigure = false;
    this.isChoosingSeat = false;
    this.isThinkingTurn = false; console.log("[Bot] finished thinking", this.userId);
  }

  protected async onGameStateUpdate(event: { targetUserId: string; state: any }): Promise<void> {
    if (event.targetUserId && event.targetUserId !== this.userId) return;

    const state = event.state as ParchisPublicState;
    console.log("[Bot] onGameStateUpdate called. state:", state.state, "user:", this.userId);
    const engineState = this.engine as ParchisEngine;
    if (!engineState) return;

    if (state.state === 'CHOOSING_TOKENS') {
      const me = state.players.find(p => p.userId === this.userId);
      if (me && !me.hasChosenFigure && !this.isChoosingFigure) {
        this.isChoosingFigure = true;
        
        let waitAttempts = 0;
        
        // Usopp's foolproof loop: Keep trying to pick a figure until successful
        while (this.engine === engineState && !engineState.players.find(p => p.userId === this.userId)?.hasChosenFigure && engineState.state === 'CHOOSING_TOKENS') {
          
          const humanPlayers = engineState.players.filter(p => !p.userId.startsWith('bot_'));
          const allHumansChosen = humanPlayers.every(p => p.hasChosenFigure || p.isOffline);

          // If humans haven't picked yet, give them priority (wait up to ~15-20 seconds before overriding)
          if (!allHumansChosen && waitAttempts < 10) {
            await this.think(1500, 2500);
            waitAttempts++;
            continue;
          }

          await this.think(500, 1500);
          
          if (engineState.state === 'CHOOSING_TOKENS') {
            const figureOptions = ['dog', 'car', 'hat', 'boat', 'gem', 'wood', 'ghost', 'rocket', 'crown', 'sword'];
            const takenFigures = engineState.players.map(p => p.selectedFigure).filter(Boolean);
            const availableFigures = figureOptions.filter(f => !takenFigures.includes(f));
            
            if (availableFigures.length > 0) {
              const randomFigure = availableFigures[Math.floor(Math.random() * availableFigures.length)];
              engineState.chooseFigure(this.userId, randomFigure);
            }
          }
        }
        
        this.isChoosingFigure = false;
      }
      return;
    }

    if (state.state === 'ROLLING_FOR_ORDER') {
      const rolled = engineState.initiativeRolls && engineState.initiativeRolls[this.userId] !== undefined;
      if (!rolled && !this.isThinkingTurn) {
        this.isThinkingTurn = true; console.log("[Bot] thinking...", this.userId, "state:", state.state);
        
        let rollAttempts = 0;
        
        // Usopp's foolproof loop: Keep trying to roll until successful
        while (this.engine === engineState && engineState.state === 'ROLLING_FOR_ORDER' && (!engineState.initiativeRolls || engineState.initiativeRolls[this.userId] === undefined)) {
          await this.think(1500, 3000);
          
          if (engineState.state === 'ROLLING_FOR_ORDER' && (!engineState.initiativeRolls || engineState.initiativeRolls[this.userId] === undefined)) {
             engineState.rollInitiative(this.userId);
          }
          
          rollAttempts++;
          if (rollAttempts > 10) break; // emergency break
        }
        
        this.isThinkingTurn = false; console.log("[Bot] finished thinking", this.userId);
      }
      return;
    }

        if (state.state === 'CHOOSING_SEATS') {
      if (state.firstPickerUserId === this.userId && !this.isChoosingSeat) {
        this.isChoosingSeat = true;
        
        // Usopp's foolproof logic for seats
        let seatAttempts = 0;
        
        while (this.engine === engineState && engineState.state === 'CHOOSING_SEATS' && engineState.firstPickerUserId === this.userId) {
           await this.think(1000, 2000);
           
           if (engineState.state === 'CHOOSING_SEATS' && engineState.firstPickerUserId === this.userId) {
              const availableSeats = [];
              for (let i = 0; i < engineState.sides; i++) {
                if (!engineState.takenSeats.includes(i)) availableSeats.push(i);
              }
              if (availableSeats.length > 0) {
                const randomSeatIndex = availableSeats[Math.floor(Math.random() * availableSeats.length)];
                engineState.chooseSeat(this.userId, randomSeatIndex);
              }
           }
           
           seatAttempts++;
           if (seatAttempts > 10) break; // emergency break
        }
        
        this.isChoosingSeat = false;
      }
      
      this.isThinkingTurn = false; console.log("[Bot] finished thinking", this.userId); // Reset just in case it got stuck
      return;
    }

    const isOurTurn = state.players[state.currentTurnIndex]?.userId === this.userId;

    // Failsafe: if it's our turn in PLAYING but we are stuck "thinking" with no dice, forcefully reset it.
    if (state.state === 'PLAYING' && isOurTurn && this.isThinkingTurn && engineState.diceValue.length === 0 && engineState.availableMoves.length === 0) {
      this.isThinkingTurn = false; console.log("[Bot] finished thinking", this.userId);
    }

    if (state.state === 'PLAYING' && isOurTurn && !this.isThinkingTurn) {
      this.isThinkingTurn = true; console.log("[Bot] thinking...", this.userId, "state:", state.state);
      if (engineState.diceValue.length === 0 && engineState.availableMoves.length === 0) {
        await this.think(1000, 3000);
        
        if (engineState.state !== 'PLAYING') {
          this.isThinkingTurn = false; console.log("[Bot] finished thinking", this.userId);
          return;
        }
        if (engineState.players[engineState.currentTurnIndex]?.userId !== this.userId) {
          this.isThinkingTurn = false; console.log("[Bot] finished thinking", this.userId);
          return;
        }

        this.isThinkingTurn = false; console.log("[Bot] finished thinking", this.userId);
        console.log("[Bot] ROLLING DICE"); engineState.rollDice(this.userId);
        return;
      }

      if (engineState.availableMoves.length > 0) {
        await this.think(500, 1500);

        if (engineState.state !== 'PLAYING') {
          this.isThinkingTurn = false; console.log("[Bot] finished thinking", this.userId);
          return;
        }
        if (engineState.players[engineState.currentTurnIndex]?.userId !== this.userId) {
          this.isThinkingTurn = false; console.log("[Bot] finished thinking", this.userId);
          return;
        }

        const me = engineState.players.find(p => p.userId === this.userId);
        if (!me) {
          this.isThinkingTurn = false; console.log("[Bot] finished thinking", this.userId);
          return;
        }

        let moved = false;
        const movesToTry = [...engineState.availableMoves];
        
        for (const moveValue of movesToTry) {
          for (const token of me.tokens) {
            const oldPos = token.position;
            const oldState = token.state;
            
            console.log("[Bot] MOVING TOKEN", token.id); engineState.moveToken(this.userId, token.id, moveValue);
            
            if (token.position !== oldPos || token.state !== oldState) {
              moved = true;
              break;
            }
          }
          if (moved) break;
        }

        if (!moved) {
          // If we couldn't make any move with the available dice, forfeit them
          engineState.availableMoves = [];
          engineState.nextTurn();
        }
      }
      this.isThinkingTurn = false; console.log("[Bot] finished thinking", this.userId);
      setTimeout(() => engineState.broadcastState(), 100);
    }
  }
}
