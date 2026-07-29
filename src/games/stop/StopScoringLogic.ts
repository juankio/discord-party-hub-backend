import { StopEngine } from './StopEngine.js';
import type { AnswerToVerify } from './StopTypes.js';

export class StopScoringLogic {
  static finishVerifyingAndScore(engine: StopEngine) {
    if (engine.state !== 'VERIFYING') return;
    
    if (engine.verifyingTimeout) {
      clearTimeout(engine.verifyingTimeout);
      engine.verifyingTimeout = null;
    }
    engine.verifyingDeadline = null;

    const activePlayers = engine.players.filter(p => !p.isOffline && !p.userId.startsWith('bot_')).length;
    // To veto, we need more than half of the OTHER players to vote.
    const threshold = Math.max(0, Math.floor((activePlayers - 1) / 2));

    for (const catVerif of engine.verifyingData) {
      const answersMap = new Map<string, AnswerToVerify[]>();

      for (const ans of catVerif.answers) {
        if (ans.answer === '') {
          ans.finalPoints = 0;
          continue;
        }

        const isVetoed = ans.vetos.length > threshold || 
          !ans.answer.toLowerCase().startsWith(engine.currentLetter!.toLowerCase()) || 
          ans.answer.length < 2;
        
        if (isVetoed) {
          ans.finalPoints = 0;
          const player = engine.players.find(p => p.userId === ans.userId);
          if (player) player.invalidatedCount++;
        } else {
          const lowerAns = ans.answer;
          if (!answersMap.has(lowerAns)) answersMap.set(lowerAns, []);
          answersMap.get(lowerAns)!.push(ans);
        }
      }

      for (const [_, ansGroup] of answersMap.entries()) {
        const pts = ansGroup.length === 1 ? 100 : 50;
        for (const ans of ansGroup) {
          ans.finalPoints = pts;
        }
      }
    }

    engine.roundScores = {};
    for (const p of engine.players) {
      if (p.isOffline) continue;
      let roundTotal = 0;
      for (const catVerif of engine.verifyingData) {
        const targetAns = catVerif.answers.find(a => a.userId === p.userId);
        if (targetAns) roundTotal += targetAns.finalPoints;
      }
      engine.roundScores[p.userId] = roundTotal;
      p.score += roundTotal;
    }

    engine.state = 'SCORING';
    engine.broadcastState();
  }
}
