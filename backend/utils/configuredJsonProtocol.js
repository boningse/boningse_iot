const crypto = require('crypto');

const parseObject = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return {};
  }
};

// Some vendor documents show register reports with unquoted keys/hex words.
// Accept only this narrow data shape when explicitly enabled by the protocol.
const parseConfiguredRegisterLiteral = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const iccid = text.match(/^\{\s*ICCID\s*:\s*([0-9A-Za-z]{10,64})\s*\}$/i);
  if (iccid) return { ICCID: iccid[1] };
  const args = text.match(/^\{\s*args\s*:\s*\{\s*([^{}]*)\s*\}\s*\}$/i);
  if (!args) return null;
  const fields = {};
  for (const pair of args[1].split(',')) {
    const match = pair.trim().match(/^(f\d{2})\s*:\s*([0-9a-f]{1,4})$/i);
    if (!match) return null;
    fields[match[1].toLowerCase()] = match[2];
  }
  return Object.keys(fields).length ? { args: fields } : null;
};

const pathTokens = (path) => String(path || '')
  .replace(/^\$\.?/, '')
  .replace(/\[(\d+)\]/g, '.$1')
  .split('.')
  .filter(Boolean);

const getValueByPath = (source, path) => {
  if (!path) return source;
  return pathTokens(path).reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    return current[key];
  }, source);
};

const matchesRule = (payload, rule) => {
  if (!rule) return true;
  if (Array.isArray(rule)) return rule.every((item) => matchesRule(payload, item));
  if (Array.isArray(rule.all)) return rule.all.every((item) => matchesRule(payload, item));
  if (Array.isArray(rule.any)) return rule.any.some((item) => matchesRule(payload, item));
  const value = getValueByPath(payload, rule.path);
  if (Object.prototype.hasOwnProperty.call(rule, 'equals')) return value === rule.equals;
  if (Array.isArray(rule.in)) return rule.in.includes(value);
  if (Object.prototype.hasOwnProperty.call(rule, 'exists')) {
    return rule.exists ? value !== undefined && value !== null : value === undefined || value === null;
  }
  return true;
};

const resolveFieldValue = (payload, record, field) => {
  if (field.combine_words) {
    const { high_path, low_path } = field.combine_words;
    const high = getValueByPath(payload, high_path);
    const low = getValueByPath(payload, low_path);
    if (high === undefined || low === undefined) return undefined;
    const highWord = parseConfiguredNumber(high, field.radix);
    const lowWord = parseConfiguredNumber(low, field.radix);
    if (field.combine_words.fractional_low_is_scaled &&
        Number.isFinite(highWord) && Number.isFinite(lowWord) &&
        (Number.isInteger(highWord) || highWord === 0) && lowWord >= 0 && lowWord < 0x10000 &&
        (!Number.isInteger(lowWord) || lowWord <= 0xffff)) {
      if (!Number.isInteger(highWord) || !Number.isInteger(lowWord)) return highWord * 0x10000 + lowWord;
    }
    if (!Number.isInteger(highWord) || !Number.isInteger(lowWord) ||
        highWord < 0 || highWord > 0xffff || lowWord < 0 || lowWord > 0xffff) return undefined;
    return highWord * 0x10000 + lowWord;
  }
  const paths = Array.isArray(field.path || field.source)
    ? (field.path || field.source)
    : [field.path || field.source || field.name];
  const values = paths.map((path) => {
    const fromRoot = String(path).startsWith('$');
    return getValueByPath(fromRoot ? payload : record, path);
  }).filter((value) => value !== undefined && value !== null);
  if (!values.length) return undefined;
  if (field.prefer_nonzero) {
    const nonzero = values.find((value) => Number(value) !== 0);
    if (nonzero !== undefined) return nonzero;
  }
  return values[0];
};

const parseConfiguredNumber = (value, radix) => {
  if (typeof value === 'number') return value;
  if (radix === 16 && typeof value === 'string') {
    const text = value.trim().replace(/^0x/i, '');
    return /^[0-9a-f]+$/i.test(text) ? Number.parseInt(text, 16) : NaN;
  }
  return Number(value);
};

