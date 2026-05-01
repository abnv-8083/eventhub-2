// middlewares/errorHandler.js

const errorHandler = (err, req, res, next) => {
    // Default status code (500 Internal Server Error) and status ('error')
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // Development vs Production Error Responses
    if (process.env.NODE_ENV === 'development') {
        // In development, we want to see all the details and the stack trace to fix bugs
        console.error('💥 ERROR:', err);
        
        // If the request was an API call (expects JSON), send JSON back
        if (req.originalUrl.includes('/user/signup') || req.originalUrl.includes('/user/login') || req.xhr || req.headers?.accept?.indexOf('json') > -1) {
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

        // Handle specific MongoDB errors nicely
        if (err.name === 'CastError') {
            error.message = `Invalid ${err.path}: ${err.value}.`;
            error.statusCode = 400;
        }
        if (err.code === 11000) { // MongoDB duplicate key error
            const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
            error.message = `Duplicate field value: ${value}. Please use another value!`;
            error.statusCode = 400;
        }

        // Operational, trusted error: send message to client
        if (error.isOperational) {
            if (req.originalUrl.startsWith('/api')) {
                return res.status(error.statusCode || 500).json({
                    status: error.status || 'error',
                    message: error.message
                });
            }
            return res.status(error.statusCode || 500).render('error', {
                title: 'Something went wrong!',
                message: error.message
            });
            
        // Programming or other unknown error: don't leak error details
        } else {
            console.error('💥 FATAL ERROR:', err);
            
            if (req.originalUrl.startsWith('/api')) {
                return res.status(500).json({
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