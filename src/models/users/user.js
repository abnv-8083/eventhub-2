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
            // Only apply a status if the user is registering as an organizer
            if (this.role === 'organizer') {
                return 'pending';
            }
            // Return undefined so regular users do not get a status field at all
            return undefined; 
        }
    }
}, {
    timestamps: true // Automatically adds 'createdAt' and 'updatedAt' fields
});

const User = mongoose.model('User', userSchema);

export default User;