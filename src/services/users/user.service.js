import User from "../../models/users/user.model.js";
import HTTP_STATUS from "../../constant/statusCode.js";
import AppError from "../../utils/AppError.js";
import generateOTP from "../../utils/generateOtp.js";
import { sendOtpEmail } from "../../utils/sendEmail.js";
import OTP from "../../models/users/otp.model.js";
import argon2 from "argon2";

export const updateUserAvatar = async (userId, updateImageUrl)=>{
    const updatedUser = await User.findByIdAndUpdate(userId,{avatar: updateImageUrl}, {new: true})

    if(!updatedUser){
        throw new AppError('Invalid User', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    }
    return updatedUser
}

export const updateUserProfile = async (userId, updateData)=>{
    const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: updateData }, // $set tells Mongo to only update these specific fields
        { 
            new: true,           // Returns the newly updated document
            runValidators: true  // Forces Mongoose to respect schema rules (like max lengths)
        }
    );
    if (!updatedUser) {
        throw new AppError('User not found', HTTP_STATUS.NOT_FOUND)
    }
    return updatedUser
}


export const updateUserEmail = async (userData)=>{

    const checkUser = await User.findOne({email: userData.email})
    if(checkUser){
        throw new AppError('Email Already Exist', HTTP_STATUS.BAD_REQUEST)
    }

    const otp = generateOTP()
    
    await OTP.create({
        email: userData.email,
        code: otp,
    })

    await sendOtpEmail(userData.email,otp, 'Change Email OTP')

    return true
}


export const updateEmail = async (userId,newEmail)=>{
    const updateEmail = await User.findByIdAndUpdate(
        userId,
        {email: newEmail},
        {new: true}
    )

    if(!updateEmail){
        throw new AppError('User Not Found', HTTP_STATUS.NOT_FOUND)
    }

    return updateEmail
}

export const updatePassword = async (userId, currentPassword, newPassword, action)=>{
    const checkUser = await User.findOne({_id: userId}).select('+password');

    if(!checkUser){
        throw new AppError('User Not Found', HTTP_STATUS.NOT_FOUND)
    }
    if(action == 'update'){
        if (!checkUser.password) {
            throw new AppError('No password set. Please use the add password feature.', HTTP_STATUS.BAD_REQUEST);
        }
        const checkPassword = await argon2.verify(checkUser.password, currentPassword)
    
        if(!checkPassword){
            throw new AppError('Invalid Current Password', HTTP_STATUS.BAD_REQUEST)
        }
        const hashPassword = await argon2.hash(newPassword)
    
        const updatePassword = await User.findByIdAndUpdate(
            userId,
            {$set: {password: hashPassword}},
            {new: true}
        ).select('+password')

        return updatePassword
    }else if(action == 'add'){
        const hashPassword = await argon2.hash(newPassword)
    
        const addPassword = await User.findByIdAndUpdate(
            userId,
            {$set: {password: hashPassword}},
            {new: true}
        ).select('+password')
        return addPassword
    }else{
        throw new AppError('Unknown Action', HTTP_STATUS.BAD_REQUEST)
    }
}