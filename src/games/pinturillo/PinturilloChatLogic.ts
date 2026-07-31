import { PinturilloState, PinturilloPlayer } from './PinturilloTypes.js';

export function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[a.length][b.length];
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function checkGuess(guess: string, secretWord: string): { isExact: boolean; isClose: boolean } {
  if (!secretWord || !guess) return { isExact: false, isClose: false };
  const cleanGuess = normalizeText(guess);
  const cleanSecret = normalizeText(secretWord);
  if (cleanGuess === cleanSecret) return { isExact: true, isClose: false };
  const distance = levenshtein(cleanGuess, cleanSecret);
  if (distance <= 2 && cleanSecret.length > 3) return { isExact: false, isClose: true };
  return { isExact: false, isClose: false };
}

export function calculateGuessPoints(timeRemainingMs: number, totalTimeMs: number): number {
  const percentage = Math.max(0, Math.min(1, timeRemainingMs / totalTimeMs));
  return Math.floor(100 + (percentage * 400));
}

export function calculateDrawerPoints(players: PinturilloPlayer[], currentDrawerId: string): number {
  let guessers = 0;
  for (const p of players) {
    if (p.userId !== currentDrawerId && p.hasGuessed) guessers++;
  }
  return guessers * 50;
}

export function getPublicState(
  playerId: string,
  state: PinturilloState,
  players: PinturilloPlayer[],
  currentDrawerId: string | null,
  secretWord: string | null,
  wordChoices: string[],
  round: number,
  maxRounds: number,
  timeRemaining: number
) {
  let safeSecretWord = null;
  const player = players.find(p => p.userId === playerId);
  
  if (
    state === PinturilloState.ROUND_RESULTS ||
    state === PinturilloState.FINISHED ||
    currentDrawerId === playerId ||
    player?.hasGuessed
  ) {
    safeSecretWord = secretWord;
  } else if (secretWord) {
    safeSecretWord = secretWord.replace(/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '_');
  }
  
  let safeWordChoices: string[] = [];
  if (state === PinturilloState.CHOOSING_WORD && currentDrawerId === playerId) {
    safeWordChoices = wordChoices;
  }

  return {
    state,
    players: players.map(p => ({
      ...p,
      id: p.userId,
      userId: p.userId,
      name: p.nickname || p.name,
      nickname: p.nickname || p.name
    })),
    currentDrawerId,
    wordToDraw: safeSecretWord,           // Antes secretWord
    wordOptions: safeWordChoices,         // Antes wordChoices
    currentWordLength: secretWord ? secretWord.length : 0,  // Nuevo
    scores: Object.fromEntries(players.map(p => [p.userId, p.score || 0])), // Nuevo
    guessedPlayers: players.filter(p => p.hasGuessed).map(p => p.userId),   // Nuevo
    round,
    maxRounds,
    timeRemaining
  };
}

export interface ChatAction {
  type: 'broadcast_chat' | 'ghost_chat' | 'private_warning' | 'correct_guess' | 'drawer_warning' | 'ignore';
  points?: number;
  message?: string;
  isExact?: boolean;
}

export function processChatAttempt(
  player: PinturilloPlayer,
  text: string,
  state: PinturilloState,
  currentDrawerId: string | null,
  secretWord: string | null,
  timeRemainingMs: number,
  roundTimeMs: number
): ChatAction {
  if (!player.isConnected) return { type: 'ignore' };
  
  if (state !== PinturilloState.DRAWING) {
    return { type: 'broadcast_chat' };
  }
  
  if (currentDrawerId === player.userId) {
    if (secretWord && checkGuess(text, secretWord).isExact) {
      return { type: 'drawer_warning', message: "No puedes decir la palabra en el chat." };
    }
    return { type: 'broadcast_chat' };
  }
  
  if (player.hasGuessed) {
    return { type: 'ghost_chat' };
  }
  
  if (!secretWord) return { type: 'ignore' };
  
  const { isExact, isClose } = checkGuess(text, secretWord);
  
  if (isExact) {
    const points = calculateGuessPoints(timeRemainingMs, roundTimeMs);
    return { type: 'correct_guess', points, isExact: true };
  } else if (isClose) {
    return { type: 'private_warning', message: "¡Estás muy cerca!" };
  } else {
    return { type: 'broadcast_chat' };
  }
}
