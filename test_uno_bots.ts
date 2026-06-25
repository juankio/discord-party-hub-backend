import { UnoEngine } from './src/games/uno/UnoEngine.js';
import { UnoBot } from './src/core/bots/uno/UnoBot.js';

async function run() {
  console.log("Starting Uno test with 4 bots...");
  const engine = new UnoEngine('test-game');
  
  const bot1 = new UnoBot({ difficultyLevel: 1, roomId: 'test-game', gameType: 'uno' }, 'Bot 1', 1, 'red');
  const bot2 = new UnoBot({ difficultyLevel: 5, roomId: 'test-game', gameType: 'uno' }, 'Bot 2', 2, 'blue');
  const bot3 = new UnoBot({ difficultyLevel: 8, roomId: 'test-game', gameType: 'uno' }, 'Bot 3', 3, 'green');
  const bot4 = new UnoBot({ difficultyLevel: 10, roomId: 'test-game', gameType: 'uno' }, 'Bot 4', 4, 'yellow');

  engine.addPlayer(bot1.userId, 'socket1', 'Bot 1', 1, 'red');
  engine.addPlayer(bot2.userId, 'socket2', 'Bot 2', 2, 'blue');
  engine.addPlayer(bot3.userId, 'socket3', 'Bot 3', 3, 'green');
  engine.addPlayer(bot4.userId, 'socket4', 'Bot 4', 4, 'yellow');

  const bots = [bot1, bot2, bot3, bot4];

  // Set the engine for the bots
  for (let i = 0; i < bots.length; i++) {
    bots[i].setEngine(engine);
  }

  // Hook up engine events to bots
  engine.on('game_action', (data) => console.log('Action:', data));
  engine.on('game_message', (data) => console.log('Message:', data));
  
  engine.on('game_state_update', (data) => {
    const { state } = data;
    if (state.state === 'FINISHED') {
      console.log(`\n=== GAME OVER! WINNER: ${state.winner} ===\n`);
      process.exit(0);
    }
  });

  engine.startGame({ 
    stackDrawCards: true, 
    drawUntilPlayable: false, 
    playMultipleSame: false, 
    interceptExact: false, 
    zeroAndSevenRules: true 
  });
}

run().catch(console.error);