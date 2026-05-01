import * as userAuthService from "../../services/users/userAuthService.js"
import HTTP_STATUS from "../../constant/statusCode.js";
import generateOTP from "../../utils/generateOtp.js";
import OTP from "../../models/users/otp.js";
import { response } from "express";
import sendEmail from "../../utils/sendEmail.js";


export const getLoginPage = (req,res)=>{
    try {
        res.render('users/auth/login', {title: 'Login'})
    } catch (error) {
        next(error)
    }
}

export const getRegisterPage = (req,res)=>{
    try {
        res.render('users/auth/register', {title: 'Signup'})
    } catch (error) {
        next(error)
    }
}


export const getForgotePasswordPage = (req,res)=>{
    try {
        res.render('users/auth/forgot-password', {title: 'Forgot Password'})
    } catch (error) {
        next(error)
    }
}

export const getResetPasswordPage = (req,res)=>{
    try {

        const email = req.session.tempEmail
        res.render('users/auth/reset-password', {title: 'Reset Password', email})
    } catch (error) {
        next(error)
    }
}

export const getOtpPage = (req,res,next)=>{
    try {
        const action = req.query.action
        console.log(action)
        if(!req.session.tempUser){
            return res.redirect('/user/signup?message=Please%20Register%20First');
        }

        res.render('users/auth/otp', {title: 'OTP Verification',action , email: req.session.tempUser?.email || 'You Have not Given the Email'})
    } catch (error) {
        next(error)
    }
}


export const postSignupPage = async (req, res, next)=>{
    try {
        req.session.tempUser = req.body
        const result = await userAuthService.findUser(req.body)
        if(!result){
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message:'Registration Faild',
            })
        }
        
        req.session.save((err) => {
            if (err) {
                console.error("Session save error:", err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                    success: false,
                    message: 'Internal Server Error'
                });
            }
            return res.status(HTTP_STATUS.OK).json({
                success: true,
                message:'OTP Sent To email Id',
            })
        });
    } catch (error) {
        next(error)
    }
}

export const postOtpPage = async (req, res, next)=>{
    try {
        const {email, otp, action} = req.body

        if(action === 'signup'){
            const tempUser = req.session.tempUser
            const result = await userAuthService.verifyAndCreateUser(email, otp, tempUser)
            
            if(!result){
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message:'User Verification Error',
                })
            }
            
            delete req.session.tempUser 
            // 3. IMPORTANT: Send the response to stop the frontend loader
            return res.status(HTTP_STATUS.OK).json({
                success: true,
                message: 'Account Created Successfully',
                redirect: '/user/login'
            });
        }else if(action === "forgotPassword"){

            const result = await userAuthService.verifyAndResetPassword(email, otp)
            if(!result){
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message:'User Verification Error',
                })
            }
            req.session.tempEmail = email
            return res.status(HTTP_STATUS.OK).json({
                success: true,
                message: 'OTP Verify Successfully',
                redirect: '/user/reset-password'
            });

        }else{
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Unknow Action'
            });
        }
        
        
        

    } catch (error) {
        next(error)
    }
}

export const postResendOtp = async (req,res, next)=>{
    try {
        const {email} = req.body
        if(!email){
            return res.status(400).json({ 
                success: false, 
                message: "Email is required" 
            });
        }
        const newOtp = generateOTP()

        const result = await userAuthService.updateUserOtp(email, newOtp)


        if(!result){
            return res.status(400).json({ 
                success: false, 
                message: "Internal Server Error" 
            });
        }

        return res.status(400).json({ 
            success: true, 
            message: "OTP Resent to Email" 
        });

    } catch (error) {
        next(error)
    }
}

export const postLoginPage = async (req,res,next)=>{
    try {
        const {email, password, remember} = req.body

        const result = await userAuthService.verifyLogin(email, password)

        if(!result){
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: 'Internal Server Error'
            });
        }
        if(remember === "on" || remember === true){
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000
        }else{
            req.session.cookie.maxAge = 2 * 60 * 60 * 1000;
        }
        req.session.user = result
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
                message: `Hi ${result.fullName}`
            });
        })
    } catch (error) {
        next(error)
    }
}



export const postForgotPassword = async (req,res,next)=>{
    try {
        const {email} = req.body

        const result = await userAuthService.forgotePasswordVerify(email)

        req.session.tempUser = result

        if(!result){
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: 'Internal Server Error'
            })
        }
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: 'OTP Sent To Email'
        })
        
    } catch (error) {
        next(error)
    }
}

export const postResetPassword = async (req,res,next)=>{
    try {
        console.log(req.body)
        const {newPassword, confirmPassword, email} = req.body
        const result = await userAuthService.resetUserPassword(newPassword, confirmPassword, email)

        if(!result){
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: 'Internal Server Error'
            })
        }
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: 'Password Successfully changed',
            redirect: '/user/login'
        })

    } catch (error) {
        next(error)
    }
}



export const userLogout = (req,res,next) =>{
    try {
        delete req.session.user

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









