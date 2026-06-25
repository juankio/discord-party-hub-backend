import { BaseBot, BotConfig } from "../BaseBot.js";
import { logger } from "../../Logger.js";

export class StopBot extends BaseBot {
  private activeRound: number = -1;
  private isThinking: boolean = false;

  constructor(config: BotConfig, nickname: string, avatarId: number, color: string) {
    super(config, nickname, avatarId, color);
  }

  protected async onGameStateUpdate(event: { targetUserId: string; state: any }): Promise<void> {
    const state = event.state;
    
    // We want to trigger answer generation only when entering PLAYING state for a new round
    if (state.state === 'PLAYING' && state.currentRound !== this.activeRound) {
      this.activeRound = state.currentRound;
      this.playRound(state);
    }
  }

  private async playRound(state: any) {
    if (this.isThinking) return;
    this.isThinking = true;

    try {
      const categories: string[] = state.categories || [];
      const currentLetter: string = state.currentLetter || 'A';

      for (const category of categories) {
        // Wait random time based on difficulty (1.5s to 4s)
        await this.think(1500, 4000);

        // Check if game is still playing (maybe someone called Stop)
        if (this.engine.state !== 'PLAYING') {
          break;
        }

        // Generate an answer based on category and current letter using a small hardcoded dictionary
        const dictionary: Record<string, string[]> = {
          'Nombre': ['lberto', 'lejandro', 'ndres', 'rmando', 'rturo', 'ngel', 'nastasia', 'Alicia', 'manda'],
          'Animal': ['guila', 'vejorro', 'rdilla', 'rmadillo', 'lbatros', 'beja', 'naconda'],
          'Cosa': ['rbol', 'rmario', 'nillo', 'lambre', 'ntena', 'utobus', 'rion', 'nsiento'],
          'Color': ['marillo', 'zul', 'ñil', 'mbar', 'rena', 'rgénteo'],
          'Fruta/Verdura': ['randano', 'celga', 'lbaricoque', 'gave', 'lmendra', 'nana'],
          'Pais/Ciudad': ['rgentina', 'lemania', 'ustria', 'fganistan', 'msterdam', 'tenas', 'ndorra'],
          'Profesion': ['rquitecto', 'ctor', 'bogado', 'stronauta', 'dministrador', 'rtista']
        };

        let answer = `${currentLetter}bot`; // Fallback
        
        // Find best matching category from dictionary
        const bestCatMatch = Object.keys(dictionary).find(cat => category.toLowerCase().includes(cat.toLowerCase()));
        
        if (bestCatMatch) {
            const possibleAnswers = dictionary[bestCatMatch] || [];
            if (possibleAnswers.length > 0) {
                // To support different letters, we cheat a bit for now and just attach the letter to a random suffix
                // A true dictionary would be indexed by letter, but this is a placeholder
                const suffix = possibleAnswers[Math.floor(Math.random() * possibleAnswers.length)];
                // If the letter happens to be A, it sounds natural. If not, it will be funny.
                answer = currentLetter + suffix.substring(1);
            }
        }
        
        // Lower difficulty bots might make typos or skip (leave blank)
        if (this.difficultyLevel <= 4 && Math.random() < 0.2) {
           answer = ""; // Bot couldn't think of an answer
        } else if (this.difficultyLevel <= 6 && Math.random() < 0.1) {
           answer = answer + "x"; // Typo
        }

        // Submit the individual answer if not blank
        if (answer !== "") {
            this.engine.submitAnswer(this.userId, category, answer);
        }
      }

      // Check if the bot finished all categories and the game is still playing
      if (this.engine.state === 'PLAYING') {
        const player = this.engine.players?.find((p: any) => p.userId === this.userId);
        if (player) {
          // If the bot filled everything, it stops the round!
          this.engine.stopCall(this.userId, player.currentAnswers);
        }
      }

    } catch (err) {
      logger.error(`[StopBot ${this.nickname}] Error during round play: ${err}`);
    } finally {
      this.isThinking = false;
    }
  }
}
