// src/validations/auth.validation.js
import Joi from 'joi';

export const registerSchema = Joi.object({
    fullName: Joi.string().trim().required().messages({
        'string.empty': 'Please provide your full name.'
    }),
    
    email: Joi.string().trim().email().required().messages({
        'string.empty': 'Email is required.',
        'string.email': 'Please provide a valid email address.'
    }),
    
    role: Joi.string().valid('user', 'organizer').default('user'),
    
    password: Joi.string().min(8).required().messages({
        'string.empty': 'Password is required.',
        'string.min': 'Password must be at least 8 characters long.'
    }),
    
    // Ensure confirmPassword matches the password field exactly
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
        'any.only': 'Passwords do not match.',
        'any.required': 'Please confirm your password.'
    }),

    // ==========================================
    // Conditional Organizer Fields
    // ==========================================
    
    organizationName: Joi.string().trim().when('role', {
        is: 'organizer',
        then: Joi.required().messages({
            'string.empty': 'Organization name is required for organizers.'
        }),
        otherwise: Joi.optional().allow('', null)
    }),
    
    city: Joi.string().trim().when('role', {
        is: 'organizer',
        then: Joi.required().messages({
            'string.empty': 'City is required for organizers.'
        }),
        otherwise: Joi.optional().allow('', null)
    }),
    
    phone: Joi.string().trim().when('role', {
        is: 'organizer',
        then: Joi.required().messages({
            'string.empty': 'Phone number is required for organizers.'
        }),
        otherwise: Joi.optional().allow('', null)
    })
});


export const loginSchema = Joi.object({
    email: Joi.string()
        .trim()
        .email()
        .required()
        .messages({
            'string.empty': 'Email is required.',
            'string.email': 'Please provide a valid email address.',
            'any.required': 'Email is a required field.'
        }),

    password: Joi.string()
        .required()
        .messages({
            'string.empty': 'Password is required.',
            'any.required': 'Password is a required field.'
        }),
    
    // This allows the "Remember Me" checkbox to pass validation if it exists in your form
    remember: Joi.any().optional() 
});


// Calculate the exact date 18 years ago from today
const eighteenYearsAgo = new Date();
eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);

export const updateProfileSchema = Joi.object({
    // Only letters (upper/lower) and spaces allowed
    fullName: Joi.string().trim().pattern(/^[a-zA-Z\s]+$/).min(3).max(50).required().messages({
        'string.empty': 'Full Name is required.',
        'string.pattern.base': 'Name can only contain letters and spaces. No numbers or special characters.',
        'string.min': 'Full Name must be at least 3 characters long.',
        'string.max': 'Full Name cannot exceed 50 characters.'
    }),
    
    // Max date is exactly 18 years ago
    dob: Joi.date().iso().max(eighteenYearsAgo).allow('', null).messages({
        'date.max': 'You must be at least 18 years old to use this platform.',
        'date.format': 'Please provide a valid date format.'
    }),
    
    // Exactly numbers only, between 10 and 15 digits
    phone: Joi.string().trim().pattern(/^[0-9]{10,15}$/).allow('', null).messages({
        'string.pattern.base': 'Phone number must contain ONLY numbers (10-15 digits). No spaces or symbols.'
    }),
    
    address: Joi.string().trim().max(250).allow('', null).messages({
        'string.max': 'Address cannot exceed 250 characters.'
    }),
    
    bio: Joi.string().trim().max(500).allow('', null).messages({
        'string.max': 'Bio cannot exceed 500 characters.'
    })
});

export const updatePasswordSchema = Joi.object({
    action: Joi.string().valid('add', 'update').required(),
    
    currentPassword: Joi.string().when('action', {
        is: 'update',
        then: Joi.required().messages({
            'string.empty': 'Current password is required.'
        }),
        otherwise: Joi.optional().allow('', null)
    }),
    
    // NEW: Added .invalid() to prevent matching the current password
    newPassword: Joi.string().min(8).invalid(Joi.ref('currentPassword')).required().messages({
        'string.empty': 'New password is required.',
        'string.min': 'New password must be at least 8 characters long.',
        'any.invalid': 'New password cannot be the same as your current password.' 
    }),
    
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required().messages({
        'any.only': 'Passwords do not match.',
        'any.required': 'Please confirm your new password.'
    })
});