const logger = require('../utils/logger');
const { Device, DeviceData, ElectricMeter, ProtocolConfig } = require('../models');
const WebSocketService = require('./websocketService');

class ElectricMeterDataService {
  constructor() {
    this.dataProcessors = new Map();
    this.initializeDataProcessors();
  }

  /**
   * 初始化数据处理器
   */
  initializeDataProcessors() {
    // 单相电表数据处理器
    this.dataProcessors.set('single_phase', this.processSinglePhaseData.bind(this));
    
    // 三相电表数据处理器
    this.dataProcessors.set('three_phase', this.processThreePhaseData.bind(this));
    
    // 智能电表数据处理器
    this.dataProcessors.set('smart_meter', this.processSmartMeterData.bind(this));
  }

  /**
   * 处理电表数据
   */
  async processElectricMeterData(electricMeter, modbusData) {
    try {
      if (!electricMeter || !modbusData) {
        logger.warn('电表或数据为空');
        return;
      }

      // 获取协议配置
      const protocolConfig = await this.getProtocolConfig(electricMeter.protocol_config_id);
      if (!protocolConfig) {
        logger.warn(`未找到协议配置: ${electricMeter.protocol_config_id}`);
        return;
      }

      // 根据电表类型选择处理器
      const processor = this.dataProcessors.get(electricMeter.meter_type || 'single_phase');
      if (!processor) {
        logger.warn(`未找到数据处理器: ${electricMeter.meter_type}`);
        return;
      }

      // 处理数据
      const parsedData = await processor(modbusData, protocolConfig);
      if (!parsedData) {
        logger.warn('数据解析失败');
        return;
      }

      // 存储数据
      await this.storeElectricMeterData(electricMeter, parsedData, modbusData.timestamp);

      // 实时推送
      await this.broadcastElectricMeterData(electricMeter, parsedData);

      logger.debug(`电表数据处理完成: ${electricMeter.Device?.name || electricMeter.id}`);

    } catch (error) {
      logger.error('处理电表数据失败:', error);
    }
  }

  /**
   * 获取协议配置
   */
  async getProtocolConfig(protocolConfigId) {
    try {
      if (!protocolConfigId) {
        return null;
      }

      return await ProtocolConfig.findByPk(protocolConfigId);
    } catch (error) {
      logger.error('获取协议配置失败:', error);
      return null;
    }
  }

  /**
   * 处理单相电表数据
   */
  async processSinglePhaseData(modbusData, protocolConfig) {
    try {
      const { registers, start_address } = modbusData;
      const config = protocolConfig.config || {};
      
      const parsedData = {
        voltage: this.parseRegisterValue(registers, config.voltage_address - start_address, config.voltage_scale || 0.1),
        current: this.parseRegisterValue(registers, config.current_address - start_address, config.current_scale || 0.001),
        power: this.parseRegisterValue(registers, config.power_address - start_address, config.power_scale || 0.1),
        energy: this.parseRegisterValue(registers, config.energy_address - start_address, config.energy_scale || 0.01),
        frequency: this.parseRegisterValue(registers, config.frequency_address - start_address, config.frequency_scale || 0.01),
        power_factor: this.parseRegisterValue(registers, config.power_factor_address - start_address, config.power_factor_scale || 0.001)
      };

      // 过滤掉无效值
      Object.keys(parsedData).forEach(key => {
        if (parsedData[key] === null || parsedData[key] === undefined) {
          delete parsedData[key];
        }
      });

      return parsedData;
    } catch (error) {
      logger.error('处理单相电表数据失败:', error);
      return null;
    }
  }

