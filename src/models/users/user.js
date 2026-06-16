// src/models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: [true, 'Please provide your full name'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Please provide your email'],
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: function(){
            return !this.googleId
        },
        minlength: 8,
        select: false // Hides the password from standard DB queries by default
    },
    role: {
        type: String,
        enum: ['user', 'organizer', 'admin'],
        default: 'user'
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true,
    },
    avatar: {
        type: String,
        default: ''
    },
    
    // ==========================================
    // Organizer Specific Fields
    // ==========================================
    organizationName: {
        type: String,
        trim: true
    },
    city: {
        type: String,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    isBlocked: {
        type: Boolean,
        default: false,
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: function() {
            if (this.role === 'organizer') return 'pending';
            return undefined; 
        }
    },

    // ==========================================
    // Wishlist & Wallet
    // ==========================================
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }],

    wallet: {
        balance: { type: Number, default: 0 },
        transactions: [{
            type: { type: String, enum: ['credit', 'debit'] },
            amount: { type: Number },
            description: { type: String },
            date: { type: Date, default: Date.now }
        }]
    },

    // ==========================================
    // Referral System
    // ==========================================
    referralCode: {
        type: String,
        unique: true,
        sparse: true,
        uppercase: true,
        trim: true
    },
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    referralRewardGiven: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true // Automatically adds 'createdAt' and 'updatedAt' fields
});

const User = mongoose.model('User', userSchema);

export default User;