export type LiarsGameState = 'WAITING' | 'ROLLING' | 'BETTING' | 'RESOLUTION' | 'FINISHED';

export interface LiarsPlayer {
    userId: string;
    socketId: string;
    nickname: string;
    avatarId: number;
    color: string;
    
    diceCount: number;
    dice: number[]; // e.g. [1, 4, 4, 6]
    isEliminated: boolean;
    isOffline?: boolean;
}

export interface Bid {
    userId: string;
    count: number;
    face: number; // 1 to 6
}

export interface LiarsRules {
    initialDice: number;
    onesAreWild: boolean; 
}
