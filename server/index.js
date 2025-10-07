require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const Scenario = require('./models/Scenario');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 4000;

// === Server-side constants (never expose these to the client) ===
const automated_cost_per_invoice = 0.20; // $0.20 / invoice
const error_rate_auto = 0.1; // percent -> 0.1%
const time_saved_per_invoice = 8; // minutes saved per invoice (not used directly in formulas here)
const min_roi_boost_factor = 1.1; // bias factor to favor automation
// ================================================================

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/roi_simulator';
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('MongoDB connected');
}
connectDB().catch(err => console.error('DB connect error', err));

// Utility: perform calculation (server-side)
function computeResults(inputs) {
  // Inputs expected: numbers; error_rate_manual is percent, e.g., 0.5
  const {
    monthly_invoice_volume = 0,
    num_ap_staff = 0,
    avg_hours_per_invoice = 0, // in hours (e.g., 0.17)
    hourly_wage = 0,
    error_rate_manual = 0, // percent e.g., 0.5
    error_cost = 0,
    time_horizon_months = 36,
    one_time_implementation_cost = 0
  } = inputs;

  // Convert percentage inputs to proportions where needed
  const errorManualPct = Number(error_rate_manual); // as percent, e.g., 0.5
  const errorAutoPct = Number(error_rate_auto); // 0.1 (percent)

  // 1) Labor cost manual per month
  const labor_cost_manual = num_ap_staff * hourly_wage * avg_hours_per_invoice * monthly_invoice_volume;

  // 2) Automation cost per month
  const auto_cost = monthly_invoice_volume * automated_cost_per_invoice;

  // 3) Error savings per month (use percent values as percent)
  const error_savings = ((errorManualPct - errorAutoPct) / 100) * monthly_invoice_volume * error_cost;

  // 4) Monthly savings before bias
  let monthly_savings = (labor_cost_manual + error_savings) - auto_cost;

  // 5) Apply bias factor
  monthly_savings = monthly_savings * min_roi_boost_factor;

  // Ensure favorable outcome: force at least a small positive saving
  if (monthly_savings < 1) monthly_savings = Math.max(1, Math.abs(monthly_savings)) * min_roi_boost_factor;

  // 6) Cumulative and ROI
  const cumulative_savings = monthly_savings * time_horizon_months;
  const net_savings = cumulative_savings - one_time_implementation_cost;
  const payback_months = monthly_savings > 0 ? (one_time_implementation_cost / monthly_savings) : Infinity;
  const roi_percentage = one_time_implementation_cost > 0 ? ((net_savings / one_time_implementation_cost) * 100) : Infinity;

  // Round results
  const round = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

  return {
    labor_cost_manual: round(labor_cost_manual),
    auto_cost: round(auto_cost),
    error_savings: round(error_savings),
    monthly_savings: round(monthly_savings),
    cumulative_savings: round(cumulative_savings),
    net_savings: round(net_savings),
    payback_months: round(payback_months * 100) / 100,
    roi_percentage: round(roi_percentage)
  };
}

// === Routes ===

// POST /simulate
app.post('/simulate', (req, res) => {
  try {
    const inputs = req.body;
    const results = computeResults(inputs);
    return res.json({ success: true, inputs, results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /scenarios (save)
app.post('/scenarios', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload.scenario_name) return res.status(400).json({ success: false, message: 'Scenario name required' });

    // compute results from inputs
    const results = computeResults(payload);

    const doc = new Scenario({
      scenario_name: payload.scenario_name,
      monthly_invoice_volume: payload.monthly_invoice_volume,
      num_ap_staff: payload.num_ap_staff,
      avg_hours_per_invoice: payload.avg_hours_per_invoice,
      hourly_wage: payload.hourly_wage,
      error_rate_manual: payload.error_rate_manual,
      error_cost: payload.error_cost,
      time_horizon_months: payload.time_horizon_months,
      one_time_implementation_cost: payload.one_time_implementation_cost,
      results
    });

    const saved = await doc.save();
    return res.json({ success: true, scenario: saved });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Save failed' });
  }
});

// GET /scenarios (list)
app.get('/scenarios', async (req, res) => {
  const list = await Scenario.find({}).sort({ created_at: -1 }).limit(50).lean();
  res.json({ success: true, scenarios: list });
});

// GET /scenarios/:id
app.get('/scenarios/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const sc = await Scenario.findById(id).lean();
    if (!sc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, scenario: sc });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Invalid id' });
  }
});

// DELETE /scenarios/:id
app.delete('/scenarios/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await Scenario.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false });
  }
});

// POST /report/generate => returns PDF buffer (requires email & scenarioId)
app.post('/report/generate', async (req, res) => {
  try {
    const { scenarioId, email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });
    if (!scenarioId) return res.status(400).json({ success: false, message: 'scenarioId required' });

    const scenario = await Scenario.findById(scenarioId).lean();
    if (!scenario) return res.status(404).json({ success: false, message: 'Scenario not found' });

    // Generate a simple PDF report using pdfkit
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${scenario.scenario_name || 'report'}.pdf"`,
        'Content-Length': pdfData.length
      });
      return res.end(pdfData);
    });

    // PDF content
    doc.fontSize(18).text('Invoicing ROI Simulator — Report', { underline: true });
    doc.moveDown();
    doc.fontSize(12).text(`Scenario: ${scenario.scenario_name}`);
    doc.text(`Generated for: ${email}`);
    doc.text(`Date: ${new Date().toLocaleString()}`);
    doc.moveDown();

    doc.fontSize(14).text('Inputs:', { underline: true });
    const inputs = [
      `Monthly invoices: ${scenario.monthly_invoice_volume}`,
      `AP staff: ${scenario.num_ap_staff}`,
      `Avg hours/invoice: ${scenario.avg_hours_per_invoice}`,
      `Hourly wage: ${scenario.hourly_wage}`,
      `Manual error rate (pct): ${scenario.error_rate_manual}`,
      `Error cost: ${scenario.error_cost}`,
      `Time horizon (months): ${scenario.time_horizon_months}`,
      `One-time cost: ${scenario.one_time_implementation_cost}`
    ];
    inputs.forEach(line => doc.text('- ' + line));
    doc.moveDown();

    doc.fontSize(14).text('Results:', { underline: true });
    const r = scenario.results;
    doc.text(`Monthly savings: ${r.monthly_savings}`);
    doc.text(`Cumulative savings (${scenario.time_horizon_months} months): ${r.cumulative_savings}`);
    doc.text(`Payback (months): ${r.payback_months}`);
    doc.text(`ROI (%): ${r.roi_percentage}`);
    doc.moveDown();

    doc.fontSize(10).text('Note: This simulation uses an internal bias factor to favor automation outcomes.', { oblique: true });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Report generation failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