const convertValue = (rawValue, field) => {
  let value = field.radix === 16 ? parseConfiguredNumber(rawValue, 16) : rawValue;
  if (field.signed_bits && Number.isInteger(value)) {
    const widths = (Array.isArray(field.signed_bits) ? field.signed_bits : [field.signed_bits])
      .map(Number).filter((width) => Number.isInteger(width) && width > 1).sort((a, b) => a - b);
    const width = widths.find((candidate) => value >= 2 ** (candidate - 1) && value < 2 ** candidate);
    if (width) value -= 2 ** width;
  }
  if (field.map && typeof field.map === 'object') {
    const key = String(value);
    if (Object.prototype.hasOwnProperty.call(field.map, key)) {
      value = field.map[key];
    } else if (Object.prototype.hasOwnProperty.call(field.map, 'default')) {
      value = field.map.default;
    }
  }
  if (value === null || value === undefined) return value;
  switch (field.type) {
    case 'number':
    case 'float':
    case 'integer': {
      const numeric = parseConfiguredNumber(value);
      if (!Number.isFinite(numeric)) return null;
      value = field.type === 'integer' ? Math.trunc(numeric) : numeric;
      break;
    }
    case 'boolean':
      if (typeof value !== 'boolean') {
        if (value === 1 || value === '1' || String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'on') value = true;
        else if (value === 0 || value === '0' || String(value).toLowerCase() === 'false' || String(value).toLowerCase() === 'off') value = false;
        else return null;
      }
      break;
    case 'string':
      value = String(value);
      break;
    default:
      break;
  }
  const multiplier = field.multiplier ?? field.scale;
  if (multiplier !== undefined && typeof value === 'number') value *= Number(multiplier);
  if (field.offset !== undefined && typeof value === 'number') value += Number(field.offset);
  return value;
};

const parseConfiguredJsonUplink = (payloadValue, configValue) => {
  const config = parseObject(configValue);
  if (config.codec !== 'configured_json') return { matched: false, data: {} };
  const payload = parseObject(payloadValue);
  if (!Object.keys(payload).length && config.allow_register_literal) {
    Object.assign(payload, parseConfiguredRegisterLiteral(payloadValue) || {});
  }
  if (!matchesRule(payload, config.message_match)) return { matched: false, data: {} };
  const record = config.record_path ? getValueByPath(payload, config.record_path) : payload;
  if (!record || typeof record !== 'object') return { matched: true, data: {} };
  const data = {};
  for (const field of Array.isArray(config.fields) ? config.fields : []) {
    if (!field?.name) continue;
    const rawValue = resolveFieldValue(payload, record, field);
    if (rawValue === undefined) continue;
    data[field.name] = convertValue(rawValue, field);
  }
  return { matched: true, data };
};

const parseConnectionConfig = (device) => parseObject(device?.connection_config);

const createTemplateValues = (device = {}, additions = {}) => {
  const connection = parseConnectionConfig(device);
  const deviceIdentity = connection.device_id || connection.deviceId || device.device_code || device.device_id || device.imei || '';
  const clientIdentity = connection.client_id || connection.clientId || connection.clientID || deviceIdentity;
  const gatewayIdentity = connection.gateway_id || connection.gatewayId || connection.gateway_mac || connection.gatewayMac || deviceIdentity;
  const uuid = crypto.randomUUID().toUpperCase();
  return {
    uuid,
    mid: uuid,
    imei: device.imei || deviceIdentity,
    deviceId: deviceIdentity,
    deviceid: deviceIdentity,
    device_id: deviceIdentity,
    device_code: deviceIdentity,
    ClientID: clientIdentity,
    clientId: clientIdentity,
    client_id: clientIdentity,
    gatewayId: gatewayIdentity,
    gateway_id: gatewayIdentity,
    ...additions
  };
};

const renderTemplate = (template, values) => {
  if (Array.isArray(template)) return template.map((item) => renderTemplate(item, values));
  if (template && typeof template === 'object') {
    return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, renderTemplate(value, values)]));
  }
  if (typeof template !== 'string') return template;
  const exact = template.match(/^\{(\w+)\}$/)?.[1];
  if (exact && Object.prototype.hasOwnProperty.call(values, exact)) return values[exact];
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
};

