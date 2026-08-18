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

const convertValue = (rawValue, field) => {
  let value = rawValue;
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
      const numeric = Number(value);
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
  const payload = parseObject(payloadValue);
  const config = parseObject(configValue);
  if (config.codec !== 'configured_json') return { matched: false, data: {} };
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
  createTemplateValues,
  getValueByPath,
  parseConfiguredJsonUplink,
  renderTemplate
};
