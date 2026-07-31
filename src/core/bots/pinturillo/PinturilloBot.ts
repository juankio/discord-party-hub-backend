import { BaseBot, BotConfig } from "../BaseBot.js";
import { logger } from "../../Logger.js";

export class PinturilloBot extends BaseBot {
  private isThinking: boolean = false;
  private currentTurnId: string = "";

  constructor(config: BotConfig, nickname: string, avatarId: number, color: string) {
    super(config, nickname, avatarId, color);
  }

  protected async onGameStateUpdate(event: { targetUserId: string; state: any }): Promise<void> {
    if (event.targetUserId !== this.userId) return;

    const state = event.state;
    
    if (state.state !== 'PLAYING') return;

    const isDrawing = state.currentDrawerUserId === this.userId;
    const isGuessing = !isDrawing && state.currentDrawerUserId !== "";

    // Track round/turn transitions to reset logic if needed
    const turnId = `${state.currentRound}_${state.currentDrawerUserId}`;
    if (this.currentTurnId !== turnId) {
       this.currentTurnId = turnId;
       this.isThinking = false;
    }

    if (isDrawing && !this.isThinking) {
       this.handleDrawingTurn(state);
    } else if (isGuessing && !this.isThinking) {
       this.handleGuessingTurn(state);
    }
  }

  private async handleDrawingTurn(state: any) {
     this.isThinking = true;
     
     // The engine requires the drawer to pick a word or maybe it auto-assigns.
     // If it requires choosing:
     if (this.engine.actionRequiredFrom === this.userId && this.engine.state === 'CHOOSING_WORD') {
         // Bot auto-picks the first word option usually
         const words = state.wordOptions || ["bot_word"];
         this.engine.chooseWord(this.userId, words[0]);
     } else if (state.currentDrawerUserId === this.userId) {
         // Drawing phase. We simulate drawing by sending random lines periodically
         try {
             // Let's draw 5 strokes randomly over the turn
             for (let i = 0; i < 5; i++) {
                 await this.think(1000, 3000);
                 if (this.engine.currentDrawerUserId !== this.userId || this.engine.state !== 'PLAYING') break;
                 
                 const startX = Math.random() * 800;
                 const startY = Math.random() * 600;
                 const endX = startX + (Math.random() * 100 - 50);
                 const endY = startY + (Math.random() * 100 - 50);
                 
                 const color = this.color || "#000000";
                 const size = Math.floor(Math.random() * 5) + 2;
                 
                 // Fire event directly if we have a stroke endpoint, or via engine.draw
                 if (typeof this.engine.addStroke === 'function') {
                     this.engine.addStroke(this.userId, {
                         x0: startX, y0: startY, x1: endX, y1: endY, color, size
                     });
                 }
             }
         } catch(e) {
             logger.error(`[PinturilloBot] Drawing error: ${e}`);
         }
     }
  }

  private async handleGuessingTurn(state: any) {
     this.isThinking = true;
     try {
         // Periodically try to guess
         const maxGuesses = Math.max(1, Math.floor(this.difficultyLevel / 2));
         
         for (let i = 0; i < maxGuesses; i++) {
             await this.think(3000, 8000); // Guess every few seconds
             
             if (this.engine.currentDrawerUserId === this.userId || this.engine.state !== 'PLAYING') break;

             // Bot uses the partially revealed word if available, else random letters
             const hint = state.partiallyRevealedWord || "?????";
             
             // Very basic dictionary for guessing
             const dict = ["perro", "gato", "casa", "arbol", "coche", "sol", "luna", "bot"];
             
             // High difficulty bots have a chance to magically guess the correct word if they 'read' it
             // but we don't have direct access to the hidden word in `state` (it shouldn't be sent).
             // Let's just guess a random word from dict for now.
             let guess = dict[Math.floor(Math.random() * dict.length)];
             
             if (this.difficultyLevel >= 8 && Math.random() > 0.5) {
                 // Try to guess based on length matching hint length
                 const lengthMatch = dict.find(w => w.length === hint.length);
                 if (lengthMatch) guess = lengthMatch;
             }

             if (typeof this.engine.submitGuess === 'function') {
                 this.engine.submitGuess(this.userId, guess);
             }
         }
     } catch(e) {
         logger.error(`[PinturilloBot] Guessing error: ${e}`);
     } finally {
         this.isThinking = false;
     }
  }
}
