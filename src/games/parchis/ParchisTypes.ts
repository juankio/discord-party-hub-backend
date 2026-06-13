export interface ParchisRules {
  diceCount: 1 | 2;
  tokensPerPlayer: 3 | 4;
  safeZones: number[];
}

export interface ParchisToken {
  id: string;
  color: string;
  ownerId: string;
  position: number;
  state: 'HOME' | 'BOARD' | 'PATH' | 'META';
}

export interface ParchisPlayer {
  userId: string;
  socketId: string;
  nickname: string;
  avatarId: number;
  color: string;
  tokens: ParchisToken[];
  isOffline: boolean;
}

export type ParchisGameState = 'LOBBY' | 'PLAYING' | 'FINISHED';

export interface ParchisPublicState {
  state: ParchisGameState;
  players: ParchisPlayer[];
  currentTurnIndex: number;
  rules: ParchisRules;
  diceValue: number[];
}
