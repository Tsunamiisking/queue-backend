const express = require("express");
const { body, param } = require("express-validator");
const { validate } = require("../middleware/validate.middleware");
const serviceController = require("../controllers/service.controller");
const { protect } = require("../middleware/auth.middleware");

const router = express.Router();

// ─── Public routes (no auth — users look up a service to join) ────────────────

// GET /api/services/join/:joinCode  — fetch service info by join code (for users)
router.get("/join/:joinCode", serviceController.getByJoinCode);

// ─── Protected routes (admin only) ───────────────────────────────────────────
router.use(protect);

// GET  /api/services               — list all services for logged-in admin
router.get("/", serviceController.listServices);

// POST /api/services               — create a new service
router.post(
  "/",
  [
    body("name").notEmpty().withMessage("Service name is required"),
    body("estimatedWaitTime.min").isInt({ min: 0 }).withMessage("Min wait time required"),
    body("estimatedWaitTime.max").isInt({ min: 1 }).withMessage("Max wait time required"),
  ],
  validate,
  serviceController.createService
);

// GET  /api/services/:id           — get single service details + live queue
router.get("/:id", serviceController.getService);

// PUT  /api/services/:id           — update service (name, wait range, capacity)
router.put(
  "/:id",
  [
    body("estimatedWaitTime.min").optional().isInt({ min: 0 }),
    body("estimatedWaitTime.max").optional().isInt({ min: 1 }),
  ],
  validate,
  serviceController.updateService
);

// PATCH /api/services/:id/toggle   — open or close the queue
router.patch("/:id/toggle", serviceController.toggleQueue);

// PATCH /api/services/:id/regenerate-code — generate a new join code
router.patch("/:id/regenerate-code", serviceController.regenerateJoinCode);

// DELETE /api/services/:id         — soft-delete service
router.delete("/:id", serviceController.deleteService);

module.exports = router;