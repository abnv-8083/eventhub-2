import User from "../../models/users/user.js";
import HTTP_STATUS from "../../constant/statusCode.js";
import argon2 from "argon2";
import AppError from "../../utils/AppError.js";
import OTP from "../../models/users/otp.js";
import {sendOtpEmail, sendOrganizerCredentials} from "../../utils/sendEmail.js";
import generateOTP from "../../utils/generateOtp.js";
import passport from "passport";
import { getIO, getActiveUsers } from "../../utils/socket.js";
import Notification from "../../models/notifications/notification.js";
import { sendNotification, notifyAllAdmins } from '../../utils/notify.js';
import { generateUniqueReferralCode, validateReferralCode } from './referralService.js';

export const findUser = async (userdata)=>{
    if(userdata.role == 'organizer'){
        const resubmitExistingUser = await User.findOne({email: userdata.email, role: 'organizer', status: 'rejected'})
        const existingUser = await User.findOne({email: userdata.email, role: 'organizer',status: {$in: ['pending','approved']}})
        
        if(resubmitExistingUser){
            const otp = generateOTP()
            await OTP.create({ email: userdata.email, code: otp })
            await sendOtpEmail(userdata.email, otp, 'Verify Email OTP')
            // FIX: Tell the controller this is a re-registration
            return { success: true, action: 'organizerReregister' }; 
        }else if(existingUser){
            throw new AppError('Organizer Already Registered', HTTP_STATUS.BAD_REQUEST)
        } else {
            const otp = generateOTP()
            await OTP.create({ email: userdata.email, code: otp })
            await sendOtpEmail(userdata.email, otp, 'Verify Email OTP')
            // FIX: Tell the controller this is a brand new creation
            return { success: true, action: 'userSignup' }; 
        }
    }else{
        if (userdata.referralCode) {
            await validateReferralCode(userdata.referralCode);
        }

        const existingUser = await User.findOne({email: userdata.email, role: 'user'})
        if(existingUser){
            throw new AppError('User Already Registered', HTTP_STATUS.BAD_REQUEST)
        }

        const otp = generateOTP()
        await OTP.create({ email: userdata.email, code: otp })
        await sendOtpEmail(userdata.email, otp, 'Verify Email OTP')
        
        // FIX: Tell the controller this is a brand new creation
        return { success: true, action: 'userSignup' }; 
    }
}
export const verifyAndCreateUser = async (email, otp, tempUserData)=>{

    const otpRecord = await OTP.findOne({email, code: otp})

    if(!otpRecord){
        throw new AppError('Invalid or Expired OTP', HTTP_STATUS.BAD_REQUEST)
    }


    const hashPassword = await argon2.hash(tempUserData.password)

    if(tempUserData.role == 'user'){
        // Generate a unique referral code for the new user
        const referralCode = await generateUniqueReferralCode();

        // Validate the referral code if provided
        let referrer = null;
        if (tempUserData.referralCode) {
            referrer = await validateReferralCode(tempUserData.referralCode);
            if (referrer && referrer.email === tempUserData.email) {
                referrer = null; // Can't refer yourself
            }
        }

        const newUser = new User({
            fullName: tempUserData.fullName,
            email: tempUserData.email,
            password: hashPassword,
            role: tempUserData.role,
            referralCode,
            referredBy: referrer ? referrer._id : null
        })
        return await newUser.save()
    }else{
        
        const newOrganizer = new User({
            fullName: tempUserData.fullName,
            email: tempUserData.email,
            password: hashPassword,
            role: tempUserData.role,
            organizationName: tempUserData.organizationName,
            city: tempUserData.city,
            phone:tempUserData.phone,
            status: 'pending',
        })

        // ==========================================
        // REAL-TIME NOTIFICATION LOGIC
        // ==========================================
        await notifyAllAdmins(`New Request: "${newOrganizer.organizationName}" has applied to be an organizer and requires your approval.`, 'info');
        await sendOrganizerCredentials(tempUserData.email, tempUserData.password, tempUserData.organizationName)
        return await newOrganizer.save()
    }
}



