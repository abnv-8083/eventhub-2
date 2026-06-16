/**
 * Shared sanitization/validation utilities
 *
 * Forbidden chars: # ! < > ? / . , * & ^ % $
 * Applied to all user-facing TEXT fields (NOT email, password, phone, date, numeric).
 */

// Regex that matches any forbidden character
export const FORBIDDEN_CHARS_RE = /[<>\\*^%]/;

// Human-readable message used in Joi .message() and frontend
export const FORBIDDEN_CHARS_MSG =
    'This field must not contain special characters: < > \\ * ^ %';

/**
 * Joi `.invalid()` replacement — use as .pattern(NO_SPECIAL, 'noSpecial') + messages
 * Use: Joi.string().pattern(NO_SPECIAL_CHARS).messages({ 'string.pattern.name': FORBIDDEN_CHARS_MSG })
 * NOTE: Joi pattern with named regex uses pattern(re, 'name') and message key 'string.pattern.name'
 */
export const NO_SPECIAL_CHARS = /^[^<>\\*^%]+$/;

/**
 * Frontend: call this to check an input value before submission.
 * Returns an error message string if invalid, else null.
 */
export function checkForbiddenChars(value) {
    if (FORBIDDEN_CHARS_RE.test(value)) {
        return 'Must not contain: < > \\ * ^ %';
    }
    return null;
}
