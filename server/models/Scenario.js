const mongoose = require('mongoose');

const ScenarioSchema = new mongoose.Schema({
  scenario_name: { type: String, required: true },
  monthly_invoice_volume: Number,
  num_ap_staff: Number,
  avg_hours_per_invoice: Number,
  hourly_wage: Number,
  error_rate_manual: Number, // percent e.g. 0.5 means 0.5%
  error_cost: Number,
  time_horizon_months: Number,
  one_time_implementation_cost: Number,
  results: { type: Object, default: {} },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Scenario', ScenarioSchema);
