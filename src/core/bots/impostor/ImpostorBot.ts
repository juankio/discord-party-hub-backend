import { BaseBot, BotConfig } from "../BaseBot.js";
import { logger } from "../../Logger.js";

export class ImpostorBot extends BaseBot {
  private hasVotedInRound: number = -1;

  constructor(config: BotConfig, nickname: string, avatarId: number, color: string) {
    super(config, nickname, avatarId, color);
  }

  protected async onGameStateUpdate(event: { targetUserId?: string; state: any }): Promise<void> {
    if (event.targetUserId && event.targetUserId !== this.userId) return;

    const { state } = event;
    if (!state || !this.engine) return;

    if (state.state === 'VOTING' && this.hasVotedInRound !== state.currentRound) {
      this.hasVotedInRound = state.currentRound;

      const myPlayer = this.engine.players?.find((p: any) => p.userId === this.userId);
      if (!myPlayer || !myPlayer.isAlive || myPlayer.hasVoted) return;

      await this.think(500, 1500);

      if (!this.engine || this.engine.state !== 'VOTING') return;

      const aliveCandidates = this.engine.players?.filter((p: any) => p.isAlive && p.userId !== this.userId) || [];
      if (aliveCandidates.length > 0) {
        const target = aliveCandidates[Math.floor(Math.random() * aliveCandidates.length)];
        logger.debug(`[ImpostorBot ${this.nickname}] Voting for ${target.nickname} (${target.userId})`);
        this.engine.vote(this.userId, target.userId);
      }
    }
  }
}
