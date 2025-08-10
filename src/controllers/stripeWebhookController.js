
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');


const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function getAccessLevelFromStripePlan(stripePriceId) {
    switch (stripePriceId) {
        case process.env.STRIPE_PRICE_BASIC_PLAN_ID:
            return 'basic';
        case process.env.STRIPE_PRICE_PREMIUM_PLAN_ID:
            return 'premium';
        default:
            return 'free';
    }
}

/**
 * Updates a Company's subscription status in the database.
 * @param {object} CompanyModel The Sequelize Company model.
 * @param {string} stripeCustomerId The Stripe Customer ID.
 * @param {object} subscriptionData The Stripe Subscription object data.
 */
async function updateCompanySubscriptionStatus(CompanyModel, stripeCustomerId, subscriptionData) {
    try {
        const company = await CompanyModel.findOne({ where: { stripeCustomerId: stripeCustomerId } });

        if (!company) {
            console.warn(`Company with Stripe Customer ID ${stripeCustomerId} not found in DB. Cannot update subscription status.`);
            return;
        }

        console.log(`Attempting to update subscription for company: ${company.name} (ID: ${company.id})`);

        const newStatus = subscriptionData.status;
        const stripeSubscriptionId = subscriptionData.id;
        const currentPeriodEnd = subscriptionData.current_period_end ? new Date(subscriptionData.current_period_end * 1000) : null;
        let newAccessLevel = 'free';

        if (subscriptionData.items && subscriptionData.items.data.length > 0) {
            newAccessLevel = getAccessLevelFromStripePlan(subscriptionData.items.data[0].price.id);
        }
        if (newStatus === 'canceled' || newStatus === 'unpaid') {
            newAccessLevel = 'free';
        }

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

exports.handleWebhook = asyncHandler(async (req, res) => {
    const { Company, PaymentTransaction } = req.db;
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error(`Webhook Signature Verification Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`--- Received Stripe event type: ${event.type} ---`);

    const dataObject = event.data.object;
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

    switch (event.type) {
        case 'checkout.session.completed':
            if (dataObject.mode === 'subscription' && dataObject.subscription) {
                console.log(`   Checkout session completed for subscription: ${dataObject.subscription}`);
                const subscription = await stripe.subscriptions.retrieve(dataObject.subscription);
                await updateCompanySubscriptionStatus(Company, subscription.customer, subscription);
            } else if (dataObject.mode === 'payment' && dataObject.payment_intent) {
                console.log(`   Checkout session completed for one-time payment: ${dataObject.payment_intent}`);
                await PaymentTransaction.update(
                    {
                        status: 'succeeded',
                        internalStatus: 'awaiting_approval'
                    },
                    { where: { stripePaymentIntentId: dataObject.payment_intent } }
                );
            }
            break;

        case 'customer.subscription.created':
            console.log('   New subscription created:', dataObject.id);
            await updateCompanySubscriptionStatus(Company, dataObject.customer, dataObject);
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