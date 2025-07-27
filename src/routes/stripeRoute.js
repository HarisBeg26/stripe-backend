const express = require('express');
const router = express.Router();
const stripeController = require('../controllers/stripeController');

router.post('/create-payment-intent', stripeController.createPaymentIntent);
router.get('/history/:companyId', stripeController.getPaymentHistory);
router.put('/transactions/:transactionId/status', stripeController.updateTransactionInternalStatus);


module.exports = router;