  /**
   * 处理三相电表数据
   */
  async processThreePhaseData(modbusData, protocolConfig) {
    try {
      const { registers, start_address } = modbusData;
      const config = protocolConfig.config || {};
      
      const parsedData = {
        // A相数据
        voltage_a: this.parseRegisterValue(registers, config.voltage_a_address - start_address, config.voltage_scale || 0.1),
        current_a: this.parseRegisterValue(registers, config.current_a_address - start_address, config.current_scale || 0.001),
        power_a: this.parseRegisterValue(registers, config.power_a_address - start_address, config.power_scale || 0.1),
        
        // B相数据
        voltage_b: this.parseRegisterValue(registers, config.voltage_b_address - start_address, config.voltage_scale || 0.1),
        current_b: this.parseRegisterValue(registers, config.current_b_address - start_address, config.current_scale || 0.001),
        power_b: this.parseRegisterValue(registers, config.power_b_address - start_address, config.power_scale || 0.1),
        
        // C相数据
        voltage_c: this.parseRegisterValue(registers, config.voltage_c_address - start_address, config.voltage_scale || 0.1),
        current_c: this.parseRegisterValue(registers, config.current_c_address - start_address, config.current_scale || 0.001),
        power_c: this.parseRegisterValue(registers, config.power_c_address - start_address, config.power_scale || 0.1),
        
        // 总数据
        total_power: this.parseRegisterValue(registers, config.total_power_address - start_address, config.power_scale || 0.1),
        total_energy: this.parseRegisterValue(registers, config.total_energy_address - start_address, config.energy_scale || 0.01),
        frequency: this.parseRegisterValue(registers, config.frequency_address - start_address, config.frequency_scale || 0.01),
        power_factor: this.parseRegisterValue(registers, config.power_factor_address - start_address, config.power_factor_scale || 0.001)
      };

      // 过滤掉无效值
      Object.keys(parsedData).forEach(key => {
        if (parsedData[key] === null || parsedData[key] === undefined) {
          delete parsedData[key];
        }
      });

      return parsedData;
    } catch (error) {
      logger.error('处理三相电表数据失败:', error);
      return null;
    }
  }

  /**
   * 处理智能电表数据
   */
  async processSmartMeterData(modbusData, protocolConfig) {
    try {
      const { registers, start_address } = modbusData;
      const config = protocolConfig.config || {};
      
      const parsedData = {
        // 基础电量数据
        voltage: this.parseRegisterValue(registers, config.voltage_address - start_address, config.voltage_scale || 0.1),
        current: this.parseRegisterValue(registers, config.current_address - start_address, config.current_scale || 0.001),
        power: this.parseRegisterValue(registers, config.power_address - start_address, config.power_scale || 0.1),
        energy: this.parseRegisterValue(registers, config.energy_address - start_address, config.energy_scale || 0.01),
        
        // 扩展数据
        reactive_power: this.parseRegisterValue(registers, config.reactive_power_address - start_address, config.power_scale || 0.1),
        apparent_power: this.parseRegisterValue(registers, config.apparent_power_address - start_address, config.power_scale || 0.1),
        frequency: this.parseRegisterValue(registers, config.frequency_address - start_address, config.frequency_scale || 0.01),
        power_factor: this.parseRegisterValue(registers, config.power_factor_address - start_address, config.power_factor_scale || 0.001),
        
        // 电能质量数据
        thd_voltage: this.parseRegisterValue(registers, config.thd_voltage_address - start_address, config.thd_scale || 0.01),
        thd_current: this.parseRegisterValue(registers, config.thd_current_address - start_address, config.thd_scale || 0.01),
        
        // 状态信息
        meter_status: this.parseRegisterValue(registers, config.status_address - start_address, 1),
        alarm_status: this.parseRegisterValue(registers, config.alarm_address - start_address, 1)
      };

      // 过滤掉无效值
      Object.keys(parsedData).forEach(key => {
        if (parsedData[key] === null || parsedData[key] === undefined) {
          delete parsedData[key];
        }
      });

      return parsedData;
    } catch (error) {
      logger.error('处理智能电表数据失败:', error);
      return null;
    }
  }

