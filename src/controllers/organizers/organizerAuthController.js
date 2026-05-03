import HTTP_STATUS from "../../constant/statusCode.js"
export const postLogout = (req,res, next)=>{
    try {
        delete req.session.organizer

        req.session.save((err)=>{
            if(err){
                return next(err)
            }
            return res.status(HTTP_STATUS.OK).json({
                success:true,
                message:'Logout Successfully'
            })
        })
    } catch (error) {
        next(error)
    }
}