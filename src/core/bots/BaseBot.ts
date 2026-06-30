import type { RoomData, RoomManager } from "../RoomManager.js";
import { logger } from "../Logger.js";
import { v4 as uuidv4 } from "uuid";

export interface BotConfig {
  difficultyLevel: number; // 1 to 10
  roomId: string;
  gameType: string;
  existingUserId?: string;
}

export abstract class BaseBot {
  public userId: string;
  public originalNickname: string;
  public nickname: string;
  public avatarId: number;
  public color: string;
  public difficultyLevel: number;
  public roomId: string;
  public gameType: string;
  protected engine: any;

  constructor(config: BotConfig, nickname: string, avatarId: number, color: string) {
    this.userId = config.existingUserId || `bot_${uuidv4()}`;
    this.difficultyLevel = config.difficultyLevel;
    this.roomId = config.roomId;
    this.gameType = config.gameType;
    this.originalNickname = nickname;
    this.nickname = nickname;
    this.avatarId = avatarId;
    this.color = color;
  }

  // Se llama cuando el motor del juego está listo o el bot es agregado a una partida iniciada.
  public setEngine(engine: any) {
    this.engine = engine;
    // Escuchar actualizaciones de estado
    this.engine.on("game_state_update", this.onGameStateUpdate.bind(this));
  }

  // Hook principal que deben implementar los bots específicos de cada juego
  protected abstract onGameStateUpdate(event: { targetUserId: string; state: any }): void;

  // Utilidad para simular tiempo de reacción ("pensamiento") basado en el ELO
  protected async think(minMs = 500, maxMs = 3000): Promise<void> {
    let baseTime = Math.random() * (maxMs - minMs) + minMs;
    
    // Scale delay based on difficulty (1 to 10)
    // Level 1: multiplier ~ 2.0 (slowest)
    // Level 10: multiplier ~ 0.5 (fastest)
    const multiplier = 2.0 - ((this.difficultyLevel - 1) * (1.5 / 9));
    baseTime *= multiplier;

    return new Promise(resolve => setTimeout(resolve, baseTime));
  }
}
