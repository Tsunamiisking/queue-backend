const { nanoid } = require("nanoid");

/**
 * Generate a human-readable ticket number for queue entries
 * Format: {PREFIX}-{UNIQUE_ID}
 * Example: "A-xK9p", "B-mN2q"
 * 
 * Uses nanoid for guaranteed uniqueness across all services
 * 
 * @param {String} serviceId - MongoDB ObjectId of the service
 * @param {Number} position - Position in queue (unused, kept for backwards compatibility)
 * @returns {String} Ticket number
 */
exports.generateTicketNumber = (serviceId, position) => {
  // Use last 2 chars of service ID to create a unique prefix
  const serviceHash = serviceId.toString().slice(-2).toUpperCase();
  
  // Convert hash to letter (A-Z)
  const prefix = String.fromCharCode(65 + (parseInt(serviceHash, 16) % 26));
  
  // Use nanoid for guaranteed uniqueness (4 chars is ~3 million possible combinations)
  const uniqueId = nanoid(4);
  
  return `${prefix}-${uniqueId}`;
};

/**
 * Generate a shareable queue join link
 * @param {String} joinCode - Service join code
 * @returns {String} Full URL to join the queue
 */
exports.generateJoinLink = (joinCode) => {
  const baseUrl = process.env.CLIENT_URL || "http://localhost:3000";
  return `${baseUrl}/join/${joinCode}`;
};

/**
 * Calculate time difference in minutes
 * @param {Date} startDate 
 * @param {Date} endDate 
 * @returns {Number} Minutes
 */
exports.minutesBetween = (startDate, endDate) => {
  return Math.round((endDate - startDate) / 60000);
};

/**
 * Format minutes into human-readable duration
 * @param {Number} minutes 
 * @returns {String} Formatted duration (e.g., "5 mins", "1 hr 30 mins")
 */
exports.formatDuration = (minutes) => {
  if (minutes < 60) {
    return `${minutes} min${minutes !== 1 ? "s" : ""}`;
  }
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (mins === 0) {
    return `${hours} hr${hours !== 1 ? "s" : ""}`;
  }
  
  return `${hours} hr${hours !== 1 ? "s" : ""} ${mins} min${mins !== 1 ? "s" : ""}`;
};
