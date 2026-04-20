/**
 * Probe Hostify calendar blocks for a listing (+ optional children) and a date range.
 *
 * Usage:
 *   node scripts/probe-hostify-calendar.js --listing=300017765 --start=2026-04-01 --end=2026-04-30
 *   node scripts/probe-hostify-calendar.js --listing=300017765 --children=300018217,300018878 --start=2026-04-01 --end=2026-04-30
 *
 * --children is optional; when provided, the script treats those as children of --listing
 * (same attribution behavior the real statement pipeline uses).
 *
 * If --start/--end are omitted, defaults to the current calendar month.
 */
require('dotenv').config();
const hostifyService = require('../src/services/HostifyService');

function parseArgs(argv) {
    const out = {};
    for (const arg of argv.slice(2)) {
        const m = arg.match(/^--([^=]+)=(.*)$/);
        if (m) out[m[1]] = m[2];
    }
    return out;
}

function firstOfMonth(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
function lastOfMonth(d) {
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

(async () => {
    const args = parseArgs(process.argv);
    if (!args.listing) {
        console.error('Missing --listing=<id>');
        console.error('Example: node scripts/probe-hostify-calendar.js --listing=300017765 --start=2026-04-01 --end=2026-04-30');
        process.exit(1);
    }

    const now = new Date();
    const parent = parseInt(args.listing, 10);
    const children = (args.children || '').split(',').map(s => s.trim()).filter(Boolean).map(s => parseInt(s, 10));
    const start = args.start || firstOfMonth(now);
    const end = args.end || lastOfMonth(now);

    const map = new Map(children.map(c => [c, parent]));
    const all = [parent, ...children];

    console.log(`Probing listing ${parent}${children.length ? ` (+ ${children.length} children)` : ''} from ${start} to ${end}`);
    const blocks = await hostifyService.fetchCalendarBlocks(all, start, end, map);
    console.log(`\nFetched ${blocks.length} block pseudo-reservation(s) after dedup:\n`);
    for (const b of blocks) {
        console.log(`- ${b.hostifyId} | ${b.guestName} | ${b.checkInDate}→${b.checkOutDate} (${b.nights}n) | baseRate=$${b.baseRate}`);
    }
})();
