import Joi from 'joi';

/**
 * Validation schema for the Admin Login process.
 * Enforces strict email formatting and prevents empty submissions.
 */
export const adminLoginSchema = Joi.object({
    email: Joi.string()
        .trim()
        .email()
        .required()
        .messages({
            'string.empty': 'Admin email is required.',
            'string.email': 'Please enter a valid administrative email address.',
            'any.required': 'Email is a mandatory field.'
        }),
    
    password: Joi.string()
        .required()
        .messages({
            'string.empty': 'Security key is required.',
            'any.required': 'Password is a mandatory field.'
        })
});