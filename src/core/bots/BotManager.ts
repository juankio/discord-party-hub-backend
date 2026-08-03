import { BaseBot, BotConfig } from "./BaseBot.js";
import { BotFactory } from "./BotFactory.js";
import type { RoomManager } from "../RoomManager.js";
import { logger } from "../Logger.js";

export class BotManager {
  private activeBots = new Map<string, BaseBot>();

  constructor(private roomManager: RoomManager) {}

  public addBotsToRoom(roomId: string, count: number, difficulty: number): void {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return logger.warn(`Cannot add bots to non-existent room: ${roomId}`);

    const selectedGame = room.selectedGame || 'uno';
    if (!['uno', 'parchis', 'liars'].includes(selectedGame)) {
      return logger.warn(`[SECURITY] Cannot add bots to room ${roomId}, game '${selectedGame}' unsupported.`);
    }

    const botNames = ["ChatGPT", "Claude", "Gemini", "Skynet", "HAL 9000", "GLaDOS", "Bender", "R2-D2"];
    const colors = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#d946ef", "#06b6d4", "#f97316"];

    let addedCount = 0;
    for (let i = 0; i < count; i++) {
      let maxPlayers = room.roomRules?.extendedLobby ? 8 : 6;
      if (selectedGame === 'parchis') {
        maxPlayers = room.roomRules?.parchisBoardSize || 4;
      }
      
      if (room.users.length >= maxPlayers) break;

      const nickname = `${botNames[Math.floor(Math.random() * botNames.length)]} ${Math.floor(Math.random() * 100)}`;
      const avatarId = Math.floor(Math.random() * 10) + 1;
      const color = colors[Math.floor(Math.random() * colors.length)] || "#ffffff";
      const config: BotConfig = { difficultyLevel: difficulty, roomId, gameType: selectedGame };

      const newBot = BotFactory.createBot(selectedGame, config, nickname, avatarId, color);
      this.activeBots.set(newBot.userId, newBot);

      let freeSeat = 0;
      for (let j = 0; j < maxPlayers; j++) {
        if (!room.users.some(u => u.seatIndex === j)) {
          freeSeat = j;
          break;
        }
      }

      room.users.push({
        socketId: newBot.userId, userId: newBot.userId, originalNickname: newBot.originalNickname,
        nickname: newBot.nickname, avatarId: newBot.avatarId, color: newBot.color,
        totalWins: 0, isOffline: false, isBot: true, seatIndex: freeSeat
      });

      if (room.gameEngine && ['uno', 'stop', 'parchis'].includes(room.gameType || '')) {
        room.gameEngine.addPlayer(newBot.userId, newBot.userId, newBot.nickname, newBot.avatarId, newBot.color);
        newBot.setEngine(room.gameEngine);
      }
      addedCount++;
    }

    this.roomManager.recomputeNicknames(room, roomId);
    logger.info(`Added ${addedCount} bots to room ${roomId} (diff: ${difficulty})`);
  }

  public removeBotsFromRoom(roomId: string): void {
    const botsToRemove = Array.from(this.activeBots.values()).filter(b => b.roomId === roomId);
    botsToRemove.forEach(b => this.activeBots.delete(b.userId));
    
    if (botsToRemove.length > 0) {
      const room = this.roomManager.getRoom(roomId);
      if (room) room.users = room.users.filter(u => !u.isBot);
    }
  }

  public recreateBotsForGame(roomId: string, newGameType: string): void {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    let maxPlayers = room.roomRules?.extendedLobby ? 8 : 6;
    if (newGameType === 'parchis') maxPlayers = room.roomRules?.parchisBoardSize || 4;

    const botsInRoom = room.users.filter(u => u.isBot);
    const humanCount = room.users.length - botsInRoom.length;
    const allowedBotsCount = Math.max(0, maxPlayers - humanCount);

    const botsData = Array.from(this.activeBots.values())
      .filter(b => b.roomId === roomId)
      .map(b => ({ userId: b.userId, nick: b.originalNickname, avatarId: b.avatarId, color: b.color, diff: b.difficultyLevel }));

    // Remove ALL bots first
    botsData.forEach(b => this.activeBots.delete(b.userId));
    room.users = room.users.filter(u => !u.isBot);

    // Recreate only up to allowed capacity
    const botsToRecreate = botsData.slice(0, allowedBotsCount);

    botsToRecreate.forEach(b => {
      const config: BotConfig = { difficultyLevel: b.diff, roomId, gameType: newGameType, existingUserId: b.userId };
      const newBot = BotFactory.createBot(newGameType, config, b.nick, b.avatarId, b.color);
      this.activeBots.set(newBot.userId, newBot);

      // Re-seat them in the room
      let freeSeat = 0;
      for (let j = 0; j < maxPlayers; j++) {
        if (!room.users.some(u => u.seatIndex === j)) {
          freeSeat = j;
          break;
        }
      }

      room.users.push({
        socketId: newBot.userId, userId: newBot.userId, originalNickname: newBot.originalNickname,
        nickname: newBot.nickname, avatarId: newBot.avatarId, color: newBot.color,
        totalWins: 0, isOffline: false, isBot: true, seatIndex: freeSeat
      });
    });

    if (botsToRecreate.length > 0) logger.info(`Recreated ${botsToRecreate.length} bots in ${roomId} for ${newGameType}`);
  }

  public attachEngineToBots(roomId: string, engine: any): void {
    Array.from(this.activeBots.values())
      .filter(bot => bot.roomId === roomId)
      .forEach(bot => bot.setEngine(engine));
  }

  public updateBotConfig(userId: string, roomId: string, data: Partial<{ difficulty: number, nickname: string, avatarId: number, color: string }>): void {
    const bot = this.activeBots.get(userId);
    if (!bot || bot.roomId !== roomId) return;

    if (data.difficulty !== undefined) bot.difficultyLevel = data.difficulty;
    if (data.nickname !== undefined) { bot.originalNickname = data.nickname; bot.nickname = data.nickname; }
    if (data.avatarId !== undefined) bot.avatarId = data.avatarId;
    if (data.color !== undefined) bot.color = data.color;

    const room = this.roomManager.getRoom(roomId);
    if (room) {
      const u = room.users.find(u => u.userId === userId);
      if (u) Object.assign(u, { 
        ...(data.nickname && { originalNickname: data.nickname, nickname: data.nickname }),
        ...(data.avatarId && { avatarId: data.avatarId }),
        ...(data.color && { color: data.color })
      });

      if (room.gameEngine && ['uno', 'stop', 'parchis'].includes(room.gameType || '')) {
        const p = room.gameEngine.players.find((p: any) => p.userId === userId);
        if (p) Object.assign(p, data);
      }
      this.roomManager.recomputeNicknames(room, roomId);
    }
  }

  public removeBot(userId: string, roomId: string): void {
    const bot = this.activeBots.get(userId);
    if (!bot || bot.roomId !== roomId) return;

    this.activeBots.delete(userId);
    const room = this.roomManager.getRoom(roomId);
    if (room) {
      room.users = room.users.filter(u => u.userId !== userId);
      room.gameEngine?.removePlayer(userId);
      this.roomManager.recomputeNicknames(room, roomId);
    }
  }
}
