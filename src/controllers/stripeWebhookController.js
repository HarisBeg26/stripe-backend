
/**
 * Stripe Webhook Controller
 * 
 * Handles incoming webhook events from Stripe to keep the application state
 * synchronized with Stripe's records. This includes:
 * - Payment status updates
 * - Subscription lifecycle events
 * - Invoice payment notifications
 * - Customer updates
 * 
 * Security: All webhook events are verified using Stripe's signature
 * to ensure they originated from Stripe and haven't been tampered with.
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');

/**
 * Async Error Handler Wrapper
 * Automatically catches and forwards any async errors to Express error handler
 */
const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// Stripe webhook endpoint secret for signature verification
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * Maps Stripe Price IDs to Access Levels
 * 
 * Determines the access level based on the Stripe subscription plan.
 * This is used for subscription-based access control.
 * 
 * @param {string} stripePriceId - The Stripe Price ID from the subscription
 * @returns {string} Access level (basic, premium, or free)
 */
function getAccessLevelFromStripePlan(stripePriceId) {
    switch (stripePriceId) {
        case process.env.STRIPE_PRICE_BASIC_PLAN_ID:
            return 'basic';
        case process.env.STRIPE_PRICE_PREMIUM_PLAN_ID:
            return 'premium';
        default:
            return 'free'; // Default access level
    }
}

/**
 * Updates Company Subscription Status
 * 
 * Synchronizes local database with Stripe subscription data.
 * This function is called whenever subscription-related events occur.
 * 
 * @param {object} CompanyModel - Sequelize Company model
 * @param {string} stripeCustomerId - Stripe Customer ID
 * @param {object} subscriptionData - Stripe Subscription object data
 */
async function updateCompanySubscriptionStatus(CompanyModel, stripeCustomerId, subscriptionData) {
    try {
        // Find the company by their Stripe Customer ID
        const company = await CompanyModel.findOne({ where: { stripeCustomerId: stripeCustomerId } });

        if (!company) {
            console.warn(`Company with Stripe Customer ID ${stripeCustomerId} not found in DB. Cannot update subscription status.`);
            return;
        }

        console.log(`Attempting to update subscription for company: ${company.name} (ID: ${company.id})`);

        // Extract subscription details
        const newStatus = subscriptionData.status;
        const stripeSubscriptionId = subscriptionData.id;
        // Convert Unix timestamp to JavaScript Date
        const currentPeriodEnd = subscriptionData.current_period_end ? new Date(subscriptionData.current_period_end * 1000) : null;
        let newAccessLevel = 'free'; // Default access level

        // Determine access level from subscription plan
        if (subscriptionData.items && subscriptionData.items.data.length > 0) {
            newAccessLevel = getAccessLevelFromStripePlan(subscriptionData.items.data[0].price.id);
        }
        
        // Override access level for canceled or unpaid subscriptions
        if (newStatus === 'canceled' || newStatus === 'unpaid') {
            newAccessLevel = 'free';
        }

        // Update company record in database
        await company.update({
            stripeSubscriptionId: stripeSubscriptionId,
            subscriptionStatus: newStatus,
            accessLevel: newAccessLevel,
            subscriptionExpiresAt: currentPeriodEnd
        });

        console.log(`✅ Successfully updated subscription for ${company.name}: Status=${newStatus}, Access=${newAccessLevel}`);

    } catch (error) {
        console.error('Error updating company subscription status in DB:', error);
    }
}

/**
 * Main Webhook Handler
 * 
 * Processes incoming webhook events from Stripe. This function:
 * 1. Verifies the webhook signature for security
 * 2. Parses the event data
 * 3. Routes to appropriate handlers based on event type
 * 4. Updates local database records to stay in sync with Stripe
 * 5. Optionally sends notifications or logs events
 * 
 * @route POST /api/stripe/webhook
 */
