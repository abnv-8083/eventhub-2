import HTTP_STATUS from "../../constant/statusCode.js"
import User from "../../models/users/user.js"
import AppError from "../../utils/AppError.js"
import argon2 from "argon2"

export const fetchAllUsers = async (query) => {
    // 1. Base query filtered by role (e.g., 'user' or 'organizer')
    const mongoQuery = { role: query.role };

    // 2. Search Logic: Handles Organization Name, Full Name, or Email
    if(query.role == 'user'){
        if (query.search) {
            mongoQuery.$or = [
                { fullName: { $regex: query.search, $options: 'i' } },
                { email: { $regex: query.search, $options: 'i' } },
            ];
        }
    }else if(query.role == 'organizer'){
       if (query.search) {
            mongoQuery.$or = [
                { organizationName: { $regex: query.search, $options: 'i' } },
                { fullName: { $regex: query.search, $options: 'i' } },
                { email: { $regex: query.search, $options: 'i' } },
                { phone: { $regex: query.search, $options: 'i'}},
            ];
        } 
    }

    // 3. Status Filtering: Maps UI terms to database fields
    if (query.status === 'active') {
        mongoQuery.isBlocked = false;
    } else if (query.status === 'blocked') {
        mongoQuery.isBlocked = true;
    } else if (query.status === 'pending') {
        mongoQuery.status = 'pending';
    } else if (query.status === 'approved') {
        mongoQuery.status = 'approved'
    }else if (query.status === 'rejected') {
        mongoQuery.status = 'rejected'
    }

    // 4. Pagination Setup
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    // 5. Sorting Logic
    let sortOption = { createdAt: -1 }; // Default: Newest first
    if (query.sort === 'oldest') {
        sortOption = { createdAt: 1 };
    } else if (query.sort === 'name-asc') {
        // Sorts by Organization name if it exists, otherwise Full Name
        sortOption = { organizationName: 1, fullName: 1 };
    }

    // 6. Execute Database Operations
    const [dbUsers, filteredTotal] = await Promise.all([
        User.find(mongoQuery)
            .sort(sortOption)
            .skip(skip)
            .limit(limit),
        User.countDocuments(mongoQuery)
    ]);

    // 7. Global Stats (Always returned for the dashboard cards)
    const totalUsers = await User.countDocuments({ role: query.role });
    const bannedUsers = await User.countDocuments({ role: query.role, isBlocked: true });

    return { 
        dbUsers, 
        totalUsers, 
        bannedUsers,
        totalPages: Math.ceil(filteredTotal / limit),
        currentPage: page
    };
};

export const toggleUserBlockStatus = async (userId) => {
    // Fetch the user
    const user = await User.findById(userId);
    
    if (!user) {
        throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }
    
    // Toggle the boolean value
    user.isBlocked = !user.isBlocked;
    
    // Save to database
    await user.save();
    
    return user;
};

export const deleteUserById = async (userId) => {
    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
        throw new AppError('User not found or already deleted', HTTP_STATUS.NOT_FOUND);
    }
    return deletedUser;
};

