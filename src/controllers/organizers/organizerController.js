
export const getDashboard = async (req, res, next) => {
    try {
        // Here is where you will eventually fetch total sales, tickets, etc. from the DB
        
        // Render the EJS file and pass the user data to the navbar/sidebar
        res.render('organizer/dashboard', {
            title: 'Organizer Dashboard',
            user: req.session.user 
        });
    } catch (error) {
        next(error);
    }
};