  /**
   * 解析寄存器值
   */
  parseRegisterValue(registers, index, scale = 1) {
    try {
      if (!registers || index < 0 || index >= registers.length) {
        return null;
      }

      const rawValue = registers[index];
      if (rawValue === null || rawValue === undefined) {
        return null;
      }

      return rawValue * scale;
    } catch (error) {
      logger.error('解析寄存器值失败:', error);
      return null;
    }
  }

  /**
   * 存储电表数据
   */
  async storeElectricMeterData(electricMeter, parsedData, timestamp) {
    try {
      // 确保timestamp是有效的
      let validTimestamp;
      if (timestamp) {
        const parsedTimestamp = new Date(timestamp);
        if (isNaN(parsedTimestamp.getTime())) {
          logger.warn(`存储电表数据时发现无效的timestamp: ${timestamp}，使用当前时间`);
          validTimestamp = new Date();
        } else {
          validTimestamp = parsedTimestamp;
        }
      } else {
        validTimestamp = new Date();
      }
      
      const deviceData = {
        device_id: electricMeter.Device?.id || electricMeter.device_id,
        data_type: 'electric_meter',
        payload: {
          meter_address: electricMeter.meter_address,
          meter_type: electricMeter.meter_type,
          data: parsedData
        },
        quality: this.calculateDataQuality(parsedData),
        timestamp: validTimestamp,
        received_at: new Date()
      };

      await DeviceData.create(deviceData);
      logger.debug(`电表数据已存储: ${electricMeter.Device?.name || electricMeter.id}`);
    } catch (error) {
      logger.error('存储电表数据失败:', error);
    }
  }

  /**
   * 计算数据质量
   */
  calculateDataQuality(parsedData) {
    try {
      const totalFields = Object.keys(parsedData).length;
      const validFields = Object.values(parsedData).filter(value => 
        value !== null && value !== undefined && !isNaN(value)
      ).length;

      return totalFields > 0 ? Math.round((validFields / totalFields) * 100) : 0;
    } catch (error) {
      logger.error('计算数据质量失败:', error);
      return 50; // 默认质量
    }
  }

  /**
   * 实时推送电表数据
   */
  async broadcastElectricMeterData(electricMeter, parsedData) {
    try {
      const message = {
        type: 'electric_meter_data',
        device_id: electricMeter.Device?.id || electricMeter.device_id,
        device_name: electricMeter.Device?.name || `电表${electricMeter.meter_address}`,
        meter_address: electricMeter.meter_address,
        meter_type: electricMeter.meter_type,
        data: parsedData,
        timestamp: Date.now()
      };

      // 推送到设备相关的房间
      const deviceId = electricMeter.Device?.id || electricMeter.device_id;
      WebSocketService.broadcastToRoom(`device_${deviceId}`, 'device_data', message);
      
      // 推送到租户房间
      if (electricMeter.Device?.tenant_id) {
        WebSocketService.broadcastToRoom(`tenant_${electricMeter.Device.tenant_id}`, 'device_data', message);
      }

      logger.debug(`电表数据已推送: ${electricMeter.Device?.name || electricMeter.id}`);
    } catch (error) {
      logger.error('推送电表数据失败:', error);
    }
  }

  /**
   * 获取电表历史数据
   */
  async getElectricMeterHistory(electricMeterId, startTime, endTime, limit = 1000) {
    try {
      const electricMeter = await ElectricMeter.findByPk(electricMeterId, {
        include: [{ model: Device, as: 'Device' }]
      });

      if (!electricMeter) {
        throw new Error('电表不存在');
      }

      const deviceData = await DeviceData.findAll({
        where: {
          device_id: electricMeter.Device.id,
          data_type: 'electric_meter',
          timestamp: {
            [require('sequelize').Op.between]: [startTime, endTime]
          }
        },
        order: [['timestamp', 'DESC']],
        limit: limit
      });

      return deviceData.map(data => ({
        timestamp: data.timestamp,
        data: data.payload.data,
        quality: data.quality
      }));
    } catch (error) {
      logger.error('获取电表历史数据失败:', error);
      throw error;
    }
  }

