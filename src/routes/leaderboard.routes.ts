import { Router } from 'express';
import { getTopPlayers } from '../controllers/leaderboard.controller.js';

const router = Router();

router.get('/top', getTopPlayers);

export default router;
