import * as userValidate from "../validations/users/auth.validation.js"
import * as adminValidate from '../validations/admin/admin.validation.js'

export const validateRegister = (req, res, next) => {
    const { error } = userValidate.registerSchema.validate(req.body, { abortEarly: false });
    
    if (error) {
        const errorDetails = error.details.map(detail => ({
            field: detail.path[0],
            message: detail.message
        }));
        return res.status(400).json({
            success: false,
            errors: errorDetails // Send the full array
        });
    }
    
    next(); // Data is valid, proceed to the controller!
};


export const validateLogin = (req, res, next) => {
    const { error } = userValidate.loginSchema.validate(req.body, { abortEarly: false });
    
    if (error) {
        const errorDetails = error.details.map(detail => ({
            field: detail.path[0],
            message: detail.message
        }));
        return res.status(400).json({
            success: false,
            errors: errorDetails // Send the full array
        });
    }
    
    next(); // Data is valid, proceed to the controller!
};

export const validateAdminLogin = (req,res,next)=>{
    const {error} = adminValidate.adminLoginSchema.validate(req.body,{abortEarly:false})

    if (error) {
        const errorDetails = error.details.map(detail => ({
            field: detail.path[0],
            message: detail.message
        }));
        return res.status(400).json({
            success: false,
            errors: errorDetails // Send the full array
        });
    }

    next()
}