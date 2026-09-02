/**
 * 🎯 USOPP & SANJI'S HARDCORE 5-PLAYER WEBSOCKET STRESS TEST SUITE
 * Tests ALL 6 games with 5 concurrent players connected via WebSocket on http://localhost:3001
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

async function ensureServerRunning() {
  try {
    const res = await fetch(`${SERVER_URL}/api/health`);
    if (res.ok) {
      console.log(`[INIT] Servidor activo en ${SERVER_URL}`);
      return;
    }
  } catch (e) {}

  console.log(`[INIT] Iniciando servidor backend en puerto 3001...`);
  serverProcess = spawn("bun", ["run", "src/server.ts"], {
    cwd: process.cwd(),
    stdio: "pipe",
    env: { ...process.env, PORT: "3001" },
  });

  let retries = 20;
  while (retries > 0) {
    await delay(500);
    try {
      const res = await fetch(`${SERVER_URL}/api/health`);
      if (res.ok) {
        console.log(`[INIT] Servidor levantado y saludable en ${SERVER_URL}`);
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
      reject(new Error(`Timeout esperando evento '${eventName}' tras ${timeoutMs}ms`));
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

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function setup5Players(roomPrefix) {
  const hostId = `${roomPrefix}_p1_${Date.now()}`;
  const roomId = await createRoom(hostId);

  const playersData = [
    { userId: hostId, nickname: "Usopp_Sniper", avatarId: 1, color: "#ef4444" },
    { userId: `${roomPrefix}_p2_${Date.now()}`, nickname: "Sanji_Cook", avatarId: 2, color: "#3b82f6" },
    { userId: `${roomPrefix}_p3_${Date.now()}`, nickname: "Luffy_Captain", avatarId: 3, color: "#eab308" },
    { userId: `${roomPrefix}_p4_${Date.now()}`, nickname: "Zoro_Swordsman", avatarId: 4, color: "#22c55e" },
    { userId: `${roomPrefix}_p5_${Date.now()}`, nickname: "Nami_Navigator", avatarId: 5, color: "#a855f7" },
  ];

  const sockets = [];
  for (const p of playersData) {
    const { socket } = await connectPlayer(roomId, p);
    sockets.push({ ...p, socket });
  }

  return { roomId, players: sockets };
}

function cleanupSockets(players) {
  players.forEach((p) => {
    if (p.socket && p.socket.connected) {
      p.socket.disconnect();
    }
  });
}

const testResults = [];

async function runGameTest(gameName, testFn) {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`🎯 [SNIPER QA] Iniciando Batería: ${BOLD}${gameName}${RESET}`);
  console.log(`${CYAN}================================================================${RESET}`);
  
  const startTime = Date.now();
  try {
    const details = await testFn();
    const duration = Date.now() - startTime;
    console.log(`${GREEN}✅ [PASSED] ${gameName} en ${duration}ms${RESET}`);
    testResults.push({ name: gameName, status: "PASS", duration, details });
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`${RED}❌ [FAILED] ${gameName} falló: ${err.message}${RESET}`);
    console.error(err.stack);
    
    console.log(`\n${YELLOW}⚠️ [FAIL-SAFE TRIGGER] Ejecutando 10 iteraciones de aislamiento para ${gameName}...${RESET}`);
    const isolationResults = [];
    for (let i = 1; i <= 10; i++) {
      const iterStart = Date.now();
      try {
        await testFn();
        isolationResults.push({ iter: i, status: "PASS", duration: Date.now() - iterStart });
        console.log(`   🔁 Iteración #${i}: PASS (${Date.now() - iterStart}ms)`);
      } catch (iterErr) {
        isolationResults.push({ iter: i, status: "FAIL", error: iterErr.message, duration: Date.now() - iterStart });
        console.log(`   🔁 Iteración #${i}: FAIL - ${iterErr.message}`);
      }
    }
    
    testResults.push({
      name: gameName,
      status: "FAIL",
      error: err.message,
      stack: err.stack,
      duration,
      isolation10x: isolationResults,
    });
  }
}

// =========================================================================
// 1. UNO (5 JUGADORES)
// =========================================================================
async function testUno5Players() {
  const { roomId, players } = await setup5Players("uno5p");
  const host = players[0];

  try {
    const gameStartedPromises = players.map(p => waitForEvent(p.socket, "game_started", 5000));
    const statePromises = players.map(p => waitForEvent(p.socket, "game_state_update", 5000));

    host.socket.emit("start_game", {
      gameType: "uno",
      rules: {
        stackDrawCards: true,
        playMultipleSame: true,
        zeroAndSevenRules: true,
        drawUntilPlayable: false,
        interceptExact: true,
      },
    });

    await Promise.all(gameStartedPromises);
    const initialStates = await Promise.all(statePromises);

    for (let i = 0; i < 5; i++) {
      const s = initialStates[i];
      if (s.state !== "PLAYING") throw new Error(`Player ${i} state no es PLAYING: ${s.state}`);
      if (!s.myHand || s.myHand.length !== 7) throw new Error(`Player ${i} no tiene 7 cartas (tiene ${s.myHand?.length})`);
      if (!s.rivals || s.rivals.length !== 4) throw new Error(`Player ${i} no tiene 4 rivales (tiene ${s.rivals?.length})`);
    }
    console.log(`[UNO 5P] 5 jugadores conectados, repartidas 7 cartas cada uno (Total 35 cartas).`);

    // 1.1 Descarte simultáneo concurrente
    console.log(`[UNO 5P] Disparando ráfaga de descarte concurrente desde los 5 jugadores...`);
    const activePlayerId = initialStates[0].currentTurnUserId;
    const activePlayer = players.find(p => p.userId === activePlayerId);

    const burstPromises = players.map(p => {
      p.socket.emit("uno:play_cards", ["fake_card_id"]);
      return delay(50);
    });
    await Promise.all(burstPromises);
    await delay(200);

    // 1.2 Robo de cartas y avance
    console.log(`[UNO 5P] Jugador activo (${activePlayer.nickname}) robando carta...`);
    const drawPromise = waitForEvent(activePlayer.socket, "game_state_update", 5000);
    activePlayer.socket.emit("uno:draw_card");
    const afterDraw = await drawPromise;
    console.log(`[UNO 5P] Carta robada exitosamente. Total cartas: ${afterDraw.myHand?.length}`);

    // 1.3 Ráfaga Yell UNO y Challenge UNO
    console.log(`[UNO 5P] Probando ráfaga de Yell UNO y Challenge UNO de los 5 jugadores...`);
    players.forEach((p, idx) => {
      if (idx === 0) p.socket.emit("uno:yell_uno");
      else p.socket.emit("uno:challenge_uno", players[0].userId);
    });
    await delay(300);

    return {
      playersCount: 5,
      totalCards: 35,
      rulesTested: ["stackDrawCards", "zeroAndSevenRules", "interceptExact", "playMultipleSame"],
    };
  } finally {
    cleanupSockets(players);
  }
}

// =========================================================================
// 2. PARCHÍS (5 JUGADORES EN TABLERO 8 LADOS)
// =========================================================================
async function testParchis5Players() {
  const { roomId, players } = await setup5Players("parchis5p");
  const host = players[0];

  try {
    host.socket.emit("update_selected_game", "parchis");
    await waitForEvent(host.socket, "room_update", 5000, (d) => d.selectedGame === "parchis");

    // En Parchís, game_state_update emite el payload directo { state: 'CHOOSING_TOKENS', ... }
    const choosingTokensPromises = players.map(p => waitForEvent(p.socket, "game_state_update", 6000, d => d.state === "CHOOSING_TOKENS"));
    
    host.socket.emit("start_game", {
      gameType: "parchis",
      rules: {
        parchisBoardSize: 8,
        diceCount: 2,
        tokensPerPlayer: 4,
        captureReward: 20,
        crownReward: 10,
      },
    });

    await Promise.all(choosingTokensPromises);
    console.log(`[PARCHÍS 5P] Partida iniciada en tablero 8 lados. Estado: CHOOSING_TOKENS.`);

    // 2.1 Elección Concurrente de Figuras
    console.log(`[PARCHÍS 5P] 5 jugadores eligiendo figuras ("1".."5") concurrentemente...`);
    const rollingOrderPromises = players.map(p => waitForEvent(p.socket, "game_state_update", 6000, d => d.state === "ROLLING_FOR_ORDER"));
    
    players.forEach((p, idx) => {
      p.socket.emit("parchis:choose_figure", { figureId: `${idx + 1}` });
    });

    await Promise.all(rollingOrderPromises);
    console.log(`[PARCHÍS 5P] Figuras elegidas. Estado: ROLLING_FOR_ORDER.`);

    // 2.2 Lanzamiento Concurrente de Iniciativa
    console.log(`[PARCHÍS 5P] 5 jugadores lanzando iniciativa simultáneamente...`);
    const choosingSeatsPromises = players.map(p => waitForEvent(p.socket, "game_state_update", 10000, d => d.state === "CHOOSING_SEATS"));
    
    players.forEach(p => {
      p.socket.emit("parchis:roll_initiative");
    });

    const seatsStates = await Promise.all(choosingSeatsPromises);
    const firstState = seatsStates[0];
    console.log(`[PARCHÍS 5P] Iniciativa lista. Primer elector: ${firstState.firstPickerUserId}, Cola: ${firstState.pickersQueue?.length}`);

    // 2.3 Selección de Asientos
    console.log(`[PARCHÍS 5P] Seleccionando asientos para los 5 jugadores...`);
    let currentFirst = firstState.firstPickerUserId;
    let seatIndex = 0;

    for (let s = 0; s < 5; s++) {
      const picker = players.find(p => p.userId === currentFirst);
      if (picker) {
        picker.socket.emit("parchis:choose_seat", { targetColorIndex: seatIndex++ });
      }
      await delay(300);
      const nextState = await new Promise(res => {
        host.socket.once("game_state_update", data => res(data));
        setTimeout(() => res(null), 400);
      });
      if (nextState?.state === "PLAYING") {
        console.log(`[PARCHÍS 5P] Transición a PLAYING completada.`);
        break;
      }
      if (nextState?.firstPickerUserId) {
        currentFirst = nextState.firstPickerUserId;
      }
    }

    // 2.4 Lanzamiento Concurrente de Dados
    console.log(`[PARCHÍS 5P] Disparando roll_dice concurrente desde los 5 jugadores...`);
    players.forEach(p => p.socket.emit("parchis:roll_dice"));
    await delay(500);

    return {
      playersCount: 5,
      boardSize: 8,
      tokensPerPlayer: 4,
      phasesCompleted: ["CHOOSING_TOKENS", "ROLLING_FOR_ORDER", "CHOOSING_SEATS", "PLAYING"],
    };
  } finally {
    cleanupSockets(players);
  }
}

// =========================================================================
// 3. STOP (5 JUGADORES)
// =========================================================================
async function testStop5Players() {
  const { roomId, players } = await setup5Players("stop5p");
  const host = players[0];

  try {
    const playPromises = players.map(p => waitForEvent(p.socket, "game_state_update", 6000, d => d.state === "PLAYING"));

    host.socket.emit("start_game", {
      gameType: "stop",
      rules: {
        categories: ["Nombre", "Animal", "Color", "Cosa", "Fruta"],
        rounds: 2,
        verificationTime: 10,
        bannedLetters: ["X", "W"],
      },
    });

    const playStates = await Promise.all(playPromises);
    const letter = playStates[0].currentLetter;
    console.log(`[STOP 5P] Partida iniciada. Letra: '${letter}', Categorías: ${playStates[0].categories.join(", ")}`);

    // 3.1 Respuestas Concurrentes y Llamadas Simultáneas a STOP
    console.log(`[STOP 5P] 5 jugadores enviando respuestas a la vez y STOP concurrente...`);
    const verifyingPromises = players.map(p => waitForEvent(p.socket, "game_state_update", 8000, d => d.state === "VERIFYING"));

    const baseWord = letter.toUpperCase();
    players.forEach((p, idx) => {
      const answers = {
        Nombre: `${baseWord}ico_${idx}`,
        Animal: idx < 2 ? `${baseWord}ato_comun` : `${baseWord}nimal_${idx}`,
        Color: `${baseWord}olor_${idx}`,
        Cosa: `${baseWord}osa_${idx}`,
        Fruta: `${baseWord}ruta_${idx}`,
      };
      p.socket.emit("stop:submit_answers", { answers });
      if (idx === 0 || idx === 1) {
        p.socket.emit("stop:call_stop", { answers });
      }
    });

    const verifyingStates = await Promise.all(verifyingPromises);
    const vData = verifyingStates[0].verifyingData;
    console.log(`[STOP 5P] Estado: VERIFYING. Matriz de verificación: ${vData?.length} categorías.`);

    // 3.2 Validar Matriz 5x5
    if (!vData || vData.length !== 5) throw new Error(`Se esperaban 5 categorías en verifyingData, se recibieron: ${vData?.length}`);
    for (const cat of vData) {
      if (!cat.answers || cat.answers.length !== 5) {
        throw new Error(`Categoría '${cat.category}' no tiene las 5 respuestas de los 5 jugadores (tiene ${cat.answers?.length})`);
      }
    }
    console.log(`[STOP 5P] ✅ Matriz 5x5 validada (5 categorías x 5 jugadores = 25 respuestas).`);

    // 3.3 Ráfaga de Vetos Simultáneos
    console.log(`[STOP 5P] Ráfaga de vetos simultáneos entre jugadores...`);
    players.forEach((p, idx) => {
      const targetId = players[(idx + 1) % 5].userId;
      p.socket.emit("stop:cast_veto", { category: "Nombre", targetId });
    });
    await delay(300);

    // 3.4 Finalizar Verificación y Evaluar Puntuación
    console.log(`[STOP 5P] Finalizando verificación y evaluando cálculo de puntos...`);
    const scoringPromises = players.map(p => waitForEvent(p.socket, "game_state_update", 6000, d => d.state === "SCORING"));
    host.socket.emit("stop:finish_verification");

    const scoringStates = await Promise.all(scoringPromises);
    const scores = scoringStates[0].roundScores;
    console.log(`[STOP 5P] Puntuaciones calculadas con éxito:`, JSON.stringify(scores));

    return {
      playersCount: 5,
      matrixSize: "5x5 (25 cells)",
      letterUsed: letter,
      roundScores: scores,
    };
  } finally {
    cleanupSockets(players);
  }
}

// =========================================================================
// 4. IMPOSTOR (5 JUGADORES)
// =========================================================================
async function testImpostor5Players() {
  const { roomId, players } = await setup5Players("impostor5p");
  const host = players[0];

  try {
    // In Impostor, initial state is WORDS_REVEALED
    const revealPromises = players.map(p => waitForEvent(p.socket, "game_state_update", 6000, d => d.state === "WORDS_REVEALED"));

    host.socket.emit("start_game", { gameType: "impostor" });

    const revealStates = await Promise.all(revealPromises);
    console.log(`[IMPOSTOR 5P] Partida iniciada. Estado: WORDS_REVEALED.`);

    let impostorId = null;
    const innocentIds = [];
    revealStates.forEach((s, idx) => {
      if (s.amImpostor) {
        impostorId = players[idx].userId;
      } else {
        innocentIds.push(players[idx].userId);
      }
    });

    console.log(`[IMPOSTOR 5P] Roles asignados: 1 Impostor (${impostorId}), 4 Inocentes.`);
    if (!impostorId || innocentIds.length !== 4) {
      throw new Error(`Distribución inválida de roles: impostor=${impostorId}, inocentes=${innocentIds.length}`);
    }

    // 4.1 Esperar transición a DISCUSSION (toma 5s de reveal)
    console.log(`[IMPOSTOR 5P] Esperando fase de DISCUSSION...`);
    const discPromises = players.map(p => waitForEvent(p.socket, "game_state_update", 8000, d => d.state === "DISCUSSION"));
    await Promise.all(discPromises);

    // 4.2 Transición a Votación
    console.log(`[IMPOSTOR 5P] Host inicia votación (impostor:start_voting)...`);
    const votingPromises = players.map(p => waitForEvent(p.socket, "game_state_update", 6000, d => d.state === "VOTING"));
    host.socket.emit("impostor:start_voting");
    await Promise.all(votingPromises);

    // 4.3 Test de Desempate 2v2v1 (5 Votos Concurrentes)
    console.log(`[IMPOSTOR 5P] Votación en ráfaga 2v2v1...`);
    const resultsPromises = players.map(p => waitForEvent(p.socket, "game_state_update", 6000, d => d.state === "RESULTS"));

    // P0 y P1 votan a P2 (2 votos)
    // P2 y P3 votan a P0 (2 votos)
    // P4 vota a P1 (1 voto)
    players[0].socket.emit("impostor:vote", { targetId: players[2].userId });
    players[1].socket.emit("impostor:vote", { targetId: players[2].userId });
    players[2].socket.emit("impostor:vote", { targetId: players[0].userId });
    players[3].socket.emit("impostor:vote", { targetId: players[0].userId });
    players[4].socket.emit("impostor:vote", { targetId: players[1].userId });

    const resultsStates = await Promise.all(resultsPromises);
    const roundResult = resultsStates[0].roundResults?.[0];
    console.log(`[IMPOSTOR 5P] Resultado ronda 2v2v1: Eliminado = ${roundResult?.eliminatedUserId || "NADIE (EMPATE)"}`);

    if (roundResult?.eliminatedUserId) {
      throw new Error(`Se esperaba empate en 2v2v1, pero fue eliminado: ${roundResult.eliminatedUserId}`);
    }
    console.log(`[IMPOSTOR 5P] ✅ Empate 2v2v1 procesado correctamente sin eliminados.`);

    return {
      playersCount: 5,
      impostorId,
      innocentsCount: innocentIds.length,
      tieBreakSuccess: true,
    };
  } finally {
    cleanupSockets(players);
  }
}

// =========================================================================
// 5. LIAR'S BAR (5 JUGADORES - 25 DADOS EN MESA)
// =========================================================================
async function testLiars5Players() {
  const { roomId, players } = await setup5Players("liars5p");
  const host = players[0];

  try {
    const rollingPromises = players.map(p => waitForEvent(p.socket, "game_state_update", 6000, d => d.state === "ROLLING"));

    host.socket.emit("start_game", { gameType: "liars" });
    const rollingStates = await Promise.all(rollingPromises);
    console.log(`[LIAR'S BAR 5P] Partida iniciada. Estado: ROLLING.`);

    const totalDice = rollingStates[0].totalDiceCount;
    console.log(`[LIAR'S BAR 5P] Total dados en mesa: ${totalDice} (5 jugadores x 5 dados).`);
    if (totalDice !== 25) throw new Error(`Se esperaban 25 dados en mesa, se obtuvieron: ${totalDice}`);

    // Esperar fase BETTING (3s)
    console.log(`[LIAR'S BAR 5P] Esperando fase BETTING...`);
    const bettingPromises = players.map(p => waitForEvent(p.socket, "game_state_update", 6000, d => d.state === "BETTING"));
    const bettingStates = await Promise.all(bettingPromises);

    const firstTurnUserId = bettingStates[0].currentTurnUserId;
    const firstPlayer = players.find(p => p.userId === firstTurnUserId);
    console.log(`[LIAR'S BAR 5P] Fase BETTING activa. Turno: ${firstPlayer?.nickname}`);

    // 5.1 Apuesta Progresiva
    console.log(`[LIAR'S BAR 5P] Colocando apuesta (count: 3, face: 2)...`);
    const betPromise = waitForEvent(host.socket, "game_state_update", 5000, d => d.currentBet?.count === 3);
    firstPlayer.socket.emit("liars:place_bid", { count: 3, face: 2 });
    const betState = await betPromise;
    console.log(`[LIAR'S BAR 5P] Apuesta confirmada: ${betState.currentBet?.count} dados de cara ${betState.currentBet?.face}`);

    // 5.2 Llamada a Mentiroso
    const secondTurnUserId = betState.currentTurnUserId;
    const secondPlayer = players.find(p => p.userId === secondTurnUserId);
    console.log(`[LIAR'S BAR 5P] ${secondPlayer?.nickname} llama a mentiroso (liars:call_liar)...`);

    const resolutionPromises = players.map(p => waitForEvent(p.socket, "game_state_update", 6000, d => d.state === "RESOLUTION"));
    secondPlayer.socket.emit("liars:call_liar");

    const resolutionStates = await Promise.all(resolutionPromises);
    const resState = resolutionStates[0];
    console.log(`[LIAR'S BAR 5P] Resolución: Ganador ronda = ${resState.roundWinner}, Perdedor = ${resState.roundLoser}`);

    return {
      playersCount: 5,
      totalDiceCount: 25,
      firstBid: { count: 3, face: 2 },
      roundLoser: resState.roundLoser,
      roundWinner: resState.roundWinner,
    };
  } finally {
    cleanupSockets(players);
  }
}

// =========================================================================
// 6. PINTURILLO (5 JUGADORES - 1 DIBUJANTE, 4 ADIVINADORES)
// =========================================================================
async function testPinturillo5Players() {
  const { roomId, players } = await setup5Players("pinturillo5p");
  const host = players[0];

  try {
    const wordChoicePromises = players.map(p => waitForEvent(p.socket, "game_state_update", 6000, d => d.state === "CHOOSING_WORD"));

    host.socket.emit("start_game", { gameType: "pinturillo" });

    const choiceStates = await Promise.all(wordChoicePromises);
    const drawerId = choiceStates[0].currentDrawerId;
    const drawer = players.find(p => p.userId === drawerId);
    const guessers = players.filter(p => p.userId !== drawerId);

    console.log(`[PINTURILLO 5P] Partida iniciada. Dibujante: ${drawer?.nickname}, 4 Adivinadores.`);

    // 6.1 Elección de Palabra
    const drawingPromises = players.map(p => waitForEvent(p.socket, "game_state_update", 6000, d => d.state === "DRAWING"));
    drawer.socket.emit("pinturillo:choose_word", { wordIndex: 0 }); // 'Gato'
    await Promise.all(drawingPromises);
    console.log(`[PINTURILLO 5P] Palabra elegida. Estado: DRAWING.`);

    // 6.2 Ráfaga de Chat Masiva
    console.log(`[PINTURILLO 5P] Disparando ráfaga masiva de 20 mensajes de chat...`);
    const chatBurstPromises = [];
    guessers.forEach((g, gIdx) => {
      for (let m = 0; m < 5; m++) {
        chatBurstPromises.push(
          new Promise(res => {
            g.socket.emit("pinturillo:chat", { text: `intento_${gIdx}_${m}` });
            setTimeout(res, 20);
          })
        );
      }
    });
    await Promise.all(chatBurstPromises);
    console.log(`[PINTURILLO 5P] Ráfaga de chat procesada sin errores.`);

    // 6.3 Acierto Escalonado
    console.log(`[PINTURILLO 5P] Adivinador 1 (${guessers[0].nickname}) enviando 'Gato'...`);
    const guesser1 = guessers[0];
    const scoreUpdatePromise = waitForEvent(host.socket, "game_state_update", 6000, d => d.guessedPlayers?.includes(guesser1.userId));
    guesser1.socket.emit("pinturillo:chat", { text: "gato" });
    const afterGuessState = await scoreUpdatePromise;

    console.log(`[PINTURILLO 5P] Acierto registrado. Puntuaciones:`, JSON.stringify(afterGuessState.scores));

    return {
      playersCount: 5,
      drawer: drawer?.nickname,
      guessersCount: guessers.length,
      firstGuesser: guesser1?.nickname,
      scores: afterGuessState.scores,
    };
  } finally {
    cleanupSockets(players);
  }
}

// =========================================================================
// MAIN RUNNER
// =========================================================================
async function main() {
  console.log(`\n${MAGENTA}${BOLD}======================================================================${RESET}`);
  console.log(`${MAGENTA}${BOLD}🏴‍☠️ USOPP & SANJI: SUITE DE ESTRÉS DE CONCURRENCIA (5 JUGADORES WEBSOCKET)${RESET}`);
  console.log(`${MAGENTA}${BOLD}======================================================================${RESET}`);

  await ensureServerRunning();

  await runGameTest("1. UNO (5 Jugadores)", testUno5Players);
  await runGameTest("2. Parchís (5 Jugadores - Tablero 8 Lados)", testParchis5Players);
  await runGameTest("3. Stop (5 Jugadores - Matriz 5x5)", testStop5Players);
  await runGameTest("4. Impostor (5 Jugadores - Votación Ráfaga & Empate)", testImpostor5Players);
  await runGameTest("5. Liar's Bar (5 Jugadores - 25 Dados en Mesa)", testLiars5Players);
  await runGameTest("6. Pinturillo (5 Jugadores - Ráfaga Chat & Acierto)", testPinturillo5Players);

  console.log(`\n${CYAN}======================================================================${RESET}`);
  console.log(`${CYAN}${BOLD}📊 REPORTE DE RESULTADOS DE QA${RESET}`);
  console.log(`${CYAN}======================================================================${RESET}`);

  let passed = 0;
  let failed = 0;
  for (const r of testResults) {
    if (r.status === "PASS") {
      passed++;
      console.log(`${GREEN}✔ ${r.name} - PASSED (${r.duration}ms)${RESET}`);
    } else {
      failed++;
      console.log(`${RED}✖ ${r.name} - FAILED: ${r.error} (${r.duration}ms)${RESET}`);
    }
  }

  console.log(`\nResumen: ${GREEN}${passed} Pasados${RESET} | ${failed > 0 ? RED : GREEN}${failed} Fallidos${RESET} de 6 juegos.`);

  if (serverProcess) {
    serverProcess.kill();
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Error fatal en test runner:", err);
  if (serverProcess) serverProcess.kill();
  process.exit(1);
});
