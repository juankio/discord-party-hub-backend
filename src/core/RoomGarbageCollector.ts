import { Server } from 'socket.io';
import { logger } from './Logger.js';
import type { RoomData } from './RoomManager.js';

export class RoomGarbageCollector {
  private rooms: Map<string, RoomData>;
  private io: Server;
  private intervalId?: NodeJS.Timeout;

  constructor(rooms: Map<string, RoomData>, io: Server) {
    this.rooms = rooms;
    this.io = io;
  }

  public start() {
    this.intervalId = setInterval(() => {
      const now = Date.now();
      for (const [roomId, room] of this.rooms.entries()) {
        const isStale = (now - room.lastActive) > 1000 * 60 * 60; // 1 hour completely stale
        const isEmpty = room.users.length === 0;

        if (isEmpty || isStale) {
          this.rooms.delete(roomId);
          logger.info(`🧹 Garbage Collector removed room ${roomId}`);
        }
      }
    }, 1000 * 60 * 5); // Run every 5 minutes
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}
