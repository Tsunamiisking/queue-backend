const express = require("express");
const { body } = require("express-validator");
const { validate } = require("../middleware/validate.middleware");
const queueController = require("../controllers/queueController");
const { protect } = require("../middleware/auth.middleware");

const router = express.Router();

// ─── Public routes (users — no login required) ────────────────────────────────

// POST /api/queue/join
// User joins a queue using a joinCode, their name, and optionally an ID number
router.post(
  "/join",
  [
    body("joinCode").notEmpty().withMessage("Join code is required"),
    body("name").notEmpty().withMessage("Name is required"),
    body("idNumber").optional().isString(),
    body("phone").optional().isMobilePhone(),
  ],
  validate,
  queueController.joinQueue
);

// GET /api/queue/status/:ticketNumber
// User checks their own queue position & estimated wait using their ticket number
router.get("/status/:ticketNumber", queueController.getTicketStatus);

// DELETE /api/queue/leave/:ticketNumber
// User voluntarily leaves the queue
router.delete("/leave/:ticketNumber", queueController.leaveQueue);

// ─── Admin routes (managing the live queue) ───────────────────────────────────
router.use(protect);

// GET /api/queue/:serviceId
// Admin views all entries in a service queue (filterable by status)
router.get("/:serviceId", queueController.getQueue);

// PATCH /api/queue/:serviceId/call-next
// Admin calls the next person in line → status: waiting → called
router.patch("/:serviceId/call-next", queueController.callNext);

// PATCH /api/queue/entry/:entryId/serve
// Admin marks someone as currently being served → status: called → serving
router.patch("/entry/:entryId/serve", queueController.markServing);

// PATCH /api/queue/entry/:entryId/complete
// Admin marks session as done → status: serving → done; records session duration
router.patch("/entry/:entryId/complete", queueController.markComplete);

// PATCH /api/queue/entry/:entryId/skip
// Admin skips someone (no-show) → status: called → skipped
router.patch("/entry/:entryId/skip", queueController.skipEntry);

// DELETE /api/queue/entry/:entryId
// Admin removes an entry manually
router.delete("/entry/:entryId", queueController.removeEntry);

module.exports = router;