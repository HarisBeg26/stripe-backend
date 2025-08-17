/**
 * Stripe API Routes
 * 
 * Defines REST API endpoints for Stripe payment operations:
 * - Payment intent creation
 * - Payment history and transaction management
 * - Transaction status updates
 * - Development/testing endpoints
 * 
 * All routes are prefixed with /api/stripe when mounted in app.js
 */

const express = require('express');
const router = express.Router();
const stripeController = require('../controllers/stripeController');
const { parseGatewayHeaders, authorizeCompanyAccess } = require('../middleware/gatewayAuth');

/**
 * POST /api/stripe/create-payment-intent
 * Creates a new Stripe Payment Intent for processing payments
 * Body: { companyId, amount, currency, customerId, description?, metadata? }
 */
router.post('/create-payment-intent', parseGatewayHeaders, stripeController.createPaymentIntent);
router.post('/create-subscription-checkout', parseGatewayHeaders, stripeController.createSubscriptionCheckoutSession);

/**
 * GET /api/stripe/transactions/company/:companyId
 * Retrieves payment history for a specific company
 * Query params: status, internalStatus, customerId, limit, offset
 */
router.get('/transactions/company/:companyId', [parseGatewayHeaders, authorizeCompanyAccess], stripeController.getPaymentHistory);

/**
 * GET /api/stripe/transactions/:transactionId
 * Retrieves detailed information for a specific transaction
 */
router.get('/transactions/:transactionId', parseGatewayHeaders, stripeController.getTransactionById);

/**
 * PUT /api/stripe/transactions/:transactionId/internal-status
 * Updates the internal business status of a payment transaction
 * Body: { internalStatus, notes? }
 */
router.put('/transactions/:transactionId/internal-status', parseGatewayHeaders, stripeController.updateTransactionInternalStatus);

/**
 * GET /api/stripe/test-payment-table
 * Development endpoint to test PaymentTransaction table connectivity
 * Should be removed or secured in production
 */
router.get('/test-payment-table', stripeController.testPaymentTransactionTable);

/**
 * DELETE /api/stripe/subscriptions/:subscriptionId
 * Cancels a Stripe subscription.
 */
router.delete('/subscriptions/:subscriptionId', parseGatewayHeaders, stripeController.cancelSubscription);

module.exports = router;