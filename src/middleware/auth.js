const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user info to request
 */
exports.authenticateToken = asyncHandler(async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { User, Company } = req.db;
        
        // Fetch full user data with company info
        const user = await User.findByPk(decoded.userId, {
            attributes: { exclude: ['password'] },
            include: [{
                model: Company,
                as: 'company',
                attributes: ['id', 'name', 'subscriptionStatus', 'accessLevel']
            }]
        });

        if (!user || !user.isActive) {
            return res.status(401).json({ message: 'Invalid or inactive user' });
        }

        // Update last login
        await user.update({ lastLogin: new Date() });

        // Attach user info to request
        req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            companyId: user.companyId,
            company: user.company
        };

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired' });
        }
        return res.status(403).json({ message: 'Invalid token' });
    }
});

/**
 * Role-based Authorization Middleware
 * Checks if user has required role(s)
 */
exports.requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const userRole = req.user.role;
        const allowedRoles = Array.isArray(roles) ? roles : [roles];

        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({ 
                message: `Access denied. Required role(s): ${allowedRoles.join(', ')}` 
            });
        }

        next();
    };
};

/**
 * Company Access Authorization
 * Ensures user can only access their own company's resources
 */
exports.requireCompanyAccess = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    const userCompanyId = req.user.companyId;
    const requestedCompanyId = req.params.companyId || req.params.id;

    // Admin can access all companies
    if (req.user.role === 'admin') {
        return next();
    }

    // User must belong to the requested company
    if (userCompanyId !== requestedCompanyId) {
        return res.status(403).json({ 
            message: 'Access denied. You can only access your own company resources.' 
        });
    }

    next();
};

/**
 * Subscription Level Authorization
 * Checks if user's company has required subscription level
 */
exports.requireSubscription = (requiredLevels) => {
    return (req, res, next) => {
        if (!req.user || !req.user.company) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const userAccessLevel = req.user.company.accessLevel;
        const allowedLevels = Array.isArray(requiredLevels) ? requiredLevels : [requiredLevels];

        // Admin always has access
        if (req.user.role === 'admin') {
            return next();
        }

        if (!allowedLevels.includes(userAccessLevel)) {
            return res.status(403).json({ 
                message: `Subscription upgrade required. Current: ${userAccessLevel}, Required: ${allowedLevels.join(' or ')}` 
            });
        }

        next();
    };
};

/**
 * Generate JWT Token
 * Creates a signed JWT token for authenticated user
 */
exports.generateToken = (user) => {
    return jwt.sign(
        { 
            userId: user.id,
            email: user.email,
            role: user.role,
            companyId: user.companyId
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
};

/**
 * Verify Password
 * Compares plain text password with hashed password
 */
exports.verifyPassword = async (plainPassword, hashedPassword) => {
    return await bcrypt.compare(plainPassword, hashedPassword);
};

/**
 * Hash Password
 * Creates a bcrypt hash of the password
 */
exports.hashPassword = async (password) => {
    return await bcrypt.hash(password, 12);
};
