const crypto = require('crypto');

// Accept 32-byte key provided as hex (64 chars) or base64
function getKey() {
    const raw = process.env.DATA_ENCRYPTION_KEY;
    if (!raw) {
        throw new Error('DATA_ENCRYPTION_KEY is not set');
    }

    let buf;
    if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
        buf = Buffer.from(raw, 'hex');
    } else {
        buf = Buffer.from(raw, 'base64');
    }

    if (buf.length !== 32) {
        throw new Error('DATA_ENCRYPTION_KEY must decode to 32 bytes (256-bit key)');
    }
    return buf;
}

function encryptString(plaintext) {
    if (plaintext === null || plaintext === undefined) return null;
    const key = getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [
        iv.toString('base64'),
        encrypted.toString('base64'),
        authTag.toString('base64')
    ].join(':');
}

function decryptString(ciphertext) {
    if (!ciphertext) return null;
    const key = getKey();
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted payload');
    }
    const [ivB64, dataB64, tagB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const encrypted = Buffer.from(dataB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
}

function encryptOptional(value) {
    if (value === null || value === undefined || value === '') return null;
    return encryptString(value);
}

function decryptOptional(value) {
    if (!value) return null;
    return decryptString(value);
}

module.exports = {
    encryptOptional,
    decryptOptional
};
