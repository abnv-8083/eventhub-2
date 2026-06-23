import Event from '../../models/events/event.js';
import Booking from '../../models/payments/booking.js';
import { EVENT_CATEGORIES, getCategoryName } from '../../constant/categories.js';
import Platform from '../../models/admin/platform.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';
import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer';
import { sendNotification } from '../../utils/notify.js';





// ─── Get Events for Organizer Dashboard ──────────────────────────────────────
export const getOrganizerEvents = async (organizerId, { search = '', status = 'all', sort = 'newest', page = 1, limit = 10 }) => {
    const skip = (parseInt(page) - 1) * limit;

    const query = { organizer: organizerId };
    if (search) query.title = { $regex: search, $options: 'i' };
    if (status === 'blocked') {
        query.isBlocked = true;
    } else if (status !== 'all') {
        query.status = status;
        query.isBlocked = { $ne: true };
    }

    const sortMap = {
        newest:      { createdAt: -1 },
        oldest:      { createdAt: 1 },
        'title-asc': { title: 1 },
    };
    const sortOption = sortMap[sort] || { createdAt: -1 };

    const [events, total] = await Promise.all([
        Event.find(query).sort(sortOption).skip(skip).limit(limit),
        Event.countDocuments(query)
    ]);

    return { events, total, totalPages: Math.ceil(total / limit) };
};

// ─── Get Event View Data ─────────────────────────────────────────────────────
export const getEventViewData = async (eventId, organizerId) => {
    const event = await Event.findOne({ _id: eventId, organizer: organizerId }).lean();

    if (!event) {
        return null; // Return null so the controller knows to redirect
    }

    const tickets = event.tickets || [];

    // 2. Fetch the recent bookings
    const bookings = await Booking.find({ event: event._id, status: { $ne: 'cancelled' } })
        .populate('user', 'fullName email profilePic')
        .sort({ bookingDate: -1 }) // Make sure your DB field is 'bookingDate' or 'createdAt'
        .limit(10)
        .lean();

    // 3. Calculate metrics
    const totalRevenue     = bookings.reduce((s, b) => s + b.totalAmount, 0);
    
    // Note: If your bookings now use a 'tickets' array (from cart), you might need to change 
    // b.quantity to b.tickets.reduce((sum, t) => sum + t.quantity, 0). 
    // Kept as b.quantity here to match your original code.
    const totalTicketsSold = bookings.reduce((s, b) => s + (b.tickets ? b.tickets.reduce((acc, t) => acc + (t.status !== 'cancelled' ? (t.quantity || 0) : 0), 0) : (b.status !== 'cancelled' ? (b.quantity || 0) : 0)), 0); 
    const totalCapacity    = tickets.reduce((s, t) => s + t.capacity, 0);

    return {
        event,
        tickets,
        bookings,
        totalRevenue,
        totalTicketsSold,
        totalCapacity
    };
};


// ─── Get Active Categories for Form Dropdowns ─────────────────────────────────
export const getActiveCategories = async () => {
    const platform = await Platform.findOne().lean() || {};
    const blocked = platform.blockedCategories || [];
    return EVENT_CATEGORIES.filter(c => !blocked.includes(c.id));
};


// ─── Create Event ─────────────────────────────────────────────────────────────
// Tickets are embedded directly — no separate insertMany needed.
export const createEvent = async (organizerId, eventData, bannerUrls, ticketData, status = 'pending') => {
    const newEvent = new Event({
        title:       eventData.title,
        description: eventData.description,
        category:    eventData.category,
        location: {
            address: eventData.address,
            lat:     eventData.lat,
            lng:     eventData.lng
        },
        startDate:  eventData.startDate,
        startTime:  eventData.startTime,
        endDate:    eventData.endDate,
        endTime:    eventData.endTime,
        isFeatured: eventData.isFeatured,
        banners:    bannerUrls,
        organizer:  organizerId,
        status:     status,
        // Embed tickets; `sold` defaults to 0 per sub-schema
        tickets:    ticketData.map(t => ({
            name:       t.name,
            price:      t.price,
            capacity:   t.capacity,
            maxPerUser: t.maxPerUser,
            sold:       0
        }))
    });

    return await newEvent.save();
};


// ─── Get Event for Edit Page ──────────────────────────────────────────────────
// Tickets are part of the event document, no extra query needed.
export const getEventForEdit = async (eventId, organizerId) => {
    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    // Return event.tickets directly as the "tickets" variable for the edit form
    return { event, tickets: event.tickets };
};


