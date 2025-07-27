const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

exports.handleWebhook = asyncHandler(async (req, res) => {
    const { Company, PaymentTransaction } = req.db;
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`⚠️ Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntentSucceeded = event.data.object;
            console.log(`PaymentIntent successful: ${paymentIntentSucceeded.id}`);
            await PaymentTransaction.update(
                {
                    status: 'succeeded',
                    internalStatus: 'awaiting_approval'
                },
                { where: { stripePaymentIntentId: paymentIntentSucceeded.id } }
            );
            break;

        case 'payment_intent.payment_failed':
            const paymentIntentFailed = event.data.object;
            console.log(`PaymentIntent failed: ${paymentIntentFailed.id}`);
            await PaymentTransaction.update(
                {
                    status: 'failed',
                    internalStatus: 'declined'
                },
                { where: { stripePaymentIntentId: paymentIntentFailed.id } }
            );
            break;

        default:
            console.log(`Unhandled event type ${event.type}`);
    }
    res.json({ received: true });
});