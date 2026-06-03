import { Router } from 'express';
import { googleLogin, googleCallback, updateProfile } from '../controllers/auth.controller.js';

const router = Router();

router.get('/google/login', googleLogin);
router.get('/google/callback', googleCallback);
router.post('/update', updateProfile);

export default router;
