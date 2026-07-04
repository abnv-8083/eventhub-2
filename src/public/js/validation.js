/**
 * EventHub — Global Inline Validation Engine
 * ─────────────────────────────────────────────
 * Usage: add data-rule="..." to any input/textarea/select.
 * Rules (comma-separated):
 *   required              — field must not be empty
 *   email                 — valid email format
 *   password              — min 8 chars, complexity check
 *   minN                  — minimum N characters  (e.g. min3)
 *   maxN                  — maximum N characters  (e.g. max100)
 *   phone                 — 10–15 digits only
 *   name                  — letters + spaces only, min 3
 *   number                — numeric, optionally with min/max via data-min / data-max
 *   date                  — must be a valid date
 *   futureDate            — date must be today or in the future
 *   match:#otherId        — must equal value of #otherId
 *   url                   — valid URL format
 *
 * Also blocks forbidden special characters globally on text inputs.
 */

// ─── Forbidden Characters ────────────────────────────────────────────────────
const FORBIDDEN_RE   = /[<>\\*^%]/;
const FORBIDDEN_KEYS = new Set(['<', '>', '\\', '*', '^', '%']);
const EXEMPT_TYPES   = new Set(['email', 'password', 'date', 'time', 'number', 'hidden', 'file', 'checkbox', 'radio', 'submit', 'button', 'select-one', 'select-multiple']);
const EXEMPT_NAMES   = new Set(['email', 'password', 'newPassword', 'confirmPassword', 'currentPassword', 'lat', 'lng', 'referralCode']);

function isForbiddenExempt(input) {
    return EXEMPT_TYPES.has(input.type)
        || EXEMPT_NAMES.has(input.name)
        || input.dataset.noSpecialCheck === 'true';
}

// ─── Error UI Helpers ────────────────────────────────────────────────────────
function getFieldWrapper(input) {
    let el = input;
    while (el.parentElement) {
        const p = el.parentElement;
        if (p.classList.contains('form-floating') || 
            p.classList.contains('form-group') || 
            p.classList.contains('password-group') || 
            p.classList.contains('input-group') || 
            p.classList.contains('position-relative') ||
            p.classList.contains('referral-link-wrap')) {
            el = p;
        } else {
            break;
        }
    }
    return el;
}

function getFeedbackEl(input, className) {
    const wrapper = getFieldWrapper(input);
    const parent = wrapper.parentElement || wrapper;
    const fieldId = input.id || input.name || 'field';
    return parent.querySelector(`.${className}[data-for="${fieldId}"]`);
}

function getOrCreateFeedbackEl(input, className) {
    const wrapper = getFieldWrapper(input);
    const parent = wrapper.parentElement || wrapper;
    const fieldId = input.id || input.name || 'field';
    
    let el = parent.querySelector(`.${className}[data-for="${fieldId}"]`);
    if (!el) {
        el = document.createElement('span');
        el.className = className;
        el.setAttribute('data-for', fieldId);
        // Insert right after the wrapper so the wrapper height NEVER expands!
        if (wrapper.nextSibling) {
            parent.insertBefore(el, wrapper.nextSibling);
        } else {
            parent.appendChild(el);
        }
    }
    return el;
}

function showError(input, message) {
    input.classList.remove('input-success');
    input.classList.add('input-error');
    input.setAttribute('aria-invalid', 'true');

    const successEl = getFeedbackEl(input, 'ev-success-msg');
    if (successEl) successEl.style.display = 'none';

    let errorEl = getOrCreateFeedbackEl(input, 'ev-error-msg');
    errorEl.innerHTML = `<i class="fi fi-rr-exclamation"></i> <span>${message}</span>`;
    errorEl.style.display = 'flex';
}

function clearError(input) {
    input.classList.remove('input-error');
    input.classList.remove('input-success');
    input.removeAttribute('aria-invalid');

    const errorEl = getFeedbackEl(input, 'ev-error-msg');
    if (errorEl) errorEl.style.display = 'none';
    const successEl = getFeedbackEl(input, 'ev-success-msg');
    if (successEl) successEl.style.display = 'none';
}

