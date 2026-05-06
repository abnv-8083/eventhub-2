// public/js/loader.js
const Loader = {
    init() {
        // Only create the loader if it doesn't already exist on the page
        if (!document.getElementById('custom-loader')) {
            const loaderDiv = document.createElement('div');
            loaderDiv.id = 'custom-loader';
            loaderDiv.className = 'loader-overlay';
            loaderDiv.style.display = 'none';

            loaderDiv.innerHTML = `
                <img src="/images/loader-logo.png" alt="Loading..." class="custom-loader-img">
                <div class="loader-text" id="loader-text">PLEASE WAIT...</div>
            `;
            
            document.body.appendChild(loaderDiv);
        }
    },

    show(text = 'PLEASE WAIT...') {
        this.init(); // Ensure it exists
        const loader = document.getElementById('custom-loader');
        const loaderText = document.getElementById('loader-text');
        
        if (loaderText) {
            loaderText.innerText = text.toUpperCase(); // Update the text dynamically
        }
        
        loader.style.display = 'flex';
    },

    hide() {
        const loader = document.getElementById('custom-loader');
        if (loader) {
            loader.style.display = 'none';
        }
    }
};

