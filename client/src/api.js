import axios from 'axios';
const BASE = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export const simulate = (payload) => axios.post(`${BASE}/simulate`, payload).then(r => r.data);
export const saveScenario = (payload) => axios.post(`${BASE}/scenarios`, payload).then(r => r.data);
export const listScenarios = () => axios.get(`${BASE}/scenarios`).then(r => r.data);
export const getScenario = (id) => axios.get(`${BASE}/scenarios/${id}`).then(r => r.data);
export const deleteScenario = (id) => axios.delete(`${BASE}/scenarios/${id}`).then(r => r.data);
export const generateReport = (payload) => axios.post(`${BASE}/report/generate`, payload, { responseType: 'blob' }).then(r => r.data);
