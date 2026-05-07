import HTTP_STATUS from "../../constant/statusCode.js"
import User from "../../models/users/user.js"
import AppError from "../../utils/AppError.js"
import argon2 from "argon2"

export const fetchAllUsers = async (query) =>{
    const mongoQuery = { role: query.role };

    if (query.search) {
        mongoQuery.$or = [
            { fullName: { $regex: query.search, $options: 'i' } },
            { email: { $regex: query.search, $options: 'i' } }
        ];
    }
    
    if (query.status === 'active') {
        mongoQuery.isBlocked = false;
    } else if (query.status === 'blocked') {
        mongoQuery.isBlocked = true;
    }

    const page = query.page || 1
    const limit = query.limit || 10
    const skip = (page - 1) * limit
    
    let sortOption = { createdAt: -1 }; // Default: Newest
    if (query.sort === 'oldest') sortOption = { createdAt: 1 };
    if (query.sort === 'name-asc') sortOption = { fullName: 1 };
    
    const dbUsers = await User.find(mongoQuery).sort(sortOption).skip(skip).limit(limit)
    if(!dbUsers){
        throw new AppError('No Users Found', HTTP_STATUS.NOT_FOUND)
    }

    const filteredTotal = await User.countDocuments(mongoQuery);

    const totalUsers = await User.countDocuments(query)

    const bannedUsers = await User.countDocuments({isBlocked: true})

    return {dbUsers, totalUsers, bannedUsers, totalPages: Math.ceil(filteredTotal/limit), currentPage: page}
}

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

export const fetchAllOrganizers = async (query) => {
    const mongoQuery = { role: 'organizer' }; // Ensure we only target organizers

    // 1. Search Logic
    if (query.search) {
        mongoQuery.$or = [
            { organizationName: { $regex: query.search, $options: 'i' } },
            { email: { $regex: query.search, $options: 'i' } }
        ];
    }

    // 2. Status Logic
    if (query.status !== 'all') {
        mongoQuery.status = query.status; // e.g., 'pending', 'active', 'suspended'
    }

    // 3. Pagination & Sort
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;
    
    let sortOption = { createdAt: -1 };
    if (query.sort === 'name-asc') sortOption = { organizationName: 1 };

    const dbOrganizers = await User.find(mongoQuery)
        .sort(sortOption)
        .skip(skip)
        .limit(limit);

    const filteredTotal = await User.countDocuments(mongoQuery);

    return {
        dbOrganizers,
        totalOrganizers: await User.countDocuments({ role: 'organizer' }),
        pendingApprovals: await User.countDocuments({ status: 'pending' }),
        totalPages: Math.ceil(filteredTotal / limit),
        currentPage: page
    };
};