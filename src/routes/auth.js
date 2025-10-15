const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Load authentication config
let authConfig;
try {
    authConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/auth.json'), 'utf8'));
} catch (error) {
    console.warn('Could not load auth config for auth route, using defaults');
    authConfig = {
        users: { 'LL': 'bnb547!' },
        realm: 'Luxury Lodging PM - Owner Statements'
    };
}

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (authConfig.users[username] && authConfig.users[username] === password) {
        res.json({ success: true, message: 'Login successful', user: { username } });
    } else {
        res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
});

router.post('/verify', (req, res) => {
    const { username, password } = req.body;
    if (authConfig.users[username] && authConfig.users[username] === password) {
        res.json({ success: true, message: 'Credentials valid', user: { username } });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

module.exports = router;
