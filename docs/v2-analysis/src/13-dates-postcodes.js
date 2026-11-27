// Batch 6: V1 lines 11702-11762, 11996-12150, 13820-13923. Native; same signatures and results as V1.

/**
 * Maps a UK date to the first range whose `max` (months ago) it is under.
 * @param {string} dateStr - Date as `dd/mm/yyyy`.
 * @param {Array<{max: number, label: *}>} ranges - Ranges in ascending order.
 * @returns {*} The matching label, or false (with a console error) when none match.
 */
function mapDateToRange(dateStr, ranges) {
    const [day, month, year] = dateStr.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    const now = new Date();
    const monthsAgo = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
    const match = ranges.find((range) => monthsAgo < range.max);
    if (!match) console.error(`No match found in range "${ranges}" for date "${dateStr}".`);
    return match ? match.label : false;
}

/**
 * Parses a Date, timestamp or string (`dd/mm/yyyy`, `dd/mm/yy`, or anything `Date` accepts; HTML is stripped).
 * @param {Date|number|string} input - Value to parse.
 * @returns {Date|null} A new Date, or null when invalid.
 */
function parseDateObject(input) {
    const validOrNull = (date) => (Number.isNaN(date.getTime()) ? null : date);
    if (input instanceof Date) return validOrNull(new Date(input.getTime()));
    if (typeof input === 'number') return validOrNull(new Date(input));
    if (typeof input !== 'string') return null;

    const cleanDate = removeHtml(input).trim();
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(cleanDate);
    if (!dmy) return validOrNull(new Date(cleanDate));

    const [day, month] = [parseInt(dmy[1], 10), parseInt(dmy[2], 10)];
    const year = parseInt(dmy[3], 10) + (dmy[3].length === 2 ? 2000 : 0); // Two-digit years mean 2000-2099.
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/**
 * Resolves a date argument (Date or anything {@link parseDateObject} takes), warning when it cannot be parsed.
 * A Date is returned as given, even an invalid one.
 * @param {*} inputDate - Value to resolve.
 * @param {string} caller - Function name for the warning.
 * @returns {Date|null}
 */
function resolveDateInput(inputDate, caller) {
    const date = inputDate instanceof Date ? inputDate : parseDateObject(inputDate);
    if (!date) console.warn(`${caller}: cannot parse date:`, inputDate);
    return date;
}

/**
 * Splits a Date into UK date and 24-hour time strings.
 * @param {Date} dateObj - Date to format.
 * @returns {{date: string, time: string}} `dd/mm/yyyy` and `HH:mm`.
 */
function formatDateTimeParts(dateObj) {
    const two = (number) => String(number).padStart(2, '0');
    return {
        date: `${two(dateObj.getDate())}/${two(dateObj.getMonth() + 1)}/${dateObj.getFullYear()}`,
        time: `${two(dateObj.getHours())}:${two(dateObj.getMinutes())}`,
    };
}

/**
 * Formats a date as `dd/mm/yyyy`.
 * @param {Date|number|string} inputDate - Date to format.
 * @returns {string} Empty string when unparseable.
 */
function getDateUKFormat(inputDate) {
    return resolveDateInput(inputDate, 'getDateUKFormat')?.toLocaleDateString('en-GB') ?? '';
}

/**
 * Adds days to a date and formats it as `dd/mm/yyyy`.
 * @param {Date|number|string} inputDate - Start date.
 * @param {number} [daysOffset=0] - Days to add (negative to subtract).
 * @returns {string} Empty string when unparseable.
 */
function getOffsetDateUK(inputDate, daysOffset = 0) {
    const date = parseDateObject(inputDate);
    if (!date) {
        console.warn('getOffsetDateUK: cannot parse date:', inputDate);
        return '';
    }
    date.setDate(date.getDate() + daysOffset);
    return getDateUKFormat(date);
}

/**
 * Formats the time of a date.
 * @param {Date|number|string} inputDate - Date to format.
 * @param {number|string} [timeFormat=24] - `12` (`3:05pm`) or `24` (`15:05`).
 * @returns {string} Empty string when unparseable.
 */
function formatTime(inputDate, timeFormat = 24) {
    const date = resolveDateInput(inputDate, 'formatTime');
    if (!date) return '';
    const format = String(timeFormat || 24).trim();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    if (format === '12') return `${date.getHours() % 12 || 12}:${minutes}${date.getHours() >= 12 ? 'pm' : 'am'}`;
    if (format !== '24') console.warn('formatTime: unsupported time format, falling back to 24:', timeFormat);
    return `${String(date.getHours()).padStart(2, '0')}:${minutes}`;
}

/**
 * Gets the weekday name of a date.
 * @param {Date|number|string} inputDate - Date.
 * @param {string} [locale='en-GB'] - Locale for the name.
 * @returns {string} Empty string when unparseable.
 */
function getWeekdayName(inputDate, locale = 'en-GB') {
    return resolveDateInput(inputDate, 'getWeekdayName')?.toLocaleDateString(locale, { weekday: 'long' }) ?? '';
}

/**
 * Formats a number or numeric text as currency.
 * @param {*} value - Value; everything except digits, `.` and `-` is ignored.
 * @param {{locale?: string, currency?: string}} [options={}] - Defaults `en-GB` and `GBP`.
 * @returns {string} Empty string when not numeric or the currency is invalid.
 */
function formatCurrency(value, options = {}) {
    const amount = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(amount)) return '';
    const locale = String(options.locale || 'en-GB').trim() || 'en-GB';
    const currency = String(options.currency || 'GBP').trim().toUpperCase() || 'GBP';
    try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
    } catch (error) {
        console.warn('formatCurrency: unable to format currency.', { value, options, error });
        return '';
    }
}

