const mongoose = require("mongoose");

/**
 * A QueueEntry represents one person's slot in a service queue.
 * Users join with a name + optional ID number, or via a join link/code.
 */
const queueEntrySchema = new mongoose.Schema(
  {
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },

    // User identity — no account required to join
    name: { type: String, required: true, trim: true },
    idNumber: { type: String, trim: true },             // Optional: national ID, student ID, etc.
    phone: { type: String, trim: true },                // Optional: for SMS notifications (future)

    // Position in queue (1-indexed, recalculated on each join/leave/call)
    position: { type: Number, required: true },

    // Ticket number — human-readable identifier shown to user (e.g. "A-042")
    ticketNumber: { type: String, required: true },

    // Dynamic wait time range (copied from service at join time, adjustable by AI)
    estimatedWait: {
      min: { type: Number },
      max: { type: Number },
    },

    status: {
      type: String,
      enum: ["waiting", "called", "serving", "done", "skipped", "left"],
      default: "waiting",
    },

    joinedAt: { type: Date, default: Date.now },
    calledAt: { type: Date },                           // When admin called this person
    servedAt: { type: Date },                           // When service actually started
    completedAt: { type: Date },                        // When session ended
  },
  { timestamps: true }
);

// Index for fast queue lookups
queueEntrySchema.index({ service: 1, status: 1, position: 1 });

module.exports = mongoose.model("QueueEntry", queueEntrySchema);