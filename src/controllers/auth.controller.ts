import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

const getClient = () => new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3001/api/auth/google/callback'
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
  if (!code) return res.redirect('http://localhost:3000/?error=missing_code');

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
      picture: (user as any).picture
    };

    const htmlResponse = `
      <html>
        <head><title>Autenticando...</title></head>
        <body style="background-color: #0A0A0A; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif;">
          <h2>Iniciando sesión...</h2>
          <script>
            try {
              const oldDataRaw = window.localStorage.getItem('party-hub-user');
              let roomId = '';
              if (oldDataRaw) {
                const oldData = JSON.parse(oldDataRaw);
                roomId = oldData.roomId || '';
              }
              const newData = ${JSON.stringify(userData)};
              if (roomId) newData.roomId = roomId;
              window.localStorage.setItem('party-hub-user', JSON.stringify(newData));
              window.location.href = 'http://localhost:3000/';
            } catch(e) {
              console.error(e);
              window.location.href = 'http://localhost:3000/?error=storage';
            }
          </script>
        </body>
      </html>
    `;
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlResponse);
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    res.redirect('http://localhost:3000/?error=oauth_failed');
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  const { token, updates } = req.body;
  if (!token || !updates) return res.status(400).json({ success: false, message: 'Faltan datos' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { id: string };
    const updateData: any = {};
    if (updates.username) updateData.username = updates.username;
    if (updates.avatarId) updateData.avatarId = updates.avatarId;
    if (updates.color) updateData.color = updates.color;
    if (updates.useGooglePicture === false) updateData.picture = '';

    const user = await User.findByIdAndUpdate(decoded.id, updateData, { new: true } as any);
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

    res.json({ success: true, user });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token inválido o expirado' });
  }
};
