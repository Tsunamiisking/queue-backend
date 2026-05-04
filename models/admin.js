const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8 },

    // Organization info
    organization: {
      name: { type: String, required: true, trim: true },
      type: {
        type: String,
        enum: ["clinic", "bank", "government", "school", "retail", "other"],
        default: "other",
      },
      logo: { type: String },         // URL to logo image
      address: { type: String },
      phone: { type: String },
    },

    // Subscription tier
    plan: {
      type: String,
      enum: ["free", "starter", "pro", "enterprise"],
      default: "free",
    },

    isActive: { type: Boolean, default: true },
    refreshToken: { type: String },
  },
  { timestamps: true }
);

// Hash password before save
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

adminSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Never return password in responses
adminSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  return obj;
};

module.exports = mongoose.model("Admin", adminSchema);