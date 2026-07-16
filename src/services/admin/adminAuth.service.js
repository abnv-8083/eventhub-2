import HTTP_STATUS from "../../constant/statusCode.js"
import User from "../../models/users/user.model.js"
import AppError from "../../utils/AppError.js"
import argon2 from "argon2"
export const verifyAdminLogin = async (email, password) =>{
    if (!email || !password) {
        throw new AppError('Please enter both email and password.', HTTP_STATUS.BAD_REQUEST);
    }
    const findUser = await User.findOne({email:email}).select('+password');
    if(findUser){
        if (!findUser.password || typeof findUser.password !== 'string') {
            throw new AppError('No password set for this account.', HTTP_STATUS.UNAUTHORIZED);
        }
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