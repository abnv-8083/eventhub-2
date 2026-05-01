export const getHomepage = (req,res,next)=>{
    try {
        res.render('index')
    } catch (error) {
        next()
    }
}