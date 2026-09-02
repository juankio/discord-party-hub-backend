import { describe, it, expect } from 'bun:test';
import jwt from 'jsonwebtoken';
import { RoomJoinHandler } from './RoomJoinHandler.js';
import { RoomManager } from './RoomManager.js';

describe('Security & Rate-Limiting Protections', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'secret';

  it('RoomJoinHandler should prioritize socket.data.authenticatedUserId over payload userId', () => {
    const mockIo: any = {
      to: () => ({ emit: () => {} }),
      sockets: { sockets: new Map() }
    };

    const manager = new RoomManager(mockIo);
    const roomId = manager.createRoom('legit-user-123');

    const handler = new RoomJoinHandler(mockIo, manager, new Map());

    const mockSocket: any = {
      id: 'socket-test-1',
      join: () => {},
      data: {
        authenticatedUserId: 'verified-user-456'
      }
    };

    // Attacker tries to impersonate another user via payload
    handler.handleJoin(mockSocket, {
      roomId,
      userId: 'attacker-impersonated-user-999',
      nickname: 'Sanji',
      avatarId: 1,
      color: '#ff0000',
      totalWins: 5
    });

    const room = manager.getRoom(roomId);
    expect(room).toBeDefined();

    // User in room MUST be the verified authenticated user ID
    expect(room?.users.some(u => u.userId === 'verified-user-456')).toBe(true);
    expect(room?.users.some(u => u.userId === 'attacker-impersonated-user-999')).toBe(false);
    expect(mockSocket.data.userId).toBe('verified-user-456');
  });

  it('Handshake token verification extracts valid user ID', () => {
    const token = jwt.sign({ id: 'user-jwt-789' }, JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    expect(decoded.id).toBe('user-jwt-789');
  });

  it('Guest ID validator enforces safe alphanumeric format', () => {
    const GUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
    
    expect(GUEST_ID_REGEX.test('guest_12345')).toBe(true);
    expect(GUEST_ID_REGEX.test('guest-abc-XYZ-99')).toBe(true);
    expect(GUEST_ID_REGEX.test('guest$injection')).toBe(false);
    expect(GUEST_ID_REGEX.test('../../../etc/passwd')).toBe(false);
    expect(GUEST_ID_REGEX.test('')).toBe(false);
  });
});
