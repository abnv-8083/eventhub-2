import Joi from 'joi';
import { NO_SPECIAL_CHARS, FORBIDDEN_CHARS_MSG } from '../common.js';

// ─── Text field with no-special-chars constraint ────────────────────────────
const safeStr = (base) =>
    base.pattern(NO_SPECIAL_CHARS, 'noSpecial').messages({
        'string.pattern.name': FORBIDDEN_CHARS_MSG
    });

export const registerSchema = Joi.object({
    fullName: safeStr(Joi.string().trim().min(3).max(60)).required().messages({
        'string.empty': 'Please provide your full name.',
        'string.min': 'Full name must be at least 3 characters.',
        'string.max': 'Full name cannot exceed 60 characters.'
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

    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
        'any.only': 'Passwords do not match.',
        'any.required': 'Please confirm your password.'
    }),

    organizationName: safeStr(Joi.string().trim()).when('role', {
        is: 'organizer',
        then: Joi.required().messages({
            'string.empty': 'Organization name is required for organizers.'
        }),
        otherwise: Joi.optional().allow('', null)
    }),

    city: safeStr(Joi.string().trim()).when('role', {
        is: 'organizer',
        then: Joi.required().messages({
            'string.empty': 'City is required for organizers.'
        }),
        otherwise: Joi.optional().allow('', null)
    }),

    phone: Joi.string().trim().pattern(/^[0-9+\-\s]{7,15}$/).when('role', {
        is: 'organizer',
        then: Joi.required().messages({
            'string.empty': 'Phone number is required for organizers.',
            'string.pattern.base': 'Enter a valid phone number (digits only, 7–15 chars).'
        }),
        otherwise: Joi.optional().allow('', null)
    })
});


export const loginSchema = Joi.object({
    email: Joi.string().trim().email().required().messages({
        'string.empty': 'Email is required.',
        'string.email': 'Please provide a valid email address.',
        'any.required': 'Email is a required field.'
    }),

    password: Joi.string().required().messages({
        'string.empty': 'Password is required.',
        'any.required': 'Password is a required field.'
    }),

    remember: Joi.any().optional()
});


const eighteenYearsAgo = new Date();
eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);

export const updateProfileSchema = Joi.object({
    fullName: Joi.string().trim().pattern(/^[a-zA-Z\s]+$/).min(3).max(50).required().messages({
        'string.empty': 'Full Name is required.',
        'string.pattern.base': 'Name can only contain letters and spaces. No numbers or special characters.',
        'string.min': 'Full Name must be at least 3 characters long.',
        'string.max': 'Full Name cannot exceed 50 characters.'
    }),

    dob: Joi.date().iso().max(eighteenYearsAgo).allow('', null).messages({
        'date.max': 'You must be at least 18 years old to use this platform.',
        'date.format': 'Please provide a valid date format.'
    }),

    phone: Joi.string().trim().pattern(/^[0-9]{10,15}$/).allow('', null).messages({
        'string.pattern.base': 'Phone number must contain ONLY numbers (10-15 digits). No spaces or symbols.'
    }),

    address: safeStr(Joi.string().trim().max(250)).allow('', null).messages({
        'string.max': 'Address cannot exceed 250 characters.'
    }),

    bio: safeStr(Joi.string().trim().max(500)).allow('', null).messages({
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