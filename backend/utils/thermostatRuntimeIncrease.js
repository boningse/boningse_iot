const MODES = ['fan', 'heat', 'cool'];
const SPEEDS = ['low', 'middle', 'high'];
const COLUMNS = MODES.flatMap(mode => SPEEDS.map(speed => `${mode}_${speed}_runtime`));
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Reads are requested every 30 minutes. Allow at most two polling intervals
// around the seven-day boundary; a much older reading is not a seven-day baseline.
const BASELINE_TOLERANCE_MS = 60 * 60 * 1000;

function counter(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function calculateRuntimeIncrease(readings = []) {
  const rows = readings.filter(row => Number.isFinite(new Date(row.observed_at).getTime()))
    .slice().sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at));
  const latest = rows.at(-1);
  const result = {
    days: 7, status: latest ? 'insufficient_history' : 'no_data',
    latest_at: latest?.observed_at || null, baseline_at: null, cutoff_at: null,
    values: Object.fromEntries(COLUMNS.map(column => [column, null])),
    speed1: null, speed2: null, speed3: null
  };
  if (!latest) return result;
  const cutoff = new Date(latest.observed_at).getTime() - WEEK_MS;
  result.cutoff_at = new Date(cutoff).toISOString();
  const baseline = rows.filter(row => new Date(row.observed_at).getTime() <= cutoff).at(-1);
  if (!baseline || cutoff - new Date(baseline.observed_at).getTime() > BASELINE_TOLERANCE_MS) return result;
  result.baseline_at = baseline.observed_at;
  const period = rows.slice(rows.indexOf(baseline));
  let reset = false;
  for (const column of COLUMNS) {
    const first = counter(baseline[column]);
    const last = counter(latest[column]);
    let previous = first;
    let decreased = false;
    for (const row of period.slice(1)) {
      const value = counter(row[column]);
      if (value === null) continue;
      if (previous !== null && value < previous) decreased = true;
      previous = value;
    }
    reset ||= decreased;
    if (first !== null && last !== null && !decreased) result.values[column] = last - first;
  }
  SPEEDS.forEach((speed, index) => {
    const values = MODES.map(mode => result.values[`${mode}_${speed}_runtime`]);
    result[`speed${index + 1}`] = values.every(value => value !== null)
      ? values.reduce((sum, value) => sum + value, 0) : null;
  });
  result.status = reset ? 'counter_reset'
    : Object.values(result.values).every(value => value !== null) ? 'available' : 'partial_data';
  return result;
}

module.exports = { calculateRuntimeIncrease, COLUMNS };
