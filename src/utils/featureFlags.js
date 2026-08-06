/**
 * Runtime feature flags, persisted in the `app_configs` table.
 *
 * Currently one flag: `payouts_enabled` — the master switch for the entire
 * Increase payout feature (endpoints, background pipeline, owner-facing setup
 * and receipt pages, and the frontend surface). Turning it off pauses the
 * machinery without touching a line of payout code or a row of payout data;
 * turning it back on restores exactly the previous behaviour, including
 * in-flight `awaiting_funding` / `queued` statements.
 *
 * Two read paths on purpose:
 *   - `isPayoutsEnabled()`   async, authoritative, short-TTL cached. Use in
 *                            request handlers and cron ticks.
 *   - `payoutsEnabledCached()` sync, last-known value. For call sites that
 *                            cannot await (Sequelize hooks). Reads `false`
 *                            until the first async read lands.
 *
 * Default is DISABLED, and the flag fails closed. A missing row, a fresh
 * environment, or an unreachable database all resolve to "payouts off" — only
 * an explicit stored `true` turns the feature on. Payouts move real money over
 * ACH with no undo, so the safe state when we are unsure is "don't send".
 *
 * Consequence worth knowing: on first deploy no row exists, so payouts start
 * off and an admin must switch them on in Settings → Features. Anything already
 * `queued` or `awaiting_funding` waits untouched until then.
 */

const logger = require('./logger');

const PAYOUTS_KEY = 'payouts_enabled';
const CACHE_TTL_MS = 10 * 1000; // short — an operator flipping the switch expects it to bite quickly

// { value: boolean, expiresAt: number } — `value` also serves as the sync fallback.
let _cache = { value: false, expiresAt: 0 };

function _appConfig() {
    return require('../models/AppConfig');
}

/**
 * Coerce whatever is stored into a strict boolean. The AppConfig getter JSON-
 * parses, so a boolean normally arrives as a boolean, but older rows or manual
 * edits can leave a string behind. Anything that isn't an affirmative `true`
 * counts as off — an unreadable value must not enable money movement.
 */
function _coerce(raw) {
    return raw === true || raw === 'true' || raw === 1 || raw === '1';
}

/**
 * Authoritative read. Never throws — a DB problem resolves to the cached value,
 * which starts at `false`, so an unreachable database leaves payouts off rather
 * than sending transfers we can't verify against stored config.
 */
async function isPayoutsEnabled() {
    if (_cache.expiresAt > Date.now()) return _cache.value;

    try {
        const AppConfig = _appConfig();
        const row = await AppConfig.findOne({ where: { key: PAYOUTS_KEY } });
        const value = row ? _coerce(row.value) : false;
        _cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
        return value;
    } catch (err) {
        logger.warn(`Feature flag read failed, using last known value (${_cache.value})`, {
            context: 'FeatureFlags',
            key: PAYOUTS_KEY,
            error: err.message,
        });
        return _cache.value;
    }
}

/**
 * Last known value, no I/O. Only for sync contexts (model hooks).
 */
function payoutsEnabledCached() {
    return _cache.value;
}

/**
 * Flip the flag. Writes through and refreshes the cache immediately so the very
 * next request sees the new value rather than waiting out the TTL.
 */
async function setPayoutsEnabled(enabled) {
    const value = Boolean(enabled);
    const AppConfig = _appConfig();
    // syncDatabase() deliberately doesn't sync models, so make sure the table
    // exists before the first write in a fresh environment (same guard
    // BackupService uses for its own app_configs access).
    await AppConfig.sync({ alter: false });
    await AppConfig.upsert({ key: PAYOUTS_KEY, value });
    _cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    logger.info(`Payout feature ${value ? 'ENABLED' : 'DISABLED'}`, { context: 'FeatureFlags' });
    return value;
}

/** Drop the cache — used by tests and immediately after an external write. */
function clearCache() {
    _cache = { value: false, expiresAt: 0 };
}

module.exports = {
    PAYOUTS_KEY,
    isPayoutsEnabled,
    payoutsEnabledCached,
    setPayoutsEnabled,
    clearCache,
};
