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

    startDate: Joi.date().iso().required().custom((value, helpers) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(value);
        start.setHours(0, 0, 0, 0);
        if (start < today) {
            return helpers.error('date.min');
        }
        return value;
    }).messages({
        'date.base': 'Start date must be a valid date',
        'date.min': 'Start date cannot be in the past',
        'any.required': 'Start date is required'
    }),

    // HH:MM 24-hour format enforced
    startTime: Joi.string()
        .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
        .required()
        .messages({
            'string.empty': 'Start time is required',
            'string.pattern.base': 'Start time must be a valid time in HH:MM format',
            'any.required': 'Start time is required'
        }),

    endDate: Joi.date().iso().min(Joi.ref('startDate')).required().messages({
        'date.base': 'End date must be a valid date',
        'date.min': 'End date must be same or after the start date',
        'any.required': 'End date is required'
    }),

    // HH:MM 24-hour format enforced
    endTime: Joi.string()
        .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
        .required()
        .messages({
            'string.empty': 'End time is required',
            'string.pattern.base': 'End time must be a valid time in HH:MM format',
            'any.required': 'End time is required'
        }),

    isFeatured: Joi.boolean().optional(),

    existingBanners: Joi.array().items(Joi.string().allow('', null)).optional(),

    tickets: Joi.array().items(
        Joi.object({
            _id: Joi.string().allow('', null).optional(),
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
}).custom((value, helpers) => {
    // Cross-field: when startDate === endDate, endTime must be strictly after startTime
    const { startDate, startTime, endDate, endTime } = value;
    if (startDate && startTime && endDate && endTime) {
        const startDateStr = new Date(startDate).toISOString().split('T')[0];
        const endDateStr   = new Date(endDate).toISOString().split('T')[0];

        if (startDateStr === endDateStr && endTime <= startTime) {
            return helpers.error('any.invalid', {
                message: 'End time must be after start time when the event starts and ends on the same day'
            });
        }
    }
    return value;
}).messages({
    'any.invalid': 'End time must be after start time when the event starts and ends on the same day'
});

// For updating events, we remove the min(today) restriction since events might already be ongoing.
// The cross-field end-time check is preserved via the .custom() on the base schema.
export const updateEventValidationSchema = eventValidationSchema.keys({
    startDate: Joi.date().iso().required().messages({
        'date.base': 'Start date must be a valid date',
        'any.required': 'Start date is required'
    })
});

// Draft Validation Schema
export const draftEventValidationSchema = Joi.object({
    title: safeStr(Joi.string().trim().min(3).max(100)).required().messages({
        'string.empty': 'Event title is required to save a draft',
        'string.min': 'Title must be at least 3 characters',
        'any.required': 'Event title is required to save a draft'
    }),
    description: safeStr(Joi.string().trim().allow('', null)),
    category: Joi.string().allow('', null),
    address: Joi.string().allow('', null),
    lat: Joi.number().allow('', null).optional(),
    lng: Joi.number().allow('', null).optional(),
    startDate: Joi.alternatives().try(Joi.date().iso(), Joi.string().valid('', null)).optional(),
    startTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).allow('', null).optional(),
    endDate: Joi.alternatives().try(Joi.date().iso(), Joi.string().valid('', null)).optional(),
    endTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).allow('', null).optional(),
    isFeatured: Joi.boolean().optional(),
    existingBanners: Joi.array().items(Joi.string().allow('', null)).optional(),
    tickets: Joi.array().items(
        Joi.object({
            _id: Joi.string().allow('', null).optional(),
            name: safeStr(Joi.string().trim()).required(),
            price: Joi.number().min(0).required(),
            capacity: Joi.number().min(1).required(),
            maxPerUser: Joi.number().min(1).required()
        })
    ).optional().default([])
});
