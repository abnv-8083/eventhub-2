// middlewares/errorHandler.js

const errorHandler = (err, req, res, next) => {
    // Default status code (500 Internal Server Error) and status ('error')
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // 1. ALWAYS format MongoDB Duplicate Key Error (code 11000) cleanly in ALL environments!
    if (err.code === 11000 || err.code === 11001) {
        const value = (err.errmsg || err.message).match(/(["'])(\\?.)*?\1/)?.[0] || 'this value';
        if (err.message.includes('email') || err.keyPattern?.email || err.keyValue?.email) {
            err.message = `An account with the email ${value} already exists. Please sign in instead!`;
        } else if (err.message.includes('organizationName') || err.keyPattern?.organizationName || err.keyValue?.organizationName) {
            err.message = `The organization name ${value} is already taken. Please choose another name!`;
        } else if (err.message.includes('referralCode') || err.keyPattern?.referralCode || err.keyValue?.referralCode) {
            err.message = `This referral code is already taken.`;
        } else {
            err.message = `Duplicate field value: ${value}. This value is already registered!`;
        }
        err.statusCode = 400;
        err.isOperational = true;
    }

    // 2. ALWAYS format Mongoose CastError / ValidationError cleanly in ALL environments!
    if (err.name === 'CastError') {
        err.message = `Invalid ${err.path}: ${err.value}.`;
        err.statusCode = 400;
        err.isOperational = true;
    }
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map(el => el.message);
        err.message = `Invalid input data: ${errors.join('. ')}`;
        err.statusCode = 400;
        err.isOperational = true;
    }

    // Check if request expects a JSON response (API calls, AJAX/fetch requests, form submissions)
    const isApiOrAjax = req.originalUrl.startsWith('/api') || req.xhr || req.headers?.['x-requested-with'] === 'XMLHttpRequest' || req.headers?.accept?.indexOf('json') > -1 || req.headers?.['content-type']?.includes('multipart/form-data') || req.headers?.['content-type']?.includes('application/json') || ((req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') && (req.originalUrl.startsWith('/organizer') || req.originalUrl.startsWith('/admin') || req.originalUrl.startsWith('/user')));

    // Development vs Production Error Responses
    if (process.env.NODE_ENV === 'development') {
        // In development, we want to see all the details and the stack trace to fix bugs
        console.error('💥 ERROR:', err);
        
        // If the request was an API call or AJAX (expects JSON), send JSON back
        if (isApiOrAjax) {
            return res.status(err.statusCode || 500).json({
                success: false, 
                message: err.message,
                stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
            });
        }
        
        // Otherwise, render an EJS error page
        return res.status(err.statusCode).render('error', {
            title: 'Something went wrong!',
            message: err.message
        });

    } else {
        // In production, we don't want to leak sensitive stack traces to the user
        let error = { ...err };
        error.message = err.message;
        error.statusCode = err.statusCode;
        error.isOperational = err.isOperational;

        // Operational, trusted error: send message to client
        if (error.isOperational) {
            if (isApiOrAjax) {
                return res.status(error.statusCode || 500).json({
                    success: false,
                    status: error.status || 'error',
                    message: error.message,
                    code: error.code || undefined
                });
            }
            return res.status(error.statusCode || 500).render('error', {
                title: 'Something went wrong!',
                message: error.message
            });
            
        // Programming or other unknown error: don't leak error details
        } else {
            console.error('💥 FATAL ERROR:', err);
            
            if (isApiOrAjax) {
                return res.status(500).json({
                    success: false,
                    status: 'error',
                    message: 'Something went very wrong!'
                });
            }
            return res.status(500).render('error', {
                title: 'Something went wrong!',
                message: 'Please try again later.'
            });
        }
    }
};

export default errorHandler;