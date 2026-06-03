import { Request, Response } from 'express';
import { User } from '../models/User.js';
import jwt from 'jsonwebtoken';

export const registerWin = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.body.token;
  const { game } = req.body;
  
  if (!token || !game) return res.status(400).json({ success: false, data: null, message: 'Missing fields', error: 'MISSING_DATA' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { id: string };
    const userId = decoded.id;

    const updateQuery: any = { $inc: { 'stats.totalWins': 1 } };
    updateQuery.$inc[`stats.${game}`] = 1;

    const user = await User.findByIdAndUpdate(userId, updateQuery, { new: true } as any);
    if (!user) return res.status(404).json({ success: false, data: null, message: 'User not found', error: 'USER_NOT_FOUND' });

    res.json({ success: true, data: { stats: (user as any).stats }, message: 'Win registered', error: null });
  } catch (e: any) {
    res.status(401).json({ success: false, data: null, message: 'Token inválido o expirado', error: e.message });
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