export const verifyLogin = async (email, password) =>{
    if (!email || !password) {
        throw new AppError('Please enter both email and password.', HTTP_STATUS.BAD_REQUEST);
    }
    const existingUser = await User.findOne({email:email}).select('+password')
    if(existingUser){
        if (!existingUser.password || typeof existingUser.password !== 'string') {
            throw new AppError('No password set for this account. Please sign in with Google or click Forgot Password to set one.', HTTP_STATUS.BAD_REQUEST);
        }
        const checkPassword = await argon2.verify(existingUser.password, password)
        if(checkPassword){
            if(existingUser.role == 'admin'){
                throw new AppError('Invalid Access', HTTP_STATUS.NOT_FOUND)
            }else if(existingUser.isBlocked){
                throw new AppError('Access Denied: Your account has been Blocked.', HTTP_STATUS.FORBIDDEN)
            }else{
                return existingUser
            }
        }else{
            throw new AppError('Password is Incorrect', HTTP_STATUS.NOT_FOUND)
        }
    }else{
        throw new AppError('User not Found', HTTP_STATUS.NOT_FOUND)
    }
    
}

export const forgotePasswordVerify = async (email) =>{
    const existingUser = await User.findOne({email:email})
    if(existingUser){
        const otp = generateOTP()
        await OTP.create({
            email: email,
            code: otp,
        })
        await sendOtpEmail(existingUser.email, otp, 'Reset Password')
        return existingUser
    }else if(!existingUser){
        throw new AppError('User not Found', HTTP_STATUS.NOT_FOUND)
    }else{
        throw new AppError('Internal Server Error', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    }
}

export const updateUserOtp = async (email, newOtp) =>{
    const updateUser = await OTP.findOneAndUpdate({email: email},{code: newOtp, createdAt: Date.now()}, {upsert:true, new: true})
    if(!updateUser){
        throw new AppError('Internal Server Error', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    }
    await sendOtpEmail(updateUser.email, updateUser.code, 'Resend OTP')
    return updateUser
}

export const verifyAndResetPassword = async (email, otp)=>{
    const otpRecord = await OTP.findOne({email, code: otp})

    if(!otpRecord){
        throw new AppError('Invalid or Expired OTP', HTTP_STATUS.BAD_REQUEST)
    }

    return otpRecord

}


export const resetUserPassword = async (newPassword,confirmPassword, email)=>{

    const getuser = await User.findOne({email:email}).select('+password')

    if (!getuser) {
        throw new AppError('User Not Found', HTTP_STATUS.NOT_FOUND);
    }
    if (getuser.password && typeof getuser.password === 'string') {
        const comparePassword = await argon2.verify(getuser.password, newPassword);
        if (comparePassword) {
            throw new AppError('This password is currently in use. Please enter a different password.', HTTP_STATUS.BAD_REQUEST);
        }
    }

    const hashPassword = await argon2.hash(newPassword)
    
    const updateUserPassword = await User.findOneAndUpdate({email:email}, {password: hashPassword}, {upsert: true, next: true})

    if(!updateUserPassword){
        throw new AppError('User Not Found', HTTP_STATUS.NOT_FOUND)
    }
    return updateUserPassword
}


export const verifyAndReregister = async (email, otp, userData) => {
    // 1. Verify the OTP
    const otpRecord = await OTP.findOne({email, code: otp});
    if(!otpRecord){
        throw new AppError('Invalid or Expired OTP', HTTP_STATUS.BAD_REQUEST);
    }

    // 2. Hash Password
    const hashPassword = await argon2.hash(userData.password);

    // 3. Update the existing rejected user
    const getUser = await User.findOneAndUpdate(
        { email: userData.email, role: 'organizer', status: 'rejected' },
        {
            $set: {
                fullName: userData.fullName, // fixed typo from userData.name
                password: hashPassword, 
                organizationName: userData.organizationName, 
                city: userData.city,         // fixed typo from userDta.city
                phone: userData.phone,
                status: 'pending'            // reset status so admins can review again
            }
        },
        { new: true }
    );

    if(!getUser){
        throw new AppError('Invalid Organizer to Resubmit the Application', HTTP_STATUS.NOT_FOUND);
    }

    await notifyAllAdmins(`Organizer Resubmission: "${userData.organizationName}" is waiting for approval.`, 'info');

    return getUser;
}