// ─── Update Event ─────────────────────────────────────────────────────────────
// Strategy for tickets on edit:
//   • Keep existing tiers that already have sold > 0 (protect sold-out data).
//   • Remove tiers with sold == 0 that are not in the new list.
//   • Add any brand-new tiers that don't exist yet (matched by name).
export const updateEvent = async (eventId, organizerId, eventData, newBannerFiles, ticketData, status = 'pending') => {
    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    const oldStartDate = event.startDate ? new Date(event.startDate).toISOString() : null;
    const newStartDate = eventData.startDate ? new Date(eventData.startDate).toISOString() : null;
    const oldEndDate = event.endDate ? new Date(event.endDate).toISOString() : null;
    const newEndDate = eventData.endDate ? new Date(eventData.endDate).toISOString() : null;

    let dateHasChanged = false;
    // Only flag as changed if it was previously set and is now different
    if (oldStartDate && (oldStartDate !== newStartDate || oldEndDate !== newEndDate)) {
        dateHasChanged = true;
        event.dateChanged = true;
    }

    event.title       = eventData.title;
    event.description = eventData.description;
    event.category    = eventData.category;
    event.location    = { address: eventData.address, lat: eventData.lat, lng: eventData.lng };
    event.startDate   = eventData.startDate;
    event.startTime   = eventData.startTime;
    event.endDate     = eventData.endDate;
    event.endTime     = eventData.endTime;
    event.isFeatured  = eventData.isFeatured;
    
    // Only update status if it's currently draft, or if we explicitly publish it
    if (event.status === 'draft' || status !== 'pending') {
        event.status = status;
    }

    let finalBanners = (eventData.existingBanners || []).filter(b => b); // Remove empty strings
    
    if (newBannerFiles && newBannerFiles.length > 0) {
        const newBanners = newBannerFiles.map(file => file.path);
        finalBanners = [...finalBanners, ...newBanners];
    }
    event.banners = finalBanners.slice(0, 2);

    // Determine which existing tiers are "protected" (have been sold)
    const soldTiers     = event.tickets.filter(t => t.sold > 0);
    const soldTierNames = new Set(soldTiers.map(t => t.name));

    // Build new tier list:
    // 1. All incoming tiers that are NOT already sold (fresh / unsold tiers)
    // 2. Plus all sold tiers that were NOT supplied in new data (keep them intact)
    const incomingNames = new Set(ticketData.map(t => t.name));

    const preservedSoldTiers = soldTiers.filter(t => !incomingNames.has(t.name));

    const freshTiers = ticketData.map(t => {
        // If this name matches a sold tier, update capacity/maxPerUser but keep sold count
        const existingSold = soldTiers.find(s => s.name === t.name);
        if (existingSold) {
            existingSold.price      = t.price;
            existingSold.capacity   = t.capacity;
            existingSold.maxPerUser = t.maxPerUser;
            return existingSold;
        }
        // Brand-new tier
        return { name: t.name, price: t.price, capacity: t.capacity, maxPerUser: t.maxPerUser, sold: 0 };
    });

    event.tickets = [...freshTiers, ...preservedSoldTiers];

    const savedEvent = await event.save();

    if (dateHasChanged) {
        const activeBookings = await Booking.find({ event: eventId, status: { $ne: 'cancelled' } }).select('user');
        const uniqueUserIds = [...new Set(activeBookings.map(b => b.user.toString()))];
        
        const notificationMessage = `The date for event "${savedEvent.title}" has been updated. The new date is ${new Date(savedEvent.startDate).toLocaleDateString(undefined, {day:'numeric', month:'short', year:'numeric'})}. You can review or cancel your booking from your dashboard if needed.`;
        for (const uId of uniqueUserIds) {
            await sendNotification(uId, notificationMessage, 'warning');
        }
    }

    return savedEvent;
};


// ─── Delete Event ─────────────────────────────────────────────────────────────
// Embedded tickets are automatically removed when the event is deleted.
export const deleteEvent = async (eventId, organizerId) => {
    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    await Booking.deleteMany({ event: eventId });
    await event.deleteOne();
};


// ─── Toggle Block Event ───────────────────────────────────────────────────────
export const toggleBlockEvent = async (eventId, organizerId) => {
    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    event.isBlocked = !event.isBlocked;
    await event.save();
    return event;
};


// ─── Resubmit Event for Review ────────────────────────────────────────────────
export const resubmitEvent = async (eventId, organizerId) => {
    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    if (event.status !== 'rejected' && event.status !== 'inactive') {
        throw new AppError('Only rejected or inactive events can be resubmitted', HTTP_STATUS.BAD_REQUEST);
    }

    event.status = 'pending';
    await event.save();
    return event;
};


