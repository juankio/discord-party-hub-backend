export interface WordEntry {
  palabra: string;
  categoría: string;
  pista: string;
}

export type ImpostorGameState =
  | 'WAITING'
  | 'WORDS_REVEALED'
  | 'DISCUSSION'
  | 'VOTING'
  | 'RESULTS'
  | 'FINISHED';

export interface ImpostorPlayer {
  userId: string;
  socketId: string;
  nickname: string;
  avatarId: number;
  color: string;
  assignedWord?: string;       // La palabra real (o la pista si es impostor)
  isImpostor?: boolean;
  hasVoted?: boolean;
  votedFor?: string;           // userId del jugador votado
  isAlive?: boolean;           // Sigue en el juego (no eliminado)
}

export interface ImpostorRoundResult {
  round: number;
  votes: Record<string, number>;  // userId → votos recibidos
  eliminatedUserId?: string;
  wasImpostor?: boolean;
  word: string;                   // Palabra revelada de esta ronda
}

export interface ImpostorPublicState {
  state: ImpostorGameState;
  currentRound: number;
  maxRounds: number;
  timeRemaining: number;
  players: Array<{
    id: string;
    userId: string;
    name: string;
    nickname: string;
    avatarId: number;
    color: string;
    hasVoted: boolean;
    isAlive: boolean;
  }>;
  roundResults: ImpostorRoundResult[];
  winner?: 'innocents' | 'impostor' | null;
  impostorUserId?: string;  // Solo se revela al final del juego
}

export interface ImpostorPrivateState extends ImpostorPublicState {
  myWord: string;        // La palabra o la pista que recibí
  amImpostor: boolean;
}

export const generateImpostorId = () => Math.random().toString(36).substring(2, 15);