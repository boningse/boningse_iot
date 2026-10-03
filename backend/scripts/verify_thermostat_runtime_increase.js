const assert = require('node:assert/strict');
const { calculateRuntimeIncrease, COLUMNS } = require('../utils/thermostatRuntimeIncrease');

const latestTime = '2026-09-30T12:00:00.000Z';
const baselineTime = '2026-09-23T12:00:00.000Z';
const reading = (observed_at, value) => ({
  observed_at, ...Object.fromEntries(COLUMNS.map(column => [column, value]))
});
const baseline = reading(baselineTime, '100');
const latest = reading(latestTime, '200');
let result = calculateRuntimeIncrease([latest, baseline]);
assert.equal(result.status, 'available');
assert.equal(result.speed1, 300);
assert.equal(result.speed2, 300);
assert.equal(result.speed3, 300);
assert.equal(result.values.cool_middle_runtime, 100);
assert.equal(result.baseline_at, baselineTime);

result = calculateRuntimeIncrease([latest]);
assert.equal(result.status, 'insufficient_history');
assert.equal(result.speed1, null);
assert.equal(calculateRuntimeIncrease([]).status, 'no_data');
assert.equal(calculateRuntimeIncrease([reading('2026-09-23T10:59:59Z', 100), latest]).speed1, null);
assert.equal(calculateRuntimeIncrease([reading('2026-09-23T11:45:00Z', 100), latest]).speed1, 300);
// A reading after the boundary must not stand in for seven days ago.
assert.equal(calculateRuntimeIncrease([reading('2026-09-23T12:01:00Z', 100), latest]).speed1, null);

result = calculateRuntimeIncrease([baseline, reading(latestTime, 100)]);
assert.equal(result.speed1, 0);
assert.equal(result.status, 'available');

const reset = { ...reading('2026-09-25T12:00:00Z', 110), cool_middle_runtime: 0 };
result = calculateRuntimeIncrease([baseline, reset, latest]);
assert.equal(result.status, 'counter_reset');
assert.equal(result.speed2, null);
assert.equal(result.speed1, 300);
assert.equal(result.values.cool_middle_runtime, null);

result = calculateRuntimeIncrease([baseline, { ...latest, cool_low_runtime: null }]);
assert.equal(result.status, 'partial_data');
assert.equal(result.speed1, null);
assert.equal(result.speed2, 300);
assert.equal(result.values.cool_low_runtime, null);
console.log('PASS: latest minus seven-day cumulative baseline, mode/speed totals, real zero, missing/old baseline, partial readings and counter resets.');
