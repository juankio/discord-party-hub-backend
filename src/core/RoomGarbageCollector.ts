import { logger } from './Logger.js';
import type { RoomManager } from './RoomManager.js';

export class RoomGarbageCollector {
  private manager: RoomManager;
  private intervalId?: NodeJS.Timeout;

  constructor(manager: RoomManager) {
    this.manager = manager;
  }

  public collect(): void {
    const now = Date.now();
    const rooms = this.manager.getRoomsMap();
    for (const [roomId, room] of rooms.entries()) {
      const isStale = (now - room.lastActive) > 1000 * 60 * 60; // 1 hour completely stale
      const isEmpty = room.users.length === 0;

      if (isEmpty || isStale) {
        this.manager.deleteRoom(roomId);
        logger.info(`🧹 Garbage Collector removed room ${roomId}`);
      }
    }
  }

  public start() {
    this.intervalId = setInterval(() => {
      this.collect();
    }, 1000 * 60 * 5); // Run every 5 minutes
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}
