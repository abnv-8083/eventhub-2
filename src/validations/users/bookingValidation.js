import Joi from 'joi';

export const bookingValidationSchema = Joi.object({
    // We now validate an array of items (the cart) instead of a single ticket
    cart: Joi.array().items(
        Joi.object({
            ticketId: Joi.string().required().messages({
                'string.empty': 'Ticket ID is required',
                'any.required': 'Ticket ID is required'
            }),
            quantity: Joi.number().integer().min(1).required().messages({
                'number.min': 'Quantity must be at least 1',
                'any.required': 'Quantity is required'
            })
        })
    ).min(1).required().messages({
        'array.min': 'Your cart cannot be empty',
        'any.required': 'Cart data is missing'
    })
});