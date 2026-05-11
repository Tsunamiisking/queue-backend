const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io;

/**
 * Initialize Socket.IO server for real-time queue updates
 * @param {http.Server} server - HTTP server instance
 */
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      credentials: true,
    },
    pingTimeout: 60000,
  });

  io.on("connection", (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // ─── Join room for a specific service (admin dashboard) ───────────────────
    socket.on("join_service", ({ serviceId, token }) => {
      try {
        // Optional: verify admin token for service ownership
        if (token) {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          socket.userId = decoded.id;
        }
        socket.join(`service:${serviceId}`);
        console.log(`📍 Socket ${socket.id} joined service:${serviceId}`);
      } catch (err) {
        socket.emit("error", { message: "Invalid authentication" });
        return; // Important: prevent further execution after error
      }
    });

    // ─── Join room for a ticket (user tracking their position) ────────────────
    socket.on("join_ticket", ({ ticketNumber }) => {
      socket.join(`ticket:${ticketNumber}`);
      console.log(`🎫 Socket ${socket.id} joined ticket:${ticketNumber}`);
    });

    // ─── Leave rooms ──────────────────────────────────────────────────────────
    socket.on("leave_service", ({ serviceId }) => {
      socket.leave(`service:${serviceId}`);
    });

    socket.on("leave_ticket", ({ ticketNumber }) => {
      socket.leave(`ticket:${ticketNumber}`);
    });

    // ─── Disconnect ───────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Get the Socket.IO instance
 * @returns {Server} Socket.IO server instance
 */
const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO not initialized. Call initSocket first.");
  }
  return io;
};

module.exports = { initSocket, getIO };
