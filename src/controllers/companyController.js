const { Op } = require('sequelize');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

exports.getAllCompanies = asyncHandler(async (req, res) => {
    const { Company } = req.db;
    const companies = await Company.findAll();
    res.status(200).json(companies);
});

exports.getCompanyById = asyncHandler(async (req, res) => {
    console.log('=== DEBUG getCompanyById ===');
    console.log('Full req.params object:', JSON.stringify(req.params));
    console.log('req.params.id:', req.params ? req.params.id : 'req.params is undefined');
    console.log('req.url:', req.url);
    console.log('req.method:', req.method);
    console.log('Keys in req:', Object.keys(req));
    console.log('=============================');
    
    if (!req.params || !req.params.id) {
        return res.status(400).json({ 
            message: 'Missing company ID parameter',
            debug: {
                params: req.params,
                url: req.url
            }
        });
    }
    
    const { Company } = req.db;
    const company = await Company.findByPk(req.params.id);
    if (!company) {
        return res.status(404).json({ message: 'Company not found' });
    }
    res.status(200).json(company);
});

exports.createCompany = asyncHandler(async (req, res) => {
    const { Company } = req.db;
    const { name, email, address, phone } = req.body;
    if (!name || !email) {
        return res.status(400).json({ message: 'Name and email are required.' });
    }
    try {
        const newCompany = await Company.create({ name, email, address, phone });
        res.status(201).json(newCompany);
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'Company with this name or email already exists.' });
        }
        throw error;
    }
});

exports.updateCompany = asyncHandler(async (req, res) => {
    const { Company } = req.db;
    const { name, email, address, phone, stripeAccountId } = req.body;
    const [updatedRows] = await Company.update(
        { name, email, address, phone, stripeAccountId },
        {
            where: { id: req.params.id },
            returning: true
        }
    );
    if (updatedRows === 0) {
        return res.status(404).json({ message: 'Company not found' });
    }
    const updatedCompany = await Company.findByPk(req.params.id);
    res.status(200).json(updatedCompany);
});

exports.deleteCompany = asyncHandler(async (req, res) => {
    const { Company } = req.db;
    const deletedRows = await Company.destroy({
        where: { id: req.params.id }
    });
    if (deletedRows === 0) {
        return res.status(404).json({ message: 'Company not found' });
    }
    res.status(200).json({ message: 'Company deleted successfully' });
});


exports.initiateStripeOnboarding = asyncHandler(async (req, res) => {
    const { Company } = req.db;
    const companyId = req.params.id;
    const company = await Company.findByPk(companyId);

    if (!company) {
        return res.status(404).json({ message: 'Company not found.' });
    }

    let account;
    if (company.stripeAccountId) {
        account = await stripe.accounts.retrieve(company.stripeAccountId);
    } else {
        account = await stripe.accounts.create({
            type: 'standard',
            country: 'US',
            email: company.email,
            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },
            metadata: {
                companyId: company.id.toString()
            }
        });

        company.stripeAccountId = account.id;
        await company.save();
    }

    const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.APP_BASE_URL}/stripe/onboard-refresh?companyId=${companyId}`,
        return_url: `${process.env.APP_BASE_URL}/stripe/onboard-success?companyId=${companyId}`,
        type: 'account_onboarding',
    });

    res.status(200).json({ url: accountLink.url });
});
