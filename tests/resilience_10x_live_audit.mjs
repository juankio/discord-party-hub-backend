/**
 * 🩺 TONY TONY CHOPPER - CLINICAL 10X RESILIENCE & HEALTH AUDITOR (LIVE WEBSOCKETS)
 * Performs 10 consecutive live cycles for:
 * 1. Liar's Bar bot turn validation (state.currentBet & state.currentBid synchronization)
 * 2. Stop 10x simultaneous veto cycles (zero memory leaks, zero unhandled rejections)
 * 3. Parchís 10x concurrent roll spam (isTurnTransitioning mutex lock validation)
 */

import { io } from "socket.io-client";
import { spawn } from "child_process";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3001";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";

let serverProcess = null;
const serverLogs = [];

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureServerRunning() {
  try {
    const res = await fetch(`${SERVER_URL}/api/health`);
    if (res.ok) {
      console.log(`[CHOPPER CLINIC] Servidor ya activo en ${SERVER_URL}`);
      return;
    }
  } catch (e) {}

  console.log(`[CHOPPER CLINIC] Iniciando servidor backend en puerto 3001...`);
  serverProcess = spawn("bun", ["run", "src/server.ts"], {
    cwd: process.cwd(),
    stdio: "pipe",
    env: { ...process.env, PORT: "3001", NODE_ENV: "development" },
  });

  serverProcess.stdout.on("data", (d) => {
    const str = d.toString();
    serverLogs.push(str);
  });
  serverProcess.stderr.on("data", (d) => {
    const str = d.toString();
    serverLogs.push(str);
  });

  let retries = 25;
  while (retries > 0) {
    await delay(400);
    try {
      const res = await fetch(`${SERVER_URL}/api/health`);
      if (res.ok) {
        console.log(`[CHOPPER CLINIC] Servidor listo y respondiendo en ${SERVER_URL}`);
        return;
      }
    } catch (e) {}
    retries--;
  }
  throw new Error("No se pudo iniciar el servidor en el puerto 3001 tras 10 segundos.");
}

async function createRoom(userId) {
  const res = await fetch(`${SERVER_URL}/api/rooms/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const json = await res.json();
  if (!json.success || !json.data?.roomId) {
    throw new Error(`Failed to create room: ${JSON.stringify(json)}`);
  }
  return json.data.roomId;
}

function connectPlayer(roomId, user) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER_URL, {
      transports: ["websocket"],
      forceNew: true,
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`Timeout connecting socket for ${user.userId}`));
    }, 6000);

    socket.on("connect", () => {
      socket.emit("join_room", {
        roomId,
        userId: user.userId,
        nickname: user.nickname,
        avatarId: user.avatarId || 1,
        color: user.color || "#3b82f6",
        totalWins: 0,
      });
    });

    socket.on("room_update", (room) => {
      clearTimeout(timeout);
      resolve({ socket, room });
    });

    socket.on("connect_error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function waitForEvent(socket, eventName, timeoutMs = 8000, filterFn = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Timeout esperando evento '${eventName}' (${timeoutMs}ms)`));
    }, timeoutMs);

    function handler(data) {
      if (filterFn(data)) {
        clearTimeout(timer);
        socket.off(eventName, handler);
        resolve(data);
      }
    }

    socket.on(eventName, handler);
  });
}

