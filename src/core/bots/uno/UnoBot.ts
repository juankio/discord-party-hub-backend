import { BaseBot, BotConfig } from "../BaseBot.js";
import { logger } from "../../Logger.js";
import type { Card, CardColor } from "../../../games/uno/UnoTypes.js";
import { UnoBotStrategy } from "./UnoBotStrategy.js";

export class UnoBot extends BaseBot {
  private lastHandledStateHash: string = "";

  constructor(config: BotConfig, nickname: string, avatarId: number, color: string) {
    super(config, nickname, avatarId, color);
  }

  private async handlePostPlayAction(chosenColor?: CardColor) {
    if (!this.engine || this.engine.actionRequiredFrom !== this.userId) return;

    if (this.engine.state === 'CHOOSING_COLOR') {
      const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
      const finalColor = chosenColor || colors[Math.floor(Math.random() * colors.length)];
      logger.debug(`[UnoBot ${this.nickname}] Declaring color: ${finalColor}`);
      this.engine.declareColor(this.userId, finalColor);
    } else if (this.engine.state === 'CHOOSING_PLAYER') {
      const rivals = this.engine.players.filter((p: any) => p.userId !== this.userId);
      
      // Yield the event loop before calculation
      await new Promise(resolve => setImmediate(resolve));
      
      const targetId = UnoBotStrategy.getBestPlayerToSwap(rivals);
      if (targetId) {
        logger.debug(`[UnoBot ${this.nickname}] Swapping hands with ${targetId}`);
        this.engine.swapHands(this.userId, targetId);
      }
    }
  }

  protected async onGameStateUpdate(event: { targetUserId: string; state: any }): Promise<void> {
    if (event.targetUserId !== this.userId) return;

    const { state } = event;

    // We only care about states where the game is active
    if (state.state === 'WAITING' || state.state === 'FINISHED') return;

    // Check if it's our turn or an action is required from us
    const isOurTurn = state.currentTurnUserId === this.userId && state.state === 'PLAYING';
    const actionRequired = state.actionRequiredFrom === this.userId;

    if (!isOurTurn && !actionRequired) return;

    const myHand = state.myHand || this.engine?.players.find((p: any) => p.userId === this.userId)?.hand || [];

    // Avoid reacting multiple times to the exact same state for the same turn state
    const stateHash = `${state.state}_${state.currentTurnUserId}_${state.actionRequiredFrom}_${state.topCard?.id}_${state.pendingDraws}_${state.hasDrawnThisTurn}_${myHand.length}`;
    if (this.lastHandledStateHash === stateHash) return;
    this.lastHandledStateHash = stateHash;

    // Small delay to simulate thinking
    await this.think(1000, 3000);

    // Re-verify the engine state
    if (!this.engine) return;
    
    const currentEnginePlayer = this.engine.players[this.engine.currentTurnIndex];
    const stillOurTurn = currentEnginePlayer?.userId === this.userId && this.engine.state === 'PLAYING';
    const stillActionRequired = this.engine.actionRequiredFrom === this.userId;

    if (!stillOurTurn && !stillActionRequired) return;

    if (stillActionRequired) {
      if (this.engine.state === 'CHOOSING_COLOR') {
        const hand: Card[] = state.myHand || this.engine.players.find((p: any) => p.userId === this.userId)?.hand || [];
        
        // Yield the event loop before calculation
        await new Promise(resolve => setImmediate(resolve));
        
        const chosenColor = UnoBotStrategy.getBestColorToDeclare(hand);
        
        logger.debug(`[UnoBot ${this.nickname}] Choosing color: ${chosenColor}`);
        this.engine.declareColor(this.userId, chosenColor);
      } else if (this.engine.state === 'CHOOSING_PLAYER') {
        const rivals = state.rivals || [];
        
        // Yield the event loop before calculation
        await new Promise(resolve => setImmediate(resolve));
        
        const targetId = UnoBotStrategy.getBestPlayerToSwap(rivals);
        if (targetId) {
          logger.debug(`[UnoBot ${this.nickname}] Swapping hands with target ${targetId}`);
          this.engine.swapHands(this.userId, targetId);
        }
      }
      return;
    }

    if (stillOurTurn) {
      const hand: Card[] = state.myHand || state.players?.find((p: any) => p.userId === this.userId)?.hand || [];
      const topCard = state.topCard;
      const currentColor = state.currentColor;
      const pendingDraws = state.pendingDraws || 0;

      if (pendingDraws > 0) {
        const canStack = this.engine.rules.stackDrawCards;

        // Yield the event loop before calculation
        await new Promise(resolve => setImmediate(resolve));
        
        const stackedCard = canStack ? UnoBotStrategy.getCardToStack(hand, topCard) : undefined;

        if (stackedCard) {
          logger.debug(`[UnoBot ${this.nickname}] Stacking card ${stackedCard.id} to avoid ${pendingDraws} draws`);
          this.engine.playCards(this.userId, [stackedCard.id]);
          await this.handlePostPlayAction();
        } else {
          logger.debug(`[UnoBot ${this.nickname}] Drawing cards because of pending draws`);
          this.engine.drawFromDeck(this.userId);
        }
        return;
      }

      if (state.hasDrawnThisTurn) {
        // Yield the event loop before calculation
        await new Promise(resolve => setImmediate(resolve));
        
        const playableCard = hand.find(c => UnoBotStrategy.isCardPlayable(c, topCard, currentColor));
        if (playableCard) {
          logger.debug(`[UnoBot ${this.nickname}] Playing drawn card ${playableCard.id}`);
          this.engine.playCards(this.userId, [playableCard.id]);
          await this.handlePostPlayAction();
          this.checkAndYellUno(hand);
        } else {
          logger.debug(`[UnoBot ${this.nickname}] Passing turn`);
          this.engine.passTurn(this.userId);
        }
        return;
      }

      // Yield the event loop before heavy calculation
      await new Promise(resolve => setImmediate(resolve));

      const cardToPlay = UnoBotStrategy.evaluateBestCardToPlay(hand, topCard, currentColor, this.difficultyLevel);

      if (cardToPlay) {
        logger.debug(`[UnoBot ${this.nickname}] Playing card ${cardToPlay.id}`);
        
        let chosenColor: CardColor | undefined = undefined;
        if (cardToPlay.color === 'wild') {
           const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
           chosenColor = colors[Math.floor(Math.random() * colors.length)];
        }

        if (typeof this.engine.playCard === 'function') {
          this.engine.playCard(this.userId, cardToPlay.id, chosenColor);
        } else {
          this.engine.playCards(this.userId, [cardToPlay.id]);
        }
        await this.handlePostPlayAction(chosenColor);
        this.checkAndYellUno(hand);
      } else {
        logger.debug(`[UnoBot ${this.nickname}] No playable cards, drawing from deck`);
        this.engine.drawFromDeck(this.userId);
      }
    }
  }

  private checkAndYellUno(hand: Card[]) {
    if (hand.length === 2) { // 2 because we just played a card, so it becomes 1? Wait, if we are evaluating hand *before* playing, it's 2.
      const forgotProbability = Math.max(0, (10 - this.difficultyLevel) * 0.1);
      if (Math.random() >= forgotProbability) {
        setTimeout(() => {
          if (this.engine) this.engine.yellUno(this.userId);
        }, 1000 + Math.random() * 500);
      } else {
        logger.debug(`[UnoBot ${this.nickname}] Forgot to yell UNO!`);
      }
    }
  }
}
