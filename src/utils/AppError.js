// utils/AppError.js

class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        
        this.statusCode = statusCode;
        // If the status code starts with 4 (e.g., 400, 404), it's a 'fail'. Otherwise, it's an 'error' (like 500).
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        
        // This marks the error as an operational error (something we foresee happening, like bad user input)
        // rather than a programming bug in our code.
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

export default AppError;