  /**
   * 获取电表实时数据
   */
  async getElectricMeterRealTimeData(electricMeterId) {
    try {
      const electricMeter = await ElectricMeter.findByPk(electricMeterId, {
        include: [{ model: Device, as: 'Device' }]
      });

      if (!electricMeter) {
        throw new Error('电表不存在');
      }

      const latestData = await DeviceData.findOne({
        where: {
          device_id: electricMeter.Device.id,
          data_type: 'electric_meter'
        },
        order: [['timestamp', 'DESC']]
      });

      return latestData ? {
        timestamp: latestData.timestamp,
        data: latestData.payload.data,
        quality: latestData.quality
      } : null;
    } catch (error) {
      logger.error('获取电表实时数据失败:', error);
      throw error;
    }
  }

  /**
   * 获取电表通信状态
   */
  async getElectricMeterCommunicationStatus(electricMeterId) {
    try {
      const electricMeter = await ElectricMeter.findByPk(electricMeterId, {
        include: [{ model: Device, as: 'Device' }]
      });

      if (!electricMeter) {
        throw new Error('电表不存在');
      }

      const deviceId = electricMeter.Device.id;
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // 使用租户电表数据服务查询数据
      const tenantElectricMeterDataService = require('./tenantElectricMeterDataService');
      const tenantCode = '370282'; // 固定租户代码

      // 获取最近的数据记录
      const latestDataList = await tenantElectricMeterDataService.queryMeterData(tenantCode, {
        electricMeterId: electricMeterId,
        limit: 1,
        orderBy: 'collection_timestamp',
        orderDirection: 'DESC'
      });

      const latestData = latestDataList.length > 0 ? latestDataList[0] : null;

      // 计算最后通信时间
      const lastCommunicationTime = latestData ? latestData.collection_timestamp : null;
      const timeSinceLastCommunication = lastCommunicationTime ? 
        Math.floor((now - new Date(lastCommunicationTime)) / 1000) : null;

      // 判断通信状态
      let communicationStatus = 'offline';
      if (timeSinceLastCommunication !== null) {
        if (timeSinceLastCommunication < 300) { // 5分钟内
          communicationStatus = 'online';
        } else if (timeSinceLastCommunication < 1800) { // 30分钟内
          communicationStatus = 'unstable';
        } else {
          communicationStatus = 'offline';
        }
      }

      // 获取最近1小时的数据统计
      const recentDataStats = await tenantElectricMeterDataService.getMeterDataStats(tenantCode, {
        electricMeterId: electricMeterId,
        startTime: oneHourAgo
      });

      // 获取最近24小时的数据统计
      const dailyDataStats = await tenantElectricMeterDataService.getMeterDataStats(tenantCode, {
        electricMeterId: electricMeterId,
        startTime: oneDayAgo
      });

      // 由于电表数据表没有quality字段，设置默认值
      const avgQuality = 100; // 默认数据质量为100%
      const minQuality = 100;
      const maxQuality = 100;

      return {
        electricMeterId,
        deviceId,
        deviceName: electricMeter.Device.name,
        deviceStatus: electricMeter.Device.status,
        communicationStatus,
        lastCommunicationTime,
        timeSinceLastCommunication,
        dataStats: {
          recentHourCount: recentDataStats.count,
          dailyCount: dailyDataStats.count,
          avgQuality,
          minQuality,
          maxQuality
        },
        timestamp: now
      };
    } catch (error) {
      logger.error('获取电表通信状态失败:', error);
      throw error;
    }
  }

