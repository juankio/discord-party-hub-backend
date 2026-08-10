import { z } from "zod";
import type { RoomManager } from "./RoomManager.js";
import { setupUnoGame } from "../games/uno/UnoSetup.js";
import { setupStopGame } from "../games/stop/StopSetup.js";
import { setupParchisGame } from "../games/parchis/ParchisSetup.js";
import { setupImpostorGame } from "../games/impostor/ImpostorSetup.js";
import { setupLiarsGame } from "../games/liars-bar/LiarsSetup.js";
import { setupPinturilloGame } from "../games/pinturillo/PinturilloSetup.js";
import { logger } from "./Logger.js";
import type { Server } from "socket.io";
import type { RoomData } from "./RoomManager.js";

// -- Validation Schemas --
const ParchisRulesSchema = z.object({
  diceCount: z.coerce.number().int().min(1).max(2).default(2),
  tokensPerPlayer: z.coerce.number().int().min(1).max(8).default(4),
  parchisBoardSize: z.coerce.number().int().min(4).max(8).default(4),
  captureReward: z.coerce.number().int().min(0).max(50).default(0),
  crownReward: z.coerce.number().int().min(0).max(50).default(0)
});

const UnoRulesSchema = z.object({
  stackDrawCards: z.boolean().default(false),
  drawUntilPlayable: z.boolean().default(false),
  playMultipleSame: z.boolean().default(false),
  interceptExact: z.boolean().default(false),
  zeroAndSevenRules: z.boolean().default(false),
  extendedLobby: z.boolean().default(false)
});

const StopRulesSchema = z.object({
  categories: z.array(z.string().max(50)).max(12).default(["Nombres", "Colores", "Paises", "Animales", "Cosas"]),
  rounds: z.coerce.number().int().min(1).max(20).default(5),
  timeLimit: z.coerce.number().int().min(30).max(300).optional(),
  verificationTime: z.coerce.number().int().min(10).max(60).optional(),
  bannedLetters: z.array(z.string().length(1)).max(27).optional()
});

export const StartGameSchema = z.object({
  gameType: z.enum(["uno", "parchis", "stop", "pinturillo", "liars", "impostor"]).default("uno"),
  rules: z.any().optional()
});

export class GameFactory {
  public static startGame(gameType: string, roomId: string, room: RoomData, io: Server, rulesPayload: any, roomManager: RoomManager): void {
    const userId = room.hostUserId;

    switch (gameType) {
      case 'parchis': {
        const mergedRules = { ...rulesPayload, ...(room.roomRules || {}) };
        const parsed = ParchisRulesSchema.safeParse(mergedRules);
        if (!parsed.success) return logger.warn(`[SECURITY] User ${userId} attempted to start parchis with invalid rules.`);
        
        const boardSize = Number(parsed.data.parchisBoardSize);
        if (room.users.length > boardSize) {
          return logger.warn(`[SECURITY] User ${userId} started parchis with too many players (${room.users.length} > ${boardSize}).`);
        }
        const safeRules = {
          diceCount: parsed.data.diceCount as 1 | 2,
          tokensPerPlayer: parsed.data.tokensPerPlayer as 3 | 4,
          parchisBoardSize: boardSize as 4 | 6 | 8,
          captureReward: parsed.data.captureReward,
          crownReward: parsed.data.crownReward
        };
        setupParchisGame(roomId, room, io, safeRules, roomManager);
        break;
      }
      case 'uno': {
        const mergedRules = { ...rulesPayload, ...(room.roomRules || {}) };
        const parsed = UnoRulesSchema.safeParse(mergedRules);
        if (!parsed.success) return logger.warn(`[SECURITY] User ${userId} attempted to start uno with invalid rules.`);
        setupUnoGame(roomId, room, io, parsed.data, roomManager);
        break;
      }
      case 'stop': {
        const mergedRules = { ...rulesPayload, ...(room.roomRules || {}) };
        const parsed = StopRulesSchema.safeParse(mergedRules);
        if (!parsed.success) return logger.warn(`[SECURITY] User ${userId} attempted to start stop with invalid rules.`);
        setupStopGame(roomId, room, io, parsed.data, roomManager);
        break;
      }
      case 'impostor':
        setupImpostorGame(roomId, room, io);
        break;
      case 'liars':
        setupLiarsGame(roomId, room, io, roomManager);
        break;
      case 'pinturillo':
        setupPinturilloGame(roomId, room, io);
        break;
      default:
        logger.warn(`Game type ${gameType} not fully supported via factory yet.`);
        break;
    }

    if (room.gameEngine && !room.gameEngine.hasActivityListener) {
      room.gameEngine.on('activity', () => {
        room.lastActive = Date.now();
      });
      room.gameEngine.hasActivityListener = true;
    }
  }
}
