import Joi from 'joi';
import { NO_SPECIAL_CHARS, FORBIDDEN_CHARS_MSG } from '../common.js';

const safeStr = (base) =>
    base.pattern(NO_SPECIAL_CHARS, 'noSpecial').messages({
        'string.pattern.name': FORBIDDEN_CHARS_MSG
    });

export const categoryValidationSchema = Joi.object({
    name: safeStr(Joi.string().trim().min(2).max(50)).required().messages({
        'string.empty': 'Category name cannot be empty',
        'string.min': 'Category name must be at least 2 characters long',
        'string.max': 'Category name cannot exceed 50 characters',
        'any.required': 'Category name is required'
    }),
    description: safeStr(Joi.string().trim().max(250)).required().messages({
        'string.empty': 'Description cannot be empty',
        'string.max': 'Description cannot exceed 250 characters',
        'any.required': 'Description is required'
    })
});
