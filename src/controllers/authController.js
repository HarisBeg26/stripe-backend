const crypto = require('crypto');
const { generateToken, verifyPassword, hashPassword } = require('../middleware/auth');

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Request Password Reset
 * Generates a reset token and stores it in the database
 */
exports.requestPasswordReset = asyncHandler(async (req, res) => {
    const { User } = req.db;
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
        // Don't reveal if email exists for security
        return res.status(200).json({ message: 'If the email exists, a reset link has been sent' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Store reset token in user record
    await user.update({
        resetToken,
        resetTokenExpiry
    });

    // In production, send email with reset link
    // For now, return the token (remove this in production)
    if (process.env.NODE_ENV === 'development') {
        return res.status(200).json({ 
            message: 'Reset token generated',
            resetToken // Remove this in production
        });
    }

    res.status(200).json({ message: 'If the email exists, a reset link has been sent' });
});

/**
 * Reset Password
 * Validates reset token and updates password
 */
exports.resetPassword = asyncHandler(async (req, res) => {
    const { User } = req.db;
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const user = await User.findOne({
        where: {
            resetToken: token,
            resetTokenExpiry: {
                [require('sequelize').Op.gt]: new Date()
            }
        }
    });

    if (!user) {
        return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // Update password and clear reset token
    const hashedPassword = await hashPassword(newPassword);
    await user.update({
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null
    });

    res.status(200).json({ message: 'Password reset successful' });
});

/**
 * Change Password
 * Allows authenticated users to change their password
 */
exports.changePassword = asyncHandler(async (req, res) => {
    const { User } = req.db;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await verifyPassword(currentPassword, user.password);
    if (!isValidPassword) {
        return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Update password
    const hashedPassword = await hashPassword(newPassword);
    await user.update({ password: hashedPassword });

    res.status(200).json({ message: 'Password changed successfully' });
});
