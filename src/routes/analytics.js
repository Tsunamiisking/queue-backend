const express = require("express");
const analyticsController = require("../controllers/analytics.controller");
const { protect } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);

// GET /api/analytics/:serviceId/summary
// Returns totals: served today, avg wait, busiest hours
router.get("/:serviceId/summary", analyticsController.getSummary);

// GET /api/analytics/:serviceId/wait-range
// Returns AI-computed dynamic wait range based on session history
// This is the hook for future ML integration
router.get("/:serviceId/wait-range", analyticsController.getDynamicWaitRange);

// GET /api/analytics/:serviceId/history
// Full session history for a service (paginated)
router.get("/:serviceId/history", analyticsController.getHistory);

module.exports = router;