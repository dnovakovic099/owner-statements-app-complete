const express = require('express');
const router = express.Router();
const { User, ActivityLog } = require('../models');
const { authenticateUser, generateToken, verifyToken } = require('../middleware/auth');
const { Op } = require('sequelize');

// Login endpoint - returns JWT token
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    try {
        const user = await authenticateUser(username, password);

        if (user) {
            // Generate JWT token
            const token = generateToken(user);

            // Log successful login
            await ActivityLog.log(req, 'LOGIN', 'auth', user.id, { username: user.username });

            return res.json({
                success: true,
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    isSystemUser: user.isSystemUser
                }
            });
        }

        // Log failed login attempt
        await ActivityLog.log(req, 'LOGIN_FAILED', 'auth', null, { username });
        res.status(401).json({ success: false, message: 'Invalid username or password' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// Verify token endpoint
router.post('/verify', async (req, res) => {
    const { token } = req.body;

    // Also support Authorization header
    let tokenToVerify = token;
    if (!tokenToVerify) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            tokenToVerify = authHeader.split(' ')[1];
        }
    }

    if (!tokenToVerify) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    try {
        const decoded = verifyToken(tokenToVerify);

        if (decoded) {
            return res.json({
                success: true,
                message: 'Token valid',
                user: {
                    id: decoded.id,
                    username: decoded.username,
                    email: decoded.email,
                    role: decoded.role,
                    isSystemUser: decoded.isSystemUser
                }
            });
        }

        res.status(401).json({ success: false, message: 'Invalid or expired token' });
    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
    const { token } = req.body;

    // Also support Authorization header
    let tokenToRefresh = token;
    if (!tokenToRefresh) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            tokenToRefresh = authHeader.split(' ')[1];
        }
    }

    if (!tokenToRefresh) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    try {
        const decoded = verifyToken(tokenToRefresh);

        if (decoded) {
            // Generate new token with fresh expiration
            const newToken = generateToken({
                id: decoded.id,
                username: decoded.username,
                email: decoded.email,
                role: decoded.role,
                isSystemUser: decoded.isSystemUser
            });

            return res.json({
                success: true,
                message: 'Token refreshed',
                token: newToken,
                user: {
                    id: decoded.id,
                    username: decoded.username,
                    email: decoded.email,
                    role: decoded.role,
                    isSystemUser: decoded.isSystemUser
                }
            });
        }

        res.status(401).json({ success: false, message: 'Invalid or expired token' });
    } catch (error) {
        console.error('Refresh error:', error);
        res.status(500).json({ success: false, message: 'Token refresh failed' });
    }
});

// Validate invite token
router.get('/invite/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const user = await User.findOne({
            where: {
                inviteToken: token,
                inviteAccepted: false,
                inviteExpires: {
                    [Op.gt]: new Date()
                }
            }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired invite link'
            });
        }

        res.json({
            success: true,
            user: {
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Invite validation error:', error);
        res.status(500).json({ success: false, message: 'Failed to validate invite' });
    }
});

// Accept invite and set password
router.post('/accept-invite', async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ success: false, message: 'Token and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const user = await User.findOne({
            where: {
                inviteToken: token,
                inviteAccepted: false,
                inviteExpires: {
                    [Op.gt]: new Date()
                }
            }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired invite link'
            });
        }

        // Set password and mark invite as accepted
        await user.setPassword(password);
        user.inviteToken = null;
        user.inviteExpires = null;
        user.inviteAccepted = true;
        await user.save();

        // Generate JWT token for immediate login
        const jwtToken = generateToken({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            isSystemUser: user.isSystemUser
        });

        res.json({
            success: true,
            message: 'Account activated successfully',
            token: jwtToken,
            user: {
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Accept invite error:', error);
        res.status(500).json({ success: false, message: 'Failed to accept invite' });
    }
});

module.exports = router;
