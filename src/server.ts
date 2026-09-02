import express from 'express';
import { createServer } from 'http';
import { Server } from "socket.io";
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { logger } from "./core/Logger.js";
import { RoomManager } from "./core/RoomManager.js";
import { startGameDispatcher, handleImpostorEvents, registerAllGameRoutes } from "./core/GameDispatcher.js";
import { connectDB } from "./config/db.js";

import authRoutes from './routes/auth.routes.js';
import leaderboardRoutes from './routes/leaderboard.routes.js';

// Conectar a MongoDB
connectDB();

const app = express();
const httpServer = createServer(app);

// Middlewares HTTP
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());

// Health Check (Azure keep-alive)
app.get('/api/health', (req, res) => res.status(200).json({ success: true, data: { status: 'ok', time: Date.now() }, message: 'Server healthy', error: null }));

// Montar rutas HTTP
app.use('/api/auth', authRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

const PORT = process.env.PORT || 3001;

const io = new Server(httpServer, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  }
});

const roomManager = new RoomManager(io);

// Ruta para crear sala
app.post('/api/rooms/create', (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ success: false, data: null, message: 'userId is required', error: 'MISSING_DATA' });
  }
  try {
    const roomId = roomManager.createRoom(userId);
    res.json({ success: true, data: { roomId }, message: 'Room created successfully', error: null });
  } catch (err: any) {
    logger.error(`Error creating room: ${err.message}`);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', error: err.message });
  }
});

// Implementar Seguridad en Sockets (Zero-Trust)
io.use((socket, next) => {
  const auth = socket.handshake.auth || {};
  const token = auth.token;
  const guestId = auth.guestId;

  if (token && typeof token === 'string') {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
      const verifiedId = decoded?.id || decoded?.userId || decoded?.sub;
      if (verifiedId && typeof verifiedId === 'string') {
        socket.data.authenticatedUserId = verifiedId;
        return next();
      } else {
        logger.warn(`[AUTH] Invalid token payload for socket ${socket.id}`);
        return next(new Error('Invalid token payload'));
      }
    } catch (err: any) {
      logger.warn(`[AUTH] Socket JWT verification failed for socket ${socket.id}: ${err.message}`);
      return next(new Error('Authentication error'));
    }
  } else if (guestId && typeof guestId === 'string') {
    const GUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
    if (GUEST_ID_REGEX.test(guestId)) {
      socket.data.authenticatedUserId = guestId;
      return next();
    } else {
      logger.warn(`[AUTH] Invalid guestId format for socket ${socket.id}`);
      return next(new Error('Invalid guestId format'));
    }
  }

  next();
});

io.on("connection", (socket) => {
  logger.info(`Nuevo usuario conectado: ${socket.id}`);

  // Rate Limiting por Socket: Descartar ráfagas abusivas (>50 eventos/segundo por socket)
  let eventCount = 0;
  let windowStart = Date.now();
  const MAX_EVENTS_PER_SECOND = 50;

  socket.use(([event, ...args], next) => {
    const now = Date.now();
    if (now - windowStart > 1000) {
      windowStart = now;
      eventCount = 0;
    }
    eventCount++;
    if (eventCount > MAX_EVENTS_PER_SECOND) {
      logger.warn(`[SECURITY] Rate limit exceeded (>50 events/s) on event '${event}' for socket ${socket.id}`);
      return next(new Error('Rate limit exceeded'));
    }
    next();
  });

  socket.on("join_room", (data: any) => roomManager.handleJoin(socket, data));
  socket.on("update_profile", (data: any) => roomManager.handleUpdateProfile(socket, data));
  socket.on("add_bots", (data: any) => roomManager.handleAddBots(socket, data));
  socket.on("update_bot_config", (data: any) => roomManager.handleUpdateBotConfig(socket, data));
  socket.on("kick_bot", (data: any) => roomManager.handleKickBot(socket, data));
  socket.on("kick_player", (data: any) => roomManager.handleKickPlayer(socket, data));
  socket.on("update_room_rules", (data: any) => roomManager.handleUpdateRoomRules(socket, data));
  socket.on("disconnect", () => roomManager.handleDisconnect(socket));
  socket.on("leave_room", () => roomManager.handleExplicitLeave(socket));


  startGameDispatcher(socket, roomManager);
  registerAllGameRoutes(socket, roomManager);
  handleImpostorEvents(socket, roomManager);
});

httpServer.listen(PORT, () => {
  logger.info(`🚀 API & Socket.io Server corriendo y blindado en http://localhost:${PORT}`);
});
