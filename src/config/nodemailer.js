// src/config/nodemailer.js
import nodemailer from 'nodemailer';

// Create the transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify connection configuration on startup
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ Nodemailer Connection Error:', error);
    } else {
        console.log('✅ Nodemailer is ready to send emails');
    }
});

export default transporter;