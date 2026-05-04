const mongoose = require("mongoose");
const { nanoid } = require("nanoid");

/**
 * A "Service" is whatever an organization offers that requires queuing:
 *   - A doctor's appointment
 *   - A bank teller counter
 *   - A government office desk
 *   - A school registration desk
 * Admins create services under their account.
 */
const serviceSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },

    name: { type: String, required: true, trim: true }, // e.g. "General Consultation"
    description: { type: String, trim: true },
    category: { type: String, trim: true },             // e.g. "Medical", "Finance"

    // Join link — shareable short code users use to join the queue
    joinCode: {
      type: String,
      unique: true,
      default: () => nanoid(8),                         // e.g. "aB3xK9Lp"
    },

    // Wait time is always a RANGE (min–max in minutes), not a fixed number
    estimatedWaitTime: {
      min: { type: Number, required: true, min: 0 },   // e.g. 20
      max: { type: Number, required: true, min: 0 },   // e.g. 30
    },

    // AI hook: stores historical session durations for dynamic range adjustment
    sessionHistory: [
      {
        durationMinutes: Number,
        recordedAt: { type: Date, default: Date.now },
      },
    ],

    // Queue control
    isOpen: { type: Boolean, default: false },           // Admin toggles open/close
    maxCapacity: { type: Number, default: null },         // null = unlimited
    avgSessionDuration: { type: Number, default: null },  // Computed by AI service

    isActive: { type: Boolean, default: true },           // Soft delete
  },
  { timestamps: true }
);

// Virtual: current queue size (populated via Queue model)
serviceSchema.virtual("currentQueueSize", {
  ref: "QueueEntry",
  localField: "_id",
  foreignField: "service",
  count: true,
  match: { status: "waiting" },
});

serviceSchema.set("toJSON", { virtuals: true });
serviceSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Service", serviceSchema);