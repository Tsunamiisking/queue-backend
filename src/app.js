const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const serviceRoutes = require("./routes/service");
const queueRoutes = require("./routes/queue");
const analyticsRoutes = require("./routes/analytics");

const { errorHandler } = require("./middleware/error.middleware");

const app = express();

// ─── Security & Parsing ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(morgan("dev"));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api", limiter);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);         // Registration, login, tokens
app.use("/api/admin", adminRoutes);       // Admin org/profile management
app.use("/api/services", serviceRoutes);  // Queue services (appointments, desks, etc.)
app.use("/api/queue", queueRoutes);       // User-facing queue join/track/leave
app.use("/api/analytics", analyticsRoutes); // Wait time history, AI hooks

// Health check
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// Global error handler
app.use(errorHandler);

module.exports = app;