const buildConfiguredJsonCommand = (command, device, currentState, commandConfigValue) => {
  const config = parseObject(commandConfigValue);
  if (config.codec !== 'configured_json' || config.command_format !== 'register_words') {
    throw new Error('协议未启用配置驱动的JSON寄存器命令');
  }
  const parameters = config.parameters || {};
  const provided = Object.entries(parameters).filter(([, item]) =>
    item.command_field && command[item.command_field] !== undefined
  );
  const commands = Array.isArray(config.commands) ? config.commands : [];
  const selected = provided.length > 1
    ? commands.find((item) => item.aggregate === true)
    : commands.find((item) => item.name === command.action);
  if (!selected) throw new Error(`协议未配置控制动作: ${command.action}`);
  const registers = selected.registers || {};
  if (!Object.keys(registers).length) throw new Error(`协议控制动作没有寄存器: ${selected.name}`);
  const encodedRegisters = {};
  const state = {};
  for (const [register, parameterName] of Object.entries(registers)) {
    const parameter = parameters[parameterName];
    if (!parameter) throw new Error(`协议未配置控制参数: ${parameterName}`);
    let raw = command[parameter.command_field];
    if (raw === undefined || raw === null || raw === '') raw = currentState?.[parameter.state_field];
    if ((raw === undefined || raw === null || raw === '') && parameter.default !== undefined) raw = parameter.default;
    if (raw === undefined || raw === null || raw === '') throw new Error(`控制参数缺少值: ${parameterName}`);
    const key = String(raw).trim().toLowerCase();
    const mapped = parameter.values ? parameter.values[key] : raw;
    if (mapped === undefined) throw new Error(`控制参数值不在协议映射中: ${parameterName}`);
    const number = Number(mapped);
    if (!Number.isFinite(number)) throw new Error(`控制参数不是有效数字: ${parameterName}`);
    if (parameter.min !== undefined && number < parameter.min) throw new Error(`控制参数小于协议下限: ${parameterName}`);
    if (parameter.max !== undefined && number > parameter.max) throw new Error(`控制参数大于协议上限: ${parameterName}`);
    const word = Math.round(number * Number(parameter.multiplier ?? 1));
    if (word < 0 || word > 0xffff) throw new Error(`控制参数超出16位寄存器范围: ${parameterName}`);
    encodedRegisters[register] = config.register_value_format === 'number'
      ? word
      : word.toString(16).toUpperCase().padStart(4, '0');
    if (parameter.state_output_field) {
      state[parameter.state_output_field] = parameter.state_output_type === 'boolean'
        ? Boolean(number)
        : raw;
    }
  }
  const values = createTemplateValues(device);
  const topic = renderTemplate(config.topicTemplates?.control || '', values);
  if (!topic) throw new Error('协议未配置控制MQTT主题');
  const payload = renderTemplate(selected.payload || { args: '{registers}' }, {
    ...values,
    registers: encodedRegisters
  });
  return { command_name: selected.name, mqtt_payload: payload, topic, state };
};

const buildConfiguredJsonAutoResponse = (payloadValue, device, commandConfigValue) => {
  const payload = parseObject(payloadValue);
  const commandConfig = parseObject(commandConfigValue);
  if (commandConfig.codec !== 'configured_json') return null;
  const response = (commandConfig.auto_responses || []).find((item) => matchesRule(payload, item.match));
  if (!response) return null;
  const values = createTemplateValues(device, {
    incoming_bid: payload.bid,
    incoming_mid: payload.mid,
    mid: payload.mid || undefined
  });
  if (!values.mid) values.mid = values.uuid;
  return {
    name: response.name,
    topic: renderTemplate(response.topic || commandConfig.topicTemplates?.control || '', values),
    payload: renderTemplate(response.payload || {}, values)
  };
};

module.exports = {
  buildConfiguredJsonAutoResponse,
  buildConfiguredJsonCommand,
  createTemplateValues,
  getValueByPath,
  parseConfiguredRegisterLiteral,
  parseConfiguredJsonUplink,
  renderTemplate
};
