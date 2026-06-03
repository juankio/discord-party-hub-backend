import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

const getClient = () => new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${BACKEND_URL}/api/auth/google/callback`
);

export const googleLogin = (req: Request, res: Response) => {
  const client = getClient();
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['email', 'profile'],
    prompt: 'consent'
  });
  res.redirect(authUrl);
};

export const googleCallback = async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) return res.redirect(`${FRONTEND_URL}/?error=missing_code`);

  try {
    const client = getClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) throw new Error('No id_token received');
    
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub) throw new Error('Invalid Google Token payload');

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || payload.given_name || 'Gamer';
    const picture = payload.picture;

    let user = await User.findOne({ googleId: googleId } as any);
    if (!user) {
      user = await User.create({
        googleId, email, username: name, picture,
        avatarId: Math.floor(Math.random() * 24) + 1, color: '#f97316'
      } as any);
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });

    const userData = {
      userId: user._id.toString(),
      nickname: user.username,
      avatarId: user.avatarId,
      color: user.color,
      isLoggedIn: true,
      token: token,
      totalWins: (user as any).stats?.totalWins || 0,
      gamesPlayed: (user as any).gamesPlayed || 0,
      lastPlayed: (user as any).lastPlayed || null,
      picture: (user as any).picture
    };

    
    const base64Data = Buffer.from(JSON.stringify(userData)).toString('base64');
    res.redirect(`${FRONTEND_URL}/?auth_data=${base64Data}`);

  } catch (error) {
    console.error('OAuth Callback Error:', error);
    res.redirect(`${FRONTEND_URL}/?error=oauth_failed`);
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.body.token;
  const { updates } = req.body;
  
  if (!token || !updates) {
    return res.status(400).json({ success: false, data: null, message: 'Faltan datos', error: 'MISSING_DATA' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { id: string };
    const updateData: any = {};
    if (updates.username && typeof updates.username === 'string') updateData.username = updates.username.substring(0, 30);
    if (updates.avatarId && typeof updates.avatarId === 'number' && updates.avatarId >= 1 && updates.avatarId <= 24) updateData.avatarId = updates.avatarId;
    if (updates.color && typeof updates.color === 'string') updateData.color = updates.color.substring(0, 10);
    if (updates.useGooglePicture === false) updateData.picture = '';

    const user = await User.findByIdAndUpdate(decoded.id, updateData, { new: true } as any);
    if (!user) {
      return res.status(404).json({ success: false, data: null, message: 'Usuario no encontrado', error: 'USER_NOT_FOUND' });
    }

    res.json({ success: true, data: { user }, message: 'Perfil actualizado', error: null });
  } catch (error: any) {
    res.status(401).json({ success: false, data: null, message: 'Token inválido o expirado', error: error.message });
  }
};
