// public/js/confirm.js
const CustomConfirm = {
    show({ title, message, confirmText = 'Confirm', actionType = 'danger', icon = 'fi-rr-triangle-warning' }) {
        return new Promise((resolve) => {
            const modal = document.getElementById('customConfirmModal');
            const titleEl = document.getElementById('confirmTitle');
            const messageEl = document.getElementById('confirmMessage');
            const confirmBtn = document.getElementById('confirmActionBtn');
            const cancelBtn = document.getElementById('confirmCancelBtn');
            const iconEl = document.getElementById('confirmIcon');
            const iconBg = document.getElementById('confirmIconBg');

            if (!modal) {
                console.error("Confirmation modal HTML missing from page!");
                return resolve(false);
            }

            // Set Content
            titleEl.innerText = title;
            messageEl.innerText = message;
            confirmBtn.innerText = confirmText;
            iconEl.className = `fi ${icon}`;

            // Reset classes and set theme
            confirmBtn.className = 'btn flex-grow-1'; 
            if (actionType === 'danger') {
                confirmBtn.classList.add('btn-primary'); // Red
                iconBg.style.background = 'rgba(230, 57, 70, 0.1)';
                iconBg.style.color = '#E63946';
            } else {
                confirmBtn.style.backgroundColor = '#f1c40f'; // Warning Yellow
                iconBg.style.background = 'rgba(241, 196, 15, 0.1)';
                iconBg.style.color = '#f1c40f';
            }

            modal.classList.add('active');

            const handleConfirm = () => {
                cleanup();
                resolve(true);
            };

            const handleCancel = () => {
                cleanup();
                resolve(false);
            };

            const cleanup = () => {
                modal.classList.remove('active');
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
            };

            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
        });
    }
};