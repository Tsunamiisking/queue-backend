/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SMART WAIT RANGE SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This is the "AI" component that calculates dynamic wait time ranges.
 * 
 * APPROACH:
 * 1. Start with admin-defined baseline range (e.g., 20-30 mins)
 * 2. Learn from historical session durations
 * 3. Adjust based on:
 *    - Queue position
 *    - Average session duration trend
 *    - Time-of-day patterns (future enhancement)
 *    - Historical variance
 * 
 * WHY RANGES INSTEAD OF EXACT TIMES:
 * - Human behavior is unpredictable
 * - Sets realistic expectations
 * - Accounts for variability in service duration
 * - More honest and user-friendly than false precision
 * 
 * FUTURE ML ENHANCEMENTS:
 * - Time-series forecasting (ARIMA, Prophet)
 * - Pattern recognition (busy hours, days)
 * - Anomaly detection (unusually long sessions)
 * - Multi-factor regression (service type, staff, etc.)
 */

/**
 * Compute a dynamic wait time range for a queue position
 * @param {Object} service - Service document with sessionHistory
 * @param {Number} position - Queue position
 * @returns {Object} { min, max } in minutes
 */
exports.computeWaitRange = (service, position) => {
  // ─── Step 1: Use baseline if no historical data ─────────────────────────────
  if (!service.sessionHistory || service.sessionHistory.length < 5) {
    // Not enough data, use admin-defined range multiplied by position
    const baseMin = service.estimatedWaitTime.min;
    const baseMax = service.estimatedWaitTime.max;
    
    return {
      min: Math.max(0, baseMin * position),
      max: Math.max(1, baseMax * position),
    };
  }

  // ─── Step 2: Calculate statistics from historical data ──────────────────────
  const recentSessions = service.sessionHistory.slice(-50); // Last 50 sessions
  const durations = recentSessions.map((s) => s.durationMinutes);

  const avgDuration = calculateAverage(durations);
  const stdDev = calculateStdDev(durations, avgDuration);
  const median = calculateMedian(durations);

  // ─── Step 3: Determine per-person service time range ────────────────────────
  // Use median as center, ±1 std deviation for range
  const perPersonMin = Math.max(1, Math.round(median - stdDev * 0.5));
  const perPersonMax = Math.max(perPersonMin + 1, Math.round(median + stdDev * 0.5));

  // ─── Step 4: Apply position multiplier with diminishing returns ─────────────
  // First few people wait longer, but it levels off (not perfectly linear)
  const positionMultiplier = Math.sqrt(position); // Diminishing growth

  const dynamicMin = Math.max(0, Math.round(perPersonMin * positionMultiplier));
  const dynamicMax = Math.max(dynamicMin + 1, Math.round(perPersonMax * positionMultiplier));

  // ─── Step 5: Ensure range is reasonable (not too wide, not too narrow) ──────
  const minRangeWidth = 5; // At least 5 minutes difference
  const maxRangeWidth = 30; // At most 30 minutes difference

  let finalMin = dynamicMin;
  let finalMax = dynamicMax;

  const rangeWidth = finalMax - finalMin;

  if (rangeWidth < minRangeWidth) {
    finalMax = finalMin + minRangeWidth;
  }

  if (rangeWidth > maxRangeWidth) {
    finalMax = finalMin + maxRangeWidth;
  }

  return {
    min: finalMin,
    max: finalMax,
  };
};

/**
 * Update service's average session duration (called periodically or on completion)
 * @param {Object} service - Service document
 */
exports.updateAvgSessionDuration = async (service) => {
  if (!service.sessionHistory || service.sessionHistory.length === 0) {
    service.avgSessionDuration = null;
    return;
  }

  const durations = service.sessionHistory.map((s) => s.durationMinutes);
  service.avgSessionDuration = Math.round(calculateAverage(durations));
  await service.save();
};

/**
 * Predict total wait time for current queue size
 * @param {Object} service - Service document
 * @param {Number} currentQueueSize - Number of people waiting
 * @returns {Object} { estimatedMinutes, range: { min, max } }
 */
exports.predictTotalWaitTime = (service, currentQueueSize) => {
  if (currentQueueSize === 0) {
    return { estimatedMinutes: 0, range: { min: 0, max: 0 } };
  }

  const range = exports.computeWaitRange(service, currentQueueSize);
  const estimatedMinutes = Math.round((range.min + range.max) / 2);

  return {
    estimatedMinutes,
    range,
  };
};

// ═════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

function calculateAverage(numbers) {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function calculateStdDev(numbers, mean) {
  if (numbers.length === 0) return 0;
  const variance = numbers.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / numbers.length;
  return Math.sqrt(variance);
}

function calculateMedian(numbers) {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Analyze queue health and performance metrics
 * @param {Object} service - Service document
 * @returns {Object} Analytics insights
 */
exports.analyzeQueueHealth = (service) => {
  if (!service.sessionHistory || service.sessionHistory.length < 10) {
    return {
      status: "insufficient_data",
      message: "Not enough historical data for analysis",
    };
  }

  const recentSessions = service.sessionHistory.slice(-30);
  const durations = recentSessions.map((s) => s.durationMinutes);

  const avg = calculateAverage(durations);
  const stdDev = calculateStdDev(durations, avg);
  const median = calculateMedian(durations);

  // Calculate coefficient of variation (CV) - measure of consistency
  const cv = (stdDev / avg) * 100;

  let status = "healthy";
  let message = "Queue is running smoothly";

  if (cv > 50) {
    status = "high_variance";
    message = "Service duration is highly unpredictable. Consider reviewing process.";
  } else if (avg > service.estimatedWaitTime.max * 1.5) {
    status = "over_capacity";
    message = "Actual service time exceeds estimates. Consider increasing staff or adjusting estimates.";
  } else if (avg < service.estimatedWaitTime.min * 0.5) {
    status = "under_utilized";
    message = "Service is faster than expected. You could reduce wait time estimates.";
  }

  return {
    status,
    message,
    metrics: {
      averageDuration: Math.round(avg),
      medianDuration: Math.round(median),
      standardDeviation: Math.round(stdDev),
      coefficientOfVariation: Math.round(cv),
      totalSessions: service.sessionHistory.length,
    },
  };
};