function showSuccess(input, message) {
    input.classList.remove('input-error');
    input.classList.add('input-success');
    input.removeAttribute('aria-invalid');

    const errorEl = getFeedbackEl(input, 'ev-error-msg');
    if (errorEl) errorEl.style.display = 'none';

    if (message) {
        let successEl = getOrCreateFeedbackEl(input, 'ev-success-msg');
        successEl.innerHTML = `<i class="fi fi-rr-check-circle"></i> <span>${message}</span>`;
        successEl.style.display = 'flex';
    } else {
        const successEl = getFeedbackEl(input, 'ev-success-msg');
        if (successEl) successEl.style.display = 'none';
    }
}

function showForbiddenError(input, msg) {
    showError(input, msg || 'Special characters not allowed here.');
}
function clearForbiddenError(input) {
    clearError(input);
}

// ─── Rule Validators ────────────────────────────────────────────────────────
const RULES = {
    required(val, input) {
        if (input.type === 'checkbox') return input.checked;
        if (input.tagName === 'SELECT') return val !== '' && val !== null;
        return val.trim() !== '';
    },
    email(val) {
        return val === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    },
    password(val) {
        return val === '' || /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(val);
    },
    phone(val) {
        return val === '' || (/^\d+$/.test(val) && val.length >= 10 && val.length <= 15);
    },
    name(val) {
        return val === '' || (/^[a-zA-Z\s]+$/.test(val) && val.trim().length >= 3);
    },
    number(val, input) {
        if (val === '') return true;
        const n = Number(val);
        if (isNaN(n)) return false;
        if (input.dataset.min !== undefined && n < Number(input.dataset.min)) return false;
        if (input.dataset.max !== undefined && n > Number(input.dataset.max)) return false;
        return true;
    },
    date(val) {
        return val === '' || !isNaN(new Date(val).getTime());
    },
    futureDate(val) {
        if (val === '') return true;
        const d = new Date(val);
        const today = new Date(); today.setHours(0,0,0,0);
        return d >= today;
    },
    url(val) {
        if (val === '') return true;
        try { new URL(val); return true; } catch { return false; }
    },
};

const RULE_MESSAGES = {
    required:    'This field is required.',
    email:       'Please enter a valid email address.',
    password:    'Password must be at least 8 chars, with uppercase, lowercase, number, and special char.',
    phone:       'Enter a valid phone number (10–15 digits).',
    name:        'Use letters and spaces only (min. 3 characters).',
    number:      'Please enter a valid number.',
    date:        'Please enter a valid date.',
    futureDate:  'Date must be today or in the future.',
    url:         'Please enter a valid URL.',
};

function parseRules(input) {
    const raw = (input.dataset.rule || '').trim();
    if (!raw) return [];
    return raw.split(',').map(r => r.trim()).filter(Boolean);
}

function validateField(input) {
    const rules = parseRules(input);
    if (!rules.length) return true;

    const val = (input.value || '').trim();

    for (const rule of rules) {
        // min{N} / max{N} length rules
        if (/^min\d+$/.test(rule)) {
            const n = parseInt(rule.slice(3));
            if (val !== '' && val.length < n) {
                showError(input, `Must be at least ${n} characters.`);
                return false;
            }
            continue;
        }
        if (/^max\d+$/.test(rule)) {
            const n = parseInt(rule.slice(3));
            if (val.length > n) {
                showError(input, `Cannot exceed ${n} characters.`);
                return false;
            }
            continue;
        }

        // match:#otherId rule
        if (rule.startsWith('match:')) {
            const otherId = rule.slice(6);
            const other = document.getElementById(otherId);
            if (other && input.value !== other.value) {
                showError(input, 'Passwords do not match.');
                return false;
            }
            continue;
        }

        // named rules
        const fn = RULES[rule];
        if (!fn) continue;

        const ok = fn(val, input);
        if (!ok) {
            // Special messages for password with min requirement
            if (rule === 'number' && input.dataset.min !== undefined) {
                showError(input, `Value must be at least ${input.dataset.min}.`);
            } else if (rule === 'name' && val.length > 0 && val.trim().length < 3) {
                showError(input, 'Name must be at least 3 characters.');
            } else {
                showError(input, RULE_MESSAGES[rule] || 'Invalid value.');
            }
            return false;
        }
    }

    if (val !== '') {
        showSuccess(input);
    } else {
        clearError(input);
    }
    return true;
}

