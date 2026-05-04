import HTTP_STATUS from "../../constant/statusCode.js";

export const getAdminDashboard = (req,res,next)=>{
    try {
        res.render('admin/dashboard',{title: 'Admin Dashboard'})
    } catch (error) {
        next(error)
    }
}