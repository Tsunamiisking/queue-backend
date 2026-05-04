const Admin = require("../models/admin.model");

// GET /api/admin/me
exports.getProfile = async (req, res) => {
  res.json({ admin: req.admin });
};

// PUT /api/admin/me
exports.updateProfile = async (req, res, next) => {
  try {
    const allowed = ["name", "organization"];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const admin = await Admin.findByIdAndUpdate(req.admin._id, updates, { new: true, runValidators: true });
    res.json({ admin });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/me/password
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.admin._id).select("+password");

    if (!(await admin.comparePassword(currentPassword)))
      return res.status(401).json({ error: "Current password is incorrect" });

    admin.password = newPassword;
    await admin.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/me
exports.deactivateAccount = async (req, res, next) => {
  try {
    await Admin.findByIdAndUpdate(req.admin._id, { isActive: false });
    res.json({ message: "Account deactivated" });
  } catch (err) {
    next(err);
  }
};