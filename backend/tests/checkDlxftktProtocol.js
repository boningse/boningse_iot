const assert = require('node:assert/strict');
const protocol = require('../config/protocols/dlxftkt-sacm6-v2.01.json');
const {
  buildConfiguredJsonCommand,
  parseConfiguredJsonUplink
} = require('../utils/configuredJsonProtocol');

const payload = {
  args: {
    f00: '0001', f01: '0001', f02: '0000', f03: '0002',
    f04: '0104', f05: '00F5', f06: '01C2',
    f09: '000A', f10: '03E8', f11: '0001', f12: '86A0',
    f17: '00F7', f24: '0000', f25: '000A', f38: '00DC'
  }
};
const parsed = parseConfiguredJsonUplink(payload, protocol.data_parsing_config);
assert.equal(parsed.matched, true);
assert.equal(parsed.data.power_state, true);
assert.equal(parsed.data.running_status, true);
assert.equal(parsed.data.mode, 'cool');
assert.equal(parsed.data.fan_speed, 'medium');
assert.equal(parsed.data.target_temperature, 26);
assert.equal(parsed.data.current_temperature, 24.5);
assert.equal(parsed.data.humidity, 45);
assert.equal(parsed.data.current, 10);
assert.equal(parsed.data.power, 1000);
assert.equal(parsed.data.energy, 100000);
assert.equal(parsed.data.voltage, 220);
assert.equal(parsed.data.temperature_compensation, -9);
assert.equal(parsed.data.metered_duration, 10);
assert.equal(parseConfiguredJsonUplink(
  '{args:{f00:0001,f02:0000,f04:0104,f09:000A}}',
  protocol.data_parsing_config
).data.target_temperature, 26);
assert.equal(parseConfiguredJsonUplink(
  '{args:{f00:0001,evil:0001}}',
  protocol.data_parsing_config
).matched, false);

const iccid = parseConfiguredJsonUplink(
  { ICCID: '89861120253048658560' }, protocol.data_parsing_config
);
assert.deepEqual(iccid, { matched: true, data: { iccid: '89861120253048658560' } });
assert.equal(parseConfiguredJsonUplink({ unknown: 1 }, protocol.data_parsing_config).matched, false);

const device = { imei: '861241056884446' };
const power = buildConfiguredJsonCommand(
  { action: 'set_power', power_state: 1 }, device, {}, protocol.command_config
);
assert.equal(power.topic, 'tcli/SACM6/861241056884446');
assert.deepEqual(power.mqtt_payload, { args: { f00: 1 } });
assert.equal(power.state.power_status, true);

const scene = buildConfiguredJsonCommand(
  { action: 'set_power', power_state: 1, mode: 'heat', fan_speed: 'auto', target_temperature: 22 },
  device, {}, protocol.command_config
);
assert.equal(scene.command_name, 'set_operating_state');
assert.deepEqual(scene.mqtt_payload, {
  args: { f00: 1, f02: 1, f03: 0, f04: 220 }
});
assert.throws(() => buildConfiguredJsonCommand(
  { action: 'set_infrared_output_mode', infrared_output_mode: 'parallel' },
  device, {}, protocol.command_config
), /未配置控制动作/);

console.log('DLXFTKT 协议解析和配置驱动控制检查通过');
