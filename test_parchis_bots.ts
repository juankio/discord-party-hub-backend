import { ParchisEngine } from './src/games/parchis/ParchisEngine.js';
import { ParchisBot } from './src/core/bots/parchis/ParchisBot.js';

async function run() {
  console.log("Starting Parchis test with 4 bots...");
  const engine = new ParchisEngine('test-parchis');
  
  const bot1 = new ParchisBot({ difficultyLevel: 1, roomId: 'test-parchis', gameType: 'parchis' }, 'Bot 1', 1, 'red');
  const bot2 = new ParchisBot({ difficultyLevel: 5, roomId: 'test-parchis', gameType: 'parchis' }, 'Bot 2', 2, 'blue');
  const bot3 = new ParchisBot({ difficultyLevel: 8, roomId: 'test-parchis', gameType: 'parchis' }, 'Bot 3', 3, 'green');
  const bot4 = new ParchisBot({ difficultyLevel: 10, roomId: 'test-parchis', gameType: 'parchis' }, 'Bot 4', 4, 'yellow');

  engine.addPlayer(bot1.userId, 'socket1', 'Bot 1', 1, 'red');
  engine.addPlayer(bot2.userId, 'socket2', 'Bot 2', 2, 'blue');
  engine.addPlayer(bot3.userId, 'socket3', 'Bot 3', 3, 'green');
  engine.addPlayer(bot4.userId, 'socket4', 'Bot 4', 4, 'yellow');

  const bots = [bot1, bot2, bot3, bot4];

  for (let i = 0; i < bots.length; i++) {
    bots[i].setEngine(engine);
  }

  engine.on('game_state_update', (data) => {
    const { state } = data;
    if (state.state === 'FINISHED') {
      console.log(`\n=== GAME OVER! WINNER: ${state.winner} ===\n`);
      process.exit(0);
    }
  });

  engine.startGame({ parchisBoardSize: 4, diceCount: 1, tokensPerPlayer: 4 });
}

run().catch(console.error);
