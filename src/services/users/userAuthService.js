import User from "../../models/users/user.js";
import HTTP_STATUS from "../../constant/statusCode.js";
import bcrypt from 'bcrypt' 
import AppError from "../../utils/AppError.js";
import OTP from "../../models/users/otp.js";
import sendEmail from "../../utils/sendEmail.js";
import generateOTP from "../../utils/generateOtp.js";
import passport from "passport";

export const findUser = async (userdata)=>{
    const existingUser = await User.findOne({email: userdata.email})
    if(existingUser){
        throw new AppError('User Already Registred', HTTP_STATUS.BAD_REQUEST)
    }

    const otp = generateOTP()
    await OTP.create({
        email: userdata.email,
        code: otp,
    })

    await sendEmail({
        email: userdata.email,
        subject: 'Verify your EventHub Account',
        message: `Your verification code is ${otp}. It expires in 5 minutes.`,
        html: `<h1 style="color: #E63946;">EventHub Verification</h1>
               <p>Your 4-digit code is: <strong>${otp}</strong></p>`
    })

    return true
}

export const verifyAndCreateUser = async (email, otp, tempUserData)=>{

    const otpRecord = await OTP.findOne({email, code: otp})

    if(!otpRecord){
        throw new AppError('Invalid or Expired OTP', HTTP_STATUS.BAD_REQUEST)
    }


    const salt = await bcrypt.genSalt(12)
    const hashPassword = await bcrypt.hash(tempUserData.password, salt)
    const newUser = new User({
        fullName: tempUserData.fullName,
        email: tempUserData.email,
        password: hashPassword,
        role: tempUserData.role,
        organizationName: tempUserData.organizationName,
        city: tempUserData.city,
        phone:tempUserData.phone
    })

    return await newUser.save()
}

export const verifyLogin = async (email, password) =>{

    const existingUser = await User.findOne({email:email}).select('+password')
    if(existingUser){
        const checkPassword = await bcrypt.compare(password,existingUser.password)
        if(checkPassword){
            return existingUser
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
        await sendEmail({
            email: existingUser.email,
            subject: "Verify Email for Reset Password",
            message: `Your verification code is ${otp}. It expires in 5 minutes.`,
            html: `<h1 style="color: #E63946;">EventHub Verification</h1>
               <p>Your 4-digit code is: <strong>${otp}</strong></p>`
        })
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
    await sendEmail({
        email: email,
        subject: 'Resend OTP',
        message: `Your verification code is ${updateUser.code}. It expires in 5 minutes.`,
        html: `<h1 style="color: #E63946;">EventHub Verification</h1>
               <p>Your 4-digit code is: <strong>${updateUser.code}</strong></p>`
    })
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

    const comparePassword = await bcrypt.compare(newPassword, getuser.password)
    if(comparePassword){
        throw new AppError('This Password is currently Using Please give another Password', HTTP_STATUS.BAD_REQUEST)
    }

    const salt = await bcrypt.genSalt(12)
    const hashPassword = await bcrypt.hash(newPassword, salt)
    
    const updateUserPassword = await User.findOneAndUpdate({email:email}, {password: hashPassword}, {upsert: true, next: true})

    if(!updateUserPassword){
        throw new AppError('User Not Found', HTTP_STATUS.NOT_FOUND)
    }
    return updateUserPassword
}


