const mqttService = require('./mqttService');
const telemetryStore = require('./telemetryStore');

const parseJsonField = (value) => {
  if (!value || typeof value === 'object') return value || {};
  try {
    return JSON.parse(value);
  } catch (_) {
    return {};
  }
};

const renderTopic = (template, device) => {
  const connectionConfig = parseJsonField(device.connection_config);
  const corp = device.manufacturer_code || '';
  const gatewayMac = connectionConfig.gatewayMac || connectionConfig.gateway_mac || device.imei;
  return template
    .replace(/\{corp\}/g, corp)
    .replace(/\{manufacturerCode\}/g, corp)
    .replace(/\{gatewayMac\}/g, gatewayMac)
    .replace(/\{imei\}/g, device.imei || '')
    .replace(/\{deviceId\}/g, device.device_code || device.imei || '');
};

const renderPayload = (payloadTemplate, values) => {
  if (Array.isArray(payloadTemplate)) {
    return payloadTemplate.map((item) => renderPayload(item, values));
  }
  if (payloadTemplate && typeof payloadTemplate === 'object') {
    return Object.entries(payloadTemplate).reduce((payload, [key, value]) => {
      payload[key] = renderPayload(value, values);
      return payload;
    }, {});
  }
  if (typeof payloadTemplate !== 'string') return payloadTemplate;
  const exactKey = payloadTemplate.match(/^\{(\w+)\}$/)?.[1];
  if (exactKey && Object.prototype.hasOwnProperty.call(values, exactKey)) {
    return values[exactKey];
  }
  return payloadTemplate.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
};

const buildProtocolControlMessages = (device, controlData) => {
  const commandConfig = parseJsonField(device.command_config);
  const commands = Array.isArray(commandConfig.commands) ? commandConfig.commands : [];
  if (!commands.length) return [];
  const topicTemplate = commandConfig.topicTemplates?.control ||
    '{corp}/json/IoT/GW/V200/{gatewayMac}/down/json/CB';
  const nextId = () => Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9));
  const buildMessage = (command, values) => ({
    topic: renderTopic(command.topic || topicTemplate, device),
    payload: renderPayload(command.payload || {}, values)
  });

  if (controlData.type === 'statistic') {
    const command = commands.find((item) => item.name === 'read_status');
    return command ? [buildMessage(command, { id: nextId(), addr: controlData.addr || 1 })] : [];
  }

  if (controlData.power_status === undefined) return [];
  const value = Number(Boolean(controlData.power_status));
  const command = commands.find((item) => item.name === (value ? 'turn_on' : 'turn_off'));
  return command ? [buildMessage(command, {
    id: nextId(),
    addr: controlData.addr || 1,
    value,
    state: value,
    power_status: value
  })] : [];
};

const executeSwitchControl = async (device, controlData, userId = null) => {
  const protocolMessages = buildProtocolControlMessages(device, controlData);
  try {
    if (protocolMessages.length) {
      for (const message of protocolMessages) {
        await mqttService.sendCommandToDevice(device.imei, message.payload, {
          mqttTopic: message.topic
        });
      }
    } else {
      await mqttService.sendCommandToDevice(device.imei, controlData);
    }
    await telemetryStore.logControl({
      device,
      moduleType: 'switch',
      action: controlData.type || 'switch_control',
      command: controlData,
      encodedPayload: protocolMessages,
      status: 'sent',
      userId
    });
    return protocolMessages;
  } catch (error) {
    await telemetryStore.logControl({
      device,
      moduleType: 'switch',
      action: controlData.type || 'switch_control',
      command: controlData,
      encodedPayload: protocolMessages,
      status: 'failed',
      errorMessage: error.message,
      userId
    });
    throw error;
  }
};

module.exports = {
  executeSwitchControl
};
