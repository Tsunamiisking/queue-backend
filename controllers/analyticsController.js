const Service = require("../models/service.model");
const QueueEntry = require("../models/queueEntry.model");
const { computeWaitRange } = require("../services/waitRange.service");

// GET /api/analytics/:serviceId/summary
exports.getSummary = async (req, res, next) => {
  try {
    const { serviceId } = req.params;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [servedToday, totalWaiting, skippedToday, entries] = await Promise.all([
      QueueEntry.countDocuments({ service: serviceId, status: "done", completedAt: { $gte: startOfDay } }),
      QueueEntry.countDocuments({ service: serviceId, status: "waiting" }),
      QueueEntry.countDocuments({ service: serviceId, status: "skipped", updatedAt: { $gte: startOfDay } }),
      QueueEntry.find({ service: serviceId, status: "done", servedAt: { $gte: startOfDay }, completedAt: { $exists: true } })
        .select("servedAt completedAt"),
    ]);

    // Average actual session duration today
    let avgDurationMinutes = null;
    if (entries.length > 0) {
      const total = entries.reduce((sum, e) => sum + (e.completedAt - e.servedAt), 0);
      avgDurationMinutes = Math.round(total / entries.length / 60000);
    }

    res.json({ servedToday, totalWaiting, skippedToday, avgDurationMinutes });
  } catch (err) {
    next(err);
  }
};

// GET /api/analytics/:serviceId/wait-range
// AI hook: returns a dynamically computed wait range based on historical data.
// Today this uses simple stats. Tomorrow you plug in an ML model here.
exports.getDynamicWaitRange = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.serviceId);
    if (!service) return res.status(404).json({ error: "Service not found" });

    const currentWaiting = await QueueEntry.countDocuments({
      service: service._id,
      status: "waiting",
    });

    const dynamicRange = computeWaitRange(service, currentWaiting + 1);

    res.json({
      staticRange: service.estimatedWaitTime,    // Admin-set baseline
      dynamicRange,                               // AI/stats-adjusted range
      basedOnSessions: service.sessionHistory.length,
      currentQueueSize: currentWaiting,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/analytics/:serviceId/history
exports.getHistory = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      QueueEntry.find({ service: req.params.serviceId, status: "done" })
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("name ticketNumber servedAt completedAt estimatedWait"),
      QueueEntry.countDocuments({ service: req.params.serviceId, status: "done" }),
    ]);

    res.json({ entries, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
};