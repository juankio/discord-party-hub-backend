import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models/User.js';

const UpdateProfileSchema = z.object({
  username: z.string().max(30).optional(),
  avatarId: z.number().int().min(1).max(24).optional(),
  color: z.string().max(10).optional(),
  useGooglePicture: z.boolean().optional(),
});

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

// Determinar el BACKEND_URL dinámicamente según los headers de Azure (x-forwarded-host)
// o usar la variable de entorno, fallando a localhost de forma segura.
const getBackendUrl = (req: Request) => {
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL.replace(/\/$/, '');
  
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  
  if (host) {
    return `${protocol}://${host}`;
  }
  return 'http://localhost:3001';
};

const getClient = (backendUrl: string) => new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${backendUrl}/api/auth/google/callback`
);

export const googleLogin = (req: Request, res: Response) => {
  const backendUrl = getBackendUrl(req);
  const client = getClient(backendUrl);
  
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
    const backendUrl = getBackendUrl(req);
    const client = getClient(backendUrl);
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

  const validationResult = UpdateProfileSchema.safeParse(updates);
  if (!validationResult.success) {
    return res.status(400).json({ success: false, data: null, message: 'Datos inválidos', error: validationResult.error.issues });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { id: string };
    const updateData: any = {};
    const validUpdates = validationResult.data;

    if (validUpdates.username) updateData.username = validUpdates.username;
    if (validUpdates.avatarId) updateData.avatarId = validUpdates.avatarId;
    if (validUpdates.color) updateData.color = validUpdates.color;
    if (validUpdates.useGooglePicture === false) updateData.picture = '';

    const user = await User.findByIdAndUpdate(decoded.id, updateData, { new: true } as any);
    if (!user) {
      return res.status(404).json({ success: false, data: null, message: 'Usuario no encontrado', error: 'USER_NOT_FOUND' });
    }

    res.json({ success: true, data: { user }, message: 'Perfil actualizado', error: null });
  } catch (error: any) {
    res.status(401).json({ success: false, data: null, message: 'Token inválido o expirado', error: error.message });
  }
};
