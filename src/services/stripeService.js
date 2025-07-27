const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const companyRepository = require('../repositories/companyRepo');

class StripeService {
    async createOnboardingLink(companyId) {
        console.log(`SERVICE: Creating onboarding link for company ID: ${companyId}`);
        const company = await companyRepository.findById(companyId);
        if (!company) {
            throw new Error('Company not found');
        }

        let accountId = company.stripe_account_id;
        if (!accountId) {
            const account = await stripe.accounts.create({type: 'standard' });
            accountId = account.id;
            await companyRepository.updateStripeId(companyId, accountId);
        }

        console.log('--- DEBUGGING STRIPE OBJECT ---');
        console.log('Is stripe.accountLinks defined?', stripe.accountLinks);

        const accountLink = await stripe.accountLInks.create({
            account: accountId,
            refresh_url: `http://localhost:4001/api/stripe/reauth/${companyId}`,
            return_url: 'http://localhost:3000/settings?stripe_return=true',
            type: 'account_onboarding',
        });

        return accountLink.url;
    }

    async createCheckoutSession(reservationId) {
        console.log(`SERVICE: Creating checkout session for reservation ${reservationId}`);

        const mockReservation = { price: 5000, serviceName: 'Barista Training'};
        const company = await companyRepository.findById('company-123');

        if(!company || !company.stripe_account_id) {
            throw new Error('Company is not configured for payments.');
        }

        const applicationFee = Math.round(mockReservation.price * 0.05);

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: mockReservation.serviceName,
                    },
                    unit_amount: mockReservation.price,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `http://localhost:3000/success`,
            cancel_url: `http://localhost:3000/cancel`,
            payment_intent_data: {
                destination: company.stripe_account_id,
                application_fee_amount: applicationFee,
            },
            metadata: {
                reservationId: reservationId,
                companyId: company.id
            }
        });
        return session;
    }
}

module.exports = new StripeService();