// ─── Initialize on DOM Ready ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

    // ── 1. Per-input blur + input events ─────────────────────────────────────
    document.addEventListener('blur', (e) => {
        const el = e.target;
        if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
        if (el.dataset.rule) validateField(el);
    }, true);

    document.addEventListener('input', (e) => {
        const el = e.target;
        if (!['INPUT', 'TEXTAREA'].includes(el.tagName)) return;

        // Real-time instant validation feedback when field has error or success state
        if (el.dataset.rule && (el.classList.contains('input-error') || el.classList.contains('input-success'))) {
            validateField(el);
        } else if (el.classList.contains('input-error')) {
            clearError(el);
        }

        // Forbidden chars check on text inputs
        if (!isForbiddenExempt(el) && FORBIDDEN_RE.test(el.value)) {
            showForbiddenError(el, 'Special characters not allowed.');
        }
    });

    document.addEventListener('change', (e) => {
        const el = e.target;
        if (el.tagName === 'SELECT' && el.dataset.rule) {
            validateField(el);
        }
    });

    // ── 2. Block forbidden key presses ───────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        const el = e.target;
        if (!['INPUT', 'TEXTAREA'].includes(el.tagName)) return;
        if (isForbiddenExempt(el)) return;
        if (FORBIDDEN_KEYS.has(e.key)) {
            e.preventDefault();
            showForbiddenError(el, `"${e.key}" is not allowed here.`);
            setTimeout(() => clearForbiddenError(el), 2000);
        }
    });

    // ── 3. Block forbidden paste ──────────────────────────────────────────────
    document.addEventListener('paste', (e) => {
        const el = e.target;
        if (!['INPUT', 'TEXTAREA'].includes(el.tagName)) return;
        if (isForbiddenExempt(el)) return;
        const pasted = (e.clipboardData || window.clipboardData).getData('text');
        if (FORBIDDEN_RE.test(pasted)) {
            e.preventDefault();
            showForbiddenError(el, 'Pasted text contains invalid characters.');
            setTimeout(() => clearForbiddenError(el), 2500);
        }
    });

    // ── 4. Pre-submit — validate all data-rule fields ────────────────────────
    document.addEventListener('submit', (e) => {
        const form = e.target;
        let isValid = true;
        let firstInvalid = null;

        form.querySelectorAll('[data-rule]').forEach(el => {
            if (!validateField(el)) {
                isValid = false;
                if (!firstInvalid) firstInvalid = el;
            }
        });

        // Also block forbidden chars
        form.querySelectorAll('input, textarea').forEach(el => {
            if (isForbiddenExempt(el)) return;
            if (FORBIDDEN_RE.test(el.value)) {
                showForbiddenError(el, 'Special characters not allowed.');
                isValid = false;
                if (!firstInvalid) firstInvalid = el;
            }
        });

        if (!isValid) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (firstInvalid) {
                firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                firstInvalid.focus();
            }
        }
    }, true);
});

// ─── Expose helpers globally (used by some inline handlers) ──────────────────
window.EV = {
    validateField,
    showError,
    clearError,
    showSuccess,
    validateForm(form) {
        let ok = true;
        let first = null;
        form.querySelectorAll('[data-rule]').forEach(el => {
            if (!validateField(el)) { ok = false; if (!first) first = el; }
        });
        if (!ok && first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); first.focus(); }
        return ok;
    }
};