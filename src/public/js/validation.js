// public/js/validation.js

// ─── Forbidden Characters ──────────────────────────────────────────────────
// Applies to all text inputs EXCEPT: email, password, date, number, hidden
const FORBIDDEN_RE = /[#!<>?\/\\*&\^%\$]/;
const FORBIDDEN_MSG = 'Must not contain special characters: # ! < > ? / * & ^ % $';

// Fields exempt from the forbidden-chars check
const EXEMPT_TYPES  = new Set(['email', 'password', 'date', 'time', 'number', 'hidden', 'file', 'checkbox', 'radio', 'submit', 'button']);
const EXEMPT_NAMES  = new Set(['email', 'password', 'newPassword', 'confirmPassword', 'currentPassword', 'lat', 'lng']);

function isForbiddenCharsExempt(input) {
    return EXEMPT_TYPES.has(input.type) || EXEMPT_NAMES.has(input.name) || input.dataset.noSpecialCheck === 'false';
}

// ─── Global real-time forbidden chars check on every text input ────────────
document.addEventListener('DOMContentLoaded', () => {
    // ── Real-time hint while typing ──────────────────────────────────────────
    document.addEventListener('input', (e) => {
        const input = e.target;
        if (!['INPUT', 'TEXTAREA'].includes(input.tagName)) return;
        if (isForbiddenCharsExempt(input)) return;

        if (FORBIDDEN_RE.test(input.value)) {
            showForbiddenError(input);
        } else {
            clearForbiddenError(input);
        }
    });

    // ── Block keypress of forbidden chars instantly ──────────────────────────
    document.addEventListener('keydown', (e) => {
        const input = e.target;
        if (!['INPUT', 'TEXTAREA'].includes(input.tagName)) return;
        if (isForbiddenCharsExempt(input)) return;

        const FORBIDDEN_KEYS = new Set(['#', '!', '<', '>', '?', '/', '.', ',', '*', '&', '^', '%', '$']);
        if (FORBIDDEN_KEYS.has(e.key)) {
            e.preventDefault();
            showForbiddenError(input, `"${e.key}" is not allowed in this field`);
            // Auto-hide after 2s
            setTimeout(() => clearForbiddenError(input), 2000);
        }
    });

    // ── Block paste of forbidden chars ───────────────────────────────────────
    document.addEventListener('paste', (e) => {
        const input = e.target;
        if (!['INPUT', 'TEXTAREA'].includes(input.tagName)) return;
        if (isForbiddenCharsExempt(input)) return;

        const pasted = (e.clipboardData || window.clipboardData).getData('text');
        if (FORBIDDEN_RE.test(pasted)) {
            e.preventDefault();
            showForbiddenError(input, 'Pasted text contains invalid special characters');
            setTimeout(() => clearForbiddenError(input), 2500);
        }
    });

    // ── Pre-submit check on every form ───────────────────────────────────────
    document.addEventListener('submit', (e) => {
        const form = e.target;
        let blocked = false;
        form.querySelectorAll('input, textarea').forEach(input => {
            if (isForbiddenCharsExempt(input)) return;
            if (FORBIDDEN_RE.test(input.value)) {
                showForbiddenError(input);
                blocked = true;
            }
        });
        if (blocked) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true); // capture phase so it runs before other submit listeners


    // ─── Original Per-Form Validation (kept for required / format checks) ────
    const forms = document.querySelectorAll('form');

    forms.forEach(form => {
        form.addEventListener('submit', (e) => {
            let isValid = true;
            const inputs = form.querySelectorAll('input, select, textarea');

            inputs.forEach(input => {
                if (!validateInput(input)) isValid = false;
            });

            const password = form.querySelector('#password, #newPassword');
            const confirmPassword = form.querySelector('#confirmPassword');
            if (password && confirmPassword) {
                if (password.value !== confirmPassword.value) {
                    showError(confirmPassword, 'Passwords do not match.');
                    isValid = false;
                }
            }

            if (!isValid) e.preventDefault();
        });

        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('blur', () => validateInput(input));
            input.addEventListener('input', () => removeError(input));
        });
    });


    // ─── Core Field-Level Validation ────────────────────────────────────────
    function validateInput(input) {
        removeError(input);
        let valid = true;

        // Skip non-text inputs
        if (EXEMPT_TYPES.has(input.type)) return true;

        // Required check
        if (input.value.trim() === '' && input.hasAttribute('required')) {
            showError(input, 'This field is required.');
            return false;
        }
        if (input.value.trim() === '') return true;

        // Forbidden chars (double-check at field level)
        if (!isForbiddenCharsExempt(input) && FORBIDDEN_RE.test(input.value)) {
            showError(input, FORBIDDEN_MSG);
            return false;
        }

        // Full Name
        if (input.name === 'fullName') {
            if (/[0-9]/.test(input.value)) {
                showError(input, 'Name cannot contain numbers.');
                valid = false;
            } else if (/[^a-zA-Z\s]/.test(input.value)) {
                showError(input, 'Name cannot contain special characters.');
                valid = false;
            } else if (input.value.trim().length < 3) {
                showError(input, 'Name must be at least 3 characters long.');
                valid = false;
            }
        }

        // Phone
        else if (input.name === 'phone') {
            if (/[^0-9]/.test(input.value)) {
                showError(input, 'Phone number can only contain numbers.');
                valid = false;
            } else if (input.value.length < 10 || input.value.length > 15) {
                showError(input, 'Phone number must be 10–15 digits.');
                valid = false;
            }
        }

        // Date of Birth
        else if (input.type === 'date' && (input.name === 'dob' || input.name === 'dateOfBirth')) {
            const dob = new Date(input.value);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            dob.setHours(0, 0, 0, 0);

            if (dob > today) {
                showError(input, 'Date of birth cannot be in the future.');
                valid = false;
            } else {
                let age = today.getFullYear() - dob.getFullYear();
                const m = today.getMonth() - dob.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
                if (age < 18) {
                    showError(input, 'You must be at least 18 years old.');
                    valid = false;
                }
            }
        }

        // Email
        else if (input.type === 'email') {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) {
                showError(input, 'Please enter a valid email address.');
                valid = false;
            }
        }

        // Password length
        else if (input.type === 'password' && input.value.length < 8) {
            showError(input, 'Password must be at least 8 characters long.');
            valid = false;
        }

        // HTML5 fallback
        if (valid && !input.checkValidity()) {
            showError(input, 'Please match the requested format.');
            valid = false;
        }

        return valid;
    }


    // ─── Error UI Helpers ────────────────────────────────────────────────────
    function showError(input, message) {
        input.classList.add('input-error');
        const container = input.parentElement.classList.contains('password-group')
            ? input.parentElement.parentElement
            : input.parentElement;
        let errorDiv = container.querySelector('.error-text');
        if (!errorDiv) {
            errorDiv = document.createElement('span');
            errorDiv.className = 'error-text';
            container.appendChild(errorDiv);
        }
        errorDiv.innerText = message;
    }

    function removeError(input) {
        input.classList.remove('input-error');
        const container = input.parentElement.classList.contains('password-group')
            ? input.parentElement.parentElement
            : input.parentElement;
        const errorDiv = container.querySelector('.error-text');
        if (errorDiv) errorDiv.remove();
    }
});

// ─── Forbidden-char error helpers (outside DOMContentLoaded for inline use) ──
function showForbiddenError(input, msg) {
    input.style.borderColor = 'rgba(230,57,70,0.7)';
    let hint = input.parentElement.querySelector('.fc-hint');
    if (!hint) {
        hint = document.createElement('span');
        hint.className = 'fc-hint';
        hint.style.cssText = 'color:#e63946;font-size:0.76rem;display:block;margin-top:3px;';
        input.parentElement.appendChild(hint);
    }
    hint.textContent = msg || 'Must not contain: # ! < > ? / . , * & ^ % $';
}

function clearForbiddenError(input) {
    input.style.borderColor = '';
    const hint = input.parentElement.querySelector('.fc-hint');
    if (hint) hint.remove();
}