const MODE_CODES = Object.freeze({
  auto: 1, cool: 2, heat: 3, fan: 4, dehumidify: 5, dry: 5,
  '\u81ea\u52a8': 1, '\u5236\u51b7': 2, '\u5236\u70ed': 3, '\u9001\u98ce': 4, '\u9664\u6e7f': 5
});
const MODE_NAMES = Object.freeze({ 1: 'auto', 2: 'cool', 3: 'heat', 4: 'fan', 5: 'dehumidify' });
const FAN_CODES = Object.freeze({
  auto: 0, low: 1, medium: 2, high: 3,
  '\u81ea\u52a8': 0, '\u4f4e': 1, '\u4e2d': 2, '\u9ad8': 3
});
const FAN_NAMES = Object.freeze({ 0: 'auto', 1: 'low', 2: 'medium', 3: 'high' });
const INFRARED_OUTPUT_MODE_CODES = Object.freeze({
  intervention: 0, remote_intervention: 0, intrusive: 0, 0: 0,
  parallel: 1, remote_parallel: 1, equal: 1, 1: 1,
  '\u4ecb\u5165\u5f0f': 0, '\u4ecb\u5165\u5f0f\u8fd0\u884c': 0,
  '\u5e73\u884c\u5f0f': 1, '\u5e73\u884c\u5f0f\u8fd0\u884c': 1
});
const INFRARED_OUTPUT_MODE_NAMES = Object.freeze({ 0: 'intervention', 1: 'parallel' });
const UPLINK_FUNCTION_CODE = 0x41;
const DOWNLINK_FUNCTION_CODE = 0x10;
const UPLINK_DATA_LENGTHS = new Set([50, 52]);

function resolveEnum(value, values, min, max, fallback, fieldName) {
  if (value === undefined || value === null || value === '') return fallback;
  const key = typeof value === 'string' ? value.trim().toLowerCase() : value;
  const code = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : Number(key);
  if (!Number.isInteger(code) || code < min || code > max) throw new Error(`${fieldName}\u53c2\u6570\u65e0\u6548`);
  return code;
}

function resolvePower(value, fallback = 1) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : value;
  if (['on', 'true', '\u5f00', '\u5f00\u542f'].includes(normalized)) return 1;
  if (['off', 'false', '\u5173', '\u5173\u95ed'].includes(normalized)) return 0;
  const code = Number(normalized);
  if (code !== 0 && code !== 1) throw new Error('\u5f00\u5173\u53c2\u6570\u65e0\u6548');
  return code;
}

function resolveTemperature(value, fallback = 24) {
  if (value === undefined || value === null || value === '') return fallback;
  const temperature = Number(value);
  if (!Number.isFinite(temperature) || temperature < 16 || temperature > 30) {
    throw new Error('\u8bbe\u5b9a\u6e29\u5ea6\u5fc5\u987b\u572816-30\u2103\u4e4b\u95f4');
  }
  return Math.round(temperature * 10) / 10;
}

function resolveInfraredOutputMode(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const key = typeof value === 'string' ? value.trim().toLowerCase() : value;
  if (Object.prototype.hasOwnProperty.call(INFRARED_OUTPUT_MODE_CODES, key)) {
    return INFRARED_OUTPUT_MODE_CODES[key];
  }
  const code = Number(key);
  if (code !== 0 && code !== 1) throw new Error('\u7ea2\u5916\u8f93\u51fa\u6a21\u5f0f\u53c2\u6570\u65e0\u6548');
  return code;
}

function crc16Modbus(buffer) {
  let crc = 0xffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xa001) : (crc >>> 1);
    }
  }
  return crc & 0xffff;
}

