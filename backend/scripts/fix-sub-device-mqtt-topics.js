const { Op } = require('sequelize');
const { Device, sequelize } = require('../models');

const replaceIdentity = (value, childIdentities, parentIdentity) => {
  if (typeof value === 'string') {
    return childIdentities.reduce(
      (result, identity) => result.split(identity).join(parentIdentity),
      value
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceIdentity(item, childIdentities, parentIdentity));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceIdentity(item, childIdentities, parentIdentity)
      ])
    );
  }
  return value;
};

const run = async () => {
  const applyChanges = process.argv.includes('--apply');
  const devices = await Device.findAll({
    where: {
      device_category: 'sub_device',
      parent_device_id: { [Op.ne]: null }
    },
    include: [{
      model: Device,
      as: 'parent_device',
      attributes: ['id', 'name', 'device_id', 'imei'],
      required: true
    }]
  });

  let changed = 0;
  for (const device of devices) {
    const parentIdentity = device.parent_device.imei || device.parent_device.device_id;
    const childIdentities = [device.device_id, device.imei]
      .filter((value, index, values) => value && values.indexOf(value) === index)
      .sort((left, right) => right.length - left.length);
    const currentConfig = device.mqtt_config || {};
    const nextConfig = replaceIdentity(currentConfig, childIdentities, parentIdentity);

    if (JSON.stringify(currentConfig) === JSON.stringify(nextConfig)) continue;
    changed += 1;
    console.log(`${applyChanges ? '更新' : '待更新'}: ${device.name} -> ${parentIdentity}`);
    if (applyChanges) await device.update({ mqtt_config: nextConfig });
  }

  console.log(`扫描 ${devices.length} 个子设备，${applyChanges ? '已更新' : '需要更新'} ${changed} 个`);
};

run()
  .then(() => sequelize.close())
  .catch(async (error) => {
    console.error('修正子设备 MQTT 主题失败:', error);
    await sequelize.close();
    process.exit(1);
  });
