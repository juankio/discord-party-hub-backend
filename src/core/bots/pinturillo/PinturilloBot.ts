import { BaseBot, BotConfig } from "../BaseBot.js";
import { logger } from "../../Logger.js";
import { PinturilloState } from "../../../games/pinturillo/PinturilloTypes.js";

export class PinturilloBot extends BaseBot {
  private isThinking: boolean = false;
  private currentTurnId: string = "";

  constructor(config: BotConfig, nickname: string, avatarId: number, color: string) {
    super(config, nickname, avatarId, color);
  }

  protected async onGameStateUpdate(event: { targetUserId?: string; state: any }): Promise<void> {
    if (event.targetUserId && event.targetUserId !== this.userId) return;

    const state = event.state;
    if (!state) return;
    
    const isDrawing = state.currentDrawerId === this.userId;
    const isGuessing = !isDrawing && !!state.currentDrawerId;

    // Track round/turn transitions to reset logic if needed
    const turnId = `${state.round}_${state.currentDrawerId}_${state.state}`;
    if (this.currentTurnId !== turnId) {
       this.currentTurnId = turnId;
       this.isThinking = false;
    }

    if (state.state === PinturilloState.CHOOSING_WORD && isDrawing && !this.isThinking) {
       this.handleChoosingWord(state);
    } else if (state.state === PinturilloState.DRAWING && isDrawing && !this.isThinking) {
       this.handleDrawingTurn(state);
    } else if (state.state === PinturilloState.DRAWING && isGuessing && !this.isThinking) {
       this.handleGuessingTurn(state);
    }
  }

  private async handleChoosingWord(state: any) {
    this.isThinking = true;
    try {
      await this.think(500, 1500);
      if (!this.engine || this.engine.state !== PinturilloState.CHOOSING_WORD || this.engine.currentDrawerId !== this.userId) return;
      const word = state.wordOptions?.[0] || this.engine.wordChoices?.[0] || 'Gato';
      logger.debug(`[PinturilloBot ${this.nickname}] Choosing word: ${word}`);
      this.engine.chooseWord(this.userId, word);
    } catch (e) {
      logger.error(`[PinturilloBot] Error choosing word: ${e}`);
    } finally {
      this.isThinking = false;
    }
  }

  private async handleDrawingTurn(state: any) {
     this.isThinking = true;
     try {
       for (let i = 0; i < 3; i++) {
         await this.think(500, 1500);
         if (!this.engine || this.engine.currentDrawerId !== this.userId || this.engine.state !== PinturilloState.DRAWING) break;
         
         const startX = Math.random() * 800;
         const startY = Math.random() * 600;
         const endX = startX + (Math.random() * 100 - 50);
         const endY = startY + (Math.random() * 100 - 50);
         const color = this.color || "#000000";
         const size = Math.floor(Math.random() * 5) + 2;

         if (typeof this.engine.handleDrawEvent === 'function') {
           this.engine.handleDrawEvent(this.userId, {
             type: 'stroke',
             data: { x0: startX, y0: startY, x1: endX, y1: endY, color, size }
           });
         }
       }
     } catch(e) {
       logger.error(`[PinturilloBot] Drawing error: ${e}`);
     } finally {
       this.isThinking = false;
     }
  }

  private async handleGuessingTurn(state: any) {
     this.isThinking = true;
     try {
       await this.think(1500, 4000);
       if (!this.engine || this.engine.currentDrawerId === this.userId || this.engine.state !== PinturilloState.DRAWING) return;

       const dict = ["gato", "pirata", "espada", "perro", "casa", "arbol", "coche", "sol", "luna"];
       let guess = dict[Math.floor(Math.random() * dict.length)];

       if (this.difficultyLevel >= 7 && this.engine.secretWord) {
         guess = this.engine.secretWord;
       }

       if (typeof this.engine.handleChat === 'function') {
         this.engine.handleChat(this.userId, guess);
       }
     } catch(e) {
       logger.error(`[PinturilloBot] Guessing error: ${e}`);
     } finally {
       this.isThinking = false;
     }
  }
}
