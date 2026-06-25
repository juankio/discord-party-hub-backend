import { exec } from 'child_process';

exec('bun run test_uno_bots.ts', { cwd: '/home/juankio/discord-party-hub-backend' }, (err, stdout, stderr) => {
  console.log('STDOUT:');
  console.log(stdout);
  console.log('STDERR:');
  console.error(stderr);
  if (err) {
    console.error('ERROR:', err);
  }
});