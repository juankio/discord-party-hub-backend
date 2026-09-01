import { BaseBot, BotConfig } from "../BaseBot.js";
import type { LiarsEngine } from "../../../games/liars-bar/LiarsEngine.js";
import { LiarsPlayLogic } from "../../../games/liars-bar/LiarsPlayLogic.js";
import { logger } from "../../Logger.js";

export class LiarsBot extends BaseBot {
    
    constructor(config: BotConfig, nickname: string, avatarId: number, color: string) {
        super(config, nickname, avatarId, color);
    }

    protected async onGameStateUpdate(event: { targetUserId: string; state: any }): Promise<void> {
        if (event.targetUserId !== this.userId) return;

        const { state } = event;

        // "You cannot cook a fine meal with muddy vegetables." 
        // Validate that it's our turn and the game is waiting for a bet.
        const currentTurn = state.currentTurnId || state.currentTurnUserId;
        if (state.state !== 'BETTING' || currentTurn !== this.userId) {
            return;
        }

        try {
            // "Simmering the ingredients..." Add an artificial pause.
            await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
            await new Promise(resolve => setImmediate(resolve));

            const liarsEngine = this.engine as LiarsEngine;
            const myDice: number[] = state.myDice || [];
            const totalDiceCount: number = state.totalDiceCount || 0;
            const currentBid = state.currentBet || state.currentBid;
            const rules = state.rules || { onesAreWild: true };
            const onesAreWild = rules.onesAreWild;

            // "Let's count our finest spices..."
            const countMyFace = (targetFace: number) => {
                return myDice.filter(d => d === targetFace || (onesAreWild && d === 1)).length;
            };

            // Calculate the most abundant face in our hand (excluding 1s if they are wild, unless we only have 1s)
            let bestFace = 2;
            let maxCount = -1;
            for (let f = 2; f <= 6; f++) {
                const count = countMyFace(f);
                if (count > maxCount) {
                    maxCount = count;
                    bestFace = f;
                }
            }
            // Fallback if we somehow only have 1s or bestFace wasn't updated
            if (maxCount <= 0) {
                maxCount = myDice.length > 0 ? 1 : 1;
                bestFace = 2;
            }

            if (!currentBid) {
                // "No bets yet? Let me plate the first dish."
                // Make a safe initial bet based on our own dice.
                const initialCount = maxCount > 0 ? maxCount : 1;
                logger.debug(`[Sanji-Bot ${this.nickname}] Placed initial bid: ${initialCount} of face ${bestFace}`);
                liarsEngine.placeBid(this.userId, initialCount, bestFace);
                return;
            }

            // "There's a dish on the table... let's see if it's rotten!"
            const currentFace = currentBid.face;
            const currentCount = currentBid.count ?? currentBid.amount;
            
            const myRelevantDice = countMyFace(currentFace);
            
            // Expected formula directly from the chef's recipe:
            // "Promedio estadístico en la mesa: expected = (state.totalDiceCount / 6) + (comodines esperados: state.totalDiceCount / 6)."
            // "Es decir, estadísticamente, habrá ~ (totalDice / 3) dados de cualquier cara."
            // "Suma lo que el bot VE en su mano de esa cara (incluyendo unos)."
            const baseExpected = totalDiceCount / 3;
            const expectedTotal = baseExpected + myRelevantDice;

            // "If the bet is widely overcooked, we call them a liar! A swift Diable Jambe!"
            // Si la apuesta actual supera ampliamente (totalDiceCount / 3) + misDadosQueAportan o excede el total de dados
            const margin = 1; 
            
            if (currentCount > expectedTotal + margin || currentCount >= totalDiceCount) {
                logger.debug(`[Sanji-Bot ${this.nickname}] Called Liar! Bid: ${currentCount}, Expected: ${expectedTotal.toFixed(2)}`);
                liarsEngine.callLiar(this.userId);
            } else {
                // "The ingredients look fresh enough. Let's spice it up!"
                // We raise the bid.
                let nextFace = currentFace;
                let nextCount = currentCount;

                if (bestFace > currentFace && maxCount >= currentCount) {
                    // Raise face, same count
                    nextFace = bestFace;
                    nextCount = currentCount;
                } else {
                    // Just raise the count
                    nextFace = currentFace;
                    nextCount = currentCount + 1;
                }

                // Ensure the constructed bid is strictly valid
                if (!LiarsPlayLogic.isValidBid(currentBid, nextCount, nextFace)) {
                    nextFace = currentFace;
                    nextCount = currentCount + 1;
                }

                logger.debug(`[Sanji-Bot ${this.nickname}] Raised bid to: ${nextCount} of face ${nextFace}`);
                liarsEngine.placeBid(this.userId, nextCount, nextFace);
            }
        } catch (error) {
            // "Never serve a burnt dish!"
            logger.error(`[Sanji-Bot ${this.nickname}] Error processing turn: ${(error as Error).message}`);
        }
    }
}
