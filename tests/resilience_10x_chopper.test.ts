import { describe, it, expect, beforeEach } from "bun:test";
import { LiarsEngine } from "../src/games/liars-bar/LiarsEngine.js";
import { LiarsPlayLogic } from "../src/games/liars-bar/LiarsPlayLogic.js";
import { LiarsBot } from "../src/core/bots/liars/LiarsBot.js";
import { StopEngine } from "../src/games/stop/StopEngine.js";
import { StopValidationLogic } from "../src/games/stop/StopValidationLogic.js";
import { StopScoringLogic } from "../src/games/stop/StopScoringLogic.js";
import { ParchisEngine } from "../src/games/parchis/ParchisEngine.js";
import { ParchisTurnLogic } from "../src/games/parchis/ParchisTurnLogic.js";

// Mock IO emitter for testing engines
function createMockIO() {
  const emitted: Array<{ target: string; evt: string; payload: any }> = [];
  return {
    to: (target: string) => ({
      emit: (evt: string, payload: any) => emitted.push({ target, evt, payload }),
    }),
    emit: (evt: string, payload: any) => emitted.push({ target: "all", evt, payload }),
    emitted,
  } as any;
}

// Fast Engine for high-speed deterministic 10x bot matches without 9s sleep delays
class AcceleratedLiarsEngine extends LiarsEngine {
  private fastTimeout: NodeJS.Timeout | null = null;

  override setTimer(ms: number, cb: () => void) {
    this.clearTimers();
    // Compress 3000ms/6000ms timers to 1ms for ultra-fast resilience loops
    this.fastTimeout = setTimeout(cb, 1);
  }

  override clearTimers() {
    if (this.fastTimeout) {
      clearTimeout(this.fastTimeout);
      this.fastTimeout = null;
    }
    super.clearTimers();
  }

  override destroy() {
    this.clearTimers();
    super.destroy();
  }
}

// Bot subclass that bypasses artificial human sleep delays for instant stress testing
class AcceleratedLiarsBot extends LiarsBot {
  public turnDecisionsCount = 0;
  public stateUpdatesObserved: any[] = [];

  protected override async onGameStateUpdate(event: { targetUserId: string; state: any }): Promise<void> {
    if (event.targetUserId !== this.userId) return;
    const { state } = event;
    this.stateUpdatesObserved.push(state);

    const currentTurn = state.currentTurnId || state.currentTurnUserId;
    if (state.state !== 'BETTING' || currentTurn !== this.userId) {
      return;
    }

    this.turnDecisionsCount++;

    // Execute the exact decision tree from production LiarsBot
    const liarsEngine = this.engine as LiarsEngine;
    const myDice: number[] = state.myDice || [];
    const totalDiceCount: number = state.totalDiceCount || 0;
    const currentBid = state.currentBet || state.currentBid;
    const rules = state.rules || { onesAreWild: true };
    const onesAreWild = rules.onesAreWild;

    const countMyFace = (targetFace: number) => {
      return myDice.filter(d => d === targetFace || (onesAreWild && d === 1)).length;
    };

    let bestFace = 2;
    let maxCount = -1;
    for (let f = 2; f <= 6; f++) {
      const count = countMyFace(f);
      if (count > maxCount) {
        maxCount = count;
        bestFace = f;
      }
    }
    if (maxCount <= 0) {
      maxCount = myDice.length > 0 ? 1 : 1;
      bestFace = 2;
    }

    if (!currentBid) {
      const initialCount = maxCount > 0 ? maxCount : 1;
      liarsEngine.placeBid(this.userId, initialCount, bestFace);
      return;
    }

    const currentFace = currentBid.face;
    const currentCount = currentBid.count ?? currentBid.amount;
    const myRelevantDice = countMyFace(currentFace);
    const baseExpected = totalDiceCount / 3;
    const expectedTotal = baseExpected + myRelevantDice;
    const margin = 1;

    if (currentCount > expectedTotal + margin || currentCount >= totalDiceCount) {
      liarsEngine.callLiar(this.userId);
    } else {
      let nextFace = currentFace;
      let nextCount = currentCount;

      if (bestFace > currentFace && maxCount >= currentCount) {
        nextFace = bestFace;
        nextCount = currentCount;
      } else {
        nextFace = currentFace;
        nextCount = currentCount + 1;
      }

      if (!LiarsPlayLogic.isValidBid(currentBid, nextCount, nextFace)) {
        nextFace = currentFace;
        nextCount = currentCount + 1;
      }

      liarsEngine.placeBid(this.userId, nextCount, nextFace);
    }
  }
}