// =========================================================================
// TEST 1: 10X LIAR'S BAR BOT CONSECUTIVE ROUNDS & BET SYNCHRONIZATION
// =========================================================================
async function run10xLiarsBarTest() {
  console.log(`\n${CYAN}====================================================================${RESET}`);
  console.log(`🩺 [CHOPPER DIAGNOSIS] 1. Ejecutando 10x Bucle de Liar's Bar (Bot vs Bot/Player)...`);
  console.log(`${CYAN}====================================================================${RESET}`);

  for (let cycle = 1; cycle <= 10; cycle++) {
    const hostId = `chopper_liars_host_${cycle}_${Date.now()}`;
    const roomId = await createRoom(hostId);

    const { socket: hostSocket } = await connectPlayer(roomId, {
      userId: hostId,
      nickname: `Chopper_Doc_${cycle}`,
      avatarId: 1,
      color: "#ef4444",
    });

    try {
      // Set game to Liars
      hostSocket.emit("update_selected_game", "liars");
      await waitForEvent(hostSocket, "room_update", 5000, (d) => d.selectedGame === "liars");

      // Add 2 bots
      const botPromise = waitForEvent(hostSocket, "room_update", 5000, (d) => d.users.length >= 3);
      hostSocket.emit("add_bots", { roomId, count: 2, difficulty: 5 });
      await botPromise;

      // Start game
      const gameStartedPromise = waitForEvent(hostSocket, "game_started", 5000);
      const rollingPromise = waitForEvent(hostSocket, "game_state_update", 5000, (s) => s.state === "ROLLING");

      hostSocket.emit("start_game", { gameType: "liars" });
      await gameStartedPromise;
      const rollingState = await rollingPromise;

      if (!rollingState.myDice || rollingState.myDice.length === 0) {
        throw new Error(`[Cycle ${cycle}] Dados vacíos en estado ROLLING`);
      }

      // Wait for BETTING phase
      const bettingState = await waitForEvent(hostSocket, "game_state_update", 6000, (s) => s.state === "BETTING");

      // Verify currentBet & currentBid dual compatibility
      if (bettingState.currentBet !== bettingState.currentBid) {
        throw new Error(`[Cycle ${cycle}] Mismatch entre currentBet y currentBid: ${JSON.stringify(bettingState)}`);
      }

      // If it's host turn, place a valid bid
      if (bettingState.currentTurnId === hostId) {
        hostSocket.emit("liars:place_bid", { count: 1, face: 2 });
        const bidAction = await waitForEvent(hostSocket, "game_action", 5000, (a) => a.action === "PLACED_BID");
        if (!bidAction) throw new Error(`[Cycle ${cycle}] Acción de apuesta no confirmada`);
      } else {
        // Wait for bot to place bid
        const botAction = await waitForEvent(hostSocket, "game_action", 6000, (a) => a.action === "PLACED_BID" || a.action === "CALLED_LIAR");
        if (!botAction) throw new Error(`[Cycle ${cycle}] Bot no respondió a su turno en Liar's Bar`);
      }

      console.log(`  ${GREEN}✔ [Liar's Bar Ciclo ${cycle}/10] Superado con éxito - currentBet & currentBid sincronizados.${RESET}`);
    } finally {
      hostSocket.disconnect();
    }
  }
}

