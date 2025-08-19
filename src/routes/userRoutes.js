const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');
const { authenticateToken, requireRole, requireCompanyAccess } = require('../middleware/auth');

// Public routes (no authentication required)
router.post('/register', userController.registerUser);
router.post('/login', userController.loginUser);
router.post('/forgot-password', authController.requestPasswordReset);
router.post('/reset-password', authController.resetPassword);

// Protected routes (authentication required)
router.get('/me', authenticateToken, userController.getCurrentUser);
router.post('/change-password', authenticateToken, authController.changePassword);
router.get('/payment-history', authenticateToken, userController.getUserPaymentHistory);
router.get('/:id', authenticateToken, requireCompanyAccess, userController.getUserById);

module.exports = router;
