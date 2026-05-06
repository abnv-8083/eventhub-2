// public/js/validation.js

document.addEventListener('DOMContentLoaded', () => {
    // Select all forms on the page
    const forms = document.querySelectorAll('form');

    forms.forEach(form => {
        // 1. Validate on Form Submit
        form.addEventListener('submit', (e) => {
            let isValid = true;
            const inputs = form.querySelectorAll('input, select, textarea');

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
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            // Check validation when leaving the input
            input.addEventListener('blur', () => validateInput(input));
            
            // Remove the error styling immediately when they start typing again
            input.addEventListener('input', () => removeError(input)); 
        });
    });

    // Core Validation Logic
    // Core Validation Logic
    function validateInput(input) {
        removeError(input); // Clear previous errors
        let valid = true;

        // 1. Required Check (Stops immediately if empty and required)
        if (input.value.trim() === '' && input.hasAttribute('required')) {
            showError(input, 'This field is required.');
            return false; 
        }

        // 2. Ignore empty optional fields (like phone or address if not filled)
        if (input.value.trim() === '') {
            return true;
        }

        // 3. Smart Full Name Check
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
        
        // 4. Smart Phone Number Check
        else if (input.name === 'phone') {
            // Check if it has anything OTHER than numbers
            if (/[^0-9]/.test(input.value)) {
                showError(input, 'Phone number can only contain numbers.');
                valid = false;
            } 
            // Check if the length is wrong
            else if (input.value.length < 10 || input.value.length > 10) {
                showError(input, 'Phone number must be 10');
                valid = false;
            }
        }
        
        // 5. Smart Date of Birth Check
        else if (input.type === 'date') {
            const dob = new Date(input.value);
            const today = new Date();
            
            // Set time to midnight for accurate comparisons
            today.setHours(0, 0, 0, 0);
            dob.setHours(0, 0, 0, 0);

            if (dob > today) {
                showError(input, 'Date of birth cannot be in the future.');
                valid = false;
            } else {
                let age = today.getFullYear() - dob.getFullYear();
                const monthDiff = today.getMonth() - dob.getMonth();

                // Adjust age if they haven't had their birthday yet this year
                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
                    age--;
                }

                if (age < 18) {
                    showError(input, 'You must be at least 18 years old.');
                    valid = false;
                }
            }
        }

        // 6. Email Check
        else if (input.type === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(input.value)) {
                showError(input, 'Please enter a valid email address.');
                valid = false;
            }
        }

        // 7. Password Check
        else if (input.type === 'password' && input.value.length < 8) {
            showError(input, 'Password must be at least 8 characters long.');
            valid = false;
        }

        // 8. Fallback for any other HTML5 errors we missed
        if (valid && !input.checkValidity()) {
             showError(input, 'Please match the requested format.');
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