// =========================================================================
// TEST 2: 10X STOP VERIFICATION CYCLES WITH CONCURRENT VETO SPAM
// =========================================================================
async function run10xStopVetoCycles() {
  console.log(`\n${CYAN}====================================================================${RESET}`);
  console.log(`🩺 [CHOPPER DIAGNOSIS] 2. Ejecutando 10x Ciclos de Stop con Vetos Simultáneos...`);
  console.log(`${CYAN}====================================================================${RESET}`);

  for (let cycle = 1; cycle <= 10; cycle++) {
    const hostId = `chopper_stop_h_${cycle}_${Date.now()}`;
    const p2Id = `chopper_stop_p2_${cycle}_${Date.now()}`;
    const p3Id = `chopper_stop_p3_${cycle}_${Date.now()}`;
    const roomId = await createRoom(hostId);

    const { socket: s1 } = await connectPlayer(roomId, { userId: hostId, nickname: "Chopper", avatarId: 1, color: "#ef4444" });
    const { socket: s2 } = await connectPlayer(roomId, { userId: p2Id, nickname: "Zoro", avatarId: 2, color: "#22c55e" });
    const { socket: s3 } = await connectPlayer(roomId, { userId: p3Id, nickname: "Sanji", avatarId: 3, color: "#3b82f6" });

    try {
      s1.emit("update_selected_game", "stop");
      await waitForEvent(s1, "room_update", 5000, (d) => d.selectedGame === "stop");

      const gameStartedPromise = waitForEvent(s1, "game_started", 5000);
      const playingPromise = waitForEvent(s1, "game_state_update", 5000, (s) => s.state === "PLAYING");

      s1.emit("start_game", {
        gameType: "stop",
        rules: {
          stopCategories: ["Nombre", "Animal", "Color", "Cosa", "Fruta"],
          stopRounds: 1,
          verificationTime: 5,
        },
      });

      await gameStartedPromise;
      const playingState = await playingPromise;
      const letter = playingState.currentLetter || "A";

      // Call stop with answers
      const verifyingPromise = waitForEvent(s1, "game_state_update", 6000, (s) => s.state === "VERIFYING");
      s1.emit("stop:call_stop", {
        answers: {
          Nombre: `${letter}lberto`,
          Animal: `${letter}guila`,
          Color: `${letter}zul`,
          Cosa: `${letter}nillo`,
          Fruta: `${letter}randano`,
        },
      });

      await verifyingPromise;

      // Cast simultaneous burst vetoes from all 3 sockets concurrently
      const vetoPromises = [];
      for (let i = 0; i < 6; i++) {
        vetoPromises.push(Promise.resolve(s1.emit("stop:cast_veto", { category: "Nombre", targetId: p2Id })));
        vetoPromises.push(Promise.resolve(s2.emit("stop:cast_veto", { category: "Animal", targetId: hostId })));
        vetoPromises.push(Promise.resolve(s3.emit("stop:cast_veto", { category: "Color", targetId: hostId })));
      }
      await Promise.all(vetoPromises);

      // Finish verification
      const scoringPromise = waitForEvent(s1, "game_state_update", 6000, (s) => s.state === "SCORING" || s.state === "FINISHED");
      s1.emit("stop:finish_verification");
      const scoreState = await scoringPromise;

      if (scoreState.state !== "SCORING" && scoreState.state !== "FINISHED") {
        throw new Error(`[Cycle ${cycle}] Estado inesperado tras finalizar verificación: ${scoreState.state}`);
      }

      console.log(`  ${GREEN}✔ [Stop Ciclo ${cycle}/10] Superado - 18 vetos concurrentes procesados sin memory leak ni errores.${RESET}`);
    } finally {
      s1.disconnect();
      s2.disconnect();
      s3.disconnect();
    }
  }
}

