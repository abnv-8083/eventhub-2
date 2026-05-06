import * as userServices from '../../services/users/userService.js'
import axios from 'axios';
import HTTP_STATUS from '../../constant/statusCode.js'
import * as userAuthServices from '../../services/users/userAuthService.js'

// NEW: AI Generation Backend Controller
export const generateAIAvatar = async (req, res, next) => {
    try {
        const { prompt } = req.body;
        
        console.log("🤖 [AI] Request received for prompt:", prompt);

        if (!prompt) {
            return res.status(400).json({ success: false, message: "Prompt is required" });
        }

        // Enhance the prompt and generate the Pollinations URL
        const enhancedPrompt = `${prompt}, highly detailed digital art, avatar portrait, centered, clean background, 4k`;
        const randomSeed = Math.floor(Math.random() * 1000000);
        
        // 🚨 THE FIX: image.pollinations.ai (NOT .io)
        const aiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=500&height=500&nologo=true&seed=${randomSeed}`;

        console.log("🌐 [AI] Fetching image from:", aiUrl);

        // Use Node's native fetch
        const fetchResponse = await fetch(aiUrl);

        if (!fetchResponse.ok) {
            throw new Error(`Pollinations API Error: ${fetchResponse.status}`);
        }

        // Convert the response safely into a Node.js Buffer
        const arrayBuffer = await fetchResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log("✅ [AI] Image downloaded successfully! Sending to frontend.");

        // Send the raw image file directly back to your frontend
        res.set('Content-Type', 'image/jpeg');
        res.send(buffer);

    } catch (error) {
        console.error("❌ [AI] Backend Generation Error:", error.message);
        res.status(500).json({ success: false, message: "Failed to generate AI image" });
    }
};


export const getHomepage = (req,res,next)=>{
    try {
        res.render('index')
    } catch (error) {
        next()
    }
}

export const getDashboard = (req,res,next)=>{
    res.render('users/dashboard',{title: "User Dashboard"})
}

export const getUserProfile = (req,res,next)=>{
    res.render('users/profile', {title: 'My Profile'})
}

export const updateUserAvatar = async (req,res,next)=>{
    try {
        const userId = req.session.user._id
        if (!req.file || !req.file.path) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                success: false, 
                message: 'No image provided' 
            });
        }
        const result = await userServices.updateUserAvatar(userId, req.file.path)

        req.session.user.avatar = result.avatar
        req.session.save((err) => {
            if (err) return next(err);
            res.status(HTTP_STATUS.OK).json({
                success: true,
                message: 'Profile picture updated!',
                avatarUrl: result.avatar // Send the new Cloudinary URL back to the frontend
            });
        });
    } catch (error) {
        next(error)
    }
}

export const updateUserProfile = async (req,res,next)=>{
    try {
        const {fullName, dob = '', phone = '', address = '', bio = ''} = req.body
        if(!fullName){
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Must Contain Full Name',
            })
        }
        const updateData = {
            fullName: fullName.trim(),
            phone: phone.trim(),
            address: address.trim(),
            bio: bio.trim()
        };
        if (dob.trim() !== '') {
            // Convert the string "YYYY-MM-DD" into a proper JavaScript Date object
            updateData.dob = new Date(dob);
        } else {
            // If the user left it blank, save it as null. 
            // This prevents MongoDB CastErrors!
            updateData.dob = null; 
        }
        const userId = req.session.user._id

        const result = await userServices.updateUserProfile(userId,updateData)

        if(!result){
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: 'Internal Server Error'
            })
        }

        req.session.user = result
        req.session.save((err) => {
            if (err) return next(err);
            res.status(HTTP_STATUS.OK).json({
                success: true,
                message: 'Profile updated Successfully!',
                updateUserData: result
            });
        });
    } catch (error) {
        next(error)
    }
}

export const updateUserEmail = async (req,res,next)=>{
    try {
        const {newEmail} = req.body
        req.session.tempData = {email: newEmail}
        const userdata = {
            email: newEmail
        }

        const result = await userServices.updateUserEmail(userdata)

        if(!result){
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: 'Internal Server Error',
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
                redirect: '/user/verify-otp?action=email-update'
            })
        });

    } catch (error) {
        next(error)
    }
}

export const updatePassword = async (req,res,next)=>{
    try {
        console.log(req.body)
        const {currentPassword, currentUserId, newPassword, action} = req.body
        const result = await userServices.updatePassword(currentUserId, currentPassword, newPassword, action)

        if(!result){
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: 'Internal Server Error'
            })
        }
        req.session.user = result
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
                message:'Password Saved Successfully',
            })
        });
        
    } catch (error) {
        next(error)
    }
}
