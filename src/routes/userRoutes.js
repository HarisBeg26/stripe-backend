const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const gatewayAuth = require('../middleware/gatewayAuth');

router.post('/register', userController.registerUser);

router.get('/payment-history', gatewayAuth.parseGatewayHeaders, userController.getUserPaymentHistory);

router.get('/:id', gatewayAuth.parseGatewayHeaders, userController.getUserById);

module.exports = router;
