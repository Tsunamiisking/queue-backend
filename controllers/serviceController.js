const { nanoid } = require("nanoid");
const Service = require("../models/service.model");
const QueueEntry = require("../models/queueEntry.model");

// GET /api/services
exports.listServices = async (req, res, next) => {
  try {
    const services = await Service.find({ admin: req.admin._id, isActive: true })
      .populate("currentQueueSize")
      .sort({ createdAt: -1 });

    res.json({ services });
  } catch (err) {
    next(err);
  }
};

// POST /api/services
exports.createService = async (req, res, next) => {
  try {
    const { name, description, category, estimatedWaitTime, maxCapacity } = req.body;

    if (estimatedWaitTime.min >= estimatedWaitTime.max)
      return res.status(400).json({ error: "Min wait time must be less than max" });

    const service = await Service.create({
      admin: req.admin._id,
      name,
      description,
      category,
      estimatedWaitTime,
      maxCapacity: maxCapacity || null,
    });

    res.status(201).json({ service });
  } catch (err) {
    next(err);
  }
};

// GET /api/services/:id
exports.getService = async (req, res, next) => {
  try {
    const service = await Service.findOne({
      _id: req.params.id,
      admin: req.admin._id,
      isActive: true,
    }).populate("currentQueueSize");

    if (!service) return res.status(404).json({ error: "Service not found" });

    // Attach live queue entries
    const queue = await QueueEntry.find({ service: service._id, status: "waiting" }).sort({ position: 1 });

    res.json({ service, queue });
  } catch (err) {
    next(err);
  }
};

// GET /api/services/join/:joinCode  (public)
exports.getByJoinCode = async (req, res, next) => {
  try {
    const service = await Service.findOne({
      joinCode: req.params.joinCode,
      isActive: true,
    }).select("name description category estimatedWaitTime isOpen maxCapacity");

    if (!service) return res.status(404).json({ error: "Queue not found" });

    const currentWaiting = await QueueEntry.countDocuments({
      service: service._id,
      status: "waiting",
    });

    res.json({ service, currentWaiting });
  } catch (err) {
    next(err);
  }
};

// PUT /api/services/:id
exports.updateService = async (req, res, next) => {
  try {
    const updates = req.body;

    if (
      updates.estimatedWaitTime &&
      updates.estimatedWaitTime.min >= updates.estimatedWaitTime.max
    ) {
      return res.status(400).json({ error: "Min wait time must be less than max" });
    }

    const service = await Service.findOneAndUpdate(
      { _id: req.params.id, admin: req.admin._id },
      updates,
      { new: true, runValidators: true }
    );

    if (!service) return res.status(404).json({ error: "Service not found" });

    res.json({ service });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/services/:id/toggle
exports.toggleQueue = async (req, res, next) => {
  try {
    const service = await Service.findOne({ _id: req.params.id, admin: req.admin._id });
    if (!service) return res.status(404).json({ error: "Service not found" });

    service.isOpen = !service.isOpen;
    await service.save();

    res.json({ isOpen: service.isOpen, message: `Queue is now ${service.isOpen ? "open" : "closed"}` });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/services/:id/regenerate-code
exports.regenerateJoinCode = async (req, res, next) => {
  try {
    const service = await Service.findOneAndUpdate(
      { _id: req.params.id, admin: req.admin._id },
      { joinCode: nanoid(8) },
      { new: true }
    );

    if (!service) return res.status(404).json({ error: "Service not found" });

    res.json({ joinCode: service.joinCode });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/services/:id (soft delete)
exports.deleteService = async (req, res, next) => {
  try {
    await Service.findOneAndUpdate(
      { _id: req.params.id, admin: req.admin._id },
      { isActive: false }
    );
    res.json({ message: "Service deleted" });
  } catch (err) {
    next(err);
  }
};