import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { PinturilloEngine } from './PinturilloEngine.js';
import { PinturilloState } from './PinturilloTypes.js';
import { setupPinturilloGame } from './PinturilloSetup.js';

describe('PinturilloEngine & Setup Tests', () => {
  let engine: PinturilloEngine;

  beforeEach(() => {
    engine = new PinturilloEngine('room-pinturillo-1', {} as any);
  });

  it('should emit private_message with targetUserId when guess is close', () => {
    engine.addPlayer('drawer-1', 'sock-drawer', 'Drawer', 1, '#ff0000');
    engine.addPlayer('guesser-1', 'sock-guesser', 'Guesser', 2, '#00ff00');

    engine.state = PinturilloState.DRAWING;
    engine.currentDrawerId = 'drawer-1';
    engine.secretWord = 'Pirata';

    let privateMessagePayload: any = null;
    engine.on('private_message', (payload) => {
      privateMessagePayload = payload;
    });

    // Close guess (distance <= 2 for Pirata, e.g. "Piratas" or "Pirate")
    engine.handleChat('guesser-1', 'Pirate');

    expect(privateMessagePayload).not.toBeNull();
    expect(privateMessagePayload.targetUserId).toBe('guesser-1');
    expect(privateMessagePayload.message.text).toContain('cerca');
  });

  it('should emit ghost_chat when a player who has already guessed chats', () => {
    engine.addPlayer('drawer-1', 'sock-drawer', 'Drawer', 1, '#ff0000');
    engine.addPlayer('guesser-1', 'sock-guesser', 'Guesser1', 2, '#00ff00');
    engine.addPlayer('guesser-2', 'sock-guesser-2', 'Guesser2', 3, '#0000ff');

    engine.state = PinturilloState.DRAWING;
    engine.currentDrawerId = 'drawer-1';
    engine.secretWord = 'Pirata';

    // Mark guesser-1 as hasGuessed = true
    const player1 = engine.players.find(p => p.userId === 'guesser-1')!;
    player1.hasGuessed = true;

    let ghostChatPayload: any = null;
    let normalChatPayload: any = null;

    engine.on('ghost_chat', (payload) => {
      ghostChatPayload = payload;
    });
    engine.on('chat_message', (payload) => {
      normalChatPayload = payload;
    });

    engine.handleChat('guesser-1', 'Hola ya adiviné');

    expect(ghostChatPayload).not.toBeNull();
    expect(ghostChatPayload.playerId).toBe('guesser-1');
    expect(ghostChatPayload.text).toBe('Hola ya adiviné');
    // It should NOT broadcast to normal chat
    expect(normalChatPayload).toBeNull();
  });

  it('setupPinturilloGame should route ghost_chat only to drawer and players who guessed', () => {
    const emittedToSockets: { [socketId: string]: any[] } = {};

    const mockIo: any = {
      to: (target: string) => ({
        emit: (event: string, data: any) => {
          if (!emittedToSockets[target]) emittedToSockets[target] = [];
          emittedToSockets[target].push({ event, data });
        }
      })
    };

    const room: any = {
      users: [
        { userId: 'drawer-1', socketId: 'sock-drawer', nickname: 'Drawer', avatarId: 1, color: '#ff0000' },
        { userId: 'guesser-1', socketId: 'sock-g1', nickname: 'Guesser1', avatarId: 2, color: '#00ff00' },
        { userId: 'guesser-2', socketId: 'sock-g2', nickname: 'Guesser2', avatarId: 3, color: '#0000ff' }
      ]
    };

    setupPinturilloGame('room-setup-1', room, mockIo);
    const gameEngine = room.gameEngine as PinturilloEngine;

    // Set state to DRAWING and word
    gameEngine.state = PinturilloState.DRAWING;
    gameEngine.currentDrawerId = 'drawer-1';
    gameEngine.secretWord = 'Barco';

    // guesser-1 guessed correctly
    const g1 = gameEngine.players.find(p => p.userId === 'guesser-1')!;
    g1.hasGuessed = true;

    // Clear prior emitted events
    for (const k in emittedToSockets) delete emittedToSockets[k];

    // guesser-1 sends ghost chat
    gameEngine.handleChat('guesser-1', 'La palabra era fácil!');

    // sock-drawer and sock-g1 should receive ghost_chat
    expect(emittedToSockets['sock-drawer']).toBeDefined();
    expect(emittedToSockets['sock-drawer'].some(e => e.event === 'ghost_chat')).toBe(true);

    expect(emittedToSockets['sock-g1']).toBeDefined();
    expect(emittedToSockets['sock-g1'].some(e => e.event === 'ghost_chat')).toBe(true);

    // sock-g2 (who hasn't guessed) should NOT receive ghost_chat
    expect(emittedToSockets['sock-g2']).toBeUndefined();
  });
});
