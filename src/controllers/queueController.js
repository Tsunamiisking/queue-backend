const Service = require("../models/Service");
const QueueEntry = require("../models/QueueEntry");
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
      "name estimatedWaitTime isOpen sessionHistory"
    );

    if (!entry) return res.status(404).json({ error: "Ticket not found" });

    // Recalculate current position (people ahead may have been served)
    const ahead = await QueueEntry.countDocuments({
      service: entry.service._id,
      status: "waiting",
      position: { $lt: entry.position },
    });

    // Compute LIVE estimate based on actual current position (not join-time position)
    const liveWaitRange = computeWaitRange(entry.service, ahead + 1);

    res.json({
      ticketNumber: entry.ticketNumber,
      name: entry.name,
      status: entry.status,
      position: entry.position,
      peopleAhead: ahead,
      estimatedWait: liveWaitRange,              // Live, recomputed
      estimatedWaitAtJoin: entry.estimatedWait,  // Original snapshot for analytics
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

    const io = getIO();
    // Notify admin dashboard
    io.to(`service:${entry.service}`).emit("queue:entry_left", { entryId: entry._id });
    
    // Update estimates for remaining waiting users
    await broadcastUpdatedEstimates(entry.service, io);

    res.json({ message: "You have left the queue" });
  } catch (err) {
    next(err);
  }
};

// GET /api/queue/:serviceId  (admin)
exports.getQueue = async (req, res, next) => {
  try {
    // Verify service ownership
    const service = await Service.findOne({ 
      _id: req.params.serviceId, 
      admin: req.admin._id 
    });
    if (!service) return res.status(403).json({ error: "Not authorized" });

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
    // Verify service ownership
    const service = await Service.findOne({ 
      _id: req.params.serviceId, 
      admin: req.admin._id 
    });
    if (!service) return res.status(403).json({ error: "Not authorized" });

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
    
    // Update estimates for remaining waiting users
    await broadcastUpdatedEstimates(req.params.serviceId, io);

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

    const io = getIO();
    io.to(`service:${entry.service}`).emit("queue:completed", { entryId: entry._id });
    
    // Update estimates for remaining waiting users
    await broadcastUpdatedEstimates(entry.service, io);
    
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

    const io = getIO();
    io.to(`service:${entry.service}`).emit("queue:skipped", { entryId: entry._id });
    
    // Update estimates for remaining waiting users
    await broadcastUpdatedEstimates(entry.service, io);
    
    res.json({ message: "Entry marked as skipped", entry });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/queue/entry/:entryId  (admin)
exports.removeEntry = async (req, res, next) => {
  try {
    const entry = await QueueEntry.findByIdAndDelete(req.params.entryId);
    
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    const io = getIO();
    io.to(`service:${entry.service}`).emit("queue:removed", { entryId: entry._id });
    
    // Update estimates for remaining waiting users
    await broadcastUpdatedEstimates(entry.service, io);
    
    res.json({ message: "Entry removed from queue" });
  } catch (err) {
    next(err);
  }
};

/**
 * Broadcast updated wait time estimates to all waiting users
 * Called after queue changes (complete, skip, leave, remove)
 * Only emits if the estimate actually changed (avoids noise)
 * 
 * @param {String} serviceId - Service ID
 * @param {Server} io - Socket.IO instance
 */
const broadcastUpdatedEstimates = async (serviceId, io) => {
  try {
    const service = await Service.findById(serviceId);
    if (!service) return;
    
    // Get all waiting entries in order
    const waitingEntries = await QueueEntry.find({
      service: serviceId,
      status: "waiting",
    }).sort({ position: 1 });

    // For each waiting person, compute fresh estimate based on effective position
    waitingEntries.forEach((entry, index) => {
      const effectivePosition = index + 1; // 1-indexed position
      const liveRange = computeWaitRange(service, effectivePosition);
      
      // Only emit if estimate actually changed (avoid unnecessary updates)
      const oldRange = entry.estimatedWait;
      if (!oldRange || liveRange.min !== oldRange.min || liveRange.max !== oldRange.max) {
        io.to(`ticket:${entry.ticketNumber}`).emit("queue:estimate_updated", {
          ticketNumber: entry.ticketNumber,
          peopleAhead: index,
          estimatedWait: liveRange,
        });
      }
    });
  } catch (err) {
    console.error("Error broadcasting estimate updates:", err);
  }
};

