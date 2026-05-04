const express = require("express");
const { body } = require("express-validator");
const { validate } = require("../middleware/validate.middleware");
const authController = require("../controllers/auth.controller");

const router = express.Router();

// POST /api/auth/register
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
router.post(
  "/login",
  [
    body("email").isEmail(),
    body("password").notEmpty(),
  ],
  validate,
  authController.login
);

// POST /api/auth/refresh  — get new access token using refresh token
router.post("/refresh", authController.refresh);

// POST /api/auth/logout
router.post("/logout", authController.logout);

module.exports = router;