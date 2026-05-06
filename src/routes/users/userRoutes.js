import { Router } from "express";
import * as userController from '../../controllers/users/userController.js'
const userRouter = Router()
import { isUserAuthenticated } from "../../middlewares/authMiddleware.js";
import { upload } from "../../config/cloudinary.js";
import { validateUpdateProfile } from "../../middlewares/validate.js";

userRouter.get('/', userController.getHomepage)

// userRouter.use(isUserAuthenticated)

userRouter.route('/dashboard')
    .get(userController.getDashboard)

userRouter.route('/profile')
    .get(userController.getUserProfile)
    .post(validateUpdateProfile,userController.updateUserProfile)

userRouter.post("/avatar", upload.single('avatar'), userController.updateUserAvatar)

userRouter.post("/generate-ai", userController.generateAIAvatar);

userRouter.post('/update-email', userController.updateUserEmail)

userRouter.post('/update-password', userController.updatePassword)

export default userRouter