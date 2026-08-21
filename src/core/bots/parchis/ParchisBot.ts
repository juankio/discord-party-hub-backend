import { BaseBot, BotConfig } from "../BaseBot.js";
import type { ParchisPublicState, ParchisToken, ParchisPlayer } from "../../../games/parchis/ParchisTypes.js";
import type { ParchisEngine } from "../../../games/parchis/ParchisEngine.js";
import { ParchisCaptureLogic } from "../../../games/parchis/ParchisCaptureLogic.js";
import { logger } from "../../Logger.js";

export class ParchisBot extends BaseBot {
  private isActing = false;
  private hasPendingUpdate = false;

  constructor(config: BotConfig, nickname: string, avatarId: number, color: string) {
    super(config, nickname, avatarId, color);
  }

  public setEngine(engine: any) {
    super.setEngine(engine);
    this.isActing = false;
    this.hasPendingUpdate = false;
  }

  protected async onGameStateUpdate(event: { targetUserId: string; state: any }): Promise<void> {
    if (event.targetUserId !== this.userId) return;
    if (!this.engine) return;

    if (this.isActing) {
      this.hasPendingUpdate = true;
      return;
    }

    await this.checkAndAct();
  }

  private async checkAndAct(): Promise<void> {
    if (!this.engine || this.isActing) return;

    const engine = this.engine as ParchisEngine;
    const state = engine.state;
    if (!state || state === 'FINISHED' || state === 'LOBBY') return;

    // Fast pre-checks to avoid acquiring lock when no action is required
    if (state === 'CHOOSING_TOKENS') {
      const me = engine.players?.find(p => p.userId === this.userId);
      if (!me || me.hasChosenFigure) return;
    } else if (state === 'ROLLING_FOR_ORDER') {
      const alreadyRolled = engine.initiativeRolls && engine.initiativeRolls[this.userId] !== undefined;
      if (alreadyRolled) return;
    } else if (state === 'CHOOSING_SEATS') {
      if (engine.firstPickerUserId !== this.userId) return;
    } else if (state === 'PLAYING') {
      const isOurTurn = engine.players?.[engine.currentTurnIndex]?.userId === this.userId;
      if (!isOurTurn) return;

      const me = engine.players?.find(p => p.userId === this.userId);
      if (!me) return;

      const allTokensHome = me.tokens.every(t => t.state === 'HOME');
      const rollAttempts = engine.rollAttempts ?? 0;
      const canRollAgain = engine.rules.diceCount === 2 && allTokensHome && rollAttempts > 0 && rollAttempts < 3;
      const needsRoll = (engine.diceValue.length === 0 && engine.availableMoves.length === 0) || (engine.availableMoves.length === 0 && canRollAgain);
      const hasAvailableMoves = engine.availableMoves && engine.availableMoves.length > 0;

      if (!needsRoll && !hasAvailableMoves) return;
    } else {
      return;
    }

    this.isActing = true;
    try {
      if (state === 'CHOOSING_TOKENS') {
        await this.handleChoosingTokens();
      } else if (state === 'ROLLING_FOR_ORDER') {
        await this.handleRollingForOrder();
      } else if (state === 'CHOOSING_SEATS') {
        await this.handleChoosingSeats();
      } else if (state === 'PLAYING') {
        await this.handlePlaying();
      }
    } catch (error) {
      logger.error(`[ParchisBot ${this.nickname}] Error in onGameStateUpdate: ${(error as Error).message}`);
    } finally {
      this.isActing = false;
      if (this.hasPendingUpdate) {
        this.hasPendingUpdate = false;
        setImmediate(() => {
          this.checkAndAct();
        });
      }
    }
  }

