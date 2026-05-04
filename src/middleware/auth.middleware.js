const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

/**
 * Protect routes - require valid JWT access token
 * Attaches `req.admin` with the authenticated admin's data
 */
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Check Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ error: "Not authorized, no token provided" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch admin from database (exclude password)
    const admin = await Admin.findById(decoded.id).select("-password -refreshToken");

    if (!admin) {
      return res.status(401).json({ error: "Admin not found" });
    }

    if (!admin.isActive) {
      return res.status(403).json({ error: "Account is deactivated" });
    }

    // Attach admin to request object
    req.admin = admin;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    next(error);
  }
};

/**
 * Optional auth - attach admin if token is valid, but don't block if missing
 */
exports.optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const admin = await Admin.findById(decoded.id).select("-password -refreshToken");
      if (admin && admin.isActive) {
        req.admin = admin;
      }
    }

    next();
  } catch (error) {
    // Silently fail - optional auth
    next();
  }
};
