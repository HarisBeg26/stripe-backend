const bcrypt = require('bcryptjs');

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

exports.getUserById = asyncHandler(async (req, res) => {
    const { User } = req.db;
    const { id } = req.params;

    const user = await User.findByPk(id, {
        attributes: { exclude: ['password'] } 
    });

    if (!user) {
        return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json(user);
});

exports.getUserPaymentHistory = asyncHandler(async (req, res) => {
    const { PaymentTransaction } = req.db;
    const userId = req.userId; // Assuming gatewayAuth middleware adds userId to req

    if (!userId) {
        return res.status(400).json({ message: 'User ID is required.' });
    }

    const transactions = await PaymentTransaction.findAll({
        where: { customer: userId },
        order: [['createdAt', 'DESC']]
    });

    if (!transactions || transactions.length === 0) {
        return res.status(404).json({ message: 'No payment history found for this user.' });
    }

    res.status(200).json(transactions);
});

exports.registerUser = asyncHandler(async (req, res) => {
    const { User, Company } = req.db;
    const { firstName, lastName, email, password, phone, companyId } = req.body;

    if (!firstName || !lastName || !email || !password || !companyId) {
        return res.status(400).json({ message: 'firstName, lastName, email, password, and companyId are required.' });
    }

    const company = await Company.findByPk(companyId);
    if (!company) {
        return res.status(404).json({ message: 'Company not found.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
            const userCount = await User.count();
    const role = userCount === 0 ? 'admin' : 'user';

    const newUser = await User.create({
        firstName,
        lastName,
        email,
        password: hashedPassword,
        phone,
        companyId,
        role: role,
    });
        res.status(201).json({ id: newUser.id, email: newUser.email, companyId: newUser.companyId });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'User with this email already exists.' });
        }
        throw error;
    }
});