// ─── Get Sales Report for an Event ────────────────────────────────────────────
export const getEventSalesReport = async (eventId, organizerId, { startDate, endDate } = {}) => {
    const event = await Event.findOne({ _id: eventId, organizer: organizerId }).lean();

    if (!event) return null;

    // 2. Fetch ALL bookings (with optional date filter)
    const query = { event: eventId };
    if (startDate && endDate) {
        query.bookingDate = {
            $gte: new Date(startDate),
            $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
        };
    }

    const allBookings = await Booking.find(query)
        .populate('user', 'fullName email')
        .populate('coupon', 'code')
        .sort({ bookingDate: -1 })
        .lean();

    // 3. Active (non-cancelled) bookings for revenue calculations
    const activeBookings = allBookings.filter(b => b.status !== 'cancelled');

    // ── Summary metrics ───────────────────────────────────────────
    const totalRevenue      = activeBookings.reduce((sum, b) => sum + b.totalAmount, 0);

    let platformFeeRate = 0.05;
    let platformFeePercentage = 5;
    const platform = await Platform.findOne();
    if (platform && platform.platformFeePercentage !== undefined) {
        platformFeePercentage = platform.platformFeePercentage;
        platformFeeRate = platformFeePercentage / 100;
    }

    const platformFee       = totalRevenue * platformFeeRate;
    const netRevenue        = totalRevenue - platformFee;
    const totalBookings     = allBookings.length;
    const activeBookingCount = activeBookings.length;
    const cancelledCount    = allBookings.filter(b => b.status === 'cancelled').length;
    const onHoldCount       = allBookings.filter(b => b.status === 'on_hold').length;

    // Total tickets sold across active bookings
    const totalTicketsSold = activeBookings.reduce((sum, b) => {
        return sum + b.tickets.reduce((tSum, t) => tSum + (t.status !== 'cancelled' ? (t.quantity || 0) : 0), 0);
    }, 0);

    const totalCapacity = (event.tickets || []).reduce((sum, t) => sum + t.capacity, 0);
    const fillRate      = totalCapacity > 0 ? ((totalTicketsSold / totalCapacity) * 100).toFixed(1) : 0;
    const avgOrderValue = activeBookingCount > 0 ? (totalRevenue / activeBookingCount).toFixed(2) : 0;

    // ── Daily Revenue trend (last 30 days) ───────────────────────
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentBookings = activeBookings.filter(b => new Date(b.bookingDate) >= thirtyDaysAgo);

    // Build a map: 'YYYY-MM-DD' → { revenue, bookings }
    const dailyMap = {};
    recentBookings.forEach(b => {
        const dateKey = new Date(b.bookingDate).toISOString().slice(0, 10);
        if (!dailyMap[dateKey]) dailyMap[dateKey] = { revenue: 0, bookings: 0 };
        dailyMap[dateKey].revenue  += b.totalAmount;
        dailyMap[dateKey].bookings += 1;
    });

    // Fill all 30 days (including zeros) for a clean chart
    const dailyRevenueTrend = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dailyRevenueTrend.push({
            date    : key,
            label   : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
            revenue : dailyMap[key]?.revenue  || 0,
            bookings: dailyMap[key]?.bookings || 0,
        });
    }

    // ── Per-tier breakdown ────────────────────────────────────────
    const tierMap = {};
    activeBookings.forEach(b => {
        b.tickets.forEach(t => {
            const tierKey = t.ticketName;
            if (!tierMap[tierKey]) {
                tierMap[tierKey] = {
                    name    : t.ticketName,
                    price   : t.ticketPrice,
                    sold    : 0,
                    revenue : 0,
                };
            }
            tierMap[tierKey].sold    += t.quantity;
            tierMap[tierKey].revenue += t.ticketPrice * t.quantity;
        });
    });

    // Merge with event.tickets to include capacity
    const tierBreakdown = (event.tickets || []).map(et => {
        const salesData = tierMap[et.name] || { sold: 0, revenue: 0 };
        const fillPct   = et.capacity > 0 ? Math.round((salesData.sold / et.capacity) * 100) : 0;
        return {
            name      : et.name,
            price     : et.price,
            capacity  : et.capacity,
            sold      : salesData.sold,
            revenue   : salesData.revenue,
            fillPct,
            remaining : et.capacity - salesData.sold,
        };
    });

    // ── Payment method split ──────────────────────────────────────
    const paymentMethodMap = { razorpay: 0, wallet: 0 };
    activeBookings.forEach(b => {
        const method = b.paymentMethod || 'razorpay';
        paymentMethodMap[method] = (paymentMethodMap[method] || 0) + b.totalAmount;
    });

    // ── Booking status distribution ───────────────────────────────
    const statusDistribution = {
        active   : activeBookingCount,
        on_hold  : onHoldCount,
        cancelled: cancelledCount,
    };

    // ── Recent transactions (latest 10 active) ────────────────────
    const recentTransactions = activeBookings.slice(0, 10).map(b => ({
        _id          : b._id,
        userName     : b.user?.fullName || 'Unknown',
        userEmail    : b.user?.email    || '',
        amount       : b.totalAmount,
        paymentMethod: b.paymentMethod,
        paymentId    : b.paymentId,
        ticketCount  : b.tickets.reduce((s, t) => s + t.quantity, 0),
        bookingDate  : b.bookingDate,
        status       : b.status,
    }));

    // ── All transactions for detailed exports ─────────────────────
    const allTransactions = allBookings.map(b => ({
        _id          : b._id,
        userName     : b.user?.fullName || 'Unknown',
        userEmail    : b.user?.email    || '',
        amount       : b.totalAmount,
        paymentMethod: b.paymentMethod,
        paymentId    : b.paymentId,
        ticketCount  : b.tickets.reduce((s, t) => s + t.quantity, 0),
        ticketBreakdown: b.tickets.map(t => `${t.ticketName} x${t.quantity}`).join(', '),
        couponCode   : b.coupon ? b.coupon.code : 'None',
        cancellationReason: b.cancellationReason || (b.cancellationRequest && b.cancellationRequest.reason ? b.cancellationRequest.reason : ''),
        bookingDate  : b.bookingDate,
        status       : b.status,
    }));

    return {
        event,
        // Summary
        totalRevenue,
        platformFeePercentage,
        platformFee,
        netRevenue,
        totalBookings,
        activeBookingCount,
        cancelledCount,
        onHoldCount,
        totalTicketsSold,
        totalCapacity,
        fillRate,
        avgOrderValue,
        // Charts data
        dailyRevenueTrend,
        tierBreakdown,
        paymentMethodMap,
        statusDistribution,
        // Table
        recentTransactions,
        allTransactions,
    };
};


