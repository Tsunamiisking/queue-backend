const Service = require("../models/service.model");
const QueueEntry = require("../models/queueEntry.model");
const { getIO } = require("../socket");
const { generateTicketNumber } = require("../utils/ticket.util");
const { computeWaitRange } = require("../services/waitRange.service");

// POST /api/queue/join  (public)
exports.joinQueue = async (req, res, next) => {
  try {
    const { joinCode, name, idNumber, phone } = req.body;

    const service = await Service.findOne({ joinCode, isActive: true });
    if (!service) return res.status(404).json({ error: "Queue not found" });
    if (!service.isOpen) return res.status(400).json({ error: "This queue is currently closed" });

    // Check capacity
    if (service.maxCapacity) {
      const count = await QueueEntry.countDocuments({ service: service._id, status: "waiting" });
      if (count >= service.maxCapacity)
        return res.status(400).json({ error: "Queue is at full capacity" });
    }

    // Assign next position
    const lastEntry = await QueueEntry.findOne({ service: service._id, status: "waiting" })
      .sort({ position: -1 });
    const position = lastEntry ? lastEntry.position + 1 : 1;

    // Dynamic wait range based on historical data
    const waitRange = computeWaitRange(service, position);

    const ticketNumber = generateTicketNumber(service._id, position);

    const entry = await QueueEntry.create({
      service: service._id,
      name,
      idNumber,
      phone,
      position,
      ticketNumber,
      estimatedWait: waitRange,
    });

    // Emit real-time update to admin dashboard
    getIO()
      .to(`service:${service._id}`)
      .emit("queue:new_entry", { entry, totalWaiting: position });

    res.status(201).json({
      message: "You have joined the queue",
      ticketNumber: entry.ticketNumber,
      position: entry.position,
      estimatedWait: entry.estimatedWait,
      serviceName: service.name,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/queue/status/:ticketNumber  (public)
exports.getTicketStatus = async (req, res, next) => {
  try {
    const entry = await QueueEntry.findOne({ ticketNumber: req.params.ticketNumber }).populate(
      "service",
      "name estimatedWaitTime isOpen"
    );

    if (!entry) return res.status(404).json({ error: "Ticket not found" });

    // Recalculate current position (people ahead may have been served)
    const ahead = await QueueEntry.countDocuments({
      service: entry.service._id,
      status: "waiting",
      position: { $lt: entry.position },
    });

    res.json({
      ticketNumber: entry.ticketNumber,
      name: entry.name,
      status: entry.status,
      position: entry.position,
      peopleAhead: ahead,
      estimatedWait: entry.estimatedWait,
      service: entry.service,
      joinedAt: entry.joinedAt,
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/queue/leave/:ticketNumber  (public)
exports.leaveQueue = async (req, res, next) => {
  try {
    const entry = await QueueEntry.findOneAndUpdate(
      { ticketNumber: req.params.ticketNumber, status: "waiting" },
      { status: "left" },
      { new: true }
    );

    if (!entry) return res.status(404).json({ error: "Active ticket not found" });

    // Notify admin dashboard
    getIO().to(`service:${entry.service}`).emit("queue:entry_left", { entryId: entry._id });

    res.json({ message: "You have left the queue" });
  } catch (err) {
    next(err);
  }
};

// GET /api/queue/:serviceId  (admin)
exports.getQueue = async (req, res, next) => {
  try {
    const { status = "waiting" } = req.query;

    const entries = await QueueEntry.find({
      service: req.params.serviceId,
      status,
    }).sort({ position: 1 });

    res.json({ entries, count: entries.length });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/queue/:serviceId/call-next  (admin)
exports.callNext = async (req, res, next) => {
  try {
    const next_entry = await QueueEntry.findOneAndUpdate(
      { service: req.params.serviceId, status: "waiting" },
      { status: "called", calledAt: new Date() },
      { new: true, sort: { position: 1 } }
    );

    if (!next_entry) return res.status(404).json({ error: "No one waiting in queue" });

    // Broadcast to all clients watching this service
    const io = getIO();
    io.to(`service:${req.params.serviceId}`).emit("queue:called", { entry: next_entry });
    // Notify the specific user by ticket number room
    io.to(`ticket:${next_entry.ticketNumber}`).emit("queue:your_turn", {
      message: "It's your turn! Please proceed.",
      ticketNumber: next_entry.ticketNumber,
    });

    res.json({ message: "Next person called", entry: next_entry });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/queue/entry/:entryId/serve  (admin)
exports.markServing = async (req, res, next) => {
  try {
    const entry = await QueueEntry.findByIdAndUpdate(
      req.params.entryId,
      { status: "serving", servedAt: new Date() },
      { new: true }
    );
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    getIO().to(`service:${entry.service}`).emit("queue:serving", { entry });
    res.json({ entry });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/queue/entry/:entryId/complete  (admin)
exports.markComplete = async (req, res, next) => {
  try {
    const entry = await QueueEntry.findByIdAndUpdate(
      req.params.entryId,
      { status: "done", completedAt: new Date() },
      { new: true }
    );
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    // Record session duration for AI wait-range learning
    if (entry.servedAt) {
      const durationMinutes = Math.round((entry.completedAt - entry.servedAt) / 60000);
      await Service.findByIdAndUpdate(entry.service, {
        $push: {
          sessionHistory: {
            $each: [{ durationMinutes }],
            $slice: -200,              // Keep only last 200 sessions
          },
        },
      });
    }

    getIO().to(`service:${entry.service}`).emit("queue:completed", { entryId: entry._id });
    res.json({ entry });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/queue/entry/:entryId/skip  (admin)
exports.skipEntry = async (req, res, next) => {
  try {
    const entry = await QueueEntry.findByIdAndUpdate(
      req.params.entryId,
      { status: "skipped" },
      { new: true }
    );
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    getIO().to(`service:${entry.service}`).emit("queue:skipped", { entryId: entry._id });
    res.json({ entry });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/queue/entry/:entryId  (admin)
exports.removeEntry = async (req, res, next) => {
  try {
    const entry = await QueueEntry.findByIdAndDelete(req.params.entryId);
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    getIO().to(`service:${entry.service}`).emit("queue:removed", { entryId: entry._id });
    res.json({ message: "Entry removed" });
  } catch (err) {
    next(err);
  }
};