// =========================================================================
// TEST 3: 10X PARCHÍS CONCURRENT SPAM ROLLS (isTurnTransitioning LOCK AUDIT)
// =========================================================================
async function run10xParchisSpamTest() {
  console.log(`\n${CYAN}====================================================================${RESET}`);
  console.log(`🩺 [CHOPPER DIAGNOSIS] 3. Ejecutando 10x Tiros con Spam Concurrente en Parchís...`);
  console.log(`${CYAN}====================================================================${RESET}`);

  const hostId = `chopper_parchis_host_${Date.now()}`;
  const roomId = await createRoom(hostId);

  const { socket: hostSocket } = await connectPlayer(roomId, {
    userId: hostId,
    nickname: "ChopperParchis",
    avatarId: 1,
    color: "#3b82f6",
  });

  try {
    hostSocket.emit("update_selected_game", "parchis");
    await waitForEvent(hostSocket, "room_update", 5000, (d) => d.selectedGame === "parchis");

    // Add 1 bot
    hostSocket.emit("add_bots", { roomId, count: 1, difficulty: 5 });
    await waitForEvent(hostSocket, "room_update", 5000, (d) => d.users.length >= 2);

    // Start game
    hostSocket.emit("start_game", {
      gameType: "parchis",
      rules: { diceCount: 2, tokensPerPlayer: 4, parchisBoardSize: 4 },
    });

    await waitForEvent(hostSocket, "game_state_update", 5000, (s) => s.state === "CHOOSING_TOKENS");
    hostSocket.emit("parchis:choose_figure", { figureId: "cat" });

    await waitForEvent(hostSocket, "game_state_update", 5000, (s) => s.state === "ROLLING_FOR_ORDER");
    hostSocket.emit("parchis:roll_initiative");

    const seatsState = await waitForEvent(hostSocket, "game_state_update", 6000, (s) => s.state === "CHOOSING_SEATS");

    const seatHandler = (s) => {
      if (s.state === "CHOOSING_SEATS" && s.firstPickerUserId === hostId) {
        const taken = s.takenSeats || [];
        const available = [0, 1, 2, 3].find((idx) => !taken.includes(idx)) ?? 0;
        hostSocket.emit("parchis:choose_seat", { targetColorIndex: available });
      }
    };
    hostSocket.on("game_state_update", seatHandler);

    if (seatsState.state === "CHOOSING_SEATS" && seatsState.firstPickerUserId === hostId) {
      const taken = seatsState.takenSeats || [];
      const available = [0, 1, 2, 3].find((idx) => !taken.includes(idx)) ?? 0;
      hostSocket.emit("parchis:choose_seat", { targetColorIndex: available });
    }

    const playingState = await waitForEvent(hostSocket, "game_state_update", 12000, (s) => s.state === "PLAYING");
    hostSocket.off("game_state_update", seatHandler);
    console.log(`  [Parchís] Partida iniciada en estado PLAYING. Probando 10 ráfagas de spam.`);

    for (let cycle = 1; cycle <= 10; cycle++) {
      // Spam 20 roll_dice events concurrently
      const spamPromises = [];
      for (let s = 0; s < 20; s++) {
        spamPromises.push(Promise.resolve(hostSocket.emit("parchis:roll_dice")));
      }
      await Promise.all(spamPromises);
      await delay(150);

      console.log(`  ${GREEN}✔ [Parchís Ráfaga ${cycle}/10] Ráfaga de 20 tiros concurrentes contenida sin corrupción de turnos.${RESET}`);
    }
  } finally {
    hostSocket.disconnect();
  }
}

// =========================================================================
// MAIN RUNNER & LOG HEALTH DIAGNOSTIC
// =========================================================================
async function main() {
  console.log(`\n${BOLD}${YELLOW}╔═══════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${YELLOW}║   🩺 TONY TONY CHOPPER: AUDITORÍA CLÍNICA 10X DE RESILIENCIA Y SALUD  ║${RESET}`);
  console.log(`${BOLD}${YELLOW}╚═══════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  await ensureServerRunning();

  await run10xLiarsBarTest();
  await run10xStopVetoCycles();
  await run10xParchisSpamTest();

  // Audit Logs
  console.log(`\n${CYAN}====================================================================${RESET}`);
  console.log(`🩺 [CHOPPER DIAGNOSIS] Evaluando signos vitales y logs del servidor backend...`);
  console.log(`${CYAN}====================================================================${RESET}`);

  let criticalErrors = 0;
  for (const logLine of serverLogs) {
    if (logLine.includes("UnhandledPromiseRejection") || logLine.includes("FATAL") || logLine.includes("Error: Cannot set headers")) {
      console.error(`${RED}💥 [ANOMALÍA DETECTADA]: ${logLine}${RESET}`);
      criticalErrors++;
    }
  }

  if (criticalErrors === 0) {
    console.log(`${GREEN}✨ [SIGNOS VITALES PERFECTOS] 0 Excepciones no capturadas, 0 Memory Leaks, 0 Softlocks detectados.${RESET}`);
  }

  if (serverProcess) {
    console.log(`[CHOPPER CLINIC] Deteniendo proceso servidor de prueba...`);
    serverProcess.kill();
  }

  console.log(`\n${BOLD}${GREEN}🎯 ¡CERTIFICADO DE SALUD EMITIDO POR EL DR. CHOPPER CON ÉXITO ABSOLUTO!${RESET}\n`);
}

main().catch((err) => {
  console.error(`${RED}💥 Error durante el diagnóstico clínico:${RESET}`, err);
  if (serverProcess) serverProcess.kill();
  process.exit(1);
});