// ─── Get Global Sales Report (All Events) ─────────────────────────────────────
export const getGlobalSalesReport = async (organizerId, { startDate, endDate } = {}) => {
    // 1. Fetch ALL events belonging to organizer
    const events = await Event.find({ organizer: organizerId }).lean();
    if (!events.length) return null;

    const eventIds = events.map(e => e._id);

    // 2. Fetch ALL bookings for these events (with optional date filter)
    const query = { event: { $in: eventIds } };
    if (startDate && endDate) {
        query.bookingDate = {
            $gte: new Date(startDate),
            $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
        };
    }

    const allBookings = await Booking.find(query)
        .populate('user', 'fullName email')
        .populate('event', 'title')
        .populate('coupon', 'code')
        .sort({ bookingDate: -1 })
        .lean();

    // 3. Active (non-cancelled) bookings for revenue calculations
    const activeBookings = allBookings.filter(b => b.status !== 'cancelled');

    // ── Summary metrics ───────────────────────────────────────────
    const totalRevenue      = activeBookings.reduce((sum, b) => sum + b.totalAmount, 0);
    
    let platformFeeRate = 0.05;
    let platformFeePercentage = 5;
    const platform = await Platform.findOne();
    if (platform && platform.platformFeePercentage !== undefined) {
        platformFeePercentage = platform.platformFeePercentage;
        platformFeeRate = platformFeePercentage / 100;
    }

    const platformFee       = totalRevenue * platformFeeRate;
    const netRevenue        = totalRevenue - platformFee;
    const totalBookingsCount= allBookings.length;
    const activeBookingCount = activeBookings.length;
    const cancelledCount    = allBookings.filter(b => b.status === 'cancelled').length;
    const onHoldCount       = allBookings.filter(b => b.status === 'on_hold').length;

    // Total tickets sold across active bookings
    const totalTicketsSold = activeBookings.reduce((sum, b) => {
        return sum + b.tickets.reduce((tSum, t) => tSum + (t.status !== 'cancelled' ? (t.quantity || 0) : 0), 0);
    }, 0);

    const totalCapacity = events.reduce((sum, e) => {
        return sum + (e.tickets || []).reduce((ts, t) => ts + t.capacity, 0);
    }, 0);
    
    const fillRate      = totalCapacity > 0 ? ((totalTicketsSold / totalCapacity) * 100).toFixed(1) : 0;
    const avgOrderValue = activeBookingCount > 0 ? (totalRevenue / activeBookingCount).toFixed(2) : 0;

    // ── Daily Revenue trend (last 30 days) ───────────────────────
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentBookings = activeBookings.filter(b => new Date(b.bookingDate) >= thirtyDaysAgo);

    const dailyMap = {};
    recentBookings.forEach(b => {
        const dateKey = new Date(b.bookingDate).toISOString().slice(0, 10);
        if (!dailyMap[dateKey]) dailyMap[dateKey] = { revenue: 0, bookings: 0 };
        dailyMap[dateKey].revenue  += b.totalAmount;
        dailyMap[dateKey].bookings += 1;
    });

    const dailyRevenueTrend = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dailyRevenueTrend.push({
            date    : key,
            label   : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
            revenue : dailyMap[key]?.revenue  || 0,
            bookings: dailyMap[key]?.bookings || 0,
        });
    }

    // ── Event-Level Performance (instead of tier breakdown) ───────
    const eventPerformance = events.map(e => {
        const evBookings = activeBookings.filter(b => String(b.event._id) === String(e._id));
        const evRevenue = evBookings.reduce((sum, b) => sum + b.totalAmount, 0);
        const evTicketsSold = evBookings.reduce((sum, b) => sum + b.tickets.reduce((ts, t) => ts + (t.quantity || 0), 0), 0);
        const evCapacity = (e.tickets || []).reduce((sum, t) => sum + t.capacity, 0);
        const evFillRate = evCapacity > 0 ? Math.round((evTicketsSold / evCapacity) * 100) : 0;

        return {
            id: e._id,
            title: e.title,
            category: getCategoryName(e.category),
            revenue: evRevenue,
            sold: evTicketsSold,
            capacity: evCapacity,
            fillPct: evFillRate
        };
    }).sort((a, b) => b.revenue - a.revenue);

    // ── Payment method split ──────────────────────────────────────
    const paymentMethodMap = { razorpay: 0, wallet: 0 };
    activeBookings.forEach(b => {
        const method = b.paymentMethod || 'razorpay';
        paymentMethodMap[method] = (paymentMethodMap[method] || 0) + b.totalAmount;
    });

    const statusDistribution = { active: activeBookingCount, on_hold: onHoldCount, cancelled: cancelledCount };

    // ── Recent transactions (latest 15 active) ────────────────────
    const recentTransactions = activeBookings.slice(0, 15).map(b => ({
        _id          : b._id,
        eventName    : b.event?.title || 'Unknown Event',
        userName     : b.user?.fullName || 'Unknown',
        userEmail    : b.user?.email    || '',
        amount       : b.totalAmount,
        paymentMethod: b.paymentMethod,
        paymentId    : b.paymentId,
        ticketCount  : b.tickets.reduce((s, t) => s + t.quantity, 0),
        bookingDate  : b.bookingDate,
        status       : b.status,
    }));

    // ── All transactions for detailed exports ─────────────────────
    const allTransactions = allBookings.map(b => ({
        _id          : b._id,
        eventName    : b.event?.title || 'Unknown Event',
        userName     : b.user?.fullName || 'Unknown',
        userEmail    : b.user?.email    || '',
        amount       : b.totalAmount,
        paymentMethod: b.paymentMethod,
        paymentId    : b.paymentId,
        ticketCount  : b.tickets.reduce((s, t) => s + t.quantity, 0),
        ticketBreakdown: b.tickets.map(t => `${t.ticketName} x${t.quantity}`).join(', '),
        couponCode   : b.coupon ? b.coupon.code : 'None',
        cancellationReason: b.cancellationReason || (b.cancellationRequest && b.cancellationRequest.reason ? b.cancellationRequest.reason : ''),
        bookingDate  : b.bookingDate,
        status       : b.status,
    }));

    return {
        eventsCount: events.length,
        totalRevenue, platformFeePercentage, platformFee, netRevenue, totalBookings: totalBookingsCount,
        activeBookingCount, cancelledCount, onHoldCount, totalTicketsSold,
        totalCapacity, fillRate, avgOrderValue, dailyRevenueTrend,
        eventPerformance, paymentMethodMap, statusDistribution, recentTransactions, allTransactions,
    };
};

