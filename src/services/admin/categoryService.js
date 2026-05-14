import Category from '../../models/categories/category.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';


// ─── Get All Categories ───────────────────────────────────────────────────────
export const getAllCategories = async () => {
    return await Category.find().sort({ createdAt: -1 });
};


// ─── Add Category ─────────────────────────────────────────────────────────────
export const addCategory = async (data) => {
    const existing = await Category.findOne({ name: { $regex: new RegExp(`^${data.name}$`, 'i') } });
    if (existing) throw new AppError('Category with this name already exists', HTTP_STATUS.BAD_REQUEST);

    const category = new Category(data);
    await category.save();
    return category;
};


// ─── Update Category ──────────────────────────────────────────────────────────
export const updateCategory = async (id, data) => {
    const existing = await Category.findOne({
        name: { $regex: new RegExp(`^${data.name}$`, 'i') },
        _id: { $ne: id }
    });
    if (existing) throw new AppError('Category with this name already exists', HTTP_STATUS.BAD_REQUEST);

    const updated = await Category.findByIdAndUpdate(
        id,
        { name: data.name, description: data.description },
        { new: true }
    );
    if (!updated) throw new AppError('Category not found', HTTP_STATUS.NOT_FOUND);

    return updated;
};


// ─── Delete Category ──────────────────────────────────────────────────────────
export const deleteCategory = async (id) => {
    const category = await Category.findByIdAndDelete(id);
    if (!category) throw new AppError('Category not found', HTTP_STATUS.NOT_FOUND);
    return category;
};


// ─── Toggle Category Block ────────────────────────────────────────────────────
export const toggleCategoryBlock = async (id) => {
    const category = await Category.findById(id);
    if (!category) throw new AppError('Category not found', HTTP_STATUS.NOT_FOUND);

    category.isActive = !category.isActive;
    await category.save();
    return category;
};
