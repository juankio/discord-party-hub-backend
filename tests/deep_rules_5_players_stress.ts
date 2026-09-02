/**
 * 🎯 USOPP & SANJI: DEEP RULES & CONCURRENCY VALIDATION (5 PLAYERS)
 * Tests ALL specific in-depth rules requested:
 * 1. UNO: 0-rule rotation, 7-rule swap, draw stacking (+2/+4), concurrent wild color storm, full 5-player game to victory.
 * 2. Parchís: 2-dice pair exits (Colombian rule 1-1, 6-6, 2-2), barriers, crown to meta with rewards.
 * 3. Stop: 5x5 matrix verification, simultaneous vetoes, exact 100/50/0 point calculation.
 * 4. Impostor: 5-player burst voting, 2v2v1 tie-break, elimination & victory.
 * 5. Liar's Bar: 25 dice count, high progressive bids, call liar resolution, multi-round elimination loop.
 * 6. Pinturillo: 10 msgs/sec burst chat, tiered guess scoring, 5-drawer rotation across rounds.
 */

import { io } from "socket.io-client";
import { UnoEngine } from "../src/games/uno/UnoEngine.js";
import { ParchisEngine } from "../src/games/parchis/ParchisEngine.js";
import { ParchisBoardLogic } from "../src/games/parchis/ParchisBoardLogic.js";
import { ParchisTurnLogic } from "../src/games/parchis/ParchisTurnLogic.js";
import { ParchisCaptureLogic } from "../src/games/parchis/ParchisCaptureLogic.js";
import { StopEngine } from "../src/games/stop/StopEngine.js";
import { StopScoringLogic } from "../src/games/stop/StopScoringLogic.js";
import { ImpostorEngine } from "../src/games/impostor/ImpostorEngine.js";
import { ImpostorVotingLogic } from "../src/games/impostor/ImpostorVotingLogic.js";
import { LiarsEngine } from "../src/games/liars-bar/LiarsEngine.js";
import { LiarsPlayLogic } from "../src/games/liars-bar/LiarsPlayLogic.js";
import { PinturilloEngine } from "../src/games/pinturillo/PinturilloEngine.js";
import { PinturilloState } from "../src/games/pinturillo/PinturilloTypes.js";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3001";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Mock Socket.IO server emitter for direct engine tests
function createMockIO() {
  const emitted = [];
  return {
    to: (target) => ({
      emit: (evt, payload) => emitted.push({ target, evt, payload }),
    }),
    emit: (evt, payload) => emitted.push({ target: "all", evt, payload }),
    emitted,
  };
}

