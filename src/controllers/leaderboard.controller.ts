import { Request, Response } from 'express';
import { User } from '../models/User.js';

export const getTopPlayers = async (req: Request, res: Response) => {
  try {
    const topPlayers = await User.find()
      .sort({ 'stats.totalWins': -1 })
      .limit(10)
      .select('username avatarId color stats.totalWins');

    const mapped = topPlayers.map(p => ({
      username: p.username,
      avatarId: p.avatarId,
      color: p.color,
      totalWins: (p as any).stats?.totalWins || 0
    }));

    res.json({ success: true, data: mapped, message: 'Leaderboard fetched', error: null });
  } catch (e: any) {
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', error: e.message });
  }
};
