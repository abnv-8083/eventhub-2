import HTTP_STATUS from '../../constant/statusCode.js';
import { categoryValidationSchema } from '../../validations/admin/categoryValidation.js';
import * as categoryService from '../../services/admin/categoryService.js';


// ─── Category List ────────────────────────────────────────────────────────────
export const getCategoryPage = async (req, res, next) => {
    try {
        const categories = await categoryService.getAllCategories();
        res.render('admin/categories/index', { title: 'Category Management', categories });
    } catch (error) {
        next(error);
    }
};


// ─── Add Category ─────────────────────────────────────────────────────────────
export const addCategory = async (req, res, next) => {
    try {
        const { error, value } = categoryValidationSchema.validate(req.body);
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.details[0].message });

        const category = await categoryService.addCategory(value);
        res.status(HTTP_STATUS.CREATED).json({ success: true, message: 'Category added successfully', category });
    } catch (error) {
        next(error);
    }
};


// ─── Update Category ──────────────────────────────────────────────────────────
export const updateCategory = async (req, res, next) => {
    try {
        const { error, value } = categoryValidationSchema.validate(req.body);
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.details[0].message });

        const category = await categoryService.updateCategory(req.params.id, value);
        res.status(HTTP_STATUS.OK).json({ success: true, message: 'Category updated successfully', category });
    } catch (error) {
        next(error);
    }
};


// ─── Delete Category ──────────────────────────────────────────────────────────
export const deleteCategory = async (req, res, next) => {
    try {
        await categoryService.deleteCategory(req.params.id);
        res.status(HTTP_STATUS.OK).json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
        next(error);
    }
};


// ─── Toggle Category Block ────────────────────────────────────────────────────
export const toggleCategoryBlock = async (req, res, next) => {
    try {
        const category = await categoryService.toggleCategoryBlock(req.body.id);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: `Category successfully ${category.isActive ? 'unblocked' : 'blocked'}.`
        });
    } catch (error) {
        next(error);
    }
};
