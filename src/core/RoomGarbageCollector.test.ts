import { describe, it, expect, mock } from 'bun:test';
import { RoomGarbageCollector } from './RoomGarbageCollector.js';
import { RoomManager } from './RoomManager.js';

describe('RoomGarbageCollector', () => {
  it('should clean up empty or stale rooms through manager.deleteRoom', () => {
    const mockIo: any = {
      to: () => ({ emit: () => {} }),
      sockets: { sockets: new Map() }
    };

    const manager = new RoomManager(mockIo);
    const originalDeleteRoom = manager.deleteRoom.bind(manager);
    const deleteRoomSpy = mock((roomId: string) => originalDeleteRoom(roomId));
    manager.deleteRoom = deleteRoomSpy;

    const roomId1 = manager.createRoom('host1'); // empty users initially
    const roomId2 = manager.createRoom('host2');

    // Add a user to roomId2 so it is not empty, but set lastActive to 2 hours ago (stale)
    const room2 = manager.getRoom(roomId2)!;
    room2.users.push({
      socketId: 'sock2',
      userId: 'u2',
      nickname: 'Bob',
      originalNickname: 'Bob',
      avatarId: 1,
      color: '#00f',
      totalWins: 0
    });
    room2.lastActive = Date.now() - (1000 * 60 * 60 * 2); // 2 hours stale

    // Add an active, non-empty room (roomId3)
    const roomId3 = manager.createRoom('host3');
    const room3 = manager.getRoom(roomId3)!;
    room3.users.push({
      socketId: 'sock3',
      userId: 'u3',
      nickname: 'Charlie',
      originalNickname: 'Charlie',
      avatarId: 2,
      color: '#0f0',
      totalWins: 0
    });
    room3.lastActive = Date.now(); // active right now

    const gc = new RoomGarbageCollector(manager);
    gc.collect();

    // roomId1 (empty) and roomId2 (stale) should be deleted via manager.deleteRoom
    expect(deleteRoomSpy).toHaveBeenCalledWith(roomId1);
    expect(deleteRoomSpy).toHaveBeenCalledWith(roomId2);
    expect(manager.getRoom(roomId1)).toBeUndefined();
    expect(manager.getRoom(roomId2)).toBeUndefined();

    // roomId3 should still exist
    expect(manager.getRoom(roomId3)).toBeDefined();
  });
});
