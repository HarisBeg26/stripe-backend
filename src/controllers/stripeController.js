/**
 * Stripe Controller
 * 
 * Handles all Stripe-related operations including:
 * - Payment intent creation and processing
 * - Payment history retrieval
 * - Transaction status management
 * - Stripe Connect marketplace functionality
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Async Error Handler Wrapper
 * Automatically catches and forwards any async errors to Express error handler
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Create Payment Intent
 * 
 * Creates a Stripe Payment Intent for processing payments with application fees.
 * This supports marketplace functionality where the platform takes a 5% fee
 * and the remaining amount is transferred to the connected company account.
 * 
 * @route POST /api/stripe/create-payment-intent
 * @param {string} companyId - ID of the company receiving the payment
 * @param {number} amount - Payment amount in smallest currency unit (cents)
 * @param {string} currency - ISO currency code (e.g., 'usd', 'eur')
 * @param {string} customerId - Customer identifier
 * @param {string} description - Optional payment description
 * @param {object} metadata - Optional additional data
 */
exports.createPaymentIntent = asyncHandler(async (req, res) => {
    const { Company, PaymentTransaction } = req.db;
    const { description, metadata } = req.body;

    // Hardcoded values for testing
    const companyId = '1';
    const amount = 2000; // e.g., 20.00 USD
    const currency = 'usd';
    const customerId = 'cus_tester';
    const companyPackageId = 'pkg_12345';

    // Validate required fields
    if (!companyId || !amount || !currency || !customerId) {
        return res.status(400).json({ message: 'companyId, amount, currency, and customerId are required.' });
    }

    // Verify company exists and is connected to Stripe
    const company = await Company.findByPk(companyId);
    if (!company || !company.stripeAccountId) {
        return res.status(404).json({ message: 'Company not found or not connected to Stripe.' });
    }

    try {
        // Create Payment Intent with marketplace functionality
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: currency,
            payment_method_types: ['card'],
            application_fee_amount: Math.round(amount * 0.05), // 5% platform fee
            transfer_data: {
                destination: company.stripeAccountId, // Transfer funds to company account
            },
            description: description || `Payment for service from ${company.name}`,
            metadata: {
                ...metadata,
                companyId: company.id.toString(),
                customerId: customerId,
                companyPackageId: companyPackageId,
            }
        });

        // Store transaction record in database for tracking
        const newTransaction = await PaymentTransaction.create({
            companyId: company.id,
            customer: customerId,
            amount: amount,
            currency: currency,
            stripePaymentIntentId: paymentIntent.id,
            status: 'pending', // Initial status, will be updated by webhooks
            description: description,
            metadata: { ...metadata, customerId: customerId, companyPackageId: companyPackageId }
        });

        // Return client secret for frontend payment confirmation
        res.status(201).json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            message: 'Payment Intent created successfully. Confirm on frontend.'
        });

    } catch (error) {
        console.error('Error creating Stripe Payment Intent:', error);
        res.status(500).json({ message: 'Failed to create Payment Intent', error: error.message });
    }
});

exports.createSubscriptionCheckoutSession = asyncHandler(async (req, res) => {
    const { Company } = req.db;
    const { companyId, priceId } = req.body;

    if (!companyId || !priceId) {
        return res.status(400).json({ message: 'companyId and priceId are required.' });
    }

    const company = await Company.findByPk(companyId);
    if (!company) {
        return res.status(404).json({ message: 'Company not found.' });
    }

    let stripeCustomerId = company.stripeCustomerId;

    // Create a Stripe customer if one doesn't exist
    if (!stripeCustomerId) {
        try {
            const customer = await stripe.customers.create({
                email: company.email,
                name: company.name,
                metadata: {
                    companyId: company.id,
                },
            });
            stripeCustomerId = customer.id;
            company.stripeCustomerId = stripeCustomerId;
            await company.save();
        } catch (error) {
            console.error('Error creating Stripe customer:', error);
            return res.status(500).json({ message: 'Failed to create Stripe customer', error: error.message });
        }
    }

    try {
        // Create the subscription checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            customer: stripeCustomerId,
            success_url: `${process.env.FRONTEND_URL}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/subscription-canceled`,
            metadata: {
                companyId: company.id,
            }
        });

        res.status(200).json({ sessionId: session.id, url: session.url });

    } catch (error) {
        console.error('Error creating Stripe Checkout session:', error);
        res.status(500).json({ message: 'Failed to create Checkout session', error: error.message });
    }
});

/**
 * Get Payment History
 * 
 * Retrieves the payment history for a specific company, with optional filters.
 * Supports filtering by status, internal status, and customer ID.
 * 
 * @route GET /api/stripe/transactions/company/:companyId
 * @param {string} companyId - ID of the company
 * @query {string} status - Filter by payment status (pending, succeeded, failed, etc.)
 * @query {string} internalStatus - Filter by internal status (awaiting_approval, approved, etc.)
 * @query {string} customerId - Filter by specific customer
 * @query {number} limit - Number of records to return (default: 10)
 * @query {number} offset - Number of records to skip for pagination (default: 0)
 */
