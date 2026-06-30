import { BaseBot, BotConfig } from "../BaseBot.js";
import type { ParchisPublicState } from "../../../games/parchis/ParchisTypes.js";
import type { ParchisEngine } from "../../../games/parchis/ParchisEngine.js";

export class ParchisBot extends BaseBot {
  constructor(config: BotConfig, nickname: string, avatarId: number, color: string) {
    super(config, nickname, avatarId, color);
  }

  protected async onGameStateUpdate(event: { targetUserId: string; state: any }): Promise<void> {
    if (event.targetUserId && event.targetUserId !== this.userId) return;

    const state = event.state as ParchisPublicState;

    // Wait slightly to avoid processing events that were triggered before the bot could fully initialize
    const engineState = this.engine as ParchisEngine;
    if (!engineState) return;

    if (state.state === 'CHOOSING_TOKENS') {
      const me = state.players.find(p => p.userId === this.userId);
      if (me && !me.hasChosenFigure) {
        await this.think(500, 1500);
        if (engineState.state === 'CHOOSING_TOKENS') {
          const figureOptions = ['dog', 'car', 'hat', 'boat', 'gem', 'wood'];
          const randomFigure = figureOptions[Math.floor(Math.random() * figureOptions.length)];
          engineState.chooseFigure(this.userId, randomFigure);
        }
      }
      return;
    }

    const isOurTurn = state.players[state.currentTurnIndex]?.userId === this.userId;

    if (state.state === 'PLAYING' && isOurTurn) {
      if (engineState.diceValue.length === 0 && engineState.availableMoves.length === 0) {
        await this.think(1000, 3000);
        
        if (engineState.state !== 'PLAYING') return;
        if (engineState.players[engineState.currentTurnIndex]?.userId !== this.userId) return;

        engineState.rollDice(this.userId);
        return;
      }

      if (engineState.availableMoves.length > 0) {
        await this.think(500, 1500);

        if (engineState.state !== 'PLAYING') return;
        if (engineState.players[engineState.currentTurnIndex]?.userId !== this.userId) return;

        const me = engineState.players.find(p => p.userId === this.userId);
        if (!me) return;

        let moved = false;
        const movesToTry = [...engineState.availableMoves];
        
        for (const moveValue of movesToTry) {
          for (const token of me.tokens) {
            const oldPos = token.position;
            const oldState = token.state;
            
            engineState.moveToken(this.userId, token.id, moveValue);
            
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
    }
  }
}
