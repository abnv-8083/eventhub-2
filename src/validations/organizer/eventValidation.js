import Joi from 'joi';
import { NO_SPECIAL_CHARS, FORBIDDEN_CHARS_MSG } from '../common.js';

const today = new Date();
today.setHours(0, 0, 0, 0);

// Shorthand: wrap a Joi string builder with the no-special-chars pattern
const safeStr = (base) =>
    base.pattern(NO_SPECIAL_CHARS, 'noSpecial').messages({
        'string.pattern.name': FORBIDDEN_CHARS_MSG
    });

export const eventValidationSchema = Joi.object({
    title: safeStr(Joi.string().trim().min(5).max(100)).required().messages({
        'string.empty': 'Event title is required',
        'string.min': 'Title must be at least 5 characters',
        'string.max': 'Title must not exceed 100 characters',
        'any.required': 'Event title is required'
    }),

    description: safeStr(Joi.string().trim().min(20)).required().messages({
        'string.empty': 'Event description is required',
        'string.min': 'Description must be at least 20 characters',
        'any.required': 'Event description is required'
    }),

    category: Joi.string().required().messages({
        'string.empty': 'Please select a category',
        'any.required': 'Please select a category'
    }),

    // Address comes from map click — allow . and , naturally present in place names
    address: Joi.string().required().messages({
        'string.empty': 'Please select a venue on the map',
        'any.required': 'Please select a venue on the map'
    }),

    lat: Joi.number().required().messages({
        'any.required': 'Please pin the location on the map'
    }),

    lng: Joi.number().required().messages({
        'any.required': 'Please pin the location on the map'
    }),

    startDate: Joi.date().iso().min(today).required().messages({
        'date.base': 'Start date must be a valid date',
        'date.min': 'Start date cannot be in the past',
        'any.required': 'Start date is required'
    }),

    startTime: Joi.string().required().messages({
        'string.empty': 'Start time is required',
        'any.required': 'Start time is required'
    }),

    endDate: Joi.date().iso().min(Joi.ref('startDate')).required().messages({
        'date.base': 'End date must be a valid date',
        'date.min': 'End date must be same or after the start date',
        'any.required': 'End date is required'
    }),

    endTime: Joi.string().required().messages({
        'string.empty': 'End time is required',
        'any.required': 'End time is required'
    }),

    isFeatured: Joi.boolean().optional(),

    tickets: Joi.array().items(
        Joi.object({
            name: safeStr(Joi.string().trim()).required().messages({
                'string.empty': 'Ticket name is required'
            }),
            price: Joi.number().min(0).required().messages({
                'number.min': 'Price cannot be negative',
                'any.required': 'Ticket price is required'
            }),
            capacity: Joi.number().min(1).required().messages({
                'number.min': 'Capacity must be at least 1',
                'any.required': 'Capacity is required'
            }),
            maxPerUser: Joi.number().min(1).required().messages({
                'number.min': 'Max per user must be at least 1',
                'any.required': 'Max per user is required'
            })
        })
    ).min(1).required().messages({
        'array.min': 'At least one ticket tier is required',
        'any.required': 'At least one ticket tier is required'
    })
});
