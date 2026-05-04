import HTTP_STATUS from "../../constant/statusCode.js";
import * as adminAuthServices from '../../services/admin/adminAuthservices.js'

export const getAdminLogin = (req,res,next)=>{
    try {
        res.render('admin/auth/login')
    } catch (error) {
        next(error)
    }
}


export const postAdminLogin = async (req,res, next)=>{
    try {
        const {email, password} = req.body
        const result = await adminAuthServices.verifyAdminLogin(email, password)
        if(!result){
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: 'Internal Server Error'
            })
        }
        req.session.admin = result
        req.session.save((err)=>{
            if(err){
                console.error("Failed to save session:", err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                    success: false,
                    message: 'Error saving session'
                });
            }
            
            return res.status(HTTP_STATUS.OK).json({
                success: true,
                message: `Welcome Back ${result.fullName}`,
                redirect: '/admin/dashboard'
            })
        })
        
    } catch (error) {
        next(error)
    }
}


export const postLogout = (req,res, next)=>{
    try {
        delete req.session.admin

        req.session.save((err)=>{
            if(err){
                return next(err)
            }
            return res.status(HTTP_STATUS.OK).json({
                success:true,
                message:'Logout Successfully'
            })
        })
    } catch (error) {
        next(error)
    }
}