import OTP_CONSTANT from "../constant/otpConstant.js";

const generateOTP = () => {
    const length = OTP_CONSTANT.OTP_LENGTH
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
        otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
};

export default generateOTP