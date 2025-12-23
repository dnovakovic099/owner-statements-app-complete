const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    username: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true
    },
    password: {
        type: DataTypes.STRING(255),
        allowNull: true // Null until user accepts invite and sets password
    },
    role: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'viewer',
        validate: {
            isIn: [['admin', 'editor', 'viewer']]
        }
    },
    inviteToken: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'invite_token'
    },
    inviteExpires: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'invite_expires'
    },
    inviteAccepted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'invite_accepted'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active'
    },
    isSystemUser: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_system_user'
    },
    lastLogin: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_login'
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'created_at'
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'updated_at'
    }
}, {
    tableName: 'users',
    timestamps: true,
    underscored: true
});

// Instance method to verify password
User.prototype.verifyPassword = async function(password) {
    if (!this.password) return false;
    return bcrypt.compare(password, this.password);
};

// Instance method to set password (hashes it)
User.prototype.setPassword = async function(password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(password, salt);
};

// Instance method to generate invite token
User.prototype.generateInviteToken = function() {
    this.inviteToken = crypto.randomBytes(32).toString('hex');
    this.inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    return this.inviteToken;
};

// Static method to check if any users exist
User.hasUsers = async function() {
    const count = await User.count();
    return count > 0;
};

// Static method to find by invite token
User.findByInviteToken = async function(token) {
    return User.findOne({
        where: {
            inviteToken: token,
            inviteAccepted: false
        }
    });
};

module.exports = User;
