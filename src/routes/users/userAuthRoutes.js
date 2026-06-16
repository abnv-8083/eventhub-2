import { Router } from "express";
import passport from "passport";
import * as userAuthController from '../../controllers/users/userAuthController.js'
import * as validation from '../../middlewares/validate.js'
import { isUserGuest ,isUserAuthenticated} from "../../middlewares/authMiddleware.js";
import noCacheMiddleware from "../../middlewares/nocache.js";
const userAuthRouter = Router()


userAuthRouter.use(noCacheMiddleware)

userAuthRouter.get('/auth/google',isUserGuest,
    passport.authenticate('google', {scope: ['profile', 'email']})
)

userAuthRouter.get('/google/callback',isUserGuest,
    passport.authenticate('google',{failureRedirect: '/user/login'}),
    (req,res)=>{
        if(req.user){
            if (req.user.isBlocked) {
                return res.redirect('/user/login?message=Your%20account%20is%20blocked%20by%20the%20admin');
            }

            const cleanUser = {
                _id: req.user._id.toString(),
                fullName: req.user.fullName,
                email: req.user.email,
                avatar: req.user.avatar,
                googleId: req.user.googleId
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
    .get(isUserGuest,userAuthController.getLoginPage)
    .post(validation.validateLogin, userAuthController.postLoginPage)
userAuthRouter.route('/signup')
    .get(isUserGuest,userAuthController.getRegisterPage)
    .post(validation.validateRegister,userAuthController.postSignupPage)

userAuthRouter.route('/forgot-password')
    .get(isUserGuest,userAuthController.getForgotePasswordPage)
    .post(userAuthController.postForgotPassword)

userAuthRouter.post('/resend-otp', userAuthController.postResendOtp)
    

userAuthRouter.route('/reset-password')
    .get(isUserGuest, userAuthController.getResetPasswordPage)
    .post(userAuthController.postResetPassword)


userAuthRouter.route('/verify-otp')
    .get(isUserGuest,userAuthController.getOtpPage)
    .post(userAuthController.postOtpPage)

userAuthRouter.post('/logout', userAuthController.userLogout)
 
export default userAuthRouter