function buildDa51kdDownlinkFrame(state) {
  const power = resolvePower(state.power, 1);
  const mode = resolveEnum(state.mode, MODE_CODES, 1, 5, 2, '\u6a21\u5f0f');
  const temperature = resolveTemperature(state.temperature, 24);
  const fan = resolveEnum(state.fan, FAN_CODES, 0, 3, 0, '\u98ce\u901f');
  const payload = Buffer.alloc(15);
  payload[0] = 0x01;
  payload[1] = DOWNLINK_FUNCTION_CODE;
  payload.writeUInt16BE(0x0108, 2);
  payload.writeUInt16BE(4, 4);
  payload[6] = 8;
  payload.writeUInt16BE(power, 7);
  payload.writeUInt16BE(mode, 9);
  payload.writeUInt16BE(Math.round(temperature * 10), 11);
  payload.writeUInt16BE(fan, 13);
  const crc = crc16Modbus(payload);
  const frame = Buffer.concat([payload, Buffer.from([crc & 0xff, (crc >>> 8) & 0xff])]);
  return {
    hex: frame.toString('hex').toUpperCase(),
    base64: frame.toString('base64'),
    state: {
      power_status: Boolean(power),
      mode: MODE_NAMES[mode],
      target_temperature: temperature,
      fan_speed: FAN_NAMES[fan]
    }
  };
}

function resolveInfraredOutputModeRegister(commandConfig) {
  const commands = Array.isArray(commandConfig?.commands) ? commandConfig.commands : [];
  const command = commands.find((item) => item?.name === 'set_infrared_output_mode');
  const register = Object.keys(command?.payload?.registers || {})[0];
  const address = Number.parseInt(register, 0);
  if (!Number.isInteger(address) || address < 0 || address > 0xffff) {
    throw new Error('DA51KD协议未配置红外输出模式寄存器');
  }
  return address;
}

function buildDa51kdInfraredOutputModeFrame(modeValue, commandConfig) {
  const mode = resolveInfraredOutputMode(modeValue, 0);
  const register = resolveInfraredOutputModeRegister(commandConfig);
  const payload = Buffer.alloc(9);
  payload[0] = 0x01;
  payload[1] = DOWNLINK_FUNCTION_CODE;
  payload.writeUInt16BE(register, 2);
  payload.writeUInt16BE(1, 4);
  payload[6] = 2;
  payload.writeUInt16BE(mode, 7);
  const crc = crc16Modbus(payload);
  const frame = Buffer.concat([payload, Buffer.from([crc & 0xff, (crc >>> 8) & 0xff])]);
  return {
    hex: frame.toString('hex').toUpperCase(),
    base64: frame.toString('base64'),
    state: {
      infrared_output_mode: INFRARED_OUTPUT_MODE_NAMES[mode]
    }
  };
}

function buildDa51kdCommand(command, currentState = {}, commandConfig = {}) {
  if (command.action === 'set_strategy') throw new Error('DA51KD\u4e0d\u652f\u6301\u76f4\u63a5\u4e0b\u53d1\u7b56\u7565\u6570\u636e');
  if (command.action === 'set_infrared_output_mode' || command.infrared_output_mode !== undefined || command.remote_mode !== undefined) {
    return buildDa51kdInfraredOutputModeFrame(command.infrared_output_mode ?? command.remote_mode, commandConfig);
  }
  const state = {
    power: resolvePower(currentState.power_status, 1),
    mode: resolveEnum(currentState.mode, MODE_CODES, 1, 5, 2, '\u6a21\u5f0f'),
    temperature: resolveTemperature(currentState.target_temperature, 24),
    fan: resolveEnum(currentState.fan_speed, FAN_CODES, 0, 3, 0, '\u98ce\u901f')
  };
  let hasControlValue = false;
  if (command.power_state !== undefined || command.action === 'set_power') {
    state.power = resolvePower(command.power_state, state.power);
    hasControlValue = true;
  }
  if (command.mode !== undefined || command.action === 'set_mode') {
    state.mode = resolveEnum(command.mode, MODE_CODES, 1, 5, state.mode, '\u6a21\u5f0f');
    hasControlValue = true;
  }
  if (command.target_temperature !== undefined || command.action === 'set_temperature') {
    state.temperature = resolveTemperature(command.target_temperature, state.temperature);
    hasControlValue = true;
  }
  if (command.fan_speed !== undefined || command.action === 'set_fan_speed') {
    state.fan = resolveEnum(command.fan_speed, FAN_CODES, 0, 3, state.fan, '\u98ce\u901f');
    hasControlValue = true;
  }
  if (!hasControlValue) throw new Error('DA51KD\u63a7\u5236\u547d\u4ee4\u4e0d\u652f\u6301');
  return buildDa51kdDownlinkFrame(state);
}

