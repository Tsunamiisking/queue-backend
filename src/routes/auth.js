const express = require("express");
const { body } = require("express-validator");
const { validate } = require("../middleware/validate.middleware");
const authController = require("../controllers/authController");

const router = express.Router();

// POST /api/auth/register
// Create new admin account
router.post(
  "/register",
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email required"),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
    body("organization.name").notEmpty().withMessage("Organization name is required"),
  ],
  validate,
  authController.register
);

// POST /api/auth/login
// Authenticate admin and get tokens
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  validate,
  authController.login
);

// POST /api/auth/refresh
// Get new access token using refresh token
router.post("/refresh", authController.refresh);

// POST /api/auth/logout
// Invalidate refresh token
router.post("/logout", authController.logout);

module.exports = router;
