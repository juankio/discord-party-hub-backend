import { BasePlayer } from '../../shared/BaseGameEngine.js';

export enum PinturilloState {
  LOBBY = 'LOBBY',
  CHOOSING_WORD = 'CHOOSING_WORD',
  DRAWING = 'DRAWING',
  ROUND_RESULTS = 'ROUND_RESULTS',
  FINISHED = 'FINISHED'
}

export interface PinturilloPlayer extends BasePlayer {
  id: string; // Keep for backwards compatibility
  name: string; // Keep for backwards compatibility
  score: number;
  hasGuessed: boolean;
  isConnected: boolean;
}

export interface DrawEvent {
  type: 'stroke' | 'clear' | 'undo';
  data?: any; // The payload for drawing (points, color, brush size)
}

export interface ChatMessage {
  playerId?: string;
  playerName?: string;
  text: string;
  isSystem: boolean;
}
