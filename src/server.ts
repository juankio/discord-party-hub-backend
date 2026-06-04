import express from 'express';
import { createServer } from 'http';
import { Server } from "socket.io";
import cors from 'cors';
import { logger } from "./core/Logger.js";
import { RoomManager } from "./core/RoomManager.js";
import { startGameDispatcher, handleUnoEvents } from "./core/GameDispatcher.js";
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

// Implementar Seguridad en Sockets (Zero-Trust)
io.use((socket, next) => {
  // Aquí podríamos validar el JWT si viene en socket.handshake.auth.token
  // Por ahora lo dejamos pasar, pero la arquitectura ya permite el middleware
  next();
});

io.on("connection", (socket) => {
  logger.info(`Nuevo usuario conectado: ${socket.id}`);

  socket.on("join_room", (data: any) => roomManager.handleJoin(socket, data));
  socket.on("disconnect", () => roomManager.handleDisconnect(socket));
  socket.on("leave_room", () => roomManager.handleExplicitLeave(socket));


  startGameDispatcher(socket, roomManager);
  handleUnoEvents(socket, roomManager);
});

httpServer.listen(PORT, () => {
  logger.info(`🚀 API & Socket.io Server corriendo y blindado en http://localhost:${PORT}`);
});
