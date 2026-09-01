import { StopEngine } from './StopEngine.js';
import type { CategoryVerification } from './StopTypes.js';
import { StopScoringLogic } from './StopScoringLogic.js';

export class StopValidationLogic {
  static startVerifying(engine: StopEngine) {
    if (engine.state === 'VERIFYING') return;
    engine.state = 'VERIFYING';
    engine.verifyingData = [];

    if (engine.verifyingTimeout) {
      clearTimeout(engine.verifyingTimeout);
      engine.verifyingTimeout = null;
    }

    const timeInSeconds = engine.rules.verificationTime || 30;
    engine.verifyingDeadline = Date.now() + (timeInSeconds * 1000);
    engine.verifyingTimeout = setTimeout(() => {
      engine.verifyingTimeout = null;
      StopScoringLogic.finishVerifyingAndScore(engine);
    }, timeInSeconds * 1000);

    for (const cat of engine.rules.categories) {
      const catVerif: CategoryVerification = { category: cat, answers: [] };
      for (const p of engine.players) {
        if (p.isOffline) continue;
        const ans = p.currentAnswers[cat] || '';
        catVerif.answers.push({
          userId: p.userId,
          answer: ans,
          vetos: [],
          finalPoints: 0
        });
      }
      engine.verifyingData.push(catVerif);
    }

    engine.broadcastState();
  }

  static voteVeto(engine: StopEngine, userId: string, category: string, targetUserId: string) {
    if (engine.state !== 'VERIFYING') return;
    if (userId === targetUserId) return; // Cant veto yourself
    
    const catVerif = engine.verifyingData.find(c => c.category === category);
    if (!catVerif) return;

    const targetAns = catVerif.answers.find(a => a.userId === targetUserId);
    if (!targetAns) return;
    if (targetAns.answer === '') return; // Empty answers already 0

    const vetoIndex = targetAns.vetos.indexOf(userId);
    if (vetoIndex === -1) {
      targetAns.vetos.push(userId);
    } else {
      targetAns.vetos.splice(vetoIndex, 1);
    }

    engine.broadcastState();
  }
}
