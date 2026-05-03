// src/utils/sendOtpEmail.js
import transporter from '../config/nodemailer.js';

/**
 * Sends a stylized OTP verification email to the user.
 * 
 * @param {string} email - The recipient's email address
 * @param {string|number} otp - The 4-digit OTP code
 * @returns {Promise<boolean>} - Returns true if successful, false otherwise
 */
export const sendOtpEmail = async (email, otp, subject) => {
    try {
        const mailOptions = {
            from: `"EventHub" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `${subject} - EVENTHUB`,
            html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f5;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
                    <tr>
                        <td align="center">
                            <!-- Main Email Card -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 20px rgba(0,0,0,0.05);">
                                
                                <!-- Header -->
                                <tr>
                                    <td align="center" style="background-color: #161616; padding: 40px 20px;">
                                        <h1 style="color: #ffffff; margin: 0; font-size: 28px; letter-spacing: 1px;">
                                            Event<span style="color: #E63946;">Hub</span>
                                        </h1>
                                    </td>
                                </tr>

                                <!-- Body Content -->
                                <tr>
                                    <td style="padding: 40px 30px; color: #333333; line-height: 1.6; font-size: 16px;">
                                        <h2 style="margin-top: 0; color: #161616; font-size: 22px;">Secure your account.</h2>
                                        <p style="margin-bottom: 20px;">Hello,</p>
                                        <p style="margin-bottom: 30px;">Thank you for joining EventHub. To complete your verification, please enter the code below into the application:</p>
                                        
                                        <!-- OTP Box -->
                                        <div style="background-color: #fafafa; border: 2px dashed #E63946; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
                                            <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #E63946;">
                                                ${otp}
                                            </span>
                                        </div>
                                        
                                        <p style="margin-top: 30px;">This verification code will expire in 10 minutes.</p>
                                        <p style="color: #777777; font-size: 14px;">If you did not request this code, you can safely ignore this email.</p>
                                    </td>
                                </tr>

                                <!-- Footer -->
                                <tr>
                                    <td align="center" style="background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #eeeeee; color: #888888; font-size: 12px; line-height: 1.5;">
                                        &copy; ${new Date().getFullYear()} EventHub. All rights reserved.<br>
                                        Kozhikode, Kerala, India
                                    </td>
                                </tr>

                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            `
        };

        // Send the email using the imported global transporter
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ OTP Email sent successfully:', info.messageId);
        return true;

    } catch (error) {
        console.error("❌ Email sending failed:", error);
        return false;
    }
};

export const sendOrganizerCredentials = async (email, tempPassword, organizationName) => {
    try {
        const mailOptions = {
            from: `"EventHub Admin" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Welcome to EventHub! Your Organizer Credentials',
            html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #121212; padding: 40px 20px; color: #ffffff;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #1e1e1e; border-radius: 12px; overflow: hidden; border: 1px solid #333;">
                    
                    <!-- Header -->
                    <div style="background-color: #E63946; padding: 25px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px;">Event<span style="font-weight: 300;">Hub</span></h1>
                    </div>

                    <!-- Body -->
                    <div style="padding: 30px;">
                        <h2 style="color: #ffffff; margin-top: 0;">Welcome, ${organizationName}!</h2>
                        <p style="color: #cccccc; line-height: 1.6; font-size: 16px;">
                            Your organizer account has been successfully created. You can now log in to your dashboard to start creating and managing your events.
                        </p>
                        
                        <div style="background-color: #2a2a2a; border-left: 4px solid #E63946; padding: 20px; margin: 25px 0; border-radius: 4px;">
                            <p style="margin: 0 0 10px 0; color: #888; font-size: 14px; text-transform: uppercase;">Your Login Details</p>
                            <p style="margin: 0 0 10px 0; color: #fff; font-size: 16px;"><strong>Email:</strong> ${email}</p>
                            <p style="margin: 0; color: #fff; font-size: 16px;"><strong>Password:</strong> <span style="font-family: monospace; background: #111; padding: 4px 8px; border-radius: 4px; letter-spacing: 1px;">${tempPassword}</span></p>
                        </div>

                        <p style="color: #e63946; font-size: 14px; font-weight: 600;">
                            ⚠️ For your security, please change this password immediately after logging in.
                        </p>

                        <!-- Call to Action Button -->
                        <div style="text-align: center; margin-top: 35px;">
                            <a href="${process.env.BASE_URL || 'http://localhost:3000'}/user/login" 
                               style="background-color: #E63946; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px;">
                                Go to Dashboard
                            </a>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div style="background-color: #151515; padding: 20px; text-align: center; border-top: 1px solid #222;">
                        <p style="color: #666; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} EventHub. All rights reserved.</p>
                    </div>
                </div>
            </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Credentials email sent to ${email} - Message ID: ${info.messageId}`);
        return true;

    } catch (error) {
        console.error("Error sending organizer credentials:", error);
        return false;
    }
};