import { BaseBot, BotConfig } from "./BaseBot.js";
import { UnoBot } from "./uno/UnoBot.js";
import { ParchisBot } from "./parchis/ParchisBot.js";
import { StopBot } from "./stop/StopBot.js";
import { PinturilloBot } from "./pinturillo/PinturilloBot.js";
import type { RoomManager } from "../RoomManager.js";
import { logger } from "../Logger.js";

// Placeholder DummyBot
class DummyBot extends BaseBot {
  protected onGameStateUpdate(event: { targetUserId: string; state: any }): void {
    // Basic placeholder behavior
    logger.debug(`[Bot ${this.nickname}] Received game state update.`);
  }
}

export class BotManager {
  private activeBots = new Map<string, BaseBot>();

  constructor(private roomManager: RoomManager) {}

  public addBotsToRoom(roomId: string, count: number, difficulty: number): void {
    const room = this.roomManager.getRoom(roomId);
    if (!room) {
      logger.warn(`Cannot add bots to non-existent room: ${roomId}`);
      return;
    }

    const botNames = [
      "ChatGPT", "Claude", "Gemini", "Skynet", "HAL 9000", 
      "GLaDOS", "Cortana", "Siri", "Alexa", "Bender", 
      "R2-D2", "C-3PO", "Wall-E", "Terminator", "Jarvis"
    ];
    const colors = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#d946ef", "#06b6d4", "#f97316", "#8b5cf6"];

    let addedCount = 0;
    for (let i = 0; i < count; i++) {
      const maxPlayers = room.roomRules?.extendedLobby ? 8 : 6;
      if (room.users.length >= maxPlayers) {
        logger.warn(`Room ${roomId} is full, cannot add more bots.`);
        break;
      }

      // Generate a unique bot nickname
      const baseNickname = botNames[Math.floor(Math.random() * botNames.length)] || "Bot";
      const nickname = `${baseNickname} ${Math.floor(Math.random() * 100)}`;
      const avatarId = Math.floor(Math.random() * 10) + 1;
      const color = colors[Math.floor(Math.random() * colors.length)] || "#ffffff";

      const botConfig: BotConfig = {
        difficultyLevel: difficulty,
        roomId,
        gameType: room.selectedGame || "uno"
      };

      let newBot: BaseBot;
      switch (botConfig.gameType) {
        case 'uno':
          newBot = new UnoBot(botConfig, nickname, avatarId, color);
          break;
        case 'parchis':
          newBot = new ParchisBot(botConfig, nickname, avatarId, color);
          break;
        case 'stop':
          newBot = new StopBot(botConfig, nickname, avatarId, color);
          break;
        case 'pinturillo':
          newBot = new PinturilloBot(botConfig, nickname, avatarId, color);
          break;
        default:
          newBot = new DummyBot(botConfig, nickname, avatarId, color);
          break;
      }
      
      this.activeBots.set(newBot.userId, newBot);

      // Add to room users
      room.users.push({
        socketId: newBot.userId, // use userId as socketId for bots
        userId: newBot.userId,
        originalNickname: newBot.nickname,
        nickname: newBot.nickname,
        avatarId: newBot.avatarId,
        color: newBot.color,
        totalWins: 0,
        isOffline: false,
        isBot: true
      });

      // If game has started, add to gameEngine
      if (room.gameEngine && ['uno', 'stop', 'parchis'].includes(room.gameType || '')) {
        room.gameEngine.addPlayer(newBot.userId, newBot.userId, newBot.nickname, newBot.avatarId, newBot.color);
        newBot.setEngine(room.gameEngine);
      }

      addedCount++;
    }

    // Recompute nicknames and broadcast room update
    this.roomManager.recomputeNicknames(room, roomId);
    logger.info(`Added ${addedCount} bots to room ${roomId} with difficulty ${difficulty}`);
  }

  public removeBotsFromRoom(roomId: string): void {
    for (const [userId, bot] of this.activeBots.entries()) {
      if (bot.roomId === roomId) {
        this.activeBots.delete(userId);
      }
    }
  }

  public attachEngineToBots(roomId: string, engine: any): void {
    for (const bot of this.activeBots.values()) {
      if (bot.roomId === roomId) {
        bot.setEngine(engine);
      }
    }
  }

  public updateBotConfig(userId: string, roomId: string, data: { difficulty?: number, nickname?: string, avatarId?: number, color?: string }): void {
    const bot = this.activeBots.get(userId);
    if (!bot || bot.roomId !== roomId) return;

    let updated = false;

    if (data.difficulty !== undefined) {
      bot.difficultyLevel = data.difficulty;
      updated = true;
    }

    if (data.nickname !== undefined) {
      bot.nickname = data.nickname;
      updated = true;
    }

    if (data.avatarId !== undefined) {
      bot.avatarId = data.avatarId;
      updated = true;
    }

    if (data.color !== undefined) {
      bot.color = data.color;
      updated = true;
    }

    if (updated) {
      const room = this.roomManager.getRoom(roomId);
      if (room) {
        const u = room.users.find(user => user.userId === userId);
        if (u) {
          if (data.nickname !== undefined) u.originalNickname = data.nickname;
          if (data.nickname !== undefined) u.nickname = data.nickname;
          if (data.avatarId !== undefined) u.avatarId = data.avatarId;
          if (data.color !== undefined) u.color = data.color;
        }

        if (room.gameEngine && ['uno', 'stop', 'parchis'].includes(room.gameType || '')) {
          const p = room.gameEngine.players.find((player: any) => player.userId === userId);
          if (p) {
            if (data.nickname !== undefined) p.nickname = data.nickname;
            if (data.avatarId !== undefined) p.avatarId = data.avatarId;
            if (data.color !== undefined) p.color = data.color;
          }
        }

        this.roomManager.recomputeNicknames(room, roomId);
      }
      logger.info(`Bot ${bot.nickname} (${userId}) config updated in room ${roomId}`);
    }
  }

  public removeBot(userId: string, roomId: string): void {
    const bot = this.activeBots.get(userId);
    if (!bot || bot.roomId !== roomId) return;

    this.activeBots.delete(userId);

    const room = this.roomManager.getRoom(roomId);
    if (room) {
      room.users = room.users.filter(u => u.userId !== userId);
      if (room.gameEngine) {
        room.gameEngine.removePlayer(userId);
      }
      this.roomManager.recomputeNicknames(room, roomId);
      logger.info(`Bot ${bot.nickname} (${userId}) removed from room ${roomId}`);
    }
  }
}
