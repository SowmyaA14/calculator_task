import React, { useState, useEffect } from 'react';
import * as api from './api';

// Modern UI with theme toggle and nicer layout
const defaults = {
  scenario_name: 'My_Scenario',
  monthly_invoice_volume: 2000,
  num_ap_staff: 3,
  avg_hours_per_invoice: 0.17,
  hourly_wage: 30,
  error_rate_manual: 0.5,
  error_cost: 100,
  time_horizon_months: 36,
  one_time_implementation_cost: 50000
};

function IconSunMoon({ dark }) {
  return dark ? (
    // moon
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" fill="currentColor"/>
    </svg>
  ) : (
    // sun
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6.76 4.84l-1.8-1.79L3.17 4.84l1.79 1.79 1.8-1.79zM1 13h3v-2H1v2zm10 9h2v-3h-2v3zM20.24 4.84l-1.79 1.79 1.8 1.79 1.79-1.79-1.8-1.79zM17 21l1.79-1.79-1.8-1.79L15.2 19.2 17 21zM4.21 15.7l-1.8 1.79L4.21 19.29l1.8-1.79-1.8-1.8zM12 6a6 6 0 100 12A6 6 0 0012 6z" fill="currentColor"/>
    </svg>
  );
}

export default function App() {
  const [inputs, setInputs] = useState(defaults);
  const [results, setResults] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [dark, setDark] = useState(false);

  // Load theme from localStorage
  useEffect(() => {
    const t = localStorage.getItem('theme');
    if (t === 'dark') setDark(true);
    else setDark(false);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    fetchScenarios();
  }, []);

  async function fetchScenarios() {
    try {
      const res = await api.listScenarios();
      if (res.success) setScenarios(res.scenarios);
    } catch (err) { console.error(err); }
  }

  async function handleSimulate() {
    setLoading(true);
    try {
      const res = await api.simulate(inputs);
      if (res.success) setResults(res.results);
    } catch (err) {
      console.error(err);
      alert('Simulation failed');
    } finally { setLoading(false); }
  }

  async function handleSave() {
    try {
      const payload = { ...inputs };
      const res = await api.saveScenario(payload);
      if (res.success) {
        fetchScenarios();
      }
    } catch (err) {
      console.error(err);
      alert('Save failed');
    }
  }

  async function handleLoad(id) {
    try {
      const res = await api.getScenario(id);
      if (res.success) {
        setInputs({
          scenario_name: res.scenario.scenario_name,
          monthly_invoice_volume: res.scenario.monthly_invoice_volume,
          num_ap_staff: res.scenario.num_ap_staff,
          avg_hours_per_invoice: res.scenario.avg_hours_per_invoice,
          hourly_wage: res.scenario.hourly_wage,
          error_rate_manual: res.scenario.error_rate_manual,
          error_cost: res.scenario.error_cost,
          time_horizon_months: res.scenario.time_horizon_months,
          one_time_implementation_cost: res.scenario.one_time_implementation_cost
        });
        setResults(res.scenario.results);
      }
    } catch (err) { console.error(err); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this scenario?')) return;
    try {
      await api.deleteScenario(id);
      fetchScenarios();
    } catch (err) { console.error(err); }
  }

  async function handleReport() {
    if (!email) return alert('Please enter an email to generate the report (lead capture)');
    if (!results) return alert('Run simulation or load a saved scenario first.');
    try {
      const saveRes = await api.saveScenario({ ...inputs });
      if (!saveRes.success) throw new Error('Could not save scenario before report');
      const blob = await api.generateReport({ scenarioId: saveRes.scenario._id, email });
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${inputs.scenario_name || 'report'}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Report generation failed');
    }
  }

  function onChange(e) {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: isNaN(Number(value)) ? value : Number(value) }));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo">RI<span>O</span></div>
          <div className="title">Invoicing ROI Simulator</div>
        </div>

        <div className="right-controls">
          <div className="theme-toggle" onClick={() => setDark(d => !d)} role="button" title="Toggle theme">
            <IconSunMoon dark={dark} />
            <span className="toggle-label">{dark ? 'Dark' : 'Light'}</span>
          </div>
        </div>
      </header>

      <main className="main-grid">
        <section className="card form-card">
          <h3>Inputs</h3>

          <div className="grid-2">
            <label>
              Scenario name
              <input name="scenario_name" value={inputs.scenario_name} onChange={onChange} />
            </label>

            <label>
              Monthly invoices
              <input name="monthly_invoice_volume" type="number" value={inputs.monthly_invoice_volume} onChange={onChange} />
            </label>

            <label>
              AP staff
              <input name="num_ap_staff" type="number" value={inputs.num_ap_staff} onChange={onChange} />
            </label>

            <label>
              Avg hours / invoice (hrs)
              <input name="avg_hours_per_invoice" step="0.01" type="number" value={inputs.avg_hours_per_invoice} onChange={onChange} />
            </label>

            <label>
              Hourly wage
              <input name="hourly_wage" type="number" value={inputs.hourly_wage} onChange={onChange} />
            </label>

            <label>
              Manual error rate (%)
              <input name="error_rate_manual" step="0.01" type="number" value={inputs.error_rate_manual} onChange={onChange} />
            </label>

            <label>
              Error cost
              <input name="error_cost" type="number" value={inputs.error_cost} onChange={onChange} />
            </label>

            <label>
              Time horizon (months)
              <input name="time_horizon_months" type="number" value={inputs.time_horizon_months} onChange={onChange} />
            </label>

            <label>
              One-time implementation cost
              <input name="one_time_implementation_cost" type="number" value={inputs.one_time_implementation_cost} onChange={onChange} />
            </label>
          </div>

          <div className="form-actions">
            <button className="btn primary" onClick={handleSimulate} disabled={loading}>
              {loading ? 'Running...' : 'Run Simulation'}
            </button>
            <button className="btn ghost" onClick={handleSave}>Save Scenario</button>
          </div>
        </section>

        <section className="card result-card">
          <div className="result-header">
            <h3>Results</h3>
            <div className="small-note">Biased to show positive ROI</div>
          </div>

          {results ? (
            <div className="results-grid">
              <div className="result-pill">
                <div className="label">Monthly savings</div>
                <div className="value">₹ {results.monthly_savings.toLocaleString()}</div>
              </div>

              <div className="result-pill">
                <div className="label">Cumulative ({inputs.time_horizon_months} mo)</div>
                <div className="value">₹ {results.cumulative_savings.toLocaleString()}</div>
              </div>

              <div className="result-pill">
                <div className="label">Payback (months)</div>
                <div className="value">{results.payback_months}</div>
              </div>

              <div className="result-pill">
                <div className="label">ROI %</div>
                <div className="value">{results.roi_percentage}%</div>
              </div>
            </div>
          ) : (
            <div className="empty-state">Run the simulation to see results 🔍</div>
          )}

          <div className="report-row">
            <input className="email-input" placeholder="Email for report" value={email} onChange={e => setEmail(e.target.value)} />
            <button className="btn accent" onClick={handleReport}>Generate Report</button>
          </div>
        </section>

        <section className="card list-card">
          <h3>Saved Scenarios</h3>
          <div className="sc-list">
            {scenarios.length === 0 && <div className="empty">No saved scenarios yet — save one!</div>}
            <ul>
              {scenarios.map(s => (
                <li key={s._id} className="sc-item">
                  <div>
                    <div className="sc-title">{s.scenario_name}</div>
                    <div className="sc-meta">{s.monthly_invoice_volume} invs • saved {new Date(s.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="sc-actions">
                    <button className="btn small" onClick={() => handleLoad(s._id)}>Load</button>
                    <button className="btn small ghost" onClick={() => handleDelete(s._id)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div>Made with ❤️ — biased to show automation wins</div>
        <div>v0.1 • quick demo</div>
      </footer>
    </div>
  );
}
