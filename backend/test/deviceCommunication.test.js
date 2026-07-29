const mqttService = require('../services/mqttService');
const mqttConfigService = require('../services/mqttConfigService');
const { normalizeDeviceLogEntry } = require('../utils/deviceLog');

const parentDevice = {
  id: 'parent-uuid',
  device_id: '864865087899689',
  imei: '864865087899689'
};

const childDevice = {
  id: 'child-uuid',
  device_id: '864865087899689-01',
  imei: '864865087899689-01',
  device_category: 'sub_device',
  parent_device: parentDevice,
  manufacturer_code: 'BNWKQ',
  manufacturer: {
    code: 'BNWKQ',
    subscription_type: 'imei_middle',
    mqtt_config: {}
  },
  mqtt_config: {
    subscribe_topics: [{
      topic: 'zhhl/BNWKQ/864865087899689-01/subscribe',
      description: '命令'
    }]
  }
};

describe('device communication routing', () => {
  test('uses the parent identity for a child device command topic', () => {
    expect(mqttService.buildCommandTopic(childDevice))
      .toBe('zhhl/BNWKQ/864865087899689/subscribe');
  });

  test('builds child MQTT configuration from the parent identity', () => {
    const config = mqttConfigService.buildDeviceConfig({
      ...childDevice,
      mqtt_config: {}
    });

    expect(config.subscribe_topics[0].topic)
      .toBe('zhhl/BNWKQ/864865087899689/subscribe');
    expect(config.publish_topics[0].topic)
      .toBe('zhhl/BNWKQ/864865087899689/publish');
  });

  test('stores routine MQTT records as debug logs', () => {
    expect(normalizeDeviceLogEntry({
      level: 'info',
      message: '接收到设备数据',
      data: { source: 'mqtt' }
    })).toEqual(expect.objectContaining({ level: 'debug' }));

    expect(normalizeDeviceLogEntry({
      level: 'warning',
      message: '设备离线',
      data: { source: 'mqtt' }
    })).toEqual(expect.objectContaining({ level: 'warning' }));
  });
});
