import express from 'express';
import { register, login, verifyEmailCognito  } from '../controllers/authController.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/verify-cognito-email', verifyEmailCognito);

export default router;