const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const signAccess = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "15m" });

const signRefresh = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, organization } = req.body;

    const exists = await Admin.findOne({ email });
    if (exists) return res.status(409).json({ error: "Email already registered" });

    const admin = await Admin.create({ name, email, password, organization });

    const accessToken = signAccess(admin._id);
    const refreshToken = signRefresh(admin._id);

    admin.refreshToken = refreshToken;
    await admin.save();

    res.status(201).json({ admin, accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email }).select("+password +refreshToken");
    if (!admin || !(await admin.comparePassword(password)))
      return res.status(401).json({ error: "Invalid credentials" });

    if (!admin.isActive)
      return res.status(403).json({ error: "Account deactivated" });

    const accessToken = signAccess(admin._id);
    const refreshToken = signRefresh(admin._id);

    admin.refreshToken = refreshToken;
    await admin.save();

    res.json({ admin, accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/refresh
exports.refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: "Refresh token required" });

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const admin = await Admin.findById(payload.id).select("+refreshToken");

    if (!admin || admin.refreshToken !== refreshToken)
      return res.status(403).json({ error: "Invalid refresh token" });

    const newAccess = signAccess(admin._id);
    res.json({ accessToken: newAccess });
  } catch (err) {
    if (err.name === "JsonWebTokenError") return res.status(403).json({ error: "Invalid token" });
    next(err);
  }
};

// POST /api/auth/logout
exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await Admin.findOneAndUpdate({ refreshToken }, { refreshToken: null });
    }
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
};