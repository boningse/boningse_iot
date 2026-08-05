const mqttService = require('./mqttService');
const telemetryStore = require('./telemetryStore');
const db = require('../utils/database');
const { buildConfiguredCommand } = require('../utils/configuredModbusProtocol');

const executeAirConditionerControl = async (device, command, userId = null) => {
  let mqttCommand = command;
  let encodedCommand = null;
  let protocolName = null;

  if (device.protocol_config_id) {
    const protocolResult = await db.query(
      'SELECT name, command_config FROM protocol_configs WHERE id = $1 AND status = $2 LIMIT 1',
      [device.protocol_config_id, 'active']
    );
    const protocol = protocolResult.rows[0];
    const commandConfig = protocol?.command_config;
    if (commandConfig?.codec === 'configured_modbus_rtu') {
      encodedCommand = buildConfiguredCommand(command, device, commandConfig);
      mqttCommand = encodedCommand.mqtt_payload;
      protocolName = protocol.name;
    }
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
        ? { protocol: protocolName, command_name: encodedCommand.command_name, hex: encodedCommand.hex, mqtt_payload: mqttCommand }
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
      ...(encodedCommand ? { protocol: protocolName, command_name: encodedCommand.command_name, hex: encodedCommand.hex } : {})
    }
  });
  await telemetryStore.logControl({
    device,
    moduleType: 'air_conditioner',
    action: command.action || 'air_conditioner_control',
    command,
    encodedPayload: encodedCommand
      ? { protocol: protocolName, command_name: encodedCommand.command_name, hex: encodedCommand.hex, mqtt_payload: mqttCommand }
      : mqttCommand,
    status: 'sent',
    userId
  });

  return encodedCommand;
};

module.exports = {
  executeAirConditionerControl
};
