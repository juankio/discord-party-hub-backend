export interface ParchisRules {
  diceCount: 1 | 2;
  tokensPerPlayer: 3 | 4;
  parchisBoardSize?: 4 | 6 | 8; // Added for different board sizes
  safeZones: number[];
  exactMeta: boolean;
  threePairsRule?: 'penalty' | 'reward';
  safeBlocks?: boolean;
  autoSoplar?: boolean;
  captureReward: number;
  crownReward: number;
}

export interface ParchisToken {
  id: string;
  color: string;
  ownerId: string;
  position: number;
  state: 'HOME' | 'BOARD' | 'PATH' | 'META' | 'FINISHED';
}

export interface ParchisPlayerStats {
  eaten: number;
  died: number;
  crowned: number;
}

export interface ParchisPlayer {
  userId: string;
  socketId: string;
  nickname: string;
  avatarId: number;
  color: string;
  tokens: ParchisToken[];
  isOffline: boolean;
  selectedFigure?: string;
  hasChosenFigure?: boolean;
  stats: ParchisPlayerStats;
  _seatIndex?: number;
}

export type ParchisGameState = 'LOBBY' | 'CHOOSING_TOKENS' | 'ROLLING_FOR_ORDER' | 'CHOOSING_SEATS' | 'PLAYING' | 'FINISHED';

export interface ParchisPublicState {
  state: ParchisGameState;
  players: ParchisPlayer[];
  currentTurnIndex: number;
  rules: ParchisRules;
  diceValue: number[];
  availableMoves: number[];
  consecutivePairs: number;
  winner?: string | null;
  initiativeRolls?: Record<string, number>;
  firstPickerUserId?: string | null;
  pickersOrder?: string[];
  pickersQueue?: string[];
  takenSeats?: number[];
  rollAttempts?: number;
}
