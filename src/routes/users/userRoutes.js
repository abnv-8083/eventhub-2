import { Router } from "express";
import * as userController from '../../controllers/users/userController.js'
const userRouter = Router()



userRouter.get('/', userController.getHomepage)

export default userRouter