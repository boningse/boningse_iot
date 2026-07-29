const mqttService = require('./mqttService');
const telemetryStore = require('./telemetryStore');
const { buildDa51kdCommand } = require('../utils/da51kdProtocol');

const executeAirConditionerControl = async (device, command, userId = null) => {
  const isDa51kd = String(device.manufacturer_code || '').trim().toUpperCase() === 'DA51KD';
  let mqttCommand = command;
  let encodedCommand = null;

  if (isDa51kd) {
    encodedCommand = buildDa51kdCommand(command, device);
    mqttCommand = { data: encodedCommand.base64 };
  }

  try {
    await mqttService.sendCommandToDevice(device.imei, mqttCommand);
  } catch (error) {
    await telemetryStore.logControl({
      device,
      moduleType: 'air_conditioner',
      action: command.action || 'air_conditioner_control',
      command,
      encodedPayload: encodedCommand
        ? { protocol: 'DA51KD', hex: encodedCommand.hex, mqtt_payload: mqttCommand }
        : mqttCommand,
      status: 'failed',
      errorMessage: error.message,
      userId
    });
    throw error;
  }

  const status = {
    power_status: device.power_status,
    mode: device.mode,
    fan_speed: device.fan_speed,
    target_temperature: device.target_temperature,
    current_temperature: device.current_temperature,
    humidity: device.humidity,
    online: true,
    ...(encodedCommand ? encodedCommand.state : {})
  };
  if (!encodedCommand && (command.action === 'set_power' || command.power_state !== undefined)) {
    status.power_status = Boolean(Number(command.power_state));
  }
  if (!encodedCommand && (command.action === 'set_mode' || command.mode !== undefined)) {
    status.mode = command.mode;
  }
  if (!encodedCommand && (command.action === 'set_fan_speed' || command.fan_speed !== undefined)) {
    status.fan_speed = command.fan_speed;
  }
  if (!encodedCommand && (command.action === 'set_temperature' || command.target_temperature !== undefined)) {
    status.target_temperature = command.target_temperature;
  }

  await telemetryStore.saveStatus({
    device,
    moduleType: 'air_conditioner',
    state: status,
    source: 'control_command',
    rawPayload: {
      command,
      ...(encodedCommand ? { protocol: 'DA51KD', hex: encodedCommand.hex } : {})
    }
  });
  await telemetryStore.logControl({
    device,
    moduleType: 'air_conditioner',
    action: command.action || 'air_conditioner_control',
    command,
    encodedPayload: encodedCommand
      ? { protocol: 'DA51KD', hex: encodedCommand.hex, mqtt_payload: mqttCommand }
      : mqttCommand,
    status: 'sent',
    userId
  });

  return encodedCommand;
};

module.exports = {
  executeAirConditionerControl
};
