import express from 'express';
import { createServer } from 'http';
import { Server } from "socket.io";
import cors from 'cors';
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
  // Aquí podríamos validar el JWT si viene en socket.handshake.auth.token
  // Por ahora lo dejamos pasar, pero la arquitectura ya permite el middleware
  next();
});

io.on("connection", (socket) => {
  logger.info(`Nuevo usuario conectado: ${socket.id}`);

  socket.on("join_room", (data: any) => roomManager.handleJoin(socket, data));
  socket.on("update_profile", (data: any) => roomManager.handleUpdateProfile(socket, data));
  socket.on("add_bots", (data: any) => roomManager.handleAddBots(socket, data));
  socket.on("update_bot_config", (data: any) => roomManager.handleUpdateBotConfig(socket, data));
  socket.on("kick_bot", (data: any) => roomManager.handleKickBot(socket, data));
  socket.on("disconnect", () => roomManager.handleDisconnect(socket));
  socket.on("leave_room", () => roomManager.handleExplicitLeave(socket));


  startGameDispatcher(socket, roomManager);
  registerAllGameRoutes(socket, roomManager);
  handleImpostorEvents(socket, roomManager);
});

httpServer.listen(PORT, () => {
  logger.info(`🚀 API & Socket.io Server corriendo y blindado en http://localhost:${PORT}`);
});
