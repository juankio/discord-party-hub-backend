import { BaseBot, BotConfig } from "./BaseBot.js";
import { UnoBot } from "./uno/UnoBot.js";
import { ParchisBot } from "./parchis/ParchisBot.js";
import { StopBot } from "./stop/StopBot.js";
import { PinturilloBot } from "./pinturillo/PinturilloBot.js";
import { logger } from "../Logger.js";

class DummyBot extends BaseBot {
  protected onGameStateUpdate(event: { targetUserId: string; state: any }): void {
    logger.debug(`[Bot ${this.nickname}] Received game state update.`);
  }
}

export class BotFactory {
  public static createBot(gameType: string, config: BotConfig, nickname: string, avatarId: number, color: string): BaseBot {
    switch (gameType) {
      case 'uno': return new UnoBot(config, nickname, avatarId, color);
      case 'parchis': return new ParchisBot(config, nickname, avatarId, color);
      case 'stop': return new StopBot(config, nickname, avatarId, color);
      case 'pinturillo': return new PinturilloBot(config, nickname, avatarId, color);
      default: return new DummyBot(config, nickname, avatarId, color);
    }
  }
}
