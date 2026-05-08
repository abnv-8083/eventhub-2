// public/js/toast.js

const Toast = {
    // Standard timeout for toasts to disappear (in milliseconds)
    duration: 4000,

    init() {
        if (!document.getElementById('toast-container')) {
            const container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
    },

    show(message, type = 'success') {
        this.init();
        const container = document.getElementById('toast-container');
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const successIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        const errorIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E63946" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
        const closeIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

        toast.innerHTML = `
            <div class="toast-content">
                <div class="toast-icon">${type === 'success' ? successIcon : errorIcon}</div>
                <div class="toast-message">${message}</div>
                <div class="toast-close">${closeIcon}</div>
            </div>
            <div class="toast-progress" style="animation-duration: ${this.duration}ms;"></div>
        `;

        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this.remove(toast));

        // --- HOVER PAUSE LOGIC ---
        let timeoutId;
        let startTime = Date.now();
        let remainingTime = this.duration;
        const progressBar = toast.querySelector('.toast-progress');

        // Initial setup to remove the toast
        const startTimer = () => {
            timeoutId = setTimeout(() => this.remove(toast), remainingTime);
            if(progressBar) progressBar.style.animationPlayState = 'running';
        };
        startTimer();

        // Pause on Hover
        toast.addEventListener('mouseenter', () => {
            clearTimeout(timeoutId); // Stop the removal JS timer
            remainingTime -= (Date.now() - startTime); // Calculate how much time is left
            if(progressBar) progressBar.style.animationPlayState = 'paused'; // Freeze the CSS bar
        });

        // Resume when Mouse Leaves
        toast.addEventListener('mouseleave', () => {
            startTime = Date.now(); // Reset the start time 
            startTimer(); // Start the timer again with the remaining time
        });
    },

    remove(toast) {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 400); 
    },

    success(message) { this.show(message, 'success'); },
    error(message) { this.show(message, 'error'); }
};