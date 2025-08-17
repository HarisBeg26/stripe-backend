const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Middleware to parse user and company info from API Gateway headers.
 * It expects 'X-User-ID', 'X-Company-ID', and 'X-User-Role' headers.
 */
exports.parseGatewayHeaders = asyncHandler(async (req, res, next) => {
    const userId = req.headers['x-user-id'];
    const companyId = req.headers['x-company-id'];
    const userRole = req.headers['x-user-role'];

    if (!userId || !companyId || !userRole) {
        return res.status(401).json({ message: 'Authentication headers are missing.' });
    }

    // Attach user and company info to the request object
    req.user = {
        id: userId,
        companyId: companyId,
        role: userRole
    };

    next();
});

/**
 * Middleware to authorize access based on role.
 * @param {string[]} requiredRoles - Array of roles that are allowed access.
 */
exports.hasRole = (requiredRoles) => (req, res, next) => {
    const userRole = req.user?.role;

    if (!userRole || !requiredRoles.includes(userRole)) {
        return res.status(403).json({ message: 'Forbidden: You do not have the required role.' });
    }

    next();
};

/**
 * Middleware to authorize access to a specific company's resources.
 * Allows access if the user is an admin or belongs to the requested company.
 */
exports.authorizeCompanyAccess = (req, res, next) => {
    const userRole = req.user?.role;
    const userCompanyId = req.user?.companyId;
    // Handles both /:id and /:companyId URL parameters
    const requestedCompanyId = req.params.id || req.params.companyId;

    // Allow access if user is an admin or if their companyId matches the one in the URL
    if (userRole === 'admin' || (userCompanyId && userCompanyId === requestedCompanyId)) {
        return next();
    }

    return res.status(403).json({ message: 'Forbidden: You do not have access to this company\'s resources.' });
};
