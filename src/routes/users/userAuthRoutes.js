import { Router } from "express";
import passport from "passport";
import * as userAuthController from '../../controllers/users/userAuthController.js'
import * as validation from '../../middlewares/validate.js'
import { isGuest } from "../../middlewares/authMiddleware.js";
const userAuthRouter = Router()

userAuthRouter.get('/auth/google',
    passport.authenticate('google', {scope: ['profile', 'email']})
)

userAuthRouter.get('/google/callback',
    passport.authenticate('google',{failureRedirect: '/user/login'}),
    (req,res)=>{
        if(req.user){
            const cleanUser = {
                _id: req.user._id.toString(),
                fullName: req.user.fullName,
                email: req.user.email,
                avatar: req.user.avatar
            };

            req.session.user = cleanUser

            req.session.save((err) => {
                if (err) {
                    console.error("Google Session Save Error:", err);
                    return next(err);
                }
                return res.redirect('/');
            });
        }else{
            res.redirect('/user/login')
        }
        
    }
)

userAuthRouter.route('/login')
    .get(isGuest,userAuthController.getLoginPage)
    .post(validation.validateLogin, userAuthController.postLoginPage)
userAuthRouter.route('/signup')
    .get(isGuest,userAuthController.getRegisterPage)
    .post(validation.validateRegister,userAuthController.postSignupPage)

userAuthRouter.route('/forgot-password')
    .get(isGuest,userAuthController.getForgotePasswordPage)
    .post(userAuthController.postForgotPassword)

userAuthRouter.post('/resend-otp', userAuthController.postResendOtp)
    

userAuthRouter.route('/reset-password')
    .get(isGuest, userAuthController.getResetPasswordPage)
    .post(userAuthController.postResetPassword)


userAuthRouter.route('/verify-otp')
    .get(userAuthController.getOtpPage)
    .post(userAuthController.postOtpPage)

userAuthRouter.post('/logout', userAuthController.userLogout)
 
export default userAuthRouter