describe("🩺 TONY TONY CHOPPER - 10X RESILIENCE CLINICAL SUITE", () => {

  // =========================================================================
  // SCENARIO 1: 10X CONSECUTIVE LIAR'S BAR BOT MATCHES (NO SOFTLOCKS & BET CONSISTENCY)
  // =========================================================================
  describe("1. Liar's Bar 10x Consecutive Matches Test (Zero Softlocks)", () => {
    it("should run 10 full consecutive Liar's Bar matches to completion without softlocks", async () => {
      const matchResults: Array<{ match: number; winner: string; rounds: number; totalTurns: number; betIntegrityPassed: boolean }> = [];

      for (let matchIndex = 1; matchIndex <= 10; matchIndex++) {
        const mockIO = createMockIO();
        const engine = new AcceleratedLiarsEngine(`room-liars-10x-${matchIndex}`, mockIO);

        const bot1 = new AcceleratedLiarsBot(
          { existingUserId: `bot_alpha_${matchIndex}`, roomId: engine.roomId, gameType: "liars", difficultyLevel: 5 },
          `Bot Alpha ${matchIndex}`, 1, "#ef4444"
        );
        const bot2 = new AcceleratedLiarsBot(
          { existingUserId: `bot_beta_${matchIndex}`, roomId: engine.roomId, gameType: "liars", difficultyLevel: 5 },
          `Bot Beta ${matchIndex}`, 2, "#3b82f6"
        );
        const bot3 = new AcceleratedLiarsBot(
          { existingUserId: `bot_gamma_${matchIndex}`, roomId: engine.roomId, gameType: "liars", difficultyLevel: 5 },
          `Bot Gamma ${matchIndex}`, 3, "#22c55e"
        );

        engine.addPlayer(bot1.userId, bot1.userId, bot1.nickname, 1, bot1.color);
        engine.addPlayer(bot2.userId, bot2.userId, bot2.nickname, 2, bot2.color);
        engine.addPlayer(bot3.userId, bot3.userId, bot3.nickname, 3, bot3.color);

        bot1.setEngine(engine);
        bot2.setEngine(engine);
        bot3.setEngine(engine);

        let betIntegrityPassed = true;
        let turnCount = 0;

        // Monitor every single game_state_update emitted to check currentBet vs currentBid
        engine.on("game_state_update", (event: { targetUserId: string; state: any }) => {
          const s = event.state;
          // Verify currentBet and currentBid are always synchronized and present
          if (s.currentBet !== undefined || s.currentBid !== undefined) {
            if (s.currentBet !== null || s.currentBid !== null) {
              if (!s.currentBet || !s.currentBid) {
                betIntegrityPassed = false;
              } else {
                if (s.currentBet.count !== s.currentBid.count || s.currentBet.face !== s.currentBid.face) {
                  betIntegrityPassed = false;
                }
              }
            }
          }
          if (s.state === "BETTING") {
            turnCount++;
          }
        });

        // Start match with 3 initial dice for fast conclusive rounds
        engine.startGame({ initialDice: 3, onesAreWild: true });

        // Wait for game completion with watchdog timeout
        const maxWaitMs = 5000;
        const startTime = Date.now();

        while (engine.state !== "FINISHED" && Date.now() - startTime < maxWaitMs) {
          await new Promise((r) => setTimeout(r, 10));
        }

        expect(engine.state).toBe("FINISHED");
        expect(engine.winner).not.toBeNull();
        expect(betIntegrityPassed).toBe(true);

        const totalTurns = bot1.turnDecisionsCount + bot2.turnDecisionsCount + bot3.turnDecisionsCount;
        expect(totalTurns).toBeGreaterThan(0);

        matchResults.push({
          match: matchIndex,
          winner: engine.winner!,
          rounds: 1, // multiple elimination rounds happened
          totalTurns,
          betIntegrityPassed,
        });

        engine.destroy();
      }

      expect(matchResults.length).toBe(10);
      expect(matchResults.every((m) => m.betIntegrityPassed)).toBe(true);
    });
  });

  // =========================================================================
  // SCENARIO 2: 10X STOP VERIFICATION CYCLES WITH SIMULTANEOUS VETOES
  // =========================================================================
  describe("2. Stop 10x Verification Cycles with Simultaneous Vetoes (Memory Leak & Rejection Audit)", () => {
    it("should execute 10 consecutive Stop verification cycles with concurrent veto spam without memory leaks or unhandled rejections", async () => {
      let unhandledRejectionCount = 0;
      const rejectionHandler = (reason: any) => {
        unhandledRejectionCount++;
      };
      process.on("unhandledRejection", rejectionHandler);

      const initialHeap = process.memoryUsage().heapUsed;
      const cycleAudit: Array<{ cycle: number; totalVetoesCast: number; scoresCalculated: boolean }> = [];

      for (let cycle = 1; cycle <= 10; cycle++) {
        const mockIO = createMockIO();
        const engine = new StopEngine(`room-stop-10x-${cycle}`, mockIO);

        const players = [
          { id: `stop_p1_${cycle}`, nick: "Chopper", avatar: 1, color: "#ef4444" },
          { id: `stop_p2_${cycle}`, nick: "Luffy", avatar: 2, color: "#3b82f6" },
          { id: `stop_p3_${cycle}`, nick: "Zoro", avatar: 3, color: "#22c55e" },
          { id: `stop_p4_${cycle}`, nick: "Nami", avatar: 4, color: "#eab308" },
          { id: `stop_p5_${cycle}`, nick: "Sanji", avatar: 5, color: "#a855f7" },
        ];

        players.forEach((p) => engine.addPlayer(p.id, p.id, p.nick, p.avatar, p.color));

        // Start game
        engine.startGame({
          categories: ["Nombre", "Animal", "Color", "Cosa", "Fruta"],
          rounds: 1,
          verificationTime: 5,
        });

        expect(engine.state).toBe("PLAYING");
        const letter = engine.currentLetter || "A";

        // Submit valid and invalid answers for all 5 players
        players.forEach((p, idx) => {
          const answers = {
            Nombre: `${letter}lberto_${idx}`,
            Animal: `${letter}guila`, // duplicate word to test shared points
            Color: idx === 0 ? `Z_Incorrecto` : `${letter}zul`, // invalid starting letter for p1
            Cosa: `${letter}uto`,
            Fruta: idx % 2 === 0 ? `${letter}nana` : `${letter}vacate`,
          };
          engine.submitAnswers(p.id, answers);
        });

        // Trigger Stop phase -> VERIFYING
        StopValidationLogic.startVerifying(engine);
        expect(engine.state).toBe("VERIFYING");
        expect(engine.verifyingData.length).toBe(5);

        // Dispatch 50 simultaneous concurrent vetoes from multiple players
        const vetoPromises: Promise<void>[] = [];
        let totalVetoesCast = 0;

        for (let v = 0; v < 50; v++) {
          const voterIndex = v % players.length;
          const targetIndex = (v + 1) % players.length;
          const voter = players[voterIndex];
          const target = players[targetIndex];
          const categories = ["Nombre", "Animal", "Color", "Cosa", "Fruta"];
          const cat = categories[v % categories.length];

          vetoPromises.push(
            (async () => {
              engine.voteVeto(voter.id, cat, target.id);
              totalVetoesCast++;
            })()
          );
        }

        await Promise.all(vetoPromises);

        // Finish verification and calculate scoring
        StopScoringLogic.finishVerifyingAndScore(engine);
        expect(engine.state).toBe("SCORING");

        // Verify that all players received scores
        const hasAllScores = players.every((p) => typeof engine.roundScores[p.id] === "number");
        expect(hasAllScores).toBe(true);

        cycleAudit.push({
          cycle,
          totalVetoesCast,
          scoresCalculated: hasAllScores,
        });

        engine.destroy();
      }

      process.off("unhandledRejection", rejectionHandler);

      const finalHeap = process.memoryUsage().heapUsed;
      const heapGrowthMB = (finalHeap - initialHeap) / (1024 * 1024);

      expect(unhandledRejectionCount).toBe(0);
      expect(cycleAudit.length).toBe(10);
      expect(cycleAudit.every((c) => c.scoresCalculated)).toBe(true);
      // Ensure no massive runaway memory leak (>50MB growth across 10 engine cycles)
      expect(heapGrowthMB).toBeLessThan(50);
    });
  });

  // =========================================================================
  // SCENARIO 3: 10X PARCHÍS CONCURRENT SPAM ROLLS (LOCK isTurnTransitioning AUDIT)
  // =========================================================================
  describe("3. Parchís 10x Concurrent Spam Rolls (Lock isTurnTransitioning Validation)", () => {
    it("should reject concurrent rollDice spam during isTurnTransitioning across 10 consecutive turn cycles", async () => {
      const mockIO = createMockIO();
      const engine = new ParchisEngine("room-parchis-10x", mockIO);

      const players = [
        { id: "parchis_p1", nick: "Chopper", avatar: 1, color: "yellow" },
        { id: "parchis_p2", nick: "Luffy", avatar: 2, color: "blue" },
        { id: "parchis_p3", nick: "Zoro", avatar: 3, color: "red" },
        { id: "parchis_p4", nick: "Nami", avatar: 4, color: "green" },
      ];

      players.forEach((p) => engine.addPlayer(p.id, p.id, p.nick, p.avatar, p.color));
      engine.state = "PLAYING";

      // Initialize all tokens in HOME for all players
      players.forEach((p) => {
        const playerObj = engine.players.find((pl) => pl.userId === p.id);
        if (playerObj) {
          playerObj.tokens = [
            { id: `${p.id}-t1`, color: p.color, ownerId: p.id, state: "HOME", position: -1 },
            { id: `${p.id}-t2`, color: p.color, ownerId: p.id, state: "HOME", position: -1 },
            { id: `${p.id}-t3`, color: p.color, ownerId: p.id, state: "HOME", position: -1 },
            { id: `${p.id}-t4`, color: p.color, ownerId: p.id, state: "HOME", position: -1 },
          ];
        }
      });

      const spamResults: Array<{ cycle: number; spamAttemptsBlocked: number; initialTurnIndex: number; newTurnIndex: number }> = [];

      for (let cycle = 1; cycle <= 10; cycle++) {
        const initialTurnIndex = engine.currentTurnIndex;
        const activePlayer = engine.players[initialTurnIndex];

        // Simulate rolling non-pair dice when all tokens are at home (no valid moves)
        engine.diceValue = [2, 3];
        engine.availableMoves = [];
        engine.rollAttempts = 3; // exhausted roll attempts -> forces turn transition

        const expectedPlayerId = activePlayer.userId;
        engine.isTurnTransitioning = true;

        let spamAttemptsBlocked = 0;

        // Fire 50 concurrent spam rollDice calls from active and other players
        for (let spam = 0; spam < 50; spam++) {
          const spammerId = spam % 2 === 0 ? activePlayer.userId : "parchis_p2";
          
          // Capture current state before spam
          const diceBefore = [...engine.diceValue];
          const movesBefore = [...engine.availableMoves];
          const turnBefore = engine.currentTurnIndex;

          ParchisTurnLogic.rollDice(engine, spammerId);

          // If isTurnTransitioning is true, rollDice must abort immediately without touching state
          if (
            engine.isTurnTransitioning &&
            engine.currentTurnIndex === turnBefore &&
            engine.availableMoves.length === movesBefore.length
          ) {
            spamAttemptsBlocked++;
          }
        }

        expect(spamAttemptsBlocked).toBe(50);
        expect(engine.isTurnTransitioning).toBe(true);

        // Manually complete the transition as setTimeout would do
        ParchisTurnLogic.nextTurn(engine);

        // Lock must be released
        expect(engine.isTurnTransitioning).toBe(false);

        const newTurnIndex = engine.currentTurnIndex;
        const expectedNextTurnIndex = (initialTurnIndex + 1) % engine.players.length;
        expect(newTurnIndex).toBe(expectedNextTurnIndex);

        spamResults.push({
          cycle,
          spamAttemptsBlocked,
          initialTurnIndex,
          newTurnIndex,
        });
      }

      expect(spamResults.length).toBe(10);
      expect(spamResults.every((r) => r.spamAttemptsBlocked === 50)).toBe(true);

      engine.destroy();
    });
  });
});
