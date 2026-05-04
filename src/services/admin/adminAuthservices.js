import HTTP_STATUS from "../../constant/statusCode.js"
import User from "../../models/users/user.js"
import AppError from "../../utils/AppError.js"
import argon2 from "argon2"
export const verifyAdminLogin = async (email, password) =>{
    const findUser = await User.findOne({email:email}).select('+password');
    if(findUser){
        const comparepassword = await argon2.verify(findUser.password, password)
        if(comparepassword){
            if(findUser.role !== 'admin'){
                throw new AppError('Access Denied, Must be an Admin Account',HTTP_STATUS.UNAUTHORIZED)
            }else{
                return findUser
            }
        }else{
            throw new AppError('Incorrect Password',HTTP_STATUS.UNAUTHORIZED)
        }
    }else{
        throw new AppError('Admin Not Found',HTTP_STATUS.UNAUTHORIZED)
    } 
}