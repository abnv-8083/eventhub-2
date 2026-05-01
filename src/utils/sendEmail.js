// src/utils/sendEmail.js
import nodemailer from 'nodemailer';

const sendEmail = async (options) => {
    // 1. Create a transporter
    const transporter = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
            user: process.env.EMAIL_USER, // Your Gmail address
            pass: process.env.EMAIL_PASS  // Your Gmail App Password
        }
    });

    // 2. Define email options
    const mailOptions = {
        from: 'EventHub <no-reply@eventhub.com>',
        to: options.email,
        subject: options.subject,
        text: options.message,
        html: options.html 
    };

    // 3. Send the email
    await transporter.sendMail(mailOptions);
};

export default sendEmail;