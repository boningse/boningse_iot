/**
 * Modbus 设备自动初始化服务
 * 在服务器启动时自动连接已配置的 Modbus 设备
 */

const { Device, ProtocolConfig } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

class ModbusInitializer {
  constructor(modbusManager) {
    this.modbusManager = modbusManager;
    this.initializationDelay = 5000; // 5秒延迟，等待服务器完全启动
  }

  /**
   * 启动自动初始化
   */
  async start() {
    logger.info('Modbus 设备自动初始化服务启动');

    // 延迟初始化，确保服务器完全启动
    setTimeout(async () => {
      try {
        await this.initializeModbusDevices();
      } catch (error) {
        logger.error('Modbus 设备自动初始化失败:', error);
      }
    }, this.initializationDelay);
  }

  /**
   * 初始化所有 Modbus 设备
   */
  async initializeModbusDevices() {
    try {
      logger.info('开始初始化 Modbus 设备...');

      // 查找所有启用的 Modbus 设备
      const modbusDevices = await this.findModbusDevices();

      if (modbusDevices.length === 0) {
        logger.info('未找到需要初始化的 Modbus 设备');
        return;
      }

      logger.info(`找到 ${modbusDevices.length} 个 Modbus 设备，开始初始化...`);

      // 并发初始化设备（限制并发数）
      const concurrencyLimit = 5;
      const results = await this.initializeDevicesConcurrently(modbusDevices, concurrencyLimit);

      // 统计结果
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      logger.info(`Modbus 设备初始化完成: 成功 ${successful} 个，失败 ${failed} 个`);

      // 记录失败的设备
      const failedDevices = results.filter(r => !r.success);
      if (failedDevices.length > 0) {
        logger.warn('以下设备初始化失败:');
        failedDevices.forEach(result => {
          logger.warn(`- 设备 ${result.device.name} (ID: ${result.device.id}): ${result.error}`);
        });
      }

    } catch (error) {
      logger.error('初始化 Modbus 设备时发生错误:', error);
    }
  }

  /**
   * 查找所有 Modbus 设备
   */
  async findModbusDevices() {
    try {
      const devices = await Device.findAll({
        include: [
          {
            model: ProtocolConfig,
            as: 'protocol_config',
            where: {
              protocol_type: 'modbus',
              status: 'active'
            },
            required: true
          }
        ],
        where: {
          status: {
            [Op.in]: ['active', 'online']
          }
        }
      });

      return devices;
    } catch (error) {
      logger.error('查找 Modbus 设备失败:', error);
      return [];
    }
  }

  /**
   * 并发初始化设备
   * @param {Array} devices - 设备列表
   * @param {number} concurrencyLimit - 并发限制
   */
  async initializeDevicesConcurrently(devices, concurrencyLimit) {
    const results = [];

    // 分批处理
    for (let i = 0; i < devices.length; i += concurrencyLimit) {
      const batch = devices.slice(i, i + concurrencyLimit);

      const batchPromises = batch.map(device => this.initializeDevice(device));
      const batchResults = await Promise.allSettled(batchPromises);

      // 处理批次结果
      batchResults.forEach((result, index) => {
        const device = batch[index];

        if (result.status === 'fulfilled') {
          results.push({
            device,
            success: true,
            result: result.value
          });
        } else {
          results.push({
            device,
            success: false,
            error: result.reason?.message || '未知错误'
          });
        }
      });

      // 批次间延迟，避免过载
      if (i + concurrencyLimit < devices.length) {
        await this.delay(1000); // 1秒延迟
      }
    }

    return results;
  }

  /**
   * 初始化单个设备
   * @param {Object} device - 设备对象
   */
  async initializeDevice(device) {
    try {
      logger.info(`正在初始化设备: ${device.name} (ID: ${device.id})`);

      // 检查设备连接配置
      if (!this.validateDeviceConfig(device)) {
        throw new Error('设备连接配置不完整');
      }

      // 初始化设备
      await this.modbusManager.initializeDevice(device, device.protocol_config);

      logger.info(`设备 ${device.name} 初始化成功`);

      return {
        deviceId: device.id,
        status: 'connected'
      };

    } catch (error) {
      logger.error(`设备 ${device.name} 初始化失败:`, error);
      throw error;
    }
  }

  /**
   * 验证设备配置
   * @param {Object} device - 设备对象
   */
  validateDeviceConfig(device) {
    // 检查协议配置
    if (!device.protocol_config) {
      logger.warn(`设备 ${device.name} 缺少协议配置`);
      return false;
    }

    // 检查 Modbus 配置（修正：使用 modbus_config 而不是 data_parsing_config.modbus）
    const modbusConfig = device.protocol_config.modbus_config;
    if (!modbusConfig) {
      logger.warn(`设备 ${device.name} 缺少 Modbus 协议配置`);
      return false;
    }

    // 对于 Modbus 设备，IP地址不是必需的（可能通过串口连接）
    // 但如果配置了IP地址或连接配置，则进行验证
    if (device.ip_address || device.connection_config?.host) {
      logger.info(`设备 ${device.name} 配置了网络连接`);
    } else {
      logger.info(`设备 ${device.name} 可能使用串口连接`);
    }

    return true;
  }

  /**
   * 延迟函数
   * @param {number} ms - 延迟毫秒数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 重新初始化所有设备
   */
  async reinitializeAll() {
    logger.info('重新初始化所有 Modbus 设备...');

    // 断开所有现有连接
    const connectedDevices = this.modbusManager.getConnectedDevices();
    for (const deviceInfo of connectedDevices) {
      try {
        await this.modbusManager.disconnectDevice(deviceInfo.deviceId);
      } catch (error) {
        logger.warn(`断开设备 ${deviceInfo.deviceId} 连接失败:`, error);
      }
    }

    // 重新初始化
    await this.initializeModbusDevices();
  }

  /**
   * 初始化特定租户的设备
   * @param {number} tenantId - 租户ID
   */
  async initializeTenantDevices(tenantId) {
    try {
      logger.info(`初始化租户 ${tenantId} 的 Modbus 设备...`);

      const devices = await Device.findAll({
        include: [
          {
            model: ProtocolConfig,
            as: 'protocol_config',
            where: {
              [Op.or]: [
                {
                  name: {
                    [Op.iLike]: '%modbus%'
                  }
                },
                {
                  protocol_type: 'modbus'
                }
              ],
              status: 'active'
            },
            required: true
          }
        ],
        where: {
          tenant_id: tenantId,
          status: 'active'
        }
      });

      if (devices.length === 0) {
        logger.info(`租户 ${tenantId} 没有需要初始化的 Modbus 设备`);
        return;
      }

      const results = await this.initializeDevicesConcurrently(devices, 3);

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      logger.info(`租户 ${tenantId} Modbus 设备初始化完成: 成功 ${successful} 个，失败 ${failed} 个`);

    } catch (error) {
      logger.error(`初始化租户 ${tenantId} Modbus 设备失败:`, error);
    }
  }

  /**
   * 获取初始化状态
   */
  getStatus() {
    const connectedDevices = this.modbusManager.getConnectedDevices();

    return {
      total_connected: connectedDevices.length,
      connected_devices: connectedDevices,
      last_initialization: this.lastInitialization || null
    };
  }
}

module.exports = ModbusInitializer;