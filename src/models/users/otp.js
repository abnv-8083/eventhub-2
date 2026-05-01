// src/models/users/otp.js
import mongoose from 'mongoose';
import OTP_CONSTANT from '../../constant/otpConstant.js';

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    code: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        // The record will automatically delete itself after 300 seconds (5 minutes)
        expires: OTP_CONSTANT.OTP_EXPIRY_SECONDS
    }
});

// Indexing email for faster lookups during verification
otpSchema.index({ email: 1 });

const OTP = mongoose.model('OTP', otpSchema);

export default OTP;