exports.getPaymentHistory = asyncHandler(async (req, res) => {
    const { PaymentTransaction, Company } = req.db;
    const { companyId } = req.params;
    const { status, internalStatus, customerId, limit = 10, offset = 0 } = req.query;

    // Validate company ID is provided
    if(!companyId) {
        return res.status(400).json({ message: 'Company ID is required.'});
    }

    // Verify company exists
    const company = await Company.findByPk(companyId);
    if(!company) {
        return res.status(404).json({ message: 'Company not found'});
    }

    // Build dynamic WHERE clause based on query parameters
    const whereClause = { companyId: companyId };

    // Apply optional filters
    if(status) {
        whereClause.status = status;
    }
    if(internalStatus) {
        whereClause.internalStatus = internalStatus;
    }
    if(customerId) {
        whereClause.customer = customerId;
    }

    // Fetch transactions with pagination and sorting
    const transactions = await PaymentTransaction.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']] // Most recent transactions first
    });

    // Return only the transaction records (not the count metadata)
    res.status(200).json(transactions.rows);
});

/**
 * Update Transaction Internal Status
 * 
 * Updates the internal business status of a payment transaction.
 * This is separate from Stripe's payment status and used for internal workflow management.
 * 
 * @route PUT /api/stripe/transactions/:transactionId/internal-status
 * @param {string} transactionId - ID of the transaction to update
 * @body {string} internalStatus - New internal status
 * @body {string} notes - Optional notes about the status change
 */
exports.updateTransactionInternalStatus = asyncHandler(async (req, res) => {
    const { PaymentTransaction } = req.db;
    const { transactionId } = req.params;
    const { internalStatus, notes } = req.body;

    // Define allowed internal status values
    const allowedInternalStatuses = ['awaiting_approval', 'approved', 'declined', 'fulfilled', 'canceled_by_business'];
    
    // Validate internal status
    if (!internalStatus || !allowedInternalStatuses.includes(internalStatus)) {
        return res.status(400).json({ 
            message: `Invalid or missing internalStatus. Must be one of: ${allowedInternalStatuses.join(', ')}` 
        });
    }

    // Find the transaction to update
    const transaction = await PaymentTransaction.findByPk(transactionId);
    if (!transaction) {
        return res.status(404).json({ message: 'Payment transaction not found.' });
    }

    // Update the transaction
    transaction.internalStatus = internalStatus;
    if (notes) {
        // Preserve existing metadata and add internal notes
        transaction.metadata = { ...transaction.metadata, internalNotes: notes };
    }

    await transaction.save();

    res.status(200).json({
        message: `Transaction ${transactionId} internal status updated to ${internalStatus}`,
        transaction: transaction
    });
});

/**
 * Get Transaction by ID
 * 
 * Retrieves detailed information for a specific payment transaction.
 * 
 * @route GET /api/stripe/transactions/:transactionId
 * @param {string} transactionId - ID of the transaction to retrieve
 */
exports.getTransactionById = asyncHandler(async (req, res) => {
    const { PaymentTransaction } = req.db;
    // Validate transaction ID parameter
    if (!transactionId) {
        return res.status(400).json({ message: 'Transaction ID is required.' });
    }

    // Find and return the transaction
    const transaction = await PaymentTransaction.findByPk(transactionId);
    if (!transaction) {
        return res.status(404).json({ message: 'Payment transaction not found.' });
    }

    res.status(200).json(transaction);
});

/**
 * Test Payment Transaction Table
 * 
 * Development/testing endpoint to verify database connectivity and table structure.
 * Returns basic statistics about the PaymentTransaction table.
 * 
 * @route GET /api/stripe/test-payment-table
 * @access Development only - should be removed or secured in production
 */
exports.testPaymentTransactionTable = asyncHandler(async (req, res) => {
    const { PaymentTransaction } = req.db;
    
    try {
        // Simple test - count total rows in the table
        const count = await PaymentTransaction.count();
        console.log('PaymentTransaction table row count:', count);
        
        res.status(200).json({
            message: 'PaymentTransaction table test successful',
            rowCount: count,
            tableName: PaymentTransaction.tableName,
            modelName: PaymentTransaction.name
        });
    } catch (error) {
        console.error('PaymentTransaction table test error:', error);
        res.status(500).json({
            message: 'PaymentTransaction table test failed',
            error: error.message,
            stack: error.stack
        });
    }
});

/**
 * Cancel Subscription
 * 
 * Cancels an active Stripe subscription by its ID.
 * This action is permanent and cannot be undone.
 * 
 * @route DELETE /api/stripe/subscriptions/:subscriptionId
 * @param {string} subscriptionId - The ID of the Stripe subscription to cancel.
 */
exports.cancelSubscription = asyncHandler(async (req, res) => {
    const { PaymentTransaction } = req.db;
    const { subscriptionId } = req.params;

    if (!subscriptionId) {
        return res.status(400).json({ message: 'Subscription ID is required.' });
    }

    try {
        // Cancel the subscription on Stripe
        const canceledSubscription = await stripe.subscriptions.del(subscriptionId);

        // Find the local transaction record to update its metadata
        const transaction = await PaymentTransaction.findOne({ where: { stripeSubscriptionId: subscriptionId } });

        if (transaction) {
            // Update the local transaction record associated with this subscription
            await transaction.update({
                status: 'canceled',
                internalStatus: 'canceled_by_user',
                metadata: { ...transaction.metadata, cancellationTimestamp: new Date().toISOString() }
            });
        }

        res.status(200).json({
            message: 'Subscription canceled successfully.',
            subscription: canceledSubscription
        });

    } catch (error) {
        console.error('Error canceling Stripe subscription:', error);
        // Handle cases where the subscription might not be found or other Stripe errors
        if (error.type === 'StripeInvalidRequestError') {
            return res.status(404).json({ message: 'Subscription not found or already canceled.', error: error.message });
        }
        res.status(500).json({ message: 'Failed to cancel subscription', error: error.message });
    }
});