function parseDa51kdWriteAck(payload) {
  const base64 = typeof payload === 'string' ? payload : payload?.data;
  if (!base64 || typeof base64 !== 'string') return null;

  const frame = Buffer.from(base64.trim(), 'base64');
  if (frame.length !== 8 || frame[0] !== 0x01 || frame[1] !== DOWNLINK_FUNCTION_CODE) {
    return null;
  }
  const expectedCrc = crc16Modbus(frame.subarray(0, 6));
  const actualCrc = frame[6] | (frame[7] << 8);
  if (actualCrc !== expectedCrc) throw new Error('DA51KD控制应答CRC校验失败');

  return {
    acknowledged: true,
    start_register: frame.readUInt16BE(2),
    register_count: frame.readUInt16BE(4),
    raw_hex: frame.toString('hex').toUpperCase()
  };
}

function parseDa51kdUplink(payload) {
  const base64 = typeof payload === 'string' ? payload : payload?.data;
  if (!base64 || typeof base64 !== 'string') throw new Error('DA51KD上报缺少data字段');

  const frame = Buffer.from(base64.trim(), 'base64');
  if (frame.length < 57) throw new Error(`DA51KD主动上报长度不足: ${frame.length}`);
  if (frame[0] !== 0x01 || frame[1] !== UPLINK_FUNCTION_CODE) {
    throw new Error('DA51KD主动上报帧头或功能码不正确');
  }
  const dataLength = frame[4];
  if (frame.readUInt16BE(2) !== 0x0100 || !UPLINK_DATA_LENGTHS.has(dataLength)) {
    throw new Error(`DA51KD主动上报寄存器范围或数据长度不正确: ${dataLength}`);
  }

  const payloadEnd = 5 + dataLength;
  if (frame.length !== payloadEnd + 2) throw new Error(`DA51KD主动上报长度不匹配: ${frame.length}`);
  const expectedCrc = crc16Modbus(frame.subarray(0, payloadEnd));
  const actualCrc = frame[payloadEnd] | (frame[payloadEnd + 1] << 8);
  if (actualCrc !== expectedCrc) throw new Error('DA51KD主动上报CRC校验失败');

  const data = frame.subarray(5, payloadEnd);
  const powerAndKey = data.readUInt16BE(16);
  const mode = data.readUInt16BE(18);
  const fanSpeed = data.readUInt16BE(22);
  const result = {
    deveui: data.subarray(0, 8).toString('hex').toLowerCase(),
    device_timestamp: data.readUInt32BE(8),
    signal_strength: data.readInt16BE(12),
    protocol_marker: data.readUInt16BE(14),
    power_state: Boolean(powerAndKey & 0xff),
    key_value: (powerAndKey >>> 8) & 0xff,
    mode,
    target_temperature: data.readUInt16BE(20) * 0.1,
    fan_speed: fanSpeed,
    vertical_swing: Boolean(data.readUInt16BE(24)),
    horizontal_swing: Boolean(data.readUInt16BE(26)),
    current: data.readUInt32BE(28) * 0.001,
    energy: data.readUInt32BE(32) * 0.01,
    total_powered_duration: data.readUInt32BE(36),
    total_running_duration: data.readUInt32BE(40),
    daily_running_duration: data.readUInt32BE(44),
    control_method: data.readUInt16BE(48),
    raw_hex: frame.toString('hex').toUpperCase()
  };
  if (dataLength >= 52) result.current_temperature = data.readUInt16BE(50) * 0.1;
  return result;
}

module.exports = {
  buildDa51kdDownlinkFrame,
  buildDa51kdInfraredOutputModeFrame,
  buildDa51kdCommand,
  parseDa51kdWriteAck,
  parseDa51kdUplink,
  crc16Modbus
};
