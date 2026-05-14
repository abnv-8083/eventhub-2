import HTTP_STATUS from '../../constant/statusCode.js';
import * as adminPayoutService from '../../services/admin/adminPayoutService.js';


// ─── Payouts List ─────────────────────────────────────────────────────────────
export const getAdminPayouts = async (req, res, next) => {
    try {
        const { search = '', status = 'all', sort = 'newest', page = 1 } = req.query;
        const { payouts, total, totalPages } = await adminPayoutService.getPayouts({ search, status, sort, page });

        res.render('admin/payouts/index', {
            title: 'Manage Payouts',
            payouts,
            filters: { search, status, sort },
            totalPages,
            currentPage: parseInt(page),
            total
        });
    } catch (error) {
        next(error);
    }
};


// ─── Approve Payout ───────────────────────────────────────────────────────────
export const approvePayout = async (req, res, next) => {
    try {
        await adminPayoutService.approvePayout(req.body.payoutId);
        res.status(HTTP_STATUS.OK).json({ success: true, message: 'Payout approved and marked as paid.' });
    } catch (error) {
        next(error);
    }
};
