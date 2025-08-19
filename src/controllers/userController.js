const bcrypt = require('bcryptjs');
const { generateToken, verifyPassword, hashPassword } = require('../middleware/auth');

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

    const hashedPassword = await hashPassword(password);

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

        // Generate JWT token for immediate login
        const token = generateToken(newUser);

        res.status(201).json({ 
            user: {
                id: newUser.id, 
                email: newUser.email, 
                companyId: newUser.companyId,
                role: newUser.role
            },
            token
        });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'User with this email already exists.' });
        }
        throw error;
    }
});

/**
 * User Login
 * Authenticates user credentials and returns JWT token
 */
exports.loginUser = asyncHandler(async (req, res) => {
    const { User, Company } = req.db;
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user with company info
    const user = await User.findOne({
        where: { email },
        include: [{
            model: Company,
            as: 'company',
            attributes: ['id', 'name', 'subscriptionStatus', 'accessLevel']
        }]
    });

    if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
        return res.status(401).json({ message: 'Account is deactivated' });
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password);
    if (!isValidPassword) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = generateToken(user);

    // Update last login
    await user.update({ lastLogin: new Date() });

    res.status(200).json({
        user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            companyId: user.companyId,
            company: user.company
        },
        token
    });
});

/**
 * Get Current User Profile
 * Returns authenticated user's profile information
 */
exports.getCurrentUser = asyncHandler(async (req, res) => {
    const { User, Company } = req.db;
    
    const user = await User.findByPk(req.user.id, {
        attributes: { exclude: ['password'] },
        include: [{
            model: Company,
            as: 'company',
            attributes: ['id', 'name', 'subscriptionStatus', 'accessLevel']
        }]
    });

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user);
});