  private async handleChoosingTokens(): Promise<void> {
    await this.think(800, 1600);

    const engine = this.engine as ParchisEngine;
    if (!engine || engine.state !== 'CHOOSING_TOKENS') return;

    const me = engine.players.find(p => p.userId === this.userId);
    if (!me || me.hasChosenFigure) return;

    const figureOptions = ['dog', 'car', 'hat', 'boat', 'gem', 'wood', 'ghost', 'rocket', 'crown', 'sword'];
    const takenFigures = engine.players.map(p => p.selectedFigure).filter(Boolean);
    const availableFigures = figureOptions.filter(f => !takenFigures.includes(f));

    if (availableFigures.length > 0) {
      const chosenFigure = availableFigures[Math.floor(Math.random() * availableFigures.length)];
      logger.debug(`[ParchisBot ${this.nickname}] Choosing figure: ${chosenFigure}`);
      engine.chooseFigure(this.userId, chosenFigure);
    }
  }

  private async handleRollingForOrder(): Promise<void> {
    await this.think(800, 1600);

    const engine = this.engine as ParchisEngine;
    if (!engine || engine.state !== 'ROLLING_FOR_ORDER') return;

    const alreadyRolled = engine.initiativeRolls && engine.initiativeRolls[this.userId] !== undefined;
    if (alreadyRolled) return;

    logger.debug(`[ParchisBot ${this.nickname}] Rolling for order`);
    engine.rollInitiative(this.userId);
  }

  private async handleChoosingSeats(): Promise<void> {
    await this.think(800, 1600);

    const engine = this.engine as ParchisEngine;
    if (!engine || engine.state !== 'CHOOSING_SEATS') return;
    if (engine.firstPickerUserId !== this.userId) return;

    const availableSeats: number[] = [];
    const sides = engine.sides || 4;
    const takenSeats = engine.takenSeats || [];

    for (let i = 0; i < sides; i++) {
      if (!takenSeats.includes(i)) {
        availableSeats.push(i);
      }
    }

    if (availableSeats.length > 0) {
      const chosenSeat = availableSeats[Math.floor(Math.random() * availableSeats.length)];
      logger.debug(`[ParchisBot ${this.nickname}] Choosing seat index: ${chosenSeat}`);
      engine.chooseSeat(this.userId, chosenSeat);
    }
  }

  private async handlePlaying(): Promise<void> {
    const engine = this.engine as ParchisEngine;
    if (!engine || engine.state !== 'PLAYING') return;

    const isOurTurn = engine.players[engine.currentTurnIndex]?.userId === this.userId;
    if (!isOurTurn) return;

    const me = engine.players.find(p => p.userId === this.userId);
    if (!me) return;

    const allTokensHome = me.tokens.every(t => t.state === 'HOME');
    const canRollAgain = engine.rules.diceCount === 2 && allTokensHome && engine.rollAttempts > 0 && engine.rollAttempts < 3;
    const needsRoll = (engine.diceValue.length === 0 && engine.availableMoves.length === 0) || (engine.availableMoves.length === 0 && canRollAgain);

    if (needsRoll) {
      await this.think(800, 1600);

      if (!this.engine || this.engine.state !== 'PLAYING') return;
      if (this.engine.players[this.engine.currentTurnIndex]?.userId !== this.userId) return;

      const currentMe = this.engine.players.find((p: any) => p.userId === this.userId);
      if (!currentMe) return;

      const currentAllTokensHome = currentMe.tokens.every((t: any) => t.state === 'HOME');
      const currentCanRollAgain = this.engine.rules.diceCount === 2 && currentAllTokensHome && this.engine.rollAttempts > 0 && this.engine.rollAttempts < 3;
      const stillNeedsRoll = (this.engine.diceValue.length === 0 && this.engine.availableMoves.length === 0) || (this.engine.availableMoves.length === 0 && currentCanRollAgain);

      if (!stillNeedsRoll) return;

      logger.debug(`[ParchisBot ${this.nickname}] Rolling dice`);
      this.engine.rollDice(this.userId);
      return;
    }

    if (engine.availableMoves && engine.availableMoves.length > 0) {
      await this.think(600, 1200);

      if (!this.engine || this.engine.state !== 'PLAYING') return;
      if (this.engine.players[this.engine.currentTurnIndex]?.userId !== this.userId) return;
      if (!this.engine.availableMoves || this.engine.availableMoves.length === 0) return;

      const currentMe = this.engine.players.find((p: any) => p.userId === this.userId);
      if (!currentMe) return;

      const bestMove = this.findBestMove(this.engine, currentMe);
      if (bestMove) {
        logger.debug(`[ParchisBot ${this.nickname}] Moving token ${bestMove.tokenId} with moveValue ${bestMove.moveValue} (score: ${bestMove.score})`);
        this.engine.moveToken(this.userId, bestMove.tokenId, bestMove.moveValue);
      } else {
        logger.warn(`[ParchisBot ${this.nickname}] No valid moves for available moves [${this.engine.availableMoves.join(', ')}]. Passing turn.`);
        this.engine.availableMoves = [];
        this.engine.nextTurn();
      }
    }
  }