exports.handleWebhook = asyncHandler(async (req, res) => {
    const { Company, PaymentTransaction } = req.db;
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // Verify webhook signature to ensure request came from Stripe
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error(`Webhook Signature Verification Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`--- Received Stripe event type: ${event.type} ---`);

    // Extract the main data object from the event
    const dataObject = event.data.object;
    
    // Optional: Log webhook events to external logging service
    if (process.env.LOGGING_SERVICE_URL) {
        try {
            await axios.post(process.env.LOGGING_SERVICE_URL, {
                event: `Stripe Webhook Received`,
                details: {
                    eventType: event.type,
                    eventId: event.id,
                    stripeCustomerId: dataObject.customer || dataObject.id,
                    livemode: event.livemode,
                    dataObjectId: dataObject.id
                }
            });
            console.log('   (Logged webhook event to external logging service)');
        } catch (logErr) {
            console.error('   Error sending webhook event to logging service:', logErr.message);
        }
    }

    // Process webhook events based on type
    switch (event.type) {
        /**
         * Checkout Session Completed
         * Fired when a customer completes a Checkout session.
         * Handles both subscription and one-time payment completions.
         */
        case 'checkout.session.completed':
            if (dataObject.mode === 'subscription' && dataObject.subscription) {
                console.log(`   Checkout session completed for subscription: ${dataObject.subscription}`);
                // Retrieve full subscription details and update company status
                const subscription = await stripe.subscriptions.retrieve(dataObject.subscription);
                await updateCompanySubscriptionStatus(Company, subscription.customer, subscription);
            } else if (dataObject.mode === 'payment' && dataObject.payment_intent) {
                console.log(`   Checkout session completed for one-time payment: ${dataObject.payment_intent}`);
                // Update payment transaction status for one-time payments
                await PaymentTransaction.update(
                    {
                        status: 'succeeded',
                        internalStatus: 'awaiting_approval'
                    },
                    { where: { stripePaymentIntentId: dataObject.payment_intent } }
                );
            }
            break;

        /**
         * Subscription Created
         * Fired when a new subscription is created.
         * Updates company subscription status and sends welcome notification.
         */
        case 'customer.subscription.created':
            console.log('   New subscription created:', dataObject.id);
            await updateCompanySubscriptionStatus(Company, dataObject.customer, dataObject);
            
            // Optional: Send welcome notification
            if (process.env.NOTIFICATION_SERVICE_URL) {
                try {
                    await axios.post(process.env.NOTIFICATION_SERVICE_URL, {
                        type: 'email',
                        recipient: dataObject.customer_email || 'admin@example.com',
                        message: `Welcome! Your subscription for plan ${dataObject.items.data[0].price.id} is now active.`
                    });
                    console.log('      (Sent notification for subscription creation)');
                } catch (notifyErr) {
                    console.error('      Error sending notification for subscription creation:', notifyErr.message);
                }
            }
            break;

        case 'customer.subscription.updated':
            console.log('   Subscription updated:', dataObject.id, 'Status:', dataObject.status);
            await updateCompanySubscriptionStatus(Company, dataObject.customer, dataObject);
            break;

        case 'customer.subscription.deleted':
            console.log('   Subscription deleted:', dataObject.id);
            await updateCompanySubscriptionStatus(Company, dataObject.customer, {
                id: dataObject.id,
                status: 'canceled',
                items: { data: [{ price: { id: process.env.STRIPE_PRICE_BASIC_PLAN_ID || 'free' } }] },
                current_period_end: Math.floor(Date.now() / 1000)
            });
            if (process.env.NOTIFICATION_SERVICE_URL) {
                try {
                    await axios.post(process.env.NOTIFICATION_SERVICE_URL, {
                        type: 'email',
                        recipient: dataObject.customer_email || 'admin@example.com',
                        message: `Your subscription has been canceled.`
                    });
                    console.log('      (Sent notification for subscription deletion)');
                } catch (notifyErr) {
                    console.error('      Error sending notification for subscription deletion:', notifyErr.message);
                }
            }
            break;

        case 'invoice.paid':
            if (dataObject.billing_reason === 'subscription_create' || dataObject.billing_reason === 'subscription_cycle') {
                console.log('   Invoice paid for subscription:', dataObject.subscription);
                const subscription = await stripe.subscriptions.retrieve(dataObject.subscription);
                await updateCompanySubscriptionStatus(Company, subscription.customer, subscription);
            } else {
                console.log('   Invoice paid for other reason:', dataObject.id);
            }
            break;

        case 'invoice.payment_failed':
            console.log('   Invoice payment failed:', dataObject.id);
            if (dataObject.subscription) {
                const subscription = await stripe.subscriptions.retrieve(dataObject.subscription);
                await updateCompanySubscriptionStatus(Company, subscription.customer, subscription);
                if (process.env.NOTIFICATION_SERVICE_URL) {
                    await axios.post(process.env.NOTIFICATION_SERVICE_URL, {
                        type: 'email',
                        recipient: dataObject.customer_email || 'company_contact@example.com',
                        message: `Your payment for subscription ${subscription.id} failed. Please update your payment method.`
                    });
                    console.log('      (Sent notification for payment failure)');
                }
            }
            break;

        case 'payment_intent.succeeded':
            const paymentIntentSucceeded = dataObject;
            console.log(`   PaymentIntent successful: ${paymentIntentSucceeded.id}`);
            await PaymentTransaction.update(
                {
                    status: 'succeeded',
                    internalStatus: 'awaiting_approval'
                },
                { where: { stripePaymentIntentId: paymentIntentSucceeded.id } }
            );

            // Call the external billing service to create a billing record
            // try {
            //     const billingServiceUrl = `${process.env.BILLING_SERVICE_URL}`;
            //     const metadata = paymentIntentSucceeded.metadata || {};

            //     const billingPayload = {
            //         amount: paymentIntentSucceeded.amount,
            //         date: new Date().toISOString(),
            //         companyServiceId: metadata.companyServiceId ? parseInt(metadata.companyServiceId, 10) : null,
            //         companyPackageId: parseInt(metadata.companyPackageId, 10) || 999
            //     };

            //     console.log(`   Calling billing service at ${billingServiceUrl} with payload:`, billingPayload);
            //     await axios.post(billingServiceUrl, billingPayload, {
            //         headers: {
            //             'Authorization': `Bearer ${process.env.BILLING_SERVICE_TOKEN}`
            //         }
            //     });
            //     console.log('   ✅ Successfully created billing record.');
            // } catch (billingError) {
            //     console.error('   Error calling the billing service:', billingError.response ? billingError.response.data : billingError.message);
            // }
            break;

        case 'payment_intent.payment_failed':
            const paymentIntentFailed = dataObject;
            console.log(`   PaymentIntent failed: ${paymentIntentFailed.id}`);
            await PaymentTransaction.update(
                {
                    status: 'failed',
                    internalStatus: 'declined'
                },
                { where: { stripePaymentIntentId: paymentIntentFailed.id } }
            );
            break;

        default:
            console.log(`Unhandled event type ${event.type}. Data:`, dataObject);
    }
    res.json({ received: true });
});