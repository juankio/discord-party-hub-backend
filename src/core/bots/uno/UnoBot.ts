import { BaseBot, BotConfig } from "../BaseBot.js";
import { logger } from "../../Logger.js";
import type { Card, CardColor } from "../../../games/uno/UnoTypes.js";

export class UnoBot extends BaseBot {
  private lastHandledStateHash: string = "";

  constructor(config: BotConfig, nickname: string, avatarId: number, color: string) {
    super(config, nickname, avatarId, color);
  }

  private handlePostPlayAction(chosenColor?: CardColor) {
    if (!this.engine || this.engine.actionRequiredFrom !== this.userId) return;

    if (this.engine.state === 'CHOOSING_COLOR') {
      const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
      const finalColor = chosenColor || colors[Math.floor(Math.random() * colors.length)];
      logger.debug(`[UnoBot ${this.nickname}] Declaring color: ${finalColor}`);
      this.engine.declareColor(this.userId, finalColor);
    } else if (this.engine.state === 'CHOOSING_PLAYER') {
      const rivals = this.engine.players.filter((p: any) => p.userId !== this.userId);
      rivals.sort((a: any, b: any) => a.hand.length - b.hand.length);
      if (rivals.length > 0) {
        const targetId = rivals[0].userId;
        logger.debug(`[UnoBot ${this.nickname}] Swapping hands with ${rivals[0].nickname}`);
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
    // We can use a simple hash or just checking hand size + top card + pending status
    const stateHash = `${state.state}_${state.currentTurnUserId}_${state.actionRequiredFrom}_${state.topCard?.id}_${state.pendingDraws}_${state.hasDrawnThisTurn}_${myHand.length}`;
    if (this.lastHandledStateHash === stateHash) return;
    this.lastHandledStateHash = stateHash;

    // Small delay to simulate thinking (BaseBot provides this)
    await this.think(1000, 3000);

    // After thinking, we must re-verify the engine state to avoid race conditions 
    // where the game might have advanced while we were waiting
    if (!this.engine) return;
    
    // Check direct engine properties to ensure it's STILL our turn
    const currentEnginePlayer = this.engine.players[this.engine.currentTurnIndex];
    const stillOurTurn = currentEnginePlayer?.userId === this.userId && this.engine.state === 'PLAYING';
    const stillActionRequired = this.engine.actionRequiredFrom === this.userId;

    if (!stillOurTurn && !stillActionRequired) return;

    // --- Action Requirement Handling (Choosing Color, Swapping Hands) ---
    if (stillActionRequired) {
      if (this.engine.state === 'CHOOSING_COLOR') {
        const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
        
        // Simple heuristic: count colors in hand and pick the most abundant
        const myHand: Card[] = state.myHand || this.engine.players.find((p: any) => p.userId === this.userId)?.hand || [];
        const colorCounts: Record<string, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
        for (const card of myHand) {
          if (card.color !== 'wild') {
            colorCounts[card.color] = (colorCounts[card.color] || 0) + 1;
          }
        }
        
        const bestColor = Object.keys(colorCounts).reduce((a, b) => colorCounts[a] > colorCounts[b] ? a : b) as CardColor;
        const chosenColor = colorCounts[bestColor] > 0 ? bestColor : colors[Math.floor(Math.random() * colors.length)];
        
        logger.debug(`[UnoBot ${this.nickname}] Choosing color: ${chosenColor}`);
        this.engine.declareColor(this.userId, chosenColor);
      } else if (this.engine.state === 'CHOOSING_PLAYER') {
        // Find a rival with the fewest cards to swap with (or randomly)
        // state.rivals is available in event.state
        const rivals = state.rivals || [];
        if (rivals.length > 0) {
          // Sort by card count ascending (we want to swap with someone who has fewest cards usually)
          rivals.sort((a: any, b: any) => a.cardCount - b.cardCount);
          const targetId = rivals[0].userId;
          logger.debug(`[UnoBot ${this.nickname}] Swapping hands with ${rivals[0].nickname}`);
          this.engine.swapHands(this.userId, targetId);
        }
      }
      return;
    }

    // --- Playing Turn Handling ---
    if (stillOurTurn) {
      const myHand: Card[] = state.myHand || state.players?.find((p: any) => p.userId === this.userId)?.hand || [];
      const topCard = state.topCard;
      const currentColor = state.currentColor;
      const pendingDraws = state.pendingDraws || 0;

      // Handle pending draws
      if (pendingDraws > 0) {
        // Can we stack? 
        const canStack = this.engine.rules.stackDrawCards;
        let stackedCard: Card | undefined;
        
        if (canStack) {
          // Find a card to stack (draw2 on draw2, wild_draw4 on wild_draw4)
          stackedCard = myHand.find(c => c.value === topCard.value && (c.value === 'draw2' || c.value === 'wild_draw4'));
        }

        if (stackedCard) {
          logger.debug(`[UnoBot ${this.nickname}] Stacking card ${stackedCard.id} to avoid ${pendingDraws} draws`);
          this.engine.playCards(this.userId, [stackedCard.id]);
          this.handlePostPlayAction();
          return;
        } else {
          logger.debug(`[UnoBot ${this.nickname}] Drawing cards because of pending draws`);
          this.engine.drawFromDeck(this.userId);
          return;
        }
      }

      // If we already drew a card this turn, we either play it (if valid) or pass
      if (state.hasDrawnThisTurn) {
        // Find if the drawn card is playable (usually the last card if drawn)
        // For simplicity, we just check all cards again (since we might have drawn a playable one)
        const playableCard = myHand.find(c => this.isCardPlayable(c, topCard, currentColor));
        if (playableCard) {
          logger.debug(`[UnoBot ${this.nickname}] Playing drawn card ${playableCard.id}`);
          if (myHand.length === 2) {
            const isDumb = this.difficultyLevel <= 3;
            const failYell = isDumb && Math.random() < 0.2;
            if (!failYell) {
              this.engine.yellUno(this.userId); // Before it goes down to 1
            } else {
              logger.debug(`[UnoBot ${this.nickname}] (Dumb Move) Forgot to yell UNO on draw play!`);
            }
          }
          this.engine.playCards(this.userId, [playableCard.id]);
          this.handlePostPlayAction();
        } else {
          logger.debug(`[UnoBot ${this.nickname}] Passing turn`);
          this.engine.passTurn(this.userId);
        }
        return;
      }

      // Normal turn logic: find a playable card
      let playableCards = myHand.filter(c => this.isCardPlayable(c, topCard, currentColor));

      // Dumb move: sometimes act like we don't have a playable card if difficulty is low
      if (playableCards.length > 0 && this.difficultyLevel <= 3 && Math.random() < 0.2) {
        logger.debug(`[UnoBot ${this.nickname}] (Dumb Move) Skipping playable cards!`);
        playableCards = [];
      }

      if (playableCards.length > 0) {
        // Simple strategy: play normal cards first, save wilds for later
        playableCards.sort((a, b) => {
          if (a.color === 'wild' && b.color !== 'wild') return 1;
          if (a.color !== 'wild' && b.color === 'wild') return -1;
          return 0;
        });

        const cardToPlay = playableCards[0];
        logger.debug(`[UnoBot ${this.nickname}] Playing card ${cardToPlay.id}`);
        
        // Yell UNO if we will have 1 card left
        if (myHand.length === 2) {
          const isDumb = this.difficultyLevel <= 3;
          const failYell = isDumb && Math.random() < 0.2;
          if (!failYell) {
            this.engine.yellUno(this.userId);
          } else {
            logger.debug(`[UnoBot ${this.nickname}] (Dumb Move) Forgot to yell UNO!`);
          }
        }

        // The prompt asks for playCard(userId, cardId, chosenColor) 
        // We will do both or handle safely if the engine signature varies
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
        this.handlePostPlayAction(chosenColor);
      } else {
        logger.debug(`[UnoBot ${this.nickname}] No playable cards, drawing from deck`);
        this.engine.drawFromDeck(this.userId);
      }
    }
  }

  private isCardPlayable(card: Card, topCard: Card, currentColor: string): boolean {
    if (card.color === 'wild') return true;
    if (card.color === currentColor) return true;
    if (card.value === topCard.value) return true;
    return false;
  }
}
