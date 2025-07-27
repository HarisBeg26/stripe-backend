const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

exports.createPaymentIntent = asyncHandler(async (req, res) => {
    const { Company, PaymentTransaction } = req.db;
    const { companyId, amount, currency, customerId, description, metadata } = req.body;

    if (!companyId || !amount || !currency || !customerId) {
        return res.status(400).json({ message: 'companyId, amount, currency, and customerId are required.' });
    }

    const company = await Company.findByPk(companyId);
    if (!company || !company.stripeAccountId) {
        return res.status(404).json({ message: 'Company not found or not connected to Stripe.' });
    }

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: currency,
            payment_method_types: ['card'],
            application_fee_amount: Math.round(amount * 0.05),
            transfer_data: {
                destination: company.stripeAccountId,
            },
            description: description || `Payment for service from ${company.name}`,
            metadata: {
                ...metadata,
                companyId: company.id.toString(),
                customerId: customerId,
            }
        });

        const newTransaction = await PaymentTransaction.create({
            companyId: company.id,
            customer: customerId,
            amount: amount,
            currency: currency,
            stripePaymentIntentId: paymentIntent.id,
            status: 'pending',
            description: description,
            metadata: { ...metadata, customerId: customerId }
        });

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

exports.getPaymentHistory = asyncHandler(async (req, res) => {
    const { PaymentTransaction, Company } = req.db;
    const { companyId } = req.params;
    const { status, internalStatus, customerId, limit = 10, offset = 0 } = req.query;

    if(!companyId) {
        return res.status(400).json({ message: 'Company ID is required.'});
    }

    const company = await Company.findByPk(companyId);
    if(!company) {
        return res.status(404).json({ message: 'Company not found'});
    }

    const whereClause = { companyId: companyId};

    if(status) {
        whereClause.status = status;
    }
    if(internalStatus) {
        whereClause.internalStatus = internalStatus;
    }
    if(customerId) {
        whereClause.customer = customerId;
    }

    const transactions = await PaymentTransaction.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']],
        include: [{
            model: Company,
            attributes: ['id', 'name', 'email']
        }]
    });

    res.status(200).json({
        total: transactions.count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        data: transactions.rows
    });
});

exports.updateTransactionInternalStatus = asyncHandler(async (req, res) => {
    const { PaymentTransaction } = req.db;
    const { transactionId } = req.params;
    const { internalStatus, notes } = req.body;

    const allowedInternalStatuses = ['awaiting_approval', 'approved', 'declined', 'fulfilled', 'canceled_by_business'];
    if (!internalStatus || !allowedInternalStatuses.includes(internalStatus)) {
        return res.status(400).json({ message: `Invalid or missing internalStatus. Must be one of: ${allowedInternalStatuses.join(', ')}` });
    }

    const transaction = await PaymentTransaction.findByPk(transactionId);

    if (!transaction) {
        return res.status(404).json({ message: 'Payment transaction not found.' });
    }

    transaction.internalStatus = internalStatus;
    if (notes) {
        transaction.metadata = { ...transaction.metadata, internalNotes: notes };
    }

    await transaction.save();

    res.status(200).json({
        message: `Transaction ${transactionId} internal status updated to ${internalStatus}`,
        transaction: transaction
    });
});