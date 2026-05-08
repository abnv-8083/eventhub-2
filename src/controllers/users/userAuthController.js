import * as userAuthService from "../../services/users/userAuthService.js"
import * as userService from "../../services/users/userService.js"
import HTTP_STATUS from "../../constant/statusCode.js";
import generateOTP from "../../utils/generateOtp.js";
import OTP from "../../models/users/otp.js";
import { response } from "express";
import {sendOtpEmail} from "../../utils/sendEmail.js";


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
        if(!req.session.tempData){
            return res.redirect('/user/signup?message=Please%20Register%20First');
        }

        res.render('users/auth/otp', {title: 'OTP Verification',action , email: req.session.tempData?.email || 'You Have not Given the Email'})
    } catch (error) {
        next(error)
    }
}


export const postSignupPage = async (req, res, next) => {
    try {
        const result = await userAuthService.findUser(req.body);
        
        if (!result || !result.success) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: 'Registration Failed',
            });
        }

        req.session.tempData = req.body;
        
        req.session.save((err) => {
            if (err) {
                console.error("Session save error:", err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                    success: false,
                    message: 'Internal Server Error'
                });
            }
            
            // Sends either 'userSignup' or 'organizerReregister' directly from the service
            return res.status(HTTP_STATUS.OK).json({
                success: true,
                message: 'OTP Sent To Email',
                action: result.action 
            });
        });
        
    } catch (error) {
        next(error);
    }
}

export const postOtpPage = async (req, res, next)=>{
    try {
        const {email, otp, action} = req.body

        if(action == 'userSignup'){
            const tempUser = req.session.tempData
            const result = await userAuthService.verifyAndCreateUser(email, otp, tempUser)
            
            if(!result){
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message:'User Verification Error',
                })
            }
            
            delete req.session.tempData 
            // 3. IMPORTANT: Send the response to stop the frontend loader
            return res.status(HTTP_STATUS.OK).json({
                success: true,
                message: 'Account Created Successfully',
                redirect: '/user/login'
            });
        }else if(action == "forgotPassword"){

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
        }else if(action == 'email-update'){
            const userId = req.session.user._id
            const result = await userAuthService.verifyAndResetPassword(email, otp)
            if(!result){
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message:'User Verification Error',
                })
            }
            const saveEmail = await userService.updateEmail(userId, email)
            if(!saveEmail){
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                    success: false,
                    message:'Internal Server Error',
                })
            }
            
            req.session.user = saveEmail
            req.session.save((err) => {
            if (err) return next(err);
            res.status(HTTP_STATUS.OK).json({
                success: true,
                message: 'Email Updated Successfully',
                redirect: '/user/profile',
            });
        });
        } else if (action == 'organizerReregister') {
            const tempUser = req.session.tempData;

            // FIX: Added email and otp arguments
            const result = await userAuthService.verifyAndReregister(email, otp, tempUser);

            if (!result) {
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                    success: false,
                    message: 'Internal Server Error'
                });
            }
            
            delete req.session.tempData;
        
            res.status(HTTP_STATUS.OK).json({
                success: true,
                message: 'Request has been sent to Admin',
                redirect: '/user/login'
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
        if(result.role == 'organizer'){
            if(result.status == 'pending'){
                return res.status(HTTP_STATUS.FORBIDDEN).json({ 
                    success: false, 
                    status: 'pending', 
                    message: 'Your account is currently under review by our team. You will be notified once approved.' 
                });
            }else if(result.status == 'rejected'){
                return res.status(HTTP_STATUS.FORBIDDEN).json({ 
                    success: false, 
                    status: 'rejected', 
                    message: 'Unfortunately, your application to become an organizer has been rejected.' 
                });
            }
        }
        if(remember === "on" || remember === true){
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000
        }else{
            req.session.cookie.maxAge = 2 * 60 * 60 * 1000;
        }
        if(result.role == 'user'){
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
                    message: `Hi ${result.fullName}`,
                    redirect: '/'
                });
            })
        }else if(result.role == 'organizer'){
            req.session.organizer = result
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
                    message: `Hi ${result.fullName}`,
                    redirect: '/organizer'
                });
            })
        }
        
    } catch (error) {
        next(error)
    }
}



export const postForgotPassword = async (req,res,next)=>{
    try {
        const {email} = req.body

        const result = await userAuthService.forgotePasswordVerify(email)

        req.session.tempData = result

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