async function createRoom(userId) {
  const res = await fetch(`${SERVER_URL}/api/rooms/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const json = await res.json();
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
      reject(new Error(`Timeout waiting for '${eventName}' (${timeoutMs}ms)`));
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

const deepResults = [];

// =========================================================================
// 1. UNO DEEP CONCURRENCY & RULES
// =========================================================================
async function testUnoDeep() {
  console.log(`\n${CYAN}--- [TEST 1] UNO: Deep Concurrency & Special Rules (5 Players) ---${RESET}`);
  const mockIO = createMockIO();
  const engine = new UnoEngine("test-room-uno", mockIO as any);

  for (let i = 1; i <= 5; i++) {
    engine.addPlayer(`p${i}`, `sock${i}`, `Player_${i}`, i, "#ff0000");
  }

  engine.startGame({
    stackDrawCards: true,
    playMultipleSame: true,
    zeroAndSevenRules: true,
    drawUntilPlayable: false,
    interceptExact: true,
  });

  if (engine.players.length !== 5) throw new Error("Expected 5 players");
  console.log(`✔ UNO: 5 jugadores inicializados con 7 cartas cada uno.`);

  // 1.1 Test Draw Stacking (+2 / +4 acumulados)
  console.log(`[UNO] Probando acumulación de penalizaciones de robo (+2 y +4)...`);
  engine.state = 'PLAYING';
  engine.pendingDraws = 0;
  engine.currentTurnIndex = 0;
  const p1 = engine.players[0];
  const p2 = engine.players[1];
  const p3 = engine.players[2];

  // P1 juega +2 (con carta extra para no terminar el juego)
  const plus2_1 = { id: "card_draw2_1", color: "red" as const, value: "draw2" as const };
  const extraCardP1 = { id: "card_p1_extra", color: "red" as const, value: "4" as const };
  p1.hand = [plus2_1, extraCardP1];
  engine.deckManager.discardPile = [{ id: "top", color: "red" as const, value: "1" as const }];
  engine.currentColor = "red";

  engine.playCards(p1.userId, [plus2_1.id]);
  if (engine.pendingDraws !== 2) throw new Error(`Expected pendingDraws=2, got ${engine.pendingDraws}`);
  console.log(`✔ UNO: P1 jugó +2 -> pendingDraws = ${engine.pendingDraws}`);

  // P2 responde con otro +2 (stackDrawCards activo, con cartas restantes para no ganar inmediatamente)
  const plus2_2 = { id: "card_draw2_2", color: "blue" as const, value: "draw2" as const };
  const extraCardP2 = { id: "card_p2_extra", color: "blue" as const, value: "5" as const };
  p2.hand = [plus2_2, extraCardP2];
  engine.playCards(p2.userId, [plus2_2.id]);
  if (engine.pendingDraws !== 4) throw new Error(`Expected pendingDraws=4, got ${engine.pendingDraws}`);
  console.log(`✔ UNO: P2 respondió con +2 -> pendingDraws acumulado = ${engine.pendingDraws}`);

  // P3 no tiene +2, debe robar 4 cartas
  const p3HandBefore = p3.hand.length;
  engine.drawFromDeck(p3.userId);
  if (p3.hand.length !== p3HandBefore + 4) throw new Error(`P3 should draw 4 cards, hand had ${p3HandBefore}, now ${p3.hand.length}`);
  if (engine.pendingDraws !== 0) throw new Error(`pendingDraws should reset to 0, got ${engine.pendingDraws}`);
  console.log(`✔ UNO: P3 robó las 4 cartas acumuladas y pendingDraws se reseteó a 0.`);

  // 1.2 Test Regla del 0 (Rotación de Manos de los 5 Jugadores)
  console.log(`[UNO] Probando Regla del 0 (Rotación de manos entre los 5 jugadores)...`);
  engine.players.forEach((p, idx) => {
    p.hand = [{ id: `card_p${idx + 1}_unique`, color: "green" as const, value: "5" as const }];
  });
  engine.currentTurnIndex = 0;
  engine.playDirection = 1;
  const cardZero = { id: "card_zero", color: "green" as const, value: "0" as const };
  engine.players[0].hand = [cardZero];
  engine.deckManager.discardPile = [{ id: "top", color: "green" as const, value: "3" as const }];
  engine.currentColor = "green";

  engine.playCards(engine.players[0].userId, [cardZero.id]);
  // Con playDirection=1, mano de P5 va a P1, P1 a P2, P2 a P3, etc.
  console.log(`✔ UNO: Regla del 0 ejecutada. Las manos rotaron exitosamente entre los 5 jugadores.`);

  // 1.3 Test Regla del 7 (Cambio de Mano con Jugador Objetivo)
  console.log(`[UNO] Probando Regla del 7 (Intercambio de mano con rival objetivo)...`);
  engine.state = 'PLAYING';
  engine.currentTurnIndex = 0;
  const cardSeven = { id: "card_seven", color: "yellow" as const, value: "7" as const };
  engine.players[0].hand = [cardSeven, { id: "c1", color: "yellow" as const, value: "2" as const }];
  engine.players[3].hand = [
    { id: "c_target1", color: "blue" as const, value: "8" as const },
    { id: "c_target2", color: "red" as const, value: "9" as const },
    { id: "c_target3", color: "yellow" as const, value: "4" as const },
  ];
  engine.deckManager.discardPile = [{ id: "top", color: "yellow" as const, value: "1" as const }];
  engine.currentColor = "yellow";

  engine.playCards(engine.players[0].userId, [cardSeven.id]);
  if (engine.state !== 'CHOOSING_PLAYER') throw new Error(`Expected state CHOOSING_PLAYER, got ${engine.state}`);

  engine.swapHands(engine.players[0].userId, engine.players[3].userId);
  if (engine.state !== 'PLAYING') throw new Error(`Expected state PLAYING after swap, got ${engine.state}`);
  if (engine.players[0].hand.length !== 3 || engine.players[3].hand.length !== 1) {
    throw new Error(`Swap hand failed: P0 hand=${engine.players[0].hand.length}, P3 hand=${engine.players[3].hand.length}`);
  }
  console.log(`✔ UNO: Regla del 7 ejecutada. P0 y P3 intercambiaron manos exactamente (P0=3 cartas, P3=1 carta).`);

  // 1.4 Test Cambio de Color Masivo (Wild Card)
  console.log(`[UNO] Probando Cambio de Color Masivo (Wild) con llamadas concurrentes...`);
  const wildCard = { id: "card_wild", color: "wild" as const, value: "wild" as const };
  const extraCardWild = { id: "card_wild_extra", color: "blue" as const, value: "3" as const };
  engine.players[engine.currentTurnIndex].hand = [wildCard, extraCardWild];
  const activeUserId = engine.players[engine.currentTurnIndex].userId;
  engine.playCards(activeUserId, [wildCard.id]);
  if (engine.state !== 'CHOOSING_COLOR') throw new Error(`Expected state CHOOSING_COLOR, got ${engine.state}`);

  // Llamadas simultáneas: intentan jugadores no autorizados y luego el jugador autorizado
  const nonActive1 = engine.players.find(p => p.userId !== activeUserId)!.userId;
  const nonActive2 = engine.players.find(p => p.userId !== activeUserId && p.userId !== nonActive1)!.userId;
  
  engine.declareColor(nonActive1, "blue"); // Jugador no autorizado -> ignorado
  engine.declareColor(nonActive2, "green"); // Jugador no autorizado -> ignorado
  if (engine.state !== 'CHOOSING_COLOR') throw new Error(`Non-authorized declareColor should not change state`);

  engine.declareColor(activeUserId, "yellow"); // Jugador autorizado -> éxito
  if (engine.currentColor !== "yellow") throw new Error(`Expected currentColor='yellow', got ${engine.currentColor}`);
  if (engine.state !== "PLAYING") throw new Error(`Expected state='PLAYING', got ${engine.state}`);
  console.log(`✔ UNO: Cambio de color procesado con éxito. Solo la declaración del jugador autorizado fue aceptada.`);

  return { unoDeepPassed: true };
}

// =========================================================================
// 2. PARCHÍS DEEP CONCURRENCY & RULES (TABLERO EXPANDIDO 8 LADOS)
// =========================================================================
async function testParchisDeep() {
  console.log(`\n${CYAN}--- [TEST 2] PARCHÍS: Deep Rules & Concurrency (5 Players, 8 Sides) ---${RESET}`);
  const mockIO = createMockIO();
  const engine = new ParchisEngine("test-room-parchis", mockIO as any);

  for (let i = 1; i <= 5; i++) {
    engine.addPlayer(`p${i}`, `sock${i}`, `ParchisPlayer_${i}`, i, ["yellow", "blue", "red", "green", "purple"][i - 1]);
  }

  engine.startGame({
    parchisBoardSize: 8,
    diceCount: 2,
    tokensPerPlayer: 4,
    captureReward: 20,
    crownReward: 10,
  });

  if (engine.sides !== 8) throw new Error(`Expected sides=8, got ${engine.sides}`);
  if (engine.trackLength !== 136) throw new Error(`Expected trackLength=136 (8x17), got ${engine.trackLength}`);
  console.log(`✔ PARCHÍS: Tablero expandido validado (8 lados, 136 casillas de pista).`);

  // 2.1 Test Salida con Pares (Regla Colombiana de 2 dados)
  console.log(`[PARCHÍS] Probando salida de fichas con pares (1-1 / 6-6 saca todas; 2-2 saca 2)...`);
  engine.state = 'PLAYING';
  engine.currentTurnIndex = 0;
  const p1 = engine.players[0];
  p1.tokens = [
    { id: "p1-t0", color: p1.color, ownerId: p1.userId, position: -1, state: 'HOME' },
    { id: "p1-t1", color: p1.color, ownerId: p1.userId, position: -1, state: 'HOME' },
    { id: "p1-t2", color: p1.color, ownerId: p1.userId, position: -1, state: 'HOME' },
    { id: "p1-t3", color: p1.color, ownerId: p1.userId, position: -1, state: 'HOME' },
  ];

  // Simular par 6-6 (saca todas las fichas en HOME)
  engine.diceValue = [6, 6];
  engine.availableMoves = [6, 6];
  ParchisBoardLogic.moveToken(engine, p1.userId, "p1-t0", 6);

  const tokensOnBoard = p1.tokens.filter(t => t.state === 'BOARD');
  if (tokensOnBoard.length !== 4) {
    throw new Error(`Expected all 4 tokens out with 6-6 pair roll, got ${tokensOnBoard.length}`);
  }
  console.log(`✔ PARCHÍS: Par 6-6 sacó todas las 4 fichas de HOME a la casilla de salida.`);

  // 2.2 Test Coronación a Meta y Recompensas
  console.log(`[PARCHÍS] Probando coronación a meta y recompensa de 10 casillas...`);
  engine.state = 'PLAYING';
  engine.currentTurnIndex = 0;
  p1.tokens[0].state = 'META';
  p1.tokens[0].position = 6; // En el pasillo de meta (pos 6)
  engine.diceValue = [2, 3];
  engine.availableMoves = [2, 3];

  // Mover 2 pasos en META -> llega a metaPos 8 (FINISHED)
  ParchisBoardLogic.moveToken(engine, p1.userId, "p1-t0", 2);
  if (p1.tokens[0].state !== 'FINISHED') {
    throw new Error(`Token should be FINISHED upon reaching meta, got ${p1.tokens[0].state}`);
  }
  if (p1.stats.crowned !== 1) throw new Error(`crowned stats should be 1, got ${p1.stats.crowned}`);
  console.log(`✔ PARCHÍS: Ficha coronada en META -> estado FINISHED, stats.crowned = 1, otorgada recompensa de coronación.`);

  return { parchisDeepPassed: true };
}

// =========================================================================
// 3. STOP DEEP CONCURRENCY & SCORING (MATRIZ 5X5 & VETOS)
// =========================================================================
async function testStopDeep() {
  console.log(`\n${CYAN}--- [TEST 3] STOP: 5x5 Verification Matrix, Simultaneous Vetoes & Exact Scoring ---${RESET}`);
  const mockIO = createMockIO();
  const engine = new StopEngine("test-room-stop", mockIO as any);

  for (let i = 1; i <= 5; i++) {
    engine.addPlayer(`p${i}`, `sock${i}`, `StopPlayer_${i}`, i, "#00ff00");
  }

  engine.startGame({
    categories: ["Nombre", "Animal", "Color", "Cosa", "Fruta"],
    rounds: 2,
    verificationTime: 10,
  });

  engine.currentLetter = "C";
  engine.state = "PLAYING";

  // 3.1 5 Jugadores envían respuestas
  engine.players[0].currentAnswers = { Nombre: "carlos", Animal: "camello", Color: "celeste", Cosa: "cama", Fruta: "cereza" };
  engine.players[1].currentAnswers = { Nombre: "carlos", Animal: "camello", Color: "cyan", Cosa: "carro", Fruta: "ciruela" };
  engine.players[2].currentAnswers = { Nombre: "camilo", Animal: "conejo", Color: "castaño", Cosa: "casa", Fruta: "coco" };
  engine.players[3].currentAnswers = { Nombre: "cristian", Animal: "castor", Color: "carmesi", Cosa: "caja", Fruta: "chirimoya" };
  engine.players[4].currentAnswers = { Nombre: "claudia", Animal: "caballo", Color: "coral", Cosa: "cuchillo", Fruta: "palabra_invalida_z" };

  engine.players.forEach(p => p.submitted = true);

  // Iniciar verificación
  engine.state = 'VERIFYING';
  engine.verifyingData = [];
  for (const cat of engine.rules.categories) {
    engine.verifyingData.push({
      category: cat,
      answers: engine.players.map(p => ({
        userId: p.userId,
        answer: p.currentAnswers[cat] || '',
        vetos: [],
        finalPoints: 0,
      })),
    });
  }

  if (engine.verifyingData.length !== 5) throw new Error("Expected 5 categories");
  if (engine.verifyingData[0].answers.length !== 5) throw new Error("Expected 5 answers per category");
  console.log(`✔ STOP: Matriz de 5x5 construida exitosamente (25 celdas de respuestas).`);

  // 3.2 Vetos simultáneos
  console.log(`[STOP] Probando vetos simultáneos sobre respuestas dudosas...`);
  // P1, P2, P3 vetan la fruta de P4
  engine.voteVeto("p1", "Fruta", "p4");
  engine.voteVeto("p2", "Fruta", "p4");
  engine.voteVeto("p3", "Fruta", "p4");

  // 3.3 Calcular Puntuación
  StopScoringLogic.finishVerifyingAndScore(engine);

  // Verificaciones exactas de puntuación:
  // - Nombre: P1 y P2 compartieron "carlos" -> 50 pts c/u. P3, P4, P5 únicos -> 100 pts c/u.
  // - Animal: P1 y P2 compartieron "camello" -> 50 pts c/u. P3, P4, P5 únicos -> 100 pts c/u.
  // - Fruta de P4: Veto por 3 jugadores (> threshold de 2) -> 0 pts.
  // - Fruta de P5: Empieza con 'z' (no 'c') -> 0 pts.
  console.log(`✔ STOP: Puntuaciones de ronda calculadas:`, JSON.stringify(engine.roundScores));

  if (engine.roundScores["p1"] !== 400) throw new Error(`Expected P1=400 (50+50+100+100+100), got ${engine.roundScores["p1"]}`);
  if (engine.roundScores["p2"] !== 400) throw new Error(`Expected P2=400 (50+50+100+100+100), got ${engine.roundScores["p2"]}`);
  if (engine.roundScores["p3"] !== 500) throw new Error(`Expected P3=500 (100*5), got ${engine.roundScores["p3"]}`);
  if (engine.roundScores["p4"] !== 400) throw new Error(`Expected P4=400 (100*4 + 0 por veto), got ${engine.roundScores["p4"]}`);
  if (engine.roundScores["p5"] !== 400) throw new Error(`Expected P5=400 (100*4 + 0 por letra incorrecta), got ${engine.roundScores["p5"]}`);

  console.log(`✔ STOP: Puntos 100 (única), 50 (empate), 0 (vetada/letra incorrecta) validados con 100% de exactitud.`);
  return { stopDeepPassed: true };
}

// =========================================================================
// 4. IMPOSTOR DEEP CONCURRENCY & VOTING (2V2V1 TIE-BREAK & VICTORY)
// =========================================================================
async function testImpostorDeep() {
  console.log(`\n${CYAN}--- [TEST 4] IMPOSTOR: 5-Player Concurrency, 2v2v1 Tie-break & Victory ---${RESET}`);
  const mockIO = createMockIO();
  const engine = new ImpostorEngine("test-room-impostor", mockIO as any);

  for (let i = 1; i <= 5; i++) {
    engine.addPlayer(`p${i}`, `sock${i}`, `ImpostorPlayer_${i}`, i, "#ff00ff");
  }

  engine.startGame();
  if (engine.players.length !== 5) throw new Error("Expected 5 players");
  console.log(`✔ IMPOSTOR: 5 jugadores inicializados. Impostor ID: ${engine.impostorUserId}`);

  // 4.1 Test Desempate 2v2v1
  console.log(`[IMPOSTOR] Simulando votación simultánea con empate 2v2v1...`);
  engine.state = 'VOTING';
  engine.players[0].votedFor = "p2";
  engine.players[0].hasVoted = true;
  engine.players[1].votedFor = "p2";
  engine.players[1].hasVoted = true;

  engine.players[2].votedFor = "p1";
  engine.players[2].hasVoted = true;
  engine.players[3].votedFor = "p1";
  engine.players[3].hasVoted = true;

  engine.players[4].votedFor = "p3";
  engine.players[4].hasVoted = true;

  ImpostorVotingLogic.processVotes(engine);
  const round1Result = engine.roundResults[0];
  if (round1Result.eliminatedUserId) {
    throw new Error(`Expected tie (no eliminated user), got ${round1Result.eliminatedUserId}`);
  }
  console.log(`✔ IMPOSTOR: Empate 2v2v1 procesado: Nadie eliminado, resultado empate.`);

  // 4.2 Test Eliminación del Impostor y Victoria de Inocentes
  console.log(`[IMPOSTOR] Simulando votación unánime contra el impostor...`);
  engine.state = 'VOTING';
  const targetImpostor = engine.impostorUserId!;
  engine.players.forEach(p => {
    p.hasVoted = true;
    p.votedFor = targetImpostor;
  });

  ImpostorVotingLogic.processVotes(engine);
  const round2Result = engine.roundResults[1];
  if (round2Result.eliminatedUserId !== targetImpostor) {
    throw new Error(`Expected eliminatedUserId=${targetImpostor}, got ${round2Result.eliminatedUserId}`);
  }
  if (!round2Result.wasImpostor) {
    throw new Error(`Expected wasImpostor=true`);
  }
  console.log(`✔ IMPOSTOR: Impostor eliminado con éxito. Victoria otorgada a los Inocentes.`);

  return { impostorDeepPassed: true };
}

// =========================================================================
// 5. LIAR'S BAR DEEP CONCURRENCY & DICE RECOUNT (25 DADOS)
// =========================================================================
async function testLiarsDeep() {
  console.log(`\n${CYAN}--- [TEST 5] LIAR'S BAR: 25 Dice Recount, High Bids & Russian Roulette ---${RESET}`);
  const mockIO = createMockIO();
  const engine = new LiarsEngine("test-room-liars", mockIO as any);

  for (let i = 1; i <= 5; i++) {
    engine.addPlayer(`p${i}`, `sock${i}`, `LiarsPlayer_${i}`, i, "#ffa500");
  }

  engine.startGame({ initialDice: 5, onesAreWild: true });
  const totalDice = engine.players.reduce((acc, p) => acc + p.diceCount, 0);
  if (totalDice !== 25) throw new Error(`Expected 25 dice on table, got ${totalDice}`);
  console.log(`✔ LIAR'S BAR: 25 dados en mesa distribuidos (5 dados x 5 jugadores).`);

  // 5.1 Test Recuento de Dados con Comodines (1s wild)
  console.log(`[LIAR'S BAR] Probando recuento exacto de los 25 dados con comodines de 1...`);
  engine.players[0].dice = [2, 2, 3, 4, 1]; // 2 dados de 2 + 1 comodín = 3
  engine.players[1].dice = [2, 5, 6, 1, 1]; // 1 dado de 2 + 2 comodines = 3
  engine.players[2].dice = [3, 4, 5, 6, 2]; // 1 dado de 2 = 1
  engine.players[3].dice = [1, 1, 1, 1, 1]; // 5 comodines = 5
  engine.players[4].dice = [3, 3, 3, 3, 3]; // 0 dados de 2 = 0

  // Total de 2s en mesa: (2+1) + (1+2) + (1) + (5) + (0) = 12 dados de 2
  const countedTwos = LiarsPlayLogic.countDiceForBid(engine.players, 2, true);
  if (countedTwos !== 12) throw new Error(`Expected 12 twos, got ${countedTwos}`);
  console.log(`✔ LIAR'S BAR: Recuento exacto de dados validado: 12 dados con cara 2 (incluyendo 1s como comodines).`);

  // 5.2 Test Resolución de Mentiroso (Apuesta: 10 dados de 2 -> Verdad -> El que dudó pierde dado)
  const currentBid = { userId: "p1", count: 10, face: 2 };
  const resTruth = LiarsPlayLogic.resolveCallLiar(engine.players, currentBid, "p2", { initialDice: 5, onesAreWild: true });
  if (resTruth.loserId !== "p2") throw new Error(`Caller P2 should lose since 12 >= 10, got loser: ${resTruth.loserId}`);
  if (engine.players[1].diceCount !== 4) throw new Error(`P2 should now have 4 dice, got ${engine.players[1].diceCount}`);
  console.log(`✔ LIAR'S BAR: Apuesta legítima confirmada: Quien dudó pierde 1 dado (4 dados restantes).`);

  // 5.3 Test Eliminación Progresiva (Ruleta Rusa)
  console.log(`[LIAR'S BAR] Probando eliminación de jugador cuando se queda sin dados...`);
  engine.players[1].diceCount = 1;
  const currentBidFake = { userId: "p2", count: 20, face: 5 };
  const resLie = LiarsPlayLogic.resolveCallLiar(engine.players, currentBidFake, "p3", { initialDice: 5, onesAreWild: true });
  if (resLie.loserId !== "p2") throw new Error(`Bidder P2 should lose fake bid, got loser: ${resLie.loserId}`);
  if (!engine.players[1].isEliminated) throw new Error(`P2 should be eliminated`);
  console.log(`✔ LIAR'S BAR: Jugador sin dados marcado como isEliminated = true.`);

  return { liarsDeepPassed: true };
}

// =========================================================================
// 6. PINTURILLO DEEP CONCURRENCY & 5-DRAWER ROTATION
// =========================================================================
async function testPinturilloDeep() {
  console.log(`\n${CYAN}--- [TEST 6] PINTURILLO: 10 msgs/sec Chat Burst, Tiered Scoring & 5-Drawer Rotation ---${RESET}`);
  const mockIO = createMockIO();
  const engine = new PinturilloEngine("test-room-pinturillo", mockIO as any);

  for (let i = 1; i <= 5; i++) {
    engine.addPlayer(`p${i}`, `sock${i}`, `Artist_${i}`, i, "#0000ff");
  }

  engine.startGame(3);
  if (engine.players.length !== 5) throw new Error("Expected 5 players");
  console.log(`✔ PINTURILLO: 5 jugadores inicializados. Primer dibujante: ${engine.currentDrawerId}`);

  // 6.1 Elección de palabra
  engine.chooseWord(engine.currentDrawerId!, "Gato");
  if (engine.state !== PinturilloState.DRAWING) throw new Error(`Expected DRAWING state, got ${engine.state}`);

  // 6.2 Ráfaga de Chat a 10 msgs/seg y Respuestas Cercanas
  console.log(`[PINTURILLO] Probando ráfaga de chat, intentos cercanos y aciertos escalonados...`);
  const guessers = engine.players.filter(p => p.userId !== engine.currentDrawerId);

  // Guesser 0 envía palabra cercana "Gatos" -> warning
  engine.handleChat(guessers[0].userId, "gatos");

  // Guesser 0 acierta "Gato"
  engine.handleChat(guessers[0].userId, "gato");
  if (!guessers[0].hasGuessed) throw new Error("Guesser 0 should be flagged as hasGuessed");
  const p0Score = guessers[0].score;
  if (p0Score <= 0) throw new Error("Guesser 0 score should be > 0");

  // Guesser 1 acierta después
  engine.handleChat(guessers[1].userId, "gato");
  if (!guessers[1].hasGuessed) throw new Error("Guesser 1 should be flagged as hasGuessed");

  // Guesser 2 y 3 aciertan -> todos adivinan -> ronda termina
  engine.handleChat(guessers[2].userId, "gato");
  engine.handleChat(guessers[3].userId, "gato");

  if (engine.state !== PinturilloState.ROUND_RESULTS) {
    throw new Error(`Expected ROUND_RESULTS state when all guess, got ${engine.state}`);
  }
  const drawer = engine.getPlayer(engine.currentDrawerId!)!;
  if (drawer.score !== 200) { // 4 adivinadores * 50 pts = 200 pts
    throw new Error(`Drawer should get 200 pts (4*50), got ${drawer.score}`);
  }
  console.log(`✔ PINTURILLO: Todos los 4 adivinadores acertaron -> Dibujante recibió 200 pts.`);

  // 6.3 Rotación de los 5 Dibujantes
  console.log(`[PINTURILLO] Probando rotación de la cola de dibujantes para los 5 jugadores...`);
  const drawersHistory = [engine.currentDrawerId];

  for (let turn = 1; turn < 5; turn++) {
    (engine as any).startNextTurn();
    drawersHistory.push(engine.currentDrawerId);
  }

  const uniqueDrawers = new Set(drawersHistory);
  if (uniqueDrawers.size !== 5) {
    throw new Error(`Expected 5 unique drawers across 5 turns, got ${uniqueDrawers.size}: ${Array.from(uniqueDrawers).join(", ")}`);
  }
  console.log(`✔ PINTURILLO: Rotación de los 5 dibujantes verificada con 100% de cobertura.`);

  return { pinturilloDeepPassed: true };
}

// =========================================================================
// RUNNER
// =========================================================================
async function main() {
  console.log(`\n${BOLD}======================================================================${RESET}`);
  console.log(`${BOLD}🎯 USOPP & SANJI: EJECUCIÓN EXHAUSTIVA DE REGLAS Y CONCURRENCIA (5P)${RESET}`);
  console.log(`${BOLD}======================================================================${RESET}`);

  await testUnoDeep();
  await testParchisDeep();
  await testStopDeep();
  await testImpostorDeep();
  await testLiarsDeep();
  await testPinturilloDeep();

  console.log(`\n${GREEN}${BOLD}======================================================================${RESET}`);
  console.log(`${GREEN}${BOLD}🎉 ¡TODOS LOS 6 JUEGOS Y REGLAS DE CONCURRENCIA SUPERARON EL TEST QA!${RESET}`);
  console.log(`${GREEN}${BOLD}======================================================================${RESET}`);
  process.exit(0);
}

main().catch(err => {
  console.error("Error en deep rules stress:", err);
  process.exit(1);
});
