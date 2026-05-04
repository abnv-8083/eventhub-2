import { Router } from "express";
import * as userController from '../../controllers/users/userController.js'
const userRouter = Router()

import { isUserAuthenticated } from "../../middlewares/authMiddleware.js";

userRouter.get('/', userController.getHomepage)



export default userRouter