// ─── Export Global Sales Report as Excel ──────────────────────────────────────
export const exportGlobalSalesReportExcel = async (organizerId, { startDate, endDate } = {}) => {
    const reportData = await getGlobalSalesReport(organizerId, { startDate, endDate });
    if (!reportData) throw new AppError('No event data found', 404);

    const {
        eventsCount, totalRevenue, netRevenue, platformFee, platformFeePercentage,
        totalBookings, activeBookingCount, cancelledCount, onHoldCount,
        totalTicketsSold, totalCapacity, fillRate, avgOrderValue,
        eventPerformance, dailyRevenueTrend, allTransactions, paymentMethodMap,
    } = reportData;

    const workbook = new ExcelJS.Workbook();
    workbook.creator  = 'EventHub';
    workbook.created  = new Date();
    workbook.modified = new Date();

    const styleHeader = (row, bgArgb = 'FFE63946') => {
        row.eachCell(cell => {
            cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
            cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.border = { top: { style: 'thin', color: { argb: 'FFE63946' } }, bottom: { style: 'thin', color: { argb: 'FFE63946' } } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
        row.height = 22;
    };
    const INR = (val) => `Rs. ${Number(val).toFixed(2)}`;

    // SHEET 1: Summary
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [{ header: 'Metric', key: 'metric', width: 30 }, { header: 'Value', key: 'value', width: 28 }];
    
    summarySheet.mergeCells('A1:B1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value = 'Global Sales Report';
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A0A0C' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    summarySheet.getRow(1).height = 30;

    summarySheet.mergeCells('A2:B2');
    const subCell = summarySheet.getCell('A2');
    subCell.value = `Generated: ${new Date().toLocaleDateString('en-IN')}` + (startDate && endDate ? ` | Filtered: ${new Date(startDate).toLocaleDateString('en-IN')} to ${new Date(endDate).toLocaleDateString('en-IN')}` : '');
    subCell.font = { italic: true, color: { argb: 'FF888888' }, size: 10 };
    subCell.alignment = { horizontal: 'center' };
    summarySheet.addRow([]);

    styleHeader(summarySheet.addRow(['Metric', 'Value']), 'FFE63946');

    const summaryRows = [
        ['Total Events', eventsCount],
        ['Gross Revenue', INR(totalRevenue)],
        [`Platform Fee (${platformFeePercentage}%)`, INR(platformFee)],
        ['Net Revenue', INR(netRevenue)],
        ['Avg. Order Value', INR(avgOrderValue)],
        ['Total Bookings', totalBookings],
        ['Active Bookings', activeBookingCount],
        ['On Hold', onHoldCount],
        ['Cancelled', cancelledCount],
        ['Tickets Sold', totalTicketsSold],
        ['Total Capacity', totalCapacity],
        ['Fill Rate', `${fillRate}%`],
        ['Razorpay Revenue', INR(paymentMethodMap.razorpay || 0)],
        ['Wallet Revenue', INR(paymentMethodMap.wallet || 0)],
    ];
    summaryRows.forEach((data, i) => {
        const row = summarySheet.addRow(data);
        row.getCell(1).font = { bold: true };
        if (i % 2 === 0) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8F8' } }; });
    });

    // SHEET 2: Event Performance
    const eventSheet = workbook.addWorksheet('Event Performance');
    eventSheet.columns = [
        { header: 'Event Title', key: 'title', width: 30 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Capacity', key: 'capacity', width: 14 },
        { header: 'Sold', key: 'sold', width: 12 },
        { header: 'Fill Rate', key: 'fillPct', width: 12 },
        { header: 'Revenue', key: 'revenue', width: 18 },
    ];
    styleHeader(eventSheet.getRow(1), 'FF1A1A2E');
    eventPerformance.forEach(ep => {
        eventSheet.addRow({ title: ep.title, category: ep.category, capacity: ep.capacity, sold: ep.sold, fillPct: `${ep.fillPct}%`, revenue: INR(ep.revenue) });
    });

    // SHEET 3: Daily Trend
    const trendSheet = workbook.addWorksheet('Daily Trend');
    trendSheet.columns = [
        { header: 'Date', key: 'date', width: 18 },
        { header: 'Revenue (Rs)', key: 'revenue', width: 18 },
        { header: 'Bookings', key: 'bookings', width: 14 },
    ];
    styleHeader(trendSheet.getRow(1), 'FF0D3349');
    dailyRevenueTrend.forEach(d => {
        trendSheet.addRow({ date: d.label, revenue: Number(d.revenue.toFixed(2)), bookings: d.bookings });
    });

    // SHEET 4: Detailed Transactions
    const txnSheet = workbook.addWorksheet('Detailed Transactions');
    txnSheet.columns = [
        { header: 'Event', key: 'event', width: 30 },
        { header: 'Attendee', key: 'name', width: 24 },
        { header: 'Email', key: 'email', width: 28 },
        { header: 'Tickets', key: 'tickets', width: 10 },
        { header: 'Ticket Breakdown', key: 'ticketBreakdown', width: 30 },
        { header: 'Coupon Used', key: 'couponCode', width: 18 },
        { header: 'Payment Method', key: 'method', width: 18 },
        { header: 'Amount (Rs)', key: 'amount', width: 16 },
        { header: 'Date & Time', key: 'date', width: 22 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Cancellation Reason', key: 'cancelReason', width: 28 },
    ];
    styleHeader(txnSheet.getRow(1), 'FF0A2E1A');
    allTransactions.forEach(t => {
        txnSheet.addRow({
            event: t.eventName, name: t.userName, email: t.userEmail, tickets: t.ticketCount,
            ticketBreakdown: t.ticketBreakdown, couponCode: t.couponCode,
            method: t.paymentMethod, amount: Number(t.amount.toFixed(2)),
            date: new Date(t.bookingDate).toLocaleString('en-IN'), status: t.status,
            cancelReason: t.cancellationReason,
        });
    });

    return workbook;
};

// ─── Export Global Sales Report as PDF ────────────────────────────────────────
export const exportGlobalSalesReportPdf = async (organizerId, { startDate, endDate } = {}) => {
    const reportData = await getGlobalSalesReport(organizerId, { startDate, endDate });
    if (!reportData) throw new AppError('No event data found', 404);

    const {
        eventsCount, totalRevenue, netRevenue, platformFee,
        totalBookings, activeBookingCount, cancelledCount, onHoldCount,
        totalTicketsSold, totalCapacity, fillRate, avgOrderValue,
        eventPerformance, allTransactions, paymentMethodMap,
    } = reportData;

    const INR = (v) => `Rs. ${Number(v).toFixed(2)}`;
    const generatedAt = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    const eventRows = eventPerformance.map(ep => `
        <tr>
            <td>${ep.title}<br><small style="color:#888;">${ep.category}</small></td>
            <td>${ep.capacity}</td>
            <td>${ep.sold}</td>
            <td>${ep.fillPct}%</td>
            <td>Rs. ${ep.revenue.toLocaleString('en-IN')}</td>
        </tr>
    `).join('');

    const txnRows = allTransactions.map(t => `
        <tr>
            <td>${t.eventName}</td>
            <td>${t.userName}<br><small style="color:#888;">${t.userEmail}</small></td>
            <td>${t.ticketCount}</td>
            <td>${t.paymentMethod}</td>
            <td>Rs. ${t.amount.toLocaleString('en-IN')}</td>
            <td>${new Date(t.bookingDate).toLocaleDateString('en-IN')}</td>
        </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 13px; }
  .page { padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #E63946; }
  .brand { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; color: #E63946; }
  .brand span { color: #1a1a1a; }
  .report-meta h1 { font-size: 20px; font-weight: 800; color: #1a1a1a; }
  .report-meta p { font-size: 11px; color: #888; margin-top: 3px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 28px; }
  .kpi-box { background: #f8f9fa; border: 1px solid #eee; border-radius: 10px; padding: 14px 16px; }
  .kpi-box .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #999; font-weight: 700; }
  .kpi-box .value { font-size: 20px; font-weight: 800; color: #1a1a1a; margin-top: 4px; }
  .kpi-box .sub { font-size: 10px; color: #aaa; margin-top: 2px; }
  .section-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #E63946; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 12px; }
  thead th { background: #1a1a1a; color: white; padding: 9px 12px; text-align: left; font-weight: 700; font-size: 11px; letter-spacing: 0.04em; }
  tbody tr:nth-child(even) td { background: #f8f9fa; }
  tbody td { padding: 9px 12px; border-bottom: 1px solid #eee; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 10px; color: #bbb; text-align: center; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="brand">Event<span>Hub</span></div>
    <div class="report-meta">
      <h1>Global Sales Report</h1>
      <p>
        Across ${eventsCount} events
        ${startDate && endDate ? `<br>Filtered: ${new Date(startDate).toLocaleDateString('en-IN')} to ${new Date(endDate).toLocaleDateString('en-IN')}` : ''}
        <br>Generated ${generatedAt}
      </p>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="label">Gross Revenue</div>
      <div class="value" style="color:#1a7a3e;">${INR(totalRevenue)}</div>
      <div class="sub">Net: ${INR(netRevenue)}</div>
    </div>
    <div class="kpi-box">
      <div class="label">Tickets Sold</div>
      <div class="value" style="color:#E63946;">${totalTicketsSold} / ${totalCapacity}</div>
      <div class="sub">${fillRate}% fill rate</div>
    </div>
    <div class="kpi-box">
      <div class="label">Total Bookings</div>
      <div class="value">${totalBookings}</div>
      <div class="sub">${activeBookingCount} active · ${cancelledCount} cancelled</div>
    </div>
    <div class="kpi-box">
      <div class="label">Avg. Order</div>
      <div class="value">${INR(avgOrderValue)}</div>
      <div class="sub">Razorpay: ${INR(paymentMethodMap.razorpay||0)} · Wallet: ${INR(paymentMethodMap.wallet||0)}</div>
    </div>
  </div>

  <div class="section-title">Event Performance</div>
  <table>
    <thead><tr><th>Event</th><th>Capacity</th><th>Sold</th><th>Fill</th><th>Revenue</th></tr></thead>
    <tbody>${eventRows}</tbody>
  </table>

  <div class="section-title">Detailed Transactions</div>
  <table>
    <thead><tr><th>Event</th><th>Attendee</th><th>Tickets</th><th>Method</th><th>Amount</th><th>Date</th></tr></thead>
    <tbody>${txnRows}</tbody>
  </table>

  <div class="footer">EventHub Global Sales Report &nbsp;·&nbsp; Confidential &nbsp;·&nbsp; ${generatedAt}</div>
</div>
</body>
</html>`;

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    await browser.close();
    return pdfBuffer;
};


// ─── Export Sales Report as Excel ─────────────────────────────────────────────
export const exportSalesReportExcel = async (eventId, organizerId, { startDate, endDate } = {}) => {
    const reportData = await getEventSalesReport(eventId, organizerId, { startDate, endDate });
    if (!reportData) throw new AppError('Event not found', 404);

    const {
        event, totalRevenue, netRevenue, platformFee, platformFeePercentage,
        totalBookings, activeBookingCount, cancelledCount, onHoldCount,
        totalTicketsSold, totalCapacity, fillRate, avgOrderValue,
        tierBreakdown, dailyRevenueTrend, allTransactions, paymentMethodMap,
    } = reportData;

    const workbook = new ExcelJS.Workbook();
    workbook.creator  = 'EventHub';
    workbook.created  = new Date();
    workbook.modified = new Date();

    // ── Helper: styled header row ──────────────────────────────────────────────
    const styleHeader = (row, bgArgb = 'FFE63946') => {
        row.eachCell(cell => {
            cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
            cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.border = {
                top:    { style: 'thin', color: { argb: 'FFE63946' } },
                bottom: { style: 'thin', color: { argb: 'FFE63946' } },
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
        row.height = 22;
    };

    const INR = (val) => `Rs. ${Number(val).toFixed(2)}`;

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 1 — SUMMARY
    // ─────────────────────────────────────────────────────────────────────────
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 30 },
        { header: 'Value',  key: 'value',  width: 28 },
    ];

    // Title block
    summarySheet.mergeCells('A1:B1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value     = `Sales Report — ${event.title}`;
    titleCell.font      = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A0A0C' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    summarySheet.getRow(1).height = 30;

    summarySheet.mergeCells('A2:B2');
    const subCell = summarySheet.getCell('A2');
    subCell.value     = `Generated: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}` + (startDate && endDate ? ` | Filtered: ${new Date(startDate).toLocaleDateString('en-IN')} to ${new Date(endDate).toLocaleDateString('en-IN')}` : '');
    subCell.font      = { italic: true, color: { argb: 'FF888888' }, size: 10 };
    subCell.alignment = { horizontal: 'center' };
    summarySheet.addRow([]);

    const headerRow = summarySheet.addRow(['Metric', 'Value']);
    styleHeader(headerRow, 'FFE63946');

    const summaryRows = [
        ['Event Name',       event.title],
        ['Event Date',       new Date(event.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })],
        ['Category',         getCategoryName(event.category)],
        ['Gross Revenue',    INR(totalRevenue)],
        [`Platform Fee (${platformFeePercentage}%)`,INR(platformFee)],
        ['Net Revenue',      INR(netRevenue)],
        ['Avg. Order Value', INR(avgOrderValue)],
        ['Total Bookings',   totalBookings],
        ['Active Bookings',  activeBookingCount],
        ['On Hold',          onHoldCount],
        ['Cancelled',        cancelledCount],
        ['Tickets Sold',     totalTicketsSold],
        ['Total Capacity',   totalCapacity],
        ['Fill Rate',        `${fillRate}%`],
        ['Razorpay Revenue', INR(paymentMethodMap.razorpay || 0)],
        ['Wallet Revenue',   INR(paymentMethodMap.wallet   || 0)],
    ];

    summaryRows.forEach((data, i) => {
        const row = summarySheet.addRow(data);
        row.getCell(1).font = { bold: true };
        if (i % 2 === 0) {
            row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8F8' } }; });
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 2 — TICKET TIERS
    // ─────────────────────────────────────────────────────────────────────────
    const tierSheet = workbook.addWorksheet('Ticket Tiers');
    tierSheet.columns = [
        { header: 'Tier Name',  key: 'name',      width: 20 },
        { header: 'Price (Rs)', key: 'price',      width: 16 },
        { header: 'Capacity',   key: 'capacity',   width: 14 },
        { header: 'Sold',       key: 'sold',       width: 12 },
        { header: 'Remaining',  key: 'remaining',  width: 14 },
        { header: 'Fill Rate',  key: 'fillPct',    width: 12 },
        { header: 'Revenue',    key: 'revenue',    width: 18 },
    ];
    styleHeader(tierSheet.getRow(1), 'FF1A1A2E');

    tierBreakdown.forEach(tier => {
        tierSheet.addRow({
            name:     tier.name,
            price:    tier.price,
            capacity: tier.capacity,
            sold:     tier.sold,
            remaining:tier.remaining,
            fillPct:  `${tier.fillPct}%`,
            revenue:  INR(tier.revenue),
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 3 — DAILY TREND
    // ─────────────────────────────────────────────────────────────────────────
    const trendSheet = workbook.addWorksheet('Daily Trend');
    trendSheet.columns = [
        { header: 'Date',         key: 'date',     width: 18 },
        { header: 'Revenue (Rs)', key: 'revenue',  width: 18 },
        { header: 'Bookings',     key: 'bookings', width: 14 },
    ];
    styleHeader(trendSheet.getRow(1), 'FF0D3349');

    dailyRevenueTrend.forEach(d => {
        trendSheet.addRow({ date: d.label, revenue: Number(d.revenue.toFixed(2)), bookings: d.bookings });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 4 — DETAILED TRANSACTIONS
    // ─────────────────────────────────────────────────────────────────────────
    const txnSheet = workbook.addWorksheet('Detailed Transactions');
    txnSheet.columns = [
        { header: 'Attendee',       key: 'name',    width: 24 },
        { header: 'Email',          key: 'email',   width: 28 },
        { header: 'Tickets',        key: 'tickets', width: 10 },
        { header: 'Ticket Breakdown', key: 'ticketBreakdown', width: 30 },
        { header: 'Coupon Used',    key: 'couponCode', width: 18 },
        { header: 'Payment Method', key: 'method',  width: 18 },
        { header: 'Payment ID',     key: 'pid',     width: 28 },
        { header: 'Amount (Rs)',    key: 'amount',  width: 16 },
        { header: 'Date & Time',    key: 'date',    width: 22 },
        { header: 'Status',         key: 'status',  width: 14 },
        { header: 'Cancellation Reason', key: 'cancelReason', width: 28 },
    ];
    styleHeader(txnSheet.getRow(1), 'FF0A2E1A');

    allTransactions.forEach(t => {
        txnSheet.addRow({
            name:    t.userName,
            email:   t.userEmail,
            tickets: t.ticketCount,
            ticketBreakdown: t.ticketBreakdown,
            couponCode: t.couponCode,
            method:  t.paymentMethod,
            pid:     t.paymentId || 'N/A',
            amount:  Number(t.amount.toFixed(2)),
            date:    new Date(t.bookingDate).toLocaleString('en-IN'),
            status:  t.status,
            cancelReason: t.cancellationReason,
        });
    });

    return workbook;
};


// ─── Export Sales Report as PDF ───────────────────────────────────────────────
export const exportSalesReportPdf = async (eventId, organizerId, { startDate, endDate } = {}) => {
    const reportData = await getEventSalesReport(eventId, organizerId, { startDate, endDate });
    if (!reportData) throw new AppError('Event not found', 404);

    const {
        event, totalRevenue, netRevenue, platformFee,
        totalBookings, activeBookingCount, cancelledCount, onHoldCount,
        totalTicketsSold, totalCapacity, fillRate, avgOrderValue,
        tierBreakdown, allTransactions, paymentMethodMap,
    } = reportData;

    const INR = (v) => `Rs. ${Number(v).toFixed(2)}`;
    const generatedAt = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    const tierRows = tierBreakdown.map(t => `
        <tr>
            <td>${t.name}</td>
            <td>Rs. ${t.price.toLocaleString('en-IN')}</td>
            <td>${t.capacity}</td>
            <td>${t.sold}</td>
            <td>${t.remaining}</td>
            <td>${t.fillPct}%</td>
            <td>Rs. ${t.revenue.toLocaleString('en-IN')}</td>
        </tr>
    `).join('');

    const txnRows = allTransactions.map(t => `
        <tr>
            <td>${t.userName}<br><small style="color:#888;">${t.userEmail}</small></td>
            <td>${t.ticketCount}</td>
            <td>${t.paymentMethod}</td>
            <td>Rs. ${t.amount.toLocaleString('en-IN')}</td>
            <td>${new Date(t.bookingDate).toLocaleDateString('en-IN')}</td>
            <td><span style="padding:3px 8px;border-radius:4px;font-size:11px;background:${t.status==='active'?'#e8f8ef':t.status==='on_hold'?'#fff8e1':'#fde9e9'};color:${t.status==='active'?'#1a7a3e':t.status==='on_hold'?'#b07d00':'#b02020'};">${t.status}</span></td>
        </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 13px; }
  .page { padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #E63946; }
  .brand { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; color: #E63946; }
  .brand span { color: #1a1a1a; }
  .report-meta h1 { font-size: 20px; font-weight: 800; color: #1a1a1a; }
  .report-meta p { font-size: 11px; color: #888; margin-top: 3px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 28px; }
  .kpi-box { background: #f8f9fa; border: 1px solid #eee; border-radius: 10px; padding: 14px 16px; }
  .kpi-box .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #999; font-weight: 700; }
  .kpi-box .value { font-size: 20px; font-weight: 800; color: #1a1a1a; margin-top: 4px; }
  .kpi-box .sub { font-size: 10px; color: #aaa; margin-top: 2px; }
  .kpi-box.green .value { color: #1a7a3e; }
  .kpi-box.red .value { color: #E63946; }
  .section-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #E63946; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 12px; }
  thead th { background: #1a1a1a; color: white; padding: 9px 12px; text-align: left; font-weight: 700; font-size: 11px; letter-spacing: 0.04em; }
  tbody tr:nth-child(even) td { background: #f8f9fa; }
  tbody td { padding: 9px 12px; border-bottom: 1px solid #eee; }
  .payment-row { display: flex; gap: 16px; margin-bottom: 28px; }
  .payment-box { flex: 1; border: 1px solid #eee; border-radius: 10px; padding: 14px 16px; }
  .payment-box .method { font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.06em; }
  .payment-box .amount { font-size: 18px; font-weight: 800; color: #1a1a1a; margin-top: 4px; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 10px; color: #bbb; text-align: center; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="brand">Event<span>Hub</span></div>
    <div class="report-meta">
      <h1>Sales Report</h1>
      <p>
        ${event.title}
        ${startDate && endDate ? `<br>Filtered: ${new Date(startDate).toLocaleDateString('en-IN')} to ${new Date(endDate).toLocaleDateString('en-IN')}` : ''}
        <br>Generated ${generatedAt}
      </p>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-box green">
      <div class="label">Gross Revenue</div>
      <div class="value">${INR(totalRevenue)}</div>
      <div class="sub">Net: ${INR(netRevenue)}</div>
    </div>
    <div class="kpi-box red">
      <div class="label">Tickets Sold</div>
      <div class="value">${totalTicketsSold} / ${totalCapacity}</div>
      <div class="sub">${fillRate}% fill rate</div>
    </div>
    <div class="kpi-box">
      <div class="label">Total Bookings</div>
      <div class="value">${totalBookings}</div>
      <div class="sub">${activeBookingCount} active · ${cancelledCount} cancelled</div>
    </div>
    <div class="kpi-box">
      <div class="label">Avg. Order</div>
      <div class="value">${INR(avgOrderValue)}</div>
      <div class="sub">Platform fee: ${INR(platformFee)}</div>
    </div>
  </div>

  <div class="payment-row">
    <div class="payment-box">
      <div class="method">Razorpay</div>
      <div class="amount">${INR(paymentMethodMap.razorpay || 0)}</div>
    </div>
    <div class="payment-box">
      <div class="method">Wallet</div>
      <div class="amount">${INR(paymentMethodMap.wallet || 0)}</div>
    </div>
    <div class="payment-box">
      <div class="method">On Hold</div>
      <div class="amount">${onHoldCount} bookings</div>
    </div>
  </div>

  <div class="section-title">Ticket Tier Breakdown</div>
  <table>
    <thead>
      <tr>
        <th>Tier</th><th>Price</th><th>Capacity</th>
        <th>Sold</th><th>Remaining</th><th>Fill</th><th>Revenue</th>
      </tr>
    </thead>
    <tbody>${tierRows}</tbody>
  </table>

  <div class="section-title">Detailed Transactions</div>
  <table>
    <thead>
      <tr><th>Attendee</th><th>Tickets</th><th>Method</th><th>Amount</th><th>Date</th><th>Status</th></tr>
    </thead>
    <tbody>${txnRows}</tbody>
  </table>

  <div class="footer">EventHub Sales Report &nbsp;·&nbsp; Confidential &nbsp;·&nbsp; ${generatedAt}</div>
</div>
</body>
</html>`;

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
        format:          'A4',
        printBackground: true,
        margin:          { top: '0', right: '0', bottom: '0', left: '0' },
    });
    await browser.close();
    return pdfBuffer;
};
