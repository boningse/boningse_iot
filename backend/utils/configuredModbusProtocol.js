function getValueByPath(value, path) {
  return String(path || '').split('.').filter(Boolean).reduce(
    (current, key) => (current && typeof current === 'object' ? current[key] : undefined),
    value
  );
}

function parseInteger(value, fieldName) {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 0) : Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${fieldName}配置无效`);
  return parsed;
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

function verifyConfiguredCrc(frame, crcConfig = {}) {
  if (crcConfig.algorithm !== 'modbus_crc16') throw new Error('协议未配置受支持的CRC算法');
  const crcBytes = parseInteger(crcConfig.bytes, 'CRC字节数');
  if (crcBytes !== 2 || frame.length < crcBytes) throw new Error('协议CRC长度配置无效');
  const payload = frame.subarray(0, frame.length - crcBytes);
  const expected = crc16Modbus(payload);
  const actual = crcConfig.byte_order === 'big'
    ? frame.readUInt16BE(frame.length - 2)
    : frame.readUInt16LE(frame.length - 2);
  if (actual !== expected) throw new Error('协议报文CRC校验失败');
}

function encodeConfiguredCrc(payload, crcConfig = {}) {
  if (crcConfig.algorithm !== 'modbus_crc16') throw new Error('协议未配置受支持的CRC算法');
  const crc = crc16Modbus(payload);
  const bytes = Buffer.alloc(2);
  if (crcConfig.byte_order === 'big') bytes.writeUInt16BE(crc, 0);
  else bytes.writeUInt16LE(crc, 0);
  return bytes;
}

function registerRange(field) {
  const value = String(field.register || field.address || '').trim();
  const [startText, endText] = value.split('-');
  const start = parseInteger(startText, `${field.name || '字段'}寄存器`);
  const end = endText ? parseInteger(endText, `${field.name || '字段'}结束寄存器`) : start;
  const count = Number(field.register_count) || (end - start + 1);
  if (end < start || count < 1) throw new Error(`${field.name || '字段'}寄存器范围无效`);
  return { start, count };
}

function readConfiguredField(data, frameStartRegister, field) {
  const range = registerRange(field);
  const byteOffset = (range.start - frameStartRegister) * 2;
  const byteLength = range.count * 2;
  if (byteOffset < 0 || byteOffset + byteLength > data.length) return undefined;
  const slice = data.subarray(byteOffset, byteOffset + byteLength);
  const byteOrder = field.byte_order || 'big';
  const readUInt16 = (offset = 0) => byteOrder === 'little' ? slice.readUInt16LE(offset) : slice.readUInt16BE(offset);
  const readInt16 = (offset = 0) => byteOrder === 'little' ? slice.readInt16LE(offset) : slice.readInt16BE(offset);
  const readUInt32 = () => byteOrder === 'little' ? slice.readUInt32LE(0) : slice.readUInt32BE(0);
  const readInt32 = () => byteOrder === 'little' ? slice.readInt32LE(0) : slice.readInt32BE(0);
  let value;
  if (field.encoding === 'hex') value = slice.toString('hex');
  else if (field.data_type === 'uint32') value = readUInt32();
  else if (field.data_type === 'int32') value = readInt32();
  else if (field.data_type === 'int16') value = readInt16();
  else {
    value = readUInt16();
    if (field.byte === 'low') value &= 0xff;
    if (field.byte === 'high') value = (value >>> 8) & 0xff;
  }
  if (typeof value === 'number' && field.scale !== undefined) value *= Number(field.scale);
  if (field.type === 'boolean') value = Boolean(value);
  if (field.expected !== undefined && Number(value) !== Number(field.expected)) {
    throw new Error(`${field.label || field.name}不符合协议固定值`);
  }
  return value;
}

function parseConfiguredUplink(payload, parsingConfig = {}) {
  const encoded = getValueByPath(payload, parsingConfig.payload_path);
  if (!encoded || typeof encoded !== 'string') throw new Error('协议配置的上报数据路径未取到Base64报文');
  if (parsingConfig.payload_encoding !== 'base64') throw new Error('协议未配置受支持的上报编码');
  const frame = Buffer.from(encoded.trim(), 'base64');
  const frameConfig = parsingConfig.frame || {};
  const layout = frameConfig.layout || {};
  const slaveOffset = parseInteger(layout.slave_id_offset, '从机地址偏移');
  const functionOffset = parseInteger(layout.function_code_offset, '功能码偏移');
  const startRegisterOffset = parseInteger(layout.start_register_offset, '起始寄存器偏移');
  const byteCountOffset = parseInteger(layout.byte_count_offset, '字节数偏移');
  const dataOffset = parseInteger(layout.data_offset, '数据偏移');
  if (frame[slaveOffset] !== parseInteger(frameConfig.slave_id, '从机地址')) throw new Error('上报从机地址不匹配');
  if (frame[functionOffset] !== parseInteger(frameConfig.function_code, '上报功能码')) throw new Error('上报功能码不匹配');
  const startRegister = frame.readUInt16BE(startRegisterOffset);
  if (startRegister !== parseInteger(frameConfig.start_register, '上报起始寄存器')) throw new Error('上报起始寄存器不匹配');
  const byteCount = frame[byteCountOffset];
  const allowedCounts = (frameConfig.allowed_byte_counts || [frameConfig.byte_count]).map(Number);
  if (!allowedCounts.includes(byteCount)) throw new Error(`上报数据字节数不在协议范围内: ${byteCount}`);
  const crcConfig = frameConfig.crc || {};
  const crcBytes = parseInteger(crcConfig.bytes, 'CRC字节数');
  if (frame.length !== dataOffset + byteCount + crcBytes) throw new Error('上报报文长度与协议配置不匹配');
  verifyConfiguredCrc(frame, crcConfig);
  const data = frame.subarray(dataOffset, dataOffset + byteCount);
  const result = {};
  for (const field of parsingConfig.fields || []) {
    const value = readConfiguredField(data, startRegister, field);
    if (value !== undefined) result[field.target || field.name] = value;
  }
  if (!Object.keys(result).length) throw new Error('协议配置未解析出任何字段');
  result.raw_hex = frame.toString('hex').toUpperCase();
  return result;
}

function parseConfiguredWriteAck(payload, commandConfig = {}) {
  const encoded = getValueByPath(payload, commandConfig.json_payload_path);
  if (!encoded || typeof encoded !== 'string') return null;
  const frame = Buffer.from(encoded.trim(), 'base64');
  const response = commandConfig.frame_builder?.response || {};
  if (!response.length || frame.length !== Number(response.length)) return null;
  const functionOffset = parseInteger(response.function_code_offset, '应答功能码偏移');
  if (frame[functionOffset] !== parseInteger(commandConfig.frame_builder.function_code, '写入功能码')) return null;
  verifyConfiguredCrc(frame, commandConfig.frame_builder.crc || {});
  const startOffset = parseInteger(response.start_register_offset, '应答起始寄存器偏移');
  const countOffset = parseInteger(response.register_count_offset, '应答寄存器数量偏移');
  return {
    acknowledged: true,
    start_register: frame.readUInt16BE(startOffset),
    register_count: frame.readUInt16BE(countOffset),
    raw_hex: frame.toString('hex').toUpperCase()
  };
}

function normalizeMappingKey(value) {
  if (typeof value === 'string') return value.trim().toLowerCase();
  return String(value);
}

function resolveConfiguredParameter(name, command, currentState, commandConfig) {
  const definition = commandConfig.parameters?.[name];
  if (!definition) throw new Error(`协议未配置命令参数: ${name}`);
  let rawValue = command?.[definition.command_field];
  if (rawValue === undefined || rawValue === null || rawValue === '') rawValue = currentState?.[definition.state_field];
  if ((rawValue === undefined || rawValue === null || rawValue === '') && definition.default !== undefined) rawValue = definition.default;
  if (rawValue === undefined || rawValue === null || rawValue === '') throw new Error(`控制参数缺少值: ${name}`);
  let value = rawValue;
  if (definition.values) {
    const key = normalizeMappingKey(rawValue);
    if (!Object.prototype.hasOwnProperty.call(definition.values, key)) throw new Error(`控制参数值不在协议映射中: ${name}`);
    value = definition.values[key];
  }
  value = Number(value);
  if (!Number.isFinite(value)) throw new Error(`控制参数不是有效数字: ${name}`);
  if (definition.min !== undefined && value < Number(definition.min)) throw new Error(`控制参数小于协议下限: ${name}`);
  if (definition.max !== undefined && value > Number(definition.max)) throw new Error(`控制参数大于协议上限: ${name}`);
  value *= Number(definition.multiplier ?? 1);
  value = Math.round(value);
  if (value < 0 || value > 0xffff) throw new Error(`控制参数超出16位寄存器范围: ${name}`);
  let stateValue = rawValue;
  if (definition.state_output_type === 'boolean') stateValue = Boolean(Number(value));
  return { value, stateField: definition.state_output_field, stateValue };
}

function selectConfiguredCommand(command, commandConfig) {
  const commands = Array.isArray(commandConfig.commands) ? commandConfig.commands : [];
  const matchingParameters = Object.values(commandConfig.parameters || {}).filter(
    (item) => item.command_field && command[item.command_field] !== undefined
  );
  if (matchingParameters.length > 1) {
    const aggregate = commands.find((item) => item.aggregate === true);
    if (aggregate) return aggregate;
  }
  const selected = commands.find((item) => item.name === command.action);
  if (!selected) throw new Error(`协议未配置控制动作: ${command.action}`);
  return selected;
}

function buildConfiguredCommand(command, currentState = {}, commandConfig = {}) {
  if (commandConfig.codec !== 'configured_modbus_rtu') throw new Error('协议未启用配置驱动的Modbus命令编码');
  const selected = selectConfiguredCommand(command, commandConfig);
  const registerTemplates = selected.payload?.registers || {};
  const entries = [];
  const state = {};
  for (const [addressText, template] of Object.entries(registerTemplates)) {
    const match = String(template).match(/^\{([^}]+)\}$/);
    if (!match) throw new Error(`协议寄存器模板无效: ${addressText}`);
    const resolved = resolveConfiguredParameter(match[1], command, currentState, commandConfig);
    entries.push({ address: parseInteger(addressText, '命令寄存器'), value: resolved.value });
    if (resolved.stateField) state[resolved.stateField] = resolved.stateValue;
  }
  if (!entries.length) throw new Error(`协议控制动作未配置寄存器: ${selected.name}`);
  entries.sort((a, b) => a.address - b.address);
  const startRegister = entries[0].address;
  const endRegister = entries[entries.length - 1].address;
  const registerCount = endRegister - startRegister + 1;
  if (registerCount !== entries.length) throw new Error('协议控制寄存器必须连续');
  const frameBuilder = commandConfig.frame_builder || {};
  if (frameBuilder.frame_type !== 'modbus_write_multiple_registers') throw new Error('协议未配置受支持的命令帧类型');
  const payload = Buffer.alloc(7 + registerCount * 2);
  payload[0] = parseInteger(frameBuilder.slave_id, '命令从机地址');
  payload[1] = parseInteger(frameBuilder.function_code, '命令功能码');
  payload.writeUInt16BE(startRegister, 2);
  payload.writeUInt16BE(registerCount, 4);
  payload[6] = registerCount * 2;
  entries.forEach((entry, index) => payload.writeUInt16BE(entry.value, 7 + index * 2));
  const frame = Buffer.concat([payload, encodeConfiguredCrc(payload, frameBuilder.crc || {})]);
  const output = frameBuilder.output;
  if (output !== 'base64') throw new Error('协议未配置受支持的命令输出编码');
  const base64 = frame.toString('base64');
  const path = commandConfig.json_payload_path;
  if (!path || path.includes('.')) throw new Error('协议命令JSON路径无效');
  return {
    command_name: selected.name,
    hex: frame.toString('hex').toUpperCase(),
    base64,
    mqtt_payload: { [path]: base64 },
    state
  };
}

module.exports = {
  buildConfiguredCommand,
  parseConfiguredUplink,
  parseConfiguredWriteAck,
  crc16Modbus
};
