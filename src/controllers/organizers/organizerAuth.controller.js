import HTTP_STATUS from "../../constant/statusCode.js"


export const postLogout = (req, res, next) => {
    try {
        if (req.session) {
            delete req.session.organizer;
            req.session.save((err) => {
                if (err) return next(err);
                const isAjax = req.xhr || req.headers.accept?.includes('application/json') || req.method === 'POST';
                if (isAjax) {
                    return res.status(HTTP_STATUS.OK).json({
                        success: true,
                        message: 'Logout Successfully'
                    });
                }
                return res.redirect('/organizer/login?message=Logged out successfully');
            });
        } else {
            const isAjax = req.xhr || req.headers.accept?.includes('application/json') || req.method === 'POST';
            if (isAjax) {
                return res.status(HTTP_STATUS.OK).json({
                    success: true,
                    message: 'Logout Successfully'
                });
            }
            return res.redirect('/organizer/login?message=Logged out successfully');
        }
    } catch (error) {
        next(error);
    }
};