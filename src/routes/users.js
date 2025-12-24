const express = require('express');
const router = express.Router();
const { User, EmailLog } = require('../models');
const emailService = require('../services/EmailService');
const { Op } = require('sequelize');

// Middleware to check if user is admin or system (uses req.user from JWT authenticate middleware)
const requireAdmin = (req, res, next) => {
    // req.user is set by the authenticate middleware in server.js
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role !== 'admin' && req.user.role !== 'system') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    next();
};

// Get all users (admin only)
router.get('/', requireAdmin, async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'username', 'email', 'role', 'isActive', 'inviteAccepted', 'isSystemUser', 'lastLogin', 'createdAt'],
            order: [['createdAt', 'DESC']]
        });
        res.json({ success: true, users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get current user info
router.get('/me', async (req, res) => {
    try {
        // req.user is set by the authenticate middleware
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const user = await User.findOne({
            where: { id: req.user.id, isActive: true },
            attributes: ['id', 'username', 'email', 'role', 'lastLogin', 'createdAt']
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, user });
    } catch (error) {
        console.error('Error fetching current user:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Invite a new user (admin only)
router.post('/invite', requireAdmin, async (req, res) => {
    try {
        const { email, username } = req.body;
        const role = 'admin'; // All users are admin for now

        if (!email || !username) {
            return res.status(400).json({ error: 'Email and username are required' });
        }

        // Check if email or username already exists
        const existingUser = await User.findOne({
            where: {
                [Op.or]: [{ email }, { username }]
            }
        });

        if (existingUser) {
            if (existingUser.email === email) {
                return res.status(400).json({ error: 'Email already in use' });
            }
            return res.status(400).json({ error: 'Username already in use' });
        }

        // Create user with invite token
        const user = await User.create({
            email,
            username,
            role,
            inviteAccepted: false,
            isActive: true
        });

        // Generate invite token
        const token = user.generateInviteToken();
        await user.save();

        // Send invite email
        const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3003}`;
        const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;

        try {
            await emailService.sendInviteEmail(email, username, role, inviteUrl);

            // Log successful invite email
            await EmailLog.create({
                statementId: null,
                propertyId: null,
                recipientEmail: email,
                recipientName: username,
                propertyName: 'User Invite',
                frequencyTag: 'User Invite',
                subject: `You've been invited to Owner Statements`,
                status: 'sent',
                sentAt: new Date()
            });
        } catch (emailError) {
            console.error('Failed to send invite email:', emailError);

            // Log failed invite email
            await EmailLog.create({
                statementId: null,
                propertyId: null,
                recipientEmail: email,
                recipientName: username,
                propertyName: 'User Invite',
                frequencyTag: 'User Invite',
                subject: `You've been invited to Owner Statements`,
                status: 'failed',
                errorMessage: emailError.message
            });

            // Don't fail the request, but let admin know
            return res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    inviteAccepted: user.inviteAccepted
                },
                warning: 'User created but invite email failed to send. Share this link manually: ' + inviteUrl
            });
        }

        res.json({
            success: true,
            message: 'Invite sent successfully',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                inviteAccepted: user.inviteAccepted
            }
        });
    } catch (error) {
        console.error('Error inviting user:', error);
        res.status(500).json({ error: 'Failed to invite user' });
    }
});

// Resend invite (admin only)
router.post('/:id/resend-invite', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findByPk(id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.inviteAccepted) {
            return res.status(400).json({ error: 'User has already accepted the invite' });
        }

        // Generate new invite token
        const token = user.generateInviteToken();
        await user.save();

        // Send invite email
        const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3003}`;
        const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;

        try {
            await emailService.sendInviteEmail(user.email, user.username, user.role, inviteUrl);

            // Log successful resend invite email
            await EmailLog.create({
                statementId: null,
                propertyId: null,
                recipientEmail: user.email,
                recipientName: user.username,
                propertyName: 'User Invite',
                frequencyTag: 'User Invite',
                subject: `You've been invited to Owner Statements`,
                status: 'sent',
                sentAt: new Date()
            });
        } catch (emailError) {
            console.error('Failed to send invite email:', emailError);

            // Log failed resend invite email
            await EmailLog.create({
                statementId: null,
                propertyId: null,
                recipientEmail: user.email,
                recipientName: user.username,
                propertyName: 'User Invite',
                frequencyTag: 'User Invite',
                subject: `You've been invited to Owner Statements`,
                status: 'failed',
                errorMessage: emailError.message
            });

            return res.json({
                success: true,
                warning: 'Invite email failed to send. Share this link manually: ' + inviteUrl
            });
        }

        res.json({ success: true, message: 'Invite resent successfully' });
    } catch (error) {
        console.error('Error resending invite:', error);
        res.status(500).json({ error: 'Failed to resend invite' });
    }
});

// Update user (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        const user = await User.findByPk(id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent deactivating yourself
        if (user.id === req.user.id && isActive === false) {
            return res.status(400).json({ error: 'Cannot deactivate your own account' });
        }

        // Prevent modifying system users
        if (user.isSystemUser) {
            return res.status(400).json({ error: 'Cannot modify system administrator account' });
        }

        if (typeof isActive === 'boolean') {
            user.isActive = isActive;
        }

        await user.save();

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
                inviteAccepted: user.inviteAccepted
            }
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Delete user (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findByPk(id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent admin from deleting themselves
        if (user.id === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        // Prevent deletion of system users
        if (user.isSystemUser) {
            return res.status(400).json({ error: 'Cannot delete system administrator account' });
        }

        await user.destroy();
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

module.exports = router;
