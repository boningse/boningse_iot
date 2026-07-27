/**
 * Modbus 设备创建示例脚本
 * 演示如何创建和配置 Modbus 设备
 */

const { Device, ProtocolConfig, DeviceType, Manufacturer } = require('../models');
const logger = require('../utils/logger');
require('dotenv').config();

/**
 * 创建示例 Modbus 设备
 */
async function createModbusDeviceExample() {
  try {
    logger.info('开始创建 Modbus 设备示例...');

    // 1. 查找或创建制造商
    const [manufacturer] = await Manufacturer.findOrCreate({
      where: { code: 'METER_001' },
      defaults: {
        name: '智能电表制造商',
        code: 'METER_001',
        description: '专业的智能电表制造商',
        contact_info: {
          website: 'https://example-meter.com',
          email: 'support@example-meter.com',
          phone: '+86-400-123-4567'
        },
        status: 'active'
      }
    });

    logger.info(`制造商创建/查找成功: ${manufacturer.name}`);

    // 2. 查找或创建设备类型
    const [deviceType] = await DeviceType.findOrCreate({
      where: { name: 'smart_meter' },
      defaults: {
        name: 'smart_meter',
        description: '智能电表',
        manufacturer: manufacturer.id,
        model: 'SM-2000',
        protocol: 'modbus',
        data_format: 'modbus_registers',
        command_format: 'modbus_commands',
        capabilities: {
          measurements: ['voltage', 'current', 'power', 'energy'],
          controls: ['reset_energy', 'calibration'],
          communication: ['modbus_tcp', 'modbus_rtu']
        }
      }
    });

    logger.info(`设备类型创建/查找成功: ${deviceType.description}`);

    // 3. 查找 Modbus 协议配置
    const protocolConfig = await ProtocolConfig.findOne({
      where: {
        name: '智能电表 Modbus 协议',
        manufacturer_code: 'METER_001',
        device_type: 'smart_meter'
      }
    });

    if (!protocolConfig) {
      throw new Error('未找到智能电表 Modbus 协议配置，请先运行 SQL 脚本创建协议配置');
    }

    logger.info(`协议配置查找成功: ${protocolConfig.name}`);

    // 4. 创建示例设备
    const devices = [
      {
        name: '1号楼智能电表',
        description: '1号楼主配电室智能电表',
        ip_address: '192.168.1.100',
        connection_config: {
          host: '192.168.1.100',
          port: 502,
          unitId: 1,
          timeout: 5000,
          reconnectInterval: 10000
        },
        location: '1号楼配电室',
        polling_interval: 30000, // 30秒
        auto_connect: true
      },
      {
        name: '2号楼智能电表',
        description: '2号楼主配电室智能电表',
        ip_address: '192.168.1.101',
        connection_config: {
          host: '192.168.1.101',
          port: 502,
          unitId: 1,
          timeout: 5000,
          reconnectInterval: 10000
        },
        location: '2号楼配电室',
        polling_interval: 30000,
        auto_connect: true
      },
      {
        name: '环境监测设备-01',
        description: '办公区环境监测设备',
        ip_address: '192.168.1.200',
        connection_config: {
          host: '192.168.1.200',
          port: 502,
          unitId: 2,
          timeout: 5000,
          reconnectInterval: 10000
        },
        location: '办公区',
        polling_interval: 60000, // 60秒
        auto_connect: true,
        device_type_name: 'environment_sensor',
        protocol_name: '环境监测设备 Modbus 协议',
        manufacturer_code: 'ENV_001'
      }
    ];

    const createdDevices = [];

    for (const deviceData of devices) {
      try {
        // 为环境监测设备查找对应的协议配置
        let currentProtocolConfig = protocolConfig;
        let currentDeviceType = deviceType;
        
        if (deviceData.device_type_name === 'environment_sensor') {
          // 查找环境监测设备的协议配置
          currentProtocolConfig = await ProtocolConfig.findOne({
            where: {
              name: deviceData.protocol_name,
              manufacturer_code: deviceData.manufacturer_code,
              device_type: deviceData.device_type_name
            }
          });

          if (!currentProtocolConfig) {
            logger.warn(`未找到环境监测设备协议配置，跳过设备: ${deviceData.name}`);
            continue;
          }

          // 查找或创建环境监测设备类型
          [currentDeviceType] = await DeviceType.findOrCreate({
            where: { name: deviceData.device_type_name },
            defaults: {
              name: deviceData.device_type_name,
              description: '环境监测设备',
              manufacturer: manufacturer.id,
              model: 'ENV-2000',
              protocol: 'modbus',
              data_format: 'modbus_registers',
              command_format: 'modbus_commands',
              capabilities: {
                measurements: ['temperature', 'humidity', 'pm25', 'pm10', 'co2'],
                controls: ['calibrate_sensor', 'set_sampling_interval'],
                communication: ['modbus_tcp']
              }
            }
          });
        }

        // 检查设备是否已存在
        const existingDevice = await Device.findOne({
          where: {
            name: deviceData.name,
            tenant_id: 1 // 默认租户
          }
        });

        if (existingDevice) {
          logger.info(`设备 ${deviceData.name} 已存在，跳过创建`);
          createdDevices.push(existingDevice);
          continue;
        }

        // 创建设备
        const device = await Device.create({
          name: deviceData.name,
          description: deviceData.description,
          device_type_id: currentDeviceType.id,
          protocol_config_id: currentProtocolConfig.id,
          manufacturer_id: manufacturer.id,
          model: currentDeviceType.model,
          serial_number: `SN${Date.now()}${Math.floor(Math.random() * 1000)}`,
          ip_address: deviceData.ip_address,
          mac_address: null,
          location: deviceData.location,
          status: 'active',
          connection_config: deviceData.connection_config,
          polling_interval: deviceData.polling_interval,
          auto_connect: deviceData.auto_connect,
          tenant_id: 1, // 默认租户
          created_by: 1 // 默认用户
        });

        createdDevices.push(device);
        logger.info(`设备创建成功: ${device.name} (ID: ${device.id})`);

      } catch (deviceError) {
        logger.error(`创建设备 ${deviceData.name} 失败:`, deviceError);
      }
    }

    logger.info(`\n=== Modbus 设备创建完成 ===`);
    logger.info(`成功创建 ${createdDevices.length} 个设备:`);
    
    createdDevices.forEach(device => {
      logger.info(`- ${device.name} (ID: ${device.id}, IP: ${device.ip_address})`);
    });

    logger.info(`\n=== 使用说明 ===`);
    logger.info('1. 启动后端服务器');
    logger.info('2. 使用以下 API 连接设备:');
    createdDevices.forEach(device => {
      logger.info(`   POST /api/modbus/devices/${device.id}/connect`);
    });
    logger.info('3. 读取设备数据:');
    createdDevices.forEach(device => {
      logger.info(`   POST /api/modbus/devices/${device.id}/read`);
    });
    logger.info('4. 执行设备命令:');
    logger.info('   POST /api/modbus/devices/{deviceId}/command');
    logger.info('   Body: { "command_name": "reset_energy", "value": 1 }');

    return createdDevices;

  } catch (error) {
    logger.error('创建 Modbus 设备示例失败:', error);
    throw error;
  }
}

