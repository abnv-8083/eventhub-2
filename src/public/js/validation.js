// public/js/validation.js

document.addEventListener('DOMContentLoaded', () => {
    // Select all forms on the page
    const forms = document.querySelectorAll('form');

    forms.forEach(form => {
        // 1. Validate on Form Submit
        form.addEventListener('submit', (e) => {
            let isValid = true;
            const inputs = form.querySelectorAll('input[required], select[required]');

            // Check every required input
            inputs.forEach(input => {
                if (!validateInput(input)) {
                    isValid = false;
                }
            });

            // Check for matching passwords (used in Register & Reset pages)
            const password = form.querySelector('#password, #newPassword');
            const confirmPassword = form.querySelector('#confirmPassword');

            if (password && confirmPassword) {
                if (password.value !== confirmPassword.value) {
                    showError(confirmPassword, 'Passwords do not match.');
                    isValid = false;
                }
            }

            // Prevent submission if anything is invalid
            if (!isValid) {
                e.preventDefault(); 
            }
        });

        // 2. Real-time validation (when user clicks out of a field or types)
        const inputs = form.querySelectorAll('input[required], select[required]');
        inputs.forEach(input => {
            // Check validation when leaving the input
            input.addEventListener('blur', () => validateInput(input));
            
            // Remove the error styling immediately when they start typing again
            input.addEventListener('input', () => removeError(input)); 
        });
    });

    // Core Validation Logic
    function validateInput(input) {
        removeError(input); // Clear previous errors
        let valid = true;

        if (input.value.trim() === '') {
            showError(input, 'This field is required.');
            valid = false;
        } else if (input.type === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(input.value)) {
                showError(input, 'Please enter a valid email address.');
                valid = false;
            }
        } else if (input.type === 'password' && input.value.length < 8) {
            showError(input, 'Password must be at least 8 characters long.');
            valid = false;
        }

        return valid;
    }

    // UI Updates - Uses your custom EventHub CSS classes
    function showError(input, message) {
        input.classList.add('input-error');
        
        // Find where to put the error text
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
        if (errorDiv) {
            errorDiv.remove();
        }
    }
});