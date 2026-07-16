// src/routes/scanner.routes.js
import express from 'express';
import * as scannerController from '../controllers/scanner.controller.js';

const router = express.Router();

router.get('/', scannerController.renderLogin);
router.post('/login', scannerController.login);
router.get('/logout', scannerController.logout);
router.get('/event/:eventId', scannerController.renderDashboard);
router.get('/api/verify/:bookingRef', scannerController.verifyTicket);
router.post('/api/checkin', scannerController.checkInTicket);

export default router;