  /**
   * 获取电表数据传输统计
   */
  async getElectricMeterTransmissionStats(electricMeterId, period = '24h') {
    try {
      const electricMeter = await ElectricMeter.findByPk(electricMeterId, {
        include: [{ model: Device, as: 'Device' }]
      });

      if (!electricMeter) {
        throw new Error('电表不存在');
      }

      const deviceId = electricMeter.Device.id;
      const now = new Date();
      
      // 根据period计算时间范围
      let startTime;
      let timeUnit;
      let groupFormat;
      
      switch (period) {
        case '1h':
          startTime = new Date(now.getTime() - 60 * 60 * 1000);
          timeUnit = 'minute';
          groupFormat = 'YYYY-MM-DD HH24:MI:00';
          break;
        case '24h':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          timeUnit = 'hour';
          groupFormat = 'YYYY-MM-DD HH24:00:00';
          break;
        case '7d':
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          timeUnit = 'day';
          groupFormat = 'YYYY-MM-DD 00:00:00';
          break;
        case '30d':
          startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          timeUnit = 'day';
          groupFormat = 'YYYY-MM-DD 00:00:00';
          break;
        default:
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          timeUnit = 'hour';
          groupFormat = 'YYYY-MM-DD HH24:00:00';
      }

      // 使用租户电表数据服务查询数据
      const tenantElectricMeterDataService = require('./tenantElectricMeterDataService');
      const tenantCode = '370282'; // 固定租户代码

      // 获取总体统计
      const totalStats = await tenantElectricMeterDataService.getMeterDataStats(tenantCode, {
        electricMeterId: electricMeterId,
        startTime: startTime
      });

      // 获取时间段内的详细数据用于分组统计
      const detailData = await tenantElectricMeterDataService.queryMeterData(tenantCode, {
        electricMeterId: electricMeterId,
        startTime: startTime,
        limit: 10000, // 设置较大的限制以获取所有数据
        orderBy: 'collection_timestamp',
        orderDirection: 'ASC'
      });

      // 按时间分组统计数据
      const groupedData = new Map();
      detailData.forEach(item => {
        const timestamp = new Date(item.collection_timestamp);
        let groupKey;
        
        switch (period) {
          case '1h':
            groupKey = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} ${String(timestamp.getHours()).padStart(2, '0')}:${String(Math.floor(timestamp.getMinutes() / 10) * 10).padStart(2, '0')}:00`;
            break;
          case '24h':
            groupKey = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} ${String(timestamp.getHours()).padStart(2, '0')}:00:00`;
            break;
          case '7d':
          case '30d':
            groupKey = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} 00:00:00`;
            break;
          default:
            groupKey = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} ${String(timestamp.getHours()).padStart(2, '0')}:00:00`;
        }
        
        if (!groupedData.has(groupKey)) {
          groupedData.set(groupKey, {
            time: groupKey,
            dataCount: 0,
            avgQuality: 100, // 默认质量
            firstTimestamp: item.collection_timestamp,
            lastTimestamp: item.collection_timestamp
          });
        }
        
        const group = groupedData.get(groupKey);
        group.dataCount++;
        if (new Date(item.collection_timestamp) < new Date(group.firstTimestamp)) {
          group.firstTimestamp = item.collection_timestamp;
        }
        if (new Date(item.collection_timestamp) > new Date(group.lastTimestamp)) {
          group.lastTimestamp = item.collection_timestamp;
        }
      });

      // 转换为数组并排序
      const formattedData = Array.from(groupedData.values()).sort((a, b) => 
        new Date(a.time) - new Date(b.time)
      );

      // 由于电表数据表没有quality字段，设置默认值
      const totalCount = totalStats.count;
      const successCount = totalCount; // 假设所有数据都是成功的
      const successRate = totalCount > 0 ? 100 : 0;
      const avgQuality = 100;
      const minQuality = 100;
      const maxQuality = 100;

      return {
        electricMeterId,
        deviceId,
        period,
        timeRange: {
          startTime,
          endTime: now
        },
        summary: {
          totalCount,
          successCount,
          successRate,
          avgQuality,
          minQuality,
          maxQuality
        },
        transmissionData: formattedData,
        timestamp: now
      };
    } catch (error) {
      logger.error('获取电表数据传输统计失败:', error);
      throw error;
    }
  }
}

module.exports = new ElectricMeterDataService();