// public/js/toast.js

const Toast = {
    // Standard timeout for toasts to disappear (in milliseconds)
    duration: 4000,

    init() {
        // Create the container if it doesn't exist in the DOM yet
        if (!document.getElementById('toast-container')) {
            const container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
    },

    show(message, type = 'success') {
        this.init();
        const container = document.getElementById('toast-container');
        
        // Create the toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        // Crisp SVG Icons with glowing colors
        const successIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        const errorIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E63946" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
        const closeIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

        // The HTML structure now includes a dedicated progress bar at the bottom
        // Notice we dynamically set the animation duration to match your JS timer!
        toast.innerHTML = `
            <div class="toast-content">
                <div class="toast-icon">${type === 'success' ? successIcon : errorIcon}</div>
                <div class="toast-message">${message}</div>
                <div class="toast-close">${closeIcon}</div>
            </div>
            <div class="toast-progress" style="animation-duration: ${this.duration}ms;"></div>
        `;

        // Add to container
        container.appendChild(toast);

        // Trigger the slide-in animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Handle the close button click
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this.remove(toast));

        // Automatically remove after the duration
        setTimeout(() => this.remove(toast), this.duration);
    },

    remove(toast) {
        // Slide out animation
        toast.classList.remove('show');
        
        // Wait for the CSS transition to finish before removing from DOM
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 400); // Matches your 0.4s CSS transition
    },

    // Helper methods for quick calling
    success(message) {
        this.show(message, 'success');
    },

    error(message) {
        this.show(message, 'error');
    }
};