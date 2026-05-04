const express = require("express");
const { body } = require("express-validator");
const { validate } = require("../middleware/validate.middleware");
const adminController = require("../controllers/adminController");
const { protect } = require("../middleware/auth.middleware");

const router = express.Router();

// All admin routes require authentication
router.use(protect);

// GET /api/admin/me
// Get logged-in admin's profile
router.get("/me", adminController.getProfile);

// PUT /api/admin/me
// Update admin profile (name, organization info)
router.put(
  "/me",
  [
    body("name").optional().notEmpty().withMessage("Name cannot be empty"),
    body("organization.name").optional().notEmpty().withMessage("Organization name cannot be empty"),
  ],
  validate,
  adminController.updateProfile
);

// PUT /api/admin/me/password
// Change password
router.put(
  "/me/password",
  [
    body("currentPassword").notEmpty().withMessage("Current password required"),
    body("newPassword").isLength({ min: 8 }).withMessage("New password must be at least 8 characters"),
  ],
  validate,
  adminController.changePassword
);

// DELETE /api/admin/me
// Deactivate account (soft delete)
router.delete("/me", adminController.deactivateAccount);

module.exports = router;