import type { RoomData, RoomManager } from "../RoomManager.js";
import { logger } from "../Logger.js";
import { v4 as uuidv4 } from "uuid";

export interface BotConfig {
  difficultyLevel: number; // 1 to 10
  roomId: string;
  gameType: string;
}

export abstract class BaseBot {
  public userId: string;
  public nickname: string;
  public avatarId: number;
  public color: string;
  public difficultyLevel: number;
  public roomId: string;
  public gameType: string;
  protected engine: any;

  constructor(config: BotConfig, nickname: string, avatarId: number, color: string) {
    this.userId = `bot_${uuidv4()}`;
    this.difficultyLevel = config.difficultyLevel;
    this.roomId = config.roomId;
    this.gameType = config.gameType;
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
    const isFast = this.difficultyLevel >= 8;
    const isSlow = this.difficultyLevel <= 3;
    
    let baseTime = Math.random() * (maxMs - minMs) + minMs;
    if (isFast) baseTime *= 0.5;
    if (isSlow) baseTime *= 1.5;

    return new Promise(resolve => setTimeout(resolve, baseTime));
  }
}