  private findBestMove(engine: ParchisEngine, player: ParchisPlayer): { tokenId: string; moveValue: number; score: number } | null {
    let bestMove: { tokenId: string; moveValue: number; score: number } | null = null;

    const uniqueMoves = Array.from(new Set(engine.availableMoves));

    for (const moveValue of uniqueMoves) {
      for (const token of player.tokens) {
        const score = this.evaluateMove(engine, player, token, moveValue);
        if (score !== null) {
          if (!bestMove || score > bestMove.score) {
            bestMove = { tokenId: token.id, moveValue, score };
          }
        }
      }
    }

    return bestMove;
  }

  private evaluateMove(engine: ParchisEngine, player: ParchisPlayer, token: ParchisToken, diceValue: number): number | null {
    if (token.state === 'FINISHED') return null;

    const colorIndex = engine.getPlayerColorIndex(player.userId);
    const startPos = ((colorIndex % engine.sides) * 17) + 12;
    const maxOnBoard = engine.trackLength - 1;

    if (token.state === 'HOME') {
      if (engine.rules.diceCount === 2) {
        const isPairRoll = engine.diceValue.length === 2 && engine.diceValue[0] === engine.diceValue[1];
        const isPairIntact = isPairRoll && engine.availableMoves.filter(m => m === engine.diceValue[0]).length === 2;

        if (!isPairRoll || !isPairIntact || diceValue !== engine.diceValue[0]) {
          return null;
        }

        const enemyBlock = engine.players.some(op =>
          op.userId !== player.userId &&
          op.tokens.filter(ot => ot.state === 'BOARD' && ot.position === startPos).length >= 2
        );

        if (enemyBlock && engine.rules.safeBlocks !== false) {
          return null;
        }

        return 1000; // EXIT HOME priority
      } else {
        // 1 die: needs 5 to exit
        if (diceValue !== 5) return null;
        if (ParchisCaptureLogic.isPositionBlocked(engine, startPos)) return null;

        return 1000; // EXIT HOME priority
      }
    }

    if (token.state === 'BOARD' || token.state === 'PATH' || token.state === 'META') {
      let travelled = 0;
      let isMetaMove = false;

      if (token.state === 'META') {
        isMetaMove = true;
        travelled = maxOnBoard + 1 + token.position;
      } else {
        travelled = token.position - startPos;
        if (travelled < 0) travelled += engine.trackLength;
      }

      const newTravelled = travelled + diceValue;

      if (newTravelled > maxOnBoard) {
        const metaPos = newTravelled - maxOnBoard - 1;
        if (metaPos > 8) return null; // Overshoots goal
        if (metaPos === 8) {
          return 900; // GOAL / FINISHED
        }
        // Advance in META corridor
        return 600 + metaPos;
      } else {
        if (isMetaMove) return null; // Cannot leave META back to board

        const newPos = (token.position + diceValue) % engine.trackLength;
        if (ParchisCaptureLogic.isPositionBlocked(engine, newPos)) return null;

        const isSafe = engine.rules.safeZones.includes(newPos);
        let isCapture = false;

        if (!isSafe) {
          for (const op of engine.players) {
            if (op.userId === player.userId) continue;
            const enemyTokens = op.tokens.filter(ot => ot.state === 'BOARD' && ot.position === newPos);
            if (enemyTokens.length > 0) {
              isCapture = true;
              break;
            }
          }
        }

        if (isCapture) {
          return 850 + (travelled / 100);
        }

        const safeBonus = isSafe ? 30 : 0;
        return 100 + travelled + safeBonus;
      }
    }

    return null;
  }
}

