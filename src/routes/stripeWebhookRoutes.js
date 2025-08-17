/**
 * Stripe Webhook Routes
 * 
 * Handles incoming webhook events from Stripe to keep the application
 * synchronized with Stripe's records.
 * 
 * IMPORTANT: This route uses express.raw() middleware instead of express.json()
 * because Stripe requires the raw request body for signature verification.
 * 
 * The webhook endpoint should be registered in Stripe Dashboard with the URL:
 * https://yourdomain.com/api/stripe/webhook
 */

const express = require('express');
const router = express.Router();
const stripeWebhookController = require('../controllers/stripeWebhookController');

/**
 * POST /api/stripe/webhook
 * 
 * Receives and processes webhook events from Stripe.
 * 
 * Security:
 * - Verifies webhook signature using STRIPE_WEBHOOK_SECRET
 * - Rejects requests that fail signature verification
 * 
 * Processed Events:
 * - payment_intent.succeeded/failed
 * - checkout.session.completed
 * - customer.subscription.created/updated/deleted
 * - invoice.paid/payment_failed
 * 
 * Note: express.raw() middleware is required for signature verification
 */
router.post('/', express.raw({ type: 'application/json' }), stripeWebhookController.handleWebhook);

module.exports = router;