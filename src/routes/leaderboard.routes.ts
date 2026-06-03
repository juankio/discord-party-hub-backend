import { Router } from 'express';
import { registerWin } from '../controllers/leaderboard.controller.js';

const router = Router();

router.post('/win', registerWin);

export default router;

import { getTopPlayers } from '../controllers/leaderboard.controller.js';

router.get('/top', getTopPlayers);
