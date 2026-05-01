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
