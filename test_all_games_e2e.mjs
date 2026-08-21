/**
 * 🎯 USOPP'S SNIPER E2E INTEGRATION SUITE
 * Tests ALL 6 games with real Socket.io clients against http://localhost:3001
 */

import { io } from "socket.io-client";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3001";

// Helper: HTTP Room creation
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

// Helper: Connect and join socket
function connectPlayer(roomId, user) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER_URL, {
      transports: ["websocket"],
      forceNew: true,
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`Timeout connecting socket for ${user.userId}`));
    }, 5000);

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

// Helper: Wait for socket event with timeout
function waitForEvent(socket, eventName, timeoutMs = 8000, filterFn = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Timeout waiting for event '${eventName}' after ${timeoutMs}ms`));
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

// ANSI colors for report
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const results = [];

async function runTest(gameName, testFn) {
  console.log(`\n${CYAN}====================================================${RESET}`);
  console.log(`🎯 [SNIPER QA] Disparando test para: ${BOLD}${gameName}${RESET}`);
  console.log(`${CYAN}====================================================${RESET}`);
  const startTime = Date.now();
  try {
    await testFn();
    const duration = Date.now() - startTime;
    console.log(`${GREEN}✅ ${gameName} PASSED (${duration}ms)${RESET}`);
    results.push({ name: gameName, status: "PASS", duration });
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`${RED}❌ ${gameName} FAILED: ${err.message}${RESET}`);
    console.error(err);
    results.push({ name: gameName, status: "FAIL", error: err.message, duration });
  }
}

// ==========================================
// 1. GAME: UNO
// ==========================================
async function testUno() {
  const hostUserId = `usopp_uno_${Date.now()}`;
  const roomId = await createRoom(hostUserId);
  console.log(`[UNO] Sala creada: ${roomId}`);

  const { socket: hostSocket } = await connectPlayer(roomId, {
    userId: hostUserId,
    nickname: "GodUsopp",
    avatarId: 1,
    color: "#ef4444",
  });

  try {
    // Add 1 bot
    const botUpdatePromise = waitForEvent(hostSocket, "room_update", 5000, (data) =>
      data.users.some((u) => u.isBot)
    );
    hostSocket.emit("add_bots", { roomId, count: 1, difficulty: 5 });
    const roomWithBot = await botUpdatePromise;
    console.log(`[UNO] Bot agregado. Total jugadores: ${roomWithBot.users.length}`);

    // Start game
    const gameStartedPromise = waitForEvent(hostSocket, "game_started", 5000);
    const stateUpdatePromise = waitForEvent(hostSocket, "game_state_update", 5000);

    hostSocket.emit("start_game", {
      gameType: "uno",
      rules: {
        stackDrawCards: true,
        playMultipleSame: true,
        zeroAndSevenRules: true,
        drawUntilPlayable: false,
        interceptExact: false,
      },
    });

    const startedData = await gameStartedPromise;
    if (startedData.gameType !== "uno") throw new Error(`Expected uno gameType, got: ${startedData.gameType}`);

    const gameState = await stateUpdatePromise;
    console.log(`[UNO] Estado recibido: state=${gameState.state}, topCard=${gameState.topCard?.id}, myHandCount=${gameState.myHand?.length}, rivals=${gameState.rivals?.length}`);

    if (gameState.state !== "PLAYING") throw new Error(`Expected state 'PLAYING', got '${gameState.state}'`);
    if (!gameState.topCard) throw new Error("Top card missing in UNO state update");
    if (!gameState.myHand || gameState.myHand.length !== 7) throw new Error(`Expected 7 cards in hand, got: ${gameState.myHand?.length}`);
    if (!gameState.rivals || gameState.rivals.length < 1) throw new Error("Expected at least 1 rival bot");

    // Perform game action: draw card or pass turn or play card
    const nextStatePromise = waitForEvent(hostSocket, "game_state_update", 5000);
    if (gameState.currentTurnUserId === hostUserId) {
      console.log("[UNO] Turno del host: robando carta del mazo");
      hostSocket.emit("uno:draw_card");
    } else {
      console.log(`[UNO] Turno del rival/bot (${gameState.currentTurnUserId}): esperando acción`);
    }

    const nextState = await nextStatePromise;
    console.log(`[UNO] Turno verificado con éxito. Turno actual: ${nextState.currentTurnUserId}`);
  } finally {
    hostSocket.disconnect();
  }
}

// ==========================================
// 2. GAME: PARCHÍS
// ==========================================
async function testParchis() {
  const hostUserId = `usopp_parchis_${Date.now()}`;
  const roomId = await createRoom(hostUserId);
  console.log(`[PARCHÍS] Sala creada: ${roomId}`);

  const { socket: hostSocket } = await connectPlayer(roomId, {
    userId: hostUserId,
    nickname: "Sogeking",
    avatarId: 2,
    color: "#3b82f6",
  });

  try {
    // Select Parchis
    hostSocket.emit("update_selected_game", "parchis");
    await waitForEvent(hostSocket, "room_update", 5000, (d) => d.selectedGame === "parchis");

    // Add 1 bot
    const botUpdatePromise = waitForEvent(hostSocket, "room_update", 5000, (data) =>
      data.users.some((u) => u.isBot)
    );
    hostSocket.emit("add_bots", { roomId, count: 1, difficulty: 5 });
    await botUpdatePromise;
    console.log("[PARCHÍS] Bot agregado en sala Parchís");

    // Start game
    const gameStartedPromise = waitForEvent(hostSocket, "game_started", 5000);
    const choosingTokensPromise = waitForEvent(hostSocket, "game_state_update", 5000, (s) => s.state === "CHOOSING_TOKENS");

    hostSocket.emit("start_game", {
      gameType: "parchis",
      rules: { diceCount: 2, tokensPerPlayer: 4, parchisBoardSize: 4 },
    });

    await gameStartedPromise;
    const tokensState = await choosingTokensPromise;
    console.log(`[PARCHÍS] Transición 1 exitosa: state=${tokensState.state}`);

    // Choose figure
    const rollingOrderPromise = waitForEvent(hostSocket, "game_state_update", 6000, (s) => s.state === "ROLLING_FOR_ORDER");
    hostSocket.emit("parchis:choose_figure", { figureId: "dog" });
    const orderState = await rollingOrderPromise;
    console.log(`[PARCHÍS] Transición 2 exitosa: state=${orderState.state}`);

    // Roll initiative
    const choosingSeatsPromise = waitForEvent(hostSocket, "game_state_update", 8000, (s) => s.state === "CHOOSING_SEATS");
    hostSocket.emit("parchis:roll_initiative");
    const seatsState = await choosingSeatsPromise;
    console.log(`[PARCHÍS] Transición 3 exitosa: state=${seatsState.state}, firstPicker=${seatsState.firstPickerUserId}`);

    // Choose seat handler (handles case whether host is first or bot is first)
    const playingPromise = waitForEvent(hostSocket, "game_state_update", 12000, (s) => s.state === "PLAYING");
    
    const seatHandler = (s) => {
      if (s.state === "CHOOSING_SEATS" && s.firstPickerUserId === hostUserId) {
        const taken = s.takenSeats || [];
        const available = [0, 1, 2, 3].find((idx) => !taken.includes(idx)) ?? 0;
        console.log(`[PARCHÍS] Host eligiendo asiento índice: ${available}`);
        hostSocket.emit("parchis:choose_seat", { targetColorIndex: available });
      }
    };
    hostSocket.on("game_state_update", seatHandler);

    if (seatsState.state === "CHOOSING_SEATS" && seatsState.firstPickerUserId === hostUserId) {
      const taken = seatsState.takenSeats || [];
      const available = [0, 1, 2, 3].find((idx) => !taken.includes(idx)) ?? 0;
      console.log(`[PARCHÍS] Host eligiendo asiento índice inmediato: ${available}`);
      hostSocket.emit("parchis:choose_seat", { targetColorIndex: available });
    }

    const playingState = await playingPromise;
    hostSocket.off("game_state_update", seatHandler);
    console.log(`[PARCHÍS] Transición 4 exitosa: state=${playingState.state}, currentTurnIndex=${playingState.currentTurnIndex}`);

    // Test playing action / bot moves
    await delay(1000);
    const activePlayer = playingState.players[playingState.currentTurnIndex];
    if (activePlayer?.userId === hostUserId) {
      console.log("[PARCHÍS] Turno del host: lanzando dados");
      hostSocket.emit("parchis:roll_dice");
    } else {
      console.log(`[PARCHÍS] Turno del bot (${activePlayer?.nickname}): procesando jugada`);
    }

    await delay(1500);
    console.log("[PARCHÍS] Todas las fases de Parchís verificadas correctamente");
  } finally {
    hostSocket.disconnect();
  }
}

// ==========================================
// 3. GAME: STOP
// ==========================================
async function testStop() {
  const hostUserId = `usopp_stop_${Date.now()}`;
  const roomId = await createRoom(hostUserId);
  console.log(`[STOP] Sala creada: ${roomId}`);

  const { socket: hostSocket } = await connectPlayer(roomId, {
    userId: hostUserId,
    nickname: "SniperKing",
    avatarId: 3,
    color: "#eab308",
  });

  try {
    hostSocket.emit("update_selected_game", "stop");
    await waitForEvent(hostSocket, "room_update", 5000, (d) => d.selectedGame === "stop");

    const gameStartedPromise = waitForEvent(hostSocket, "game_started", 5000);
    const stateUpdatePromise = waitForEvent(hostSocket, "game_state_update", 5000, (s) => s.state === "PLAYING");

    hostSocket.emit("start_game", {
      gameType: "stop",
      rules: {
        stopCategories: ["Nombre", "Animal", "Color", "Cosa", "Fruta"],
        stopRounds: 3,
        verificationTime: 10,
      },
    });

    await gameStartedPromise;
    const playingState = await stateUpdatePromise;
    console.log(`[STOP] Juego iniciado: state=${playingState.state}, currentLetter=${playingState.currentLetter}, categories=${playingState.categories?.join(", ")}`);

    if (!playingState.currentLetter) throw new Error("Stop game started without assigned letter");
    if (!playingState.categories || playingState.categories.length === 0) throw new Error("Stop game started without categories");

    // Submit answers and call stop
    const letter = playingState.currentLetter;
    const answers = {
      Nombre: `${letter}lberto`,
      Animal: `${letter}guila`,
      Color: `${letter}zul`,
      Cosa: `${letter}nillo`,
      Fruta: `${letter}randano`,
    };

    const verifyingPromise = waitForEvent(hostSocket, "game_state_update", 6000, (s) => s.state === "VERIFYING");
    hostSocket.emit("stop:call_stop", { answers });

    const verifyingState = await verifyingPromise;
    console.log(`[STOP] Fase de verificación alcanzada: state=${verifyingState.state}, verifyingDataCount=${verifyingState.verifyingData?.length}`);

    if (verifyingState.state !== "VERIFYING") throw new Error(`Expected state 'VERIFYING', got '${verifyingState.state}'`);

    // Cast veto test
    hostSocket.emit("stop:cast_veto", { category: "Nombre", targetId: "other_dummy" });

    // Host finishes verification
    const scoringPromise = waitForEvent(hostSocket, "game_state_update", 6000, (s) => s.state === "SCORING" || s.state === "FINISHED");
    hostSocket.emit("stop:finish_verification");

    const scoringState = await scoringPromise;
    console.log(`[STOP] Fase de puntuación alcanzada con éxito: state=${scoringState.state}`);
  } finally {
    hostSocket.disconnect();
  }
}

// ==========================================
// 4. GAME: IMPOSTOR
// ==========================================
async function testImpostor() {
  const hostUserId = `usopp_impostor_${Date.now()}`;
  const roomId = await createRoom(hostUserId);
  console.log(`[IMPOSTOR] Sala creada: ${roomId}`);

  const { socket: hostSocket } = await connectPlayer(roomId, {
    userId: hostUserId,
    nickname: "SherlockUsopp",
    avatarId: 4,
    color: "#8b5cf6",
  });

  try {
    hostSocket.emit("update_selected_game", "impostor");
    await waitForEvent(hostSocket, "room_update", 5000, (d) => d.selectedGame === "impostor");

    // Add 2 bots (Impostor requires at least 2 or 3 players)
    const botUpdatePromise = waitForEvent(hostSocket, "room_update", 5000, (d) => d.users.length >= 3);
    hostSocket.emit("add_bots", { roomId, count: 2, difficulty: 5 });
    const roomWithBots = await botUpdatePromise;
    console.log(`[IMPOSTOR] Bots agregados. Total jugadores en sala: ${roomWithBots.users.length}`);

    // Start game
    const gameStartedPromise = waitForEvent(hostSocket, "game_started", 5000);
    const wordsRevealedPromise = waitForEvent(hostSocket, "game_state_update", 5000, (s) => s.state === "WORDS_REVEALED");

    hostSocket.emit("start_game", { gameType: "impostor" });

    await gameStartedPromise;
    const wordsState = await wordsRevealedPromise;
    console.log(`[IMPOSTOR] Palabras reveladas: state=${wordsState.state}, myWord=${wordsState.myWord}, amImpostor=${wordsState.amImpostor}`);

    if (wordsState.state !== "WORDS_REVEALED") throw new Error(`Expected state 'WORDS_REVEALED', got '${wordsState.state}'`);
    if (wordsState.myWord === undefined) throw new Error("Assigned word is undefined for host player");
    if (wordsState.amImpostor === undefined) throw new Error("amImpostor role is undefined");

    // Wait for DISCUSSION phase
    const discussionPromise = waitForEvent(hostSocket, "game_state_update", 8000, (s) => s.state === "DISCUSSION");
    const discussionState = await discussionPromise;
    console.log(`[IMPOSTOR] Fase de discusión alcanzada: state=${discussionState.state}`);

    // Transition to VOTING phase early via host command
    const votingPromise = waitForEvent(hostSocket, "game_state_update", 5000, (s) => s.state === "VOTING");
    hostSocket.emit("impostor:start_voting");
    const votingState = await votingPromise;
    console.log(`[IMPOSTOR] Fase de votación alcanzada: state=${votingState.state}`);

    // Vote for one of the other players
    const target = votingState.players.find((p) => p.userId !== hostUserId && p.isAlive);
    if (!target) throw new Error("No alive target found to vote for");

    const resultsPromise = waitForEvent(hostSocket, "game_state_update", 8000, (s) => s.state === "RESULTS" || s.state === "FINISHED");
    console.log(`[IMPOSTOR] Emitiendo voto contra: ${target.nickname} (${target.userId})`);
    hostSocket.emit("impostor:vote", { targetId: target.userId });

    const resultsState = await resultsPromise;
    console.log(`[IMPOSTOR] Votos procesados con éxito: state=${resultsState.state}, roundResultsCount=${resultsState.roundResults?.length}`);
  } finally {
    hostSocket.disconnect();
  }
}

// ==========================================
// 5. GAME: LIAR'S BAR
// ==========================================
async function testLiarsBar() {
  const hostUserId = `usopp_liars_${Date.now()}`;
  const roomId = await createRoom(hostUserId);
  console.log(`[LIAR'S BAR] Sala creada: ${roomId}`);

  const { socket: hostSocket } = await connectPlayer(roomId, {
    userId: hostUserId,
    nickname: "LiarKing",
    avatarId: 5,
    color: "#10b981",
  });

  try {
    hostSocket.emit("update_selected_game", "liars");
    await waitForEvent(hostSocket, "room_update", 5000, (d) => d.selectedGame === "liars");

    // Add 1 bot
    const botUpdatePromise = waitForEvent(hostSocket, "room_update", 5000, (d) =>
      d.users.some((u) => u.isBot)
    );
    hostSocket.emit("add_bots", { roomId, count: 1, difficulty: 5 });
    await botUpdatePromise;
    console.log("[LIAR'S BAR] Bot agregado en sala Liar's Bar");

    // Start game
    const gameStartedPromise = waitForEvent(hostSocket, "game_started", 5000);
    const rollingPromise = waitForEvent(hostSocket, "game_state_update", 5000, (s) => s.state === "ROLLING");

    hostSocket.emit("start_game", { gameType: "liars" });

    await gameStartedPromise;
    const rollingState = await rollingPromise;
    console.log(`[LIAR'S BAR] Dados lanzados: state=${rollingState.state}, myDice=${JSON.stringify(rollingState.myDice)}, totalDiceCount=${rollingState.totalDiceCount}`);

    if (rollingState.state !== "ROLLING") throw new Error(`Expected state 'ROLLING', got '${rollingState.state}'`);
    if (!Array.isArray(rollingState.myDice) || rollingState.myDice.length === 0) throw new Error("Expected myDice to contain rolled dice");

    // Wait for BETTING phase
    const bettingPromise = waitForEvent(hostSocket, "game_state_update", 6000, (s) => s.state === "BETTING");
    const bettingState = await bettingPromise;
    console.log(`[LIAR'S BAR] Fase de apuestas alcanzada: state=${bettingState.state}, currentTurnId=${bettingState.currentTurnId}`);

    // Place a bid or respond to bid
    if (bettingState.currentTurnId === hostUserId) {
      console.log("[LIAR'S BAR] Turno del host: realizando apuesta inicial (1 dado con cara 3)");
      hostSocket.emit("liars:place_bid", { count: 1, face: 3 });
      
      const bidAction = await waitForEvent(hostSocket, "game_action", 5000, (a) => a.action === "PLACED_BID");
      console.log(`[LIAR'S BAR] Apuesta registrada: ${JSON.stringify(bidAction)}`);
    } else {
      console.log(`[LIAR'S BAR] Turno del bot (${bettingState.currentTurnId}): esperando apuesta del bot`);
      const botBid = await waitForEvent(hostSocket, "game_action", 6000, (a) => a.action === "PLACED_BID");
      console.log(`[LIAR'S BAR] El bot ha apostado: ${JSON.stringify(botBid)}`);

      // Host calls liar or raises
      hostSocket.emit("liars:call_liar");
      const liarAction = await waitForEvent(hostSocket, "game_action", 6000, (a) => a.action === "CALLED_LIAR");
      console.log(`[LIAR'S BAR] Host dudó de la apuesta: ${JSON.stringify(liarAction)}`);
    }

    console.log("[LIAR'S BAR] Flujo de apuestas y dados verificado correctamente");
  } finally {
    hostSocket.disconnect();
  }
}

// ==========================================
// 6. GAME: PINTURILLO
// ==========================================
async function testPinturillo() {
  const hostUserId = `usopp_pintu_${Date.now()}`;
  const guesserUserId = `usopp_guess_${Date.now()}`;
  const roomId = await createRoom(hostUserId);
  console.log(`[PINTURILLO] Sala creada: ${roomId}`);

  const { socket: hostSocket } = await connectPlayer(roomId, {
    userId: hostUserId,
    nickname: "PicassoUsopp",
    avatarId: 6,
    color: "#f97316",
  });

  const { socket: guesserSocket } = await connectPlayer(roomId, {
    userId: guesserUserId,
    nickname: "DetectiveLuffy",
    avatarId: 7,
    color: "#ec4899",
  });

  try {
    hostSocket.emit("update_selected_game", "pinturillo");
    await waitForEvent(hostSocket, "room_update", 5000, (d) => d.selectedGame === "pinturillo");

    // Start game
    const gameStartedPromise = waitForEvent(hostSocket, "game_started", 5000);
    const choosingWordPromise = waitForEvent(hostSocket, "game_state_update", 5000, (s) => s.state === "CHOOSING_WORD");

    hostSocket.emit("start_game", { gameType: "pinturillo" });

    await gameStartedPromise;
    const chooseState = await choosingWordPromise;
    console.log(`[PINTURILLO] Juego iniciado: state=${chooseState.state}, drawer=${chooseState.currentDrawerId}`);

    const drawerSocket = chooseState.currentDrawerId === hostUserId ? hostSocket : guesserSocket;
    const otherSocket = drawerSocket === hostSocket ? guesserSocket : hostSocket;

    // Drawer chooses word
    const drawingPromise = waitForEvent(drawerSocket, "game_state_update", 5000, (s) => s.state === "DRAWING");
    drawerSocket.emit("pinturillo:choose_word", { wordIndex: 0 });
    const drawingState = await drawingPromise;
    console.log(`[PINTURILLO] Palabra elegida. Fase de dibujo alcanzada: state=${drawingState.state}, wordToDraw=${drawingState.wordToDraw}`);

    // Verify drawing event broadcast
    const drawBroadcastPromise = waitForEvent(otherSocket, "draw_event", 5000);
    drawerSocket.emit("pinturillo:draw", {
      type: "stroke",
      data: { points: [{ x: 10, y: 10 }, { x: 50, y: 50 }], color: "#000000", size: 4 },
    });
    const drawBroadcast = await drawBroadcastPromise;
    console.log(`[PINTURILLO] Broadcast de trazo recibido por el rival: ${JSON.stringify(drawBroadcast)}`);

    // Verify chat word evaluation
    // 1. Incorrect guess
    otherSocket.emit("pinturillo:chat", { text: "Elefante" });
    const chatMsg = await waitForEvent(drawerSocket, "chat_message", 5000, (m) => m.text === "Elefante");
    console.log(`[PINTURILLO] Mensaje de chat recibido: ${chatMsg.playerName}: ${chatMsg.text}`);

    // 2. Correct guess (the first word option is 'Gato')
    const correctGuessPromise = waitForEvent(drawerSocket, "chat_message", 5000, (m) => m.isSystem && m.text.includes("ha adivinado la palabra"));
    const updatedScorePromise = waitForEvent(otherSocket, "game_state_update", 5000, (s) => s.guessedPlayers?.includes(guesserUserId) || (s.scores && s.scores[guesserUserId] > 0));

    console.log("[PINTURILLO] Enviando palabra correcta 'Gato'");
    otherSocket.emit("pinturillo:chat", { text: "Gato" });

    await correctGuessPromise;
    console.log("[PINTURILLO] Acierto detectado por el sistema de evaluación!");

    const finalState = await updatedScorePromise;
    console.log(`[PINTURILLO] Puntuaciones actualizadas: ${JSON.stringify(finalState.scores)}`);
  } finally {
    hostSocket.disconnect();
    guesserSocket.disconnect();
  }
}

// ==========================================
// MAIN RUNNER
// ==========================================
async function main() {
  console.log(`\n${BOLD}${YELLOW}╔════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${YELLOW}║   🎯 USOPP (QA SNIPER): EJECUTANDO BATERÍA E2E DE 6 JUEGOS   ║${RESET}`);
  console.log(`${BOLD}${YELLOW}╚════════════════════════════════════════════════════════════════╝${RESET}\n`);

  await runTest("UNO", testUno);
  await runTest("Parchís", testParchis);
  await runTest("Stop", testStop);
  await runTest("Impostor", testImpostor);
  await runTest("Liar's Bar", testLiarsBar);
  await runTest("Pinturillo", testPinturillo);

  console.log(`\n${BOLD}${CYAN}================== RESUMEN DE MISIÓN ==================${RESET}`);
  let allPassed = true;
  for (const r of results) {
    if (r.status === "PASS") {
      console.log(` ${GREEN}✔ ${r.name.padEnd(15)} : PASSED (${r.duration}ms)${RESET}`);
    } else {
      console.log(` ${RED}✖ ${r.name.padEnd(15)} : FAILED (${r.error})${RESET}`);
      allPassed = false;
    }
  }
  console.log(`${BOLD}${CYAN}========================================================${RESET}\n`);

  if (!allPassed) {
    console.error(`${RED}💥 ¡Alerta roja! Algunos juegos fallaron la prueba de disparo.${RESET}`);
    process.exit(1);
  } else {
    console.log(`${BOLD}${GREEN}🎯 ¡MISIÓN CUMPLIDA! Todos los 6 juegos superaron las pruebas E2E con precisión absoluta.${RESET}\n`);
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
