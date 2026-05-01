
const noCache = (req, res, next) => {
    // Force the browser to never store the page on the hard drive or RAM
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    
    // Fallback for older HTTP/1.0 browsers
    res.set('Pragma', 'no-cache');
    
    // Tell the browser the page is already expired
    res.set('Expires', '-1');
    
    next();
};

export default noCache 