export type StopGameState = 'LOBBY' | 'PLAYING' | 'VERIFYING' | 'SCORING' | 'FINISHED';

export interface StopRules {
  categories: string[]; // max 12
  rounds: number; // e.g. 3, 5, 10
  timeLimit?: number; // optional time limit in seconds
  verificationTime?: number; // time to verify answers in seconds
  bannedLetters?: string[]; // letters to exclude from the roulette
}

export interface PlayerAnswers {
  [category: string]: string; // lowercase, trimmed
}

export interface PlayerVetoState {
  [category: string]: {
    [targetUserId: string]: boolean; // true if this player vetoed the target's answer
  };
}

export interface StopPlayerState {
  userId: string;
  socketId: string;
  nickname: string;
  avatarId: number;
  color: string;
  isOffline: boolean;
  score: number;
  invalidatedCount: number; // tracks how many words got invalidated across all rounds
  currentAnswers: PlayerAnswers;
  submitted: boolean; // Did they submit their answers?
}

// In Verifying phase, we need to know who wrote what for each category
export interface AnswerToVerify {
  userId: string;
  answer: string;
  vetos: string[]; // userIds of players who vetoed this answer
  finalPoints: number;
}

export interface CategoryVerification {
  category: string;
  answers: AnswerToVerify[];
}

export interface StopPublicState {
  state: StopGameState;
  players: Omit<StopPlayerState, 'socketId' | 'currentAnswers'>[];
  currentRound: number;
  totalRounds: number;
  currentLetter: string | null;
  categories: string[];
  verifyingCategoryIndex: number; // Which category are we currently voting on?
  verifyingData: CategoryVerification[] | null;
  roundScores: Record<string, number> | null; // userId -> points earned in this round
  winnerId: string | null;
  timeRemaining?: number; // in milliseconds if applicable
}