/**
 * 删除示例设备
 */
async function deleteModbusDeviceExample() {
  try {
    logger.info('开始删除 Modbus 设备示例...');

    const deviceNames = [
      '1号楼智能电表',
      '2号楼智能电表',
      '环境监测设备-01'
    ];

    for (const deviceName of deviceNames) {
      const device = await Device.findOne({
        where: {
          name: deviceName,
          tenant_id: 1
        }
      });

      if (device) {
        await device.destroy();
        logger.info(`设备删除成功: ${deviceName}`);
      } else {
        logger.info(`设备不存在: ${deviceName}`);
      }
    }

    logger.info('Modbus 设备示例删除完成');

  } catch (error) {
    logger.error('删除 Modbus 设备示例失败:', error);
    throw error;
  }
}

/**
 * 显示设备连接测试命令
 */
function showTestCommands() {
  logger.info(`\n=== Modbus 设备测试命令 ===`);
  logger.info('1. 测试连接:');
  logger.info('curl -X POST http://localhost:3003/api/modbus/test-connection \\');
  logger.info('  -H "Content-Type: application/json" \\');
  logger.info('  -H "Authorization: Bearer YOUR_TOKEN" \\');
  logger.info('  -d \'{ "host": "192.168.1.100", "port": 502, "unitId": 1 }\'');
  
  logger.info('\n2. 获取设备列表:');
  logger.info('curl -X GET http://localhost:3003/api/modbus/devices \\');
  logger.info('  -H "Authorization: Bearer YOUR_TOKEN"');
  
  logger.info('\n3. 连接设备:');
  logger.info('curl -X POST http://localhost:3003/api/modbus/devices/{deviceId}/connect \\');
  logger.info('  -H "Authorization: Bearer YOUR_TOKEN"');
  
  logger.info('\n4. 读取数据:');
  logger.info('curl -X POST http://localhost:3003/api/modbus/devices/{deviceId}/read \\');
  logger.info('  -H "Authorization: Bearer YOUR_TOKEN"');
  
  logger.info('\n5. 执行命令:');
  logger.info('curl -X POST http://localhost:3003/api/modbus/devices/{deviceId}/command \\');
  logger.info('  -H "Content-Type: application/json" \\');
  logger.info('  -H "Authorization: Bearer YOUR_TOKEN" \\');
  logger.info('  -d \'{ "command_name": "reset_energy", "value": 1 }\'');
}

// 命令行参数处理
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'create':
      createModbusDeviceExample()
        .then(() => {
          showTestCommands();
          process.exit(0);
        })
        .catch(error => {
          logger.error('脚本执行失败:', error);
          process.exit(1);
        });
      break;
      
    case 'delete':
      deleteModbusDeviceExample()
        .then(() => {
          process.exit(0);
        })
        .catch(error => {
          logger.error('脚本执行失败:', error);
          process.exit(1);
        });
      break;
      
    case 'test':
      showTestCommands();
      process.exit(0);
      break;
      
    default:
      logger.info('使用方法:');
      logger.info('  node createModbusDeviceExample.js create   # 创建示例设备');
      logger.info('  node createModbusDeviceExample.js delete   # 删除示例设备');
      logger.info('  node createModbusDeviceExample.js test     # 显示测试命令');
      process.exit(1);
  }
}

module.exports = {
  createModbusDeviceExample,
  deleteModbusDeviceExample,
  showTestCommands
};