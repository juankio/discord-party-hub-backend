import { Request, Response } from 'express';
import { User } from '../models/User.js';

export const registerWin = async (req: Request, res: Response) => {
  const { userId, game } = req.body;
  if (!userId || !game) return res.status(400).json({ error: 'Missing fields' });

  try {
    const updateQuery: any = { $inc: { 'stats.totalWins': 1 } };
    updateQuery.$inc[`stats.${game}`] = 1;

    const user = await User.findByIdAndUpdate(userId, updateQuery, { new: true } as any);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ success: true, stats: (user as any).stats });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

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

    res.json(mapped);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
