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

        // Generate a simple placeholder answer starting with the current letter
        const answer = `${currentLetter}bot`;
        
        // Submit the individual answer
        this.engine.submitAnswer(this.userId, category, answer);
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