/**
 * Gets the last millisecond of a date's day (local time) as an ISO string.
 * @param {Date|number|string} inputDate - Date.
 * @returns {string} Empty string when unparseable.
 */
function getEndOfDayIso(inputDate) {
    const date = parseDateObject(inputDate);
    if (!date) return '';
    date.setHours(23, 59, 59, 999);
    return date.toISOString();
}

/**
 * Gets today's date minus a number of weeks, as `dd/mm/yyyy`.
 * @param {number} weeksAgo - Weeks to go back.
 * @returns {string}
 */
function getWeeksAgoDate(weeksAgo) {
    return getDateUKFormat(new Date(Date.now() - weeksAgo * 7 * 24 * 60 * 60 * 1000));
}

/**
 * Lists the 52 consecutive week field ids starting at a field number.
 * @param {number} startFieldNum - First field number.
 * @returns {string[]} `field_N` ids.
 */
function getArrayOfWeekNumbersAndFields(startFieldNum) {
    return Array.from({ length: 52 }, (_, index) => `field_${startFieldNum + index}`);
}

/**
 * Gets the ISO-8601 week number of a date.
 * @param {Date} date - Date.
 * @returns {number}
 */
function getWeekNumber(date) {
    const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7)); // Nearest Thursday decides the year.
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
    return Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
}

/**
 * Extracts a UK postcode from the end of an address (HTML stripped).
 * @param {string} address - Address text.
 * @returns {string} Upper-cased postcode, or `''`.
 */
function extractPostcode(address) {
    if (!address) return '';
    return removeHtml(address).trim().match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}$/i)?.[0].toUpperCase() ?? '';
}

/**
 * Breaks a UK postcode (full, or just an outcode plus sector digit) into its parts.
 * @param {*} value - Postcode text.
 * @returns {{formatted: string, compact: string, sector: string, sectorCompact: string, outcode: string, inward: string, unit: string, isFullPostcode: boolean}}
 */
function normaliseUkPostcode(value) {
    const result = (parts = {}) => ({ formatted: '', compact: '', sector: '', sectorCompact: '', outcode: '', inward: '', unit: '', isFullPostcode: false, ...parts });
    const raw = String(value ?? '').trim().toUpperCase();
    const full = extractPostcode(raw).replace(/\s+/g, '');
    if (full) {
        const formatted = `${full.slice(0, -3)} ${full.slice(-3)}`.trim();
        const sector = formatted.replace(/[A-Z]{2}$/i, '').trim();
        const inward = formatted.slice(-3).trim();
        return result({ formatted, compact: full, sector, sectorCompact: sector.replace(/\s+/g, ''), outcode: formatted.slice(0, -4).trim(), inward, unit: inward.slice(-2), isFullPostcode: true });
    }
    const compact = raw.replace(/\s+/g, '');
    const match = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d)$/i);
    if (!match) return result();
    const sector = `${match[1].toUpperCase()} ${match[2]}`;
    return result({ formatted: sector, compact: compact.toUpperCase(), sector, sectorCompact: compact.toUpperCase(), outcode: match[1].toUpperCase() });
}

/**
 * Validates a UK mobile number (11 digits starting 07; brackets, dashes and spaces ignored).
 * @param {*} value - Number as typed.
 * @param {{allowIncomplete?: boolean}} [options={}] - Accept a valid prefix of up to 11 digits.
 * @returns {{isValid: boolean, message: string}}
 */
function validateUkMobileNumber(value, options = {}) {
    const message = 'Enter an 11-digit mobile number starting with 07.';
    const valid = () => ({ isValid: true, message: '' });
    const invalid = (text = message) => ({ isValid: false, message: text });
    const number = knackValueResolver.normalizeComparableText(value).replace(/[()\-\s]+/g, '');

    if (!number) return valid();
    if (number.startsWith('+44') || number.startsWith('0044')) return invalid(`${message} Do not use +44 or 0044.`);
    if (!/^\d+$/.test(number) || !number.startsWith('0')) return invalid();
    if (number.length > 1 && !number.startsWith('07')) return invalid();
    if (options?.allowIncomplete && number.length <= 11) return valid();
    return /^07\d{9}$/.test(number) ? valid() : invalid();
}
