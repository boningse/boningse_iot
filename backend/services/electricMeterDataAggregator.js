/**
 * 电表数据聚合器
 * 实现在一个轮询周期内收集所有寄存器数据，等待所有响应完成后统一存储
 */

const logger = require('../utils/logger');
const { DeviceData, Tenant } = require('../models');
const tenantElectricMeterDataService = require('./tenantElectricMeterDataService');

class ElectricMeterDataAggregator {
  constructor() {
    // 存储每个电表的轮询会话数据
    // 格式: { "deviceId_meterId": { sessionId, expectedCommands, receivedData, startTime, timeout } }
    this.pollingSessions = new Map();
    
    // 会话超时时间（毫秒）
    this.sessionTimeout = 60000; // 60秒
    
    // 启动清理定时器
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 30000); // 每30秒清理一次
    
    // 启动状态监控定时器（每5分钟记录一次状态）
    this.statusInterval = setInterval(() => {
      this.logSessionStatus();
    }, 300000); // 每5分钟记录一次状态
  }

  /**
   * 开始新的轮询会话
   * @param {Object} device - 设备对象
   * @param {Object} electricMeter - 电表对象
   * @param {Array} expectedCommands - 预期的命令列表
   * @returns {string} 会话ID
   */
  startPollingSession(device, electricMeter, expectedCommands) {
    const sessionKey = `${device.id}_${electricMeter.id}`;
    const sessionId = `${sessionKey}_${Date.now()}`;
    
    // 如果已存在会话，先完成旧会话
    if (this.pollingSessions.has(sessionKey)) {
      logger.warn(`电表 ${electricMeter.meter_number} 存在未完成的轮询会话，将强制完成旧会话`);
      this.forceCompleteSession(sessionKey);
    }
    
    const session = {
      sessionId,
      device,
      electricMeter,
      expectedCommands: expectedCommands.map(cmd => ({
        functionCode: cmd.function_code,
        startAddress: cmd.start_address,
        quantity: cmd.quantity,
        registerMapping: cmd.register_mapping || [],
        registerNames: cmd.register_names || [],
        completed: false
      })),
      receivedData: new Map(), // 存储接收到的原始数据
      parsedData: {}, // 存储解析后的数据
      startTime: new Date(),
      timeout: setTimeout(() => {
        this.handleSessionTimeout(sessionKey);
      }, this.sessionTimeout)
    };
    
    this.pollingSessions.set(sessionKey, session);
    
    logger.info(`开始电表轮询会话`, {
      sessionId,
      deviceId: device.id,
      meterNumber: electricMeter.meter_number,
      expectedCommands: expectedCommands.length,
      timeout: this.sessionTimeout
    });
    
    return sessionId;
  }

  /**
   * 添加接收到的数据到会话
   * @param {Object} device - 设备对象
   * @param {Object} electricMeter - 电表对象
   * @param {Object} commandInfo - 命令信息
   * @param {Object} rawData - 原始数据
   * @param {Object} parsedData - 解析后的数据
   */
  addDataToSession(device, electricMeter, commandInfo, rawData, parsedData) {
    const sessionKey = `${device.id}_${electricMeter.id}`;
    let session = this.pollingSessions.get(sessionKey);
    
    if (!session) {
      // 尝试创建临时会话来处理延迟到达的数据
      const tempSession = this.createTemporarySession(device, electricMeter, commandInfo);
      if (tempSession) {
        session = tempSession;
        logger.info(`为延迟数据创建临时会话`, {
          meterNumber: electricMeter.meter_number,
          sessionId: session.sessionId,
          commandInfo
        });
      } else {
        logger.warn(`未找到电表 ${electricMeter.meter_number} 的活动轮询会话，数据将直接保存`);
        return false; // 返回false表示没有找到会话，调用方应直接保存数据
      }
    }
    
    // 查找匹配的预期命令
    const matchingCommand = session.expectedCommands.find(cmd => 
      cmd.functionCode === commandInfo.functionCode &&
      cmd.startAddress === commandInfo.startAddress &&
      cmd.quantity === commandInfo.quantity
    );
    
    if (!matchingCommand) {
      logger.warn(`接收到未预期的命令响应`, {
        sessionId: session.sessionId,
        functionCode: commandInfo.functionCode,
        startAddress: commandInfo.startAddress,
        quantity: commandInfo.quantity
      });
      return false;
    }
    
    // 标记命令为已完成
    matchingCommand.completed = true;
    
    // 存储数据
    const dataKey = `${commandInfo.functionCode}_${commandInfo.startAddress}_${commandInfo.quantity}`;
    session.receivedData.set(dataKey, {
      commandInfo,
      rawData,
      parsedData,
      receivedAt: new Date()
    });
    
    // 合并解析后的数据
    Object.assign(session.parsedData, parsedData);
    
    logger.debug(`添加数据到轮询会话`, {
      sessionId: session.sessionId,
      dataKey,
      completedCommands: session.expectedCommands.filter(cmd => cmd.completed).length,
      totalCommands: session.expectedCommands.length
    });
    
    // 检查是否所有命令都已完成
    if (this.isSessionComplete(session)) {
      this.completeSession(sessionKey);
    }
    
    return true; // 返回true表示数据已添加到会话
  }

  /**
   * 检查会话是否完成
   * @param {Object} session - 会话对象
   * @returns {boolean} 是否完成
   */
  isSessionComplete(session) {
    return session.expectedCommands.every(cmd => cmd.completed);
  }

  /**
   * 完成轮询会话并保存聚合数据
   * @param {string} sessionKey - 会话键
   */
  async completeSession(sessionKey) {
    const session = this.pollingSessions.get(sessionKey);
    if (!session) {
      return;
    }
    
    try {
      // 清除超时定时器
      if (session.timeout) {
        clearTimeout(session.timeout);
      }
      
      const completedCommands = session.expectedCommands.filter(cmd => cmd.completed).length;
      const totalCommands = session.expectedCommands.length;
      const duration = Date.now() - session.startTime.getTime();
      
      logger.info(`完成电表轮询会话`, {
        sessionId: session.sessionId,
        deviceId: session.device.id,
        meterNumber: session.electricMeter.meter_number,
        completedCommands,
        totalCommands,
        duration: `${duration}ms`,
        dataPoints: Object.keys(session.parsedData).length
      });
      
      // 构造聚合后的数据
      const aggregatedData = {
        ...session.parsedData,
        timestamp: new Date(),
        session_id: session.sessionId,
        polling_duration: duration,
        completed_commands: completedCommands,
        total_commands: totalCommands,
        data_completeness: (completedCommands / totalCommands * 100).toFixed(2) + '%'
      };
      
      // 保存聚合数据
      await this.saveAggregatedData(session.device, session.electricMeter, aggregatedData, session.receivedData);
      
    } catch (error) {
      logger.error(`完成轮询会话时发生错误`, {
        sessionId: session.sessionId,
        error: error.message
      });
    } finally {
      // 移除会话
      this.pollingSessions.delete(sessionKey);
    }
  }

  /**
   * 创建临时会话处理延迟到达的数据
   * @param {Object} device - 设备对象
   * @param {Object} electricMeter - 电表对象
   * @param {Object} commandInfo - 命令信息
   * @returns {Object|null} 临时会话对象或null
   */
  createTemporarySession(device, electricMeter, commandInfo) {
    const sessionKey = `${device.id}_${electricMeter.id}`;
    const sessionId = `${sessionKey}_temp_${Date.now()}`;
    
    // 创建一个最小化的临时会话，只包含当前命令
    const tempSession = {
      sessionId,
      device,
      electricMeter,
      expectedCommands: [{
        functionCode: commandInfo.functionCode,
        startAddress: commandInfo.startAddress,
        quantity: commandInfo.quantity,
        registerMapping: [],
        registerNames: [],
        completed: false
      }],
      receivedData: new Map(),
      parsedData: {},
      startTime: new Date(),
      isTemporary: true,
      timeout: setTimeout(() => {
        this.handleSessionTimeout(sessionKey);
      }, this.sessionTimeout / 2) // 临时会话使用较短的超时时间
    };
    
    this.pollingSessions.set(sessionKey, tempSession);
    
    logger.debug(`创建临时轮询会话`, {
      sessionId,
      meterNumber: electricMeter.meter_number,
      commandInfo,
      timeout: this.sessionTimeout / 2
    });
    
    return tempSession;
  }

  /**
   * 延长会话超时时间
   * @param {string} sessionKey - 会话键
   * @param {number} extensionMs - 延长时间（毫秒）
   */
  extendSessionTimeout(sessionKey, extensionMs = 30000) {
    const session = this.pollingSessions.get(sessionKey);
    if (!session) {
      return false;
    }
    
    // 清除现有超时
    if (session.timeout) {
      clearTimeout(session.timeout);
    }
    
    // 设置新的超时
    session.timeout = setTimeout(() => {
      this.handleSessionTimeout(sessionKey);
    }, extensionMs);
    
    logger.debug(`延长会话超时时间`, {
      sessionId: session.sessionId,
      extensionMs,
      meterNumber: session.electricMeter.meter_number
    });
    
    return true;
  }

  /**
   * 强制完成会话（用于处理超时或新会话开始）
   * @param {string} sessionKey - 会话键
   */
  async forceCompleteSession(sessionKey) {
    const session = this.pollingSessions.get(sessionKey);
    if (!session) {
      return;
    }
    
    logger.warn(`强制完成轮询会话`, {
      sessionId: session.sessionId,
      reason: '超时或新会话开始',
      isTemporary: session.isTemporary || false
    });
    
    await this.completeSession(sessionKey);
  }

  /**
   * 处理会话超时
   * @param {string} sessionKey - 会话键
   */
  async handleSessionTimeout(sessionKey) {
    const session = this.pollingSessions.get(sessionKey);
    if (!session) {
      return;
    }
    
    const completedCommands = session.expectedCommands.filter(cmd => cmd.completed).length;
    const totalCommands = session.expectedCommands.length;
    
    logger.warn(`轮询会话超时`, {
      sessionId: session.sessionId,
      deviceId: session.device.id,
      meterNumber: session.electricMeter.meter_number,
      completedCommands,
      totalCommands,
      timeout: this.sessionTimeout
    });
    
    // 即使超时也尝试保存已收集的数据
    await this.completeSession(sessionKey);
  }

  /**
   * 保存聚合后的数据
   * @param {Object} device - 设备对象
   * @param {Object} electricMeter - 电表对象
   * @param {Object} aggregatedData - 聚合数据
   * @param {Map} rawDataMap - 原始数据映射
   */
  async saveAggregatedData(device, electricMeter, aggregatedData, rawDataMap) {
    try {
      // 构造payload
      const payload = {
        ...aggregatedData,
        electric_meter_id: electricMeter.id,
        meter_number: electricMeter.meter_number,
        meter_address: electricMeter.meter_address,
        data_type: 'electric_meter_aggregated',
        raw_data_summary: {
          total_responses: rawDataMap.size,
          response_keys: Array.from(rawDataMap.keys())
        }
      };
      
      // 清理payload中的无效Unicode字符
      const cleanedPayload = this.sanitizePayloadForStorage(payload);
      
      // 保存到原有的device_data表
      await DeviceData.create({
        device_id: device.id,
        timestamp: aggregatedData.timestamp,
        data_type: 'electric_meter_aggregated',
        payload: cleanedPayload,
        quality: this.calculateDataQuality(aggregatedData),
        received_at: new Date()
      });
      
      // 同时保存到按租户分表的电表数据表
      await this.saveTenantAggregatedData(device, electricMeter, aggregatedData, cleanedPayload);
      
      logger.info(`聚合电表数据已保存`, {
        deviceId: device.id,
        meterNumber: electricMeter.meter_number,
        dataPoints: Object.keys(aggregatedData).length,
        quality: this.calculateDataQuality(aggregatedData)
      });
      
    } catch (error) {
      logger.error('保存聚合电表数据失败:', error);
      throw error;
    }
  }

  /**
   * 保存聚合数据到租户分表
   * @param {Object} device - 设备对象
   * @param {Object} electricMeter - 电表对象
   * @param {Object} aggregatedData - 聚合数据
   * @param {Object} cleanedPayload - 清理后的payload
   */
  async saveTenantAggregatedData(device, electricMeter, aggregatedData, cleanedPayload) {
    try {
      // 获取电表所属的租户信息
      const tenant = await Tenant.findByPk(electricMeter.tenant_id);
      if (!tenant || !tenant.code) {
        logger.warn(`电表 ${electricMeter.meter_number} 未关联有效租户，跳过按租户分表存储`);
        return;
      }
      
      // 构造电表数据对象
      const meterData = {
        electricMeterId: electricMeter.id,
        deviceId: device.id,
        meterNumber: electricMeter.meter_number,
        meterAddress: electricMeter.meter_address,
        data: this.extractElectricParameters(cleanedPayload),
        collectionTimestamp: aggregatedData.timestamp,
        sessionId: aggregatedData.session_id,
        pollingDuration: aggregatedData.polling_duration,
        dataCompleteness: aggregatedData.data_completeness
      };
      
      // 插入到租户专用的电表数据表
      const insertedId = await tenantElectricMeterDataService.insertMeterData(tenant.code, meterData);
      
      if (insertedId) {
        logger.debug(`聚合电表数据已保存到租户 ${tenant.code} 的专用表`, {
          tenantCode: tenant.code,
          meterNumber: electricMeter.meter_number,
          insertedId,
          sessionId: aggregatedData.session_id
        });
      }
    } catch (error) {
      logger.error('保存聚合电表数据到租户分表失败:', error);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 从payload中提取电气参数
   * @param {Object} payload - 清理后的payload数据
   * @returns {Object} 电气参数对象
   */
  extractElectricParameters(payload) {
    const parameters = {};
    
    // 定义有效的电气参数字段
    const validElectricFields = [
      'total_active_energy', 'forward_active_energy', 'reverse_active_energy',
      'energy', 'active_energy', 'reactive_energy',
      'phase_a_current', 'phase_b_current', 'phase_c_current', 'current_avg',
      'phase_a_voltage', 'phase_b_voltage', 'phase_c_voltage', 'voltage_avg',
      'line_ab_voltage', 'line_ac_voltage', 'line_bc_voltage',
      'phase_a_power', 'phase_b_power', 'phase_c_power', 'total_power',
      'active_power', 'reactive_power', 'apparent_power',
      'phase_a_power_factor', 'phase_b_power_factor', 'phase_c_power_factor',
      'total_power_factor', 'power_factor',
      'phase_a_temperature', 'phase_b_temperature', 'phase_c_temperature', 'temperature',
      'frequency'
    ];
    
    // 提取有效的电气参数
    for (const [key, value] of Object.entries(payload)) {
      if (validElectricFields.includes(key) && value !== null && value !== undefined) {
        parameters[key] = value;
      }
    }
    
    return parameters;
  }

  /**
   * 计算数据质量
   * @param {Object} aggregatedData - 聚合数据
   * @returns {number} 数据质量分数 (0-100)
   */
  calculateDataQuality(aggregatedData) {
    let quality = 100;
    
    // 根据数据完整性调整质量
    if (aggregatedData.data_completeness) {
      const completeness = parseFloat(aggregatedData.data_completeness.replace('%', ''));
      quality = Math.max(quality * (completeness / 100), 50); // 最低50分
    }
    
    // 根据轮询持续时间调整质量（超时会降低质量）
    if (aggregatedData.polling_duration > this.sessionTimeout * 0.8) {
      quality *= 0.9; // 接近超时时降低10%
    }
    
    return Math.round(quality);
  }

  /**
   * 清理payload数据中的无效Unicode字符
   * @param {Object} payload - 要清理的数据
   * @returns {Object} 清理后的数据
   */
  sanitizePayloadForStorage(payload) {
    try {
      // 深拷贝payload
      const cleanedPayload = JSON.parse(JSON.stringify(payload));
      
      // 特殊处理raw_data中的二进制数据
      if (cleanedPayload.raw_data && cleanedPayload.raw_data.raw_response) {
        // 如果raw_response是Buffer，转换为十六进制字符串
        if (Buffer.isBuffer(cleanedPayload.raw_data.raw_response)) {
          cleanedPayload.raw_data.raw_response = cleanedPayload.raw_data.raw_response.toString('hex');
        } else if (typeof cleanedPayload.raw_data.raw_response === 'string') {
          // 如果是字符串，尝试清理无效的Unicode字符
          cleanedPayload.raw_data.raw_response = cleanedPayload.raw_data.raw_response.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
        }
      }
      
      return cleanedPayload;
    } catch (error) {
      logger.warn('清理payload数据失败，使用原始数据', { error: error.message });
      // 如果清理失败，至少尝试移除raw_data以避免存储问题
      try {
        const fallbackPayload = { ...payload };
        if (fallbackPayload.raw_data) {
          delete fallbackPayload.raw_data;
        }
        return fallbackPayload;
      } catch (fallbackError) {
        logger.error('fallback清理也失败', { error: fallbackError.message });
        return payload;
      }
    }
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions = [];
    const staleThreshold = this.sessionTimeout * 2.5; // 增加清理阈值到2.5倍
    
    for (const [sessionKey, session] of this.pollingSessions.entries()) {
      const sessionAge = now - session.startTime.getTime();
      
      // 对于临时会话，使用更短的清理时间
      const cleanupThreshold = session.isTemporary ? this.sessionTimeout : staleThreshold;
      
      if (sessionAge > cleanupThreshold) {
        // 检查会话是否有未完成的命令且最近有活动
        const hasRecentActivity = this.hasRecentSessionActivity(session, now);
        const hasIncompleteCommands = session.expectedCommands.some(cmd => !cmd.completed);
        
        // 如果会话有最近活动且有未完成命令，延长超时而不是清理
        if (hasRecentActivity && hasIncompleteCommands && !session.isTemporary) {
          logger.info(`会话有最近活动，延长超时时间`, {
            sessionId: session.sessionId,
            meterNumber: session.electricMeter.meter_number,
            sessionAge: Math.round(sessionAge / 1000) + 's'
          });
          this.extendSessionTimeout(sessionKey, this.sessionTimeout);
        } else {
          expiredSessions.push(sessionKey);
        }
      }
    }
    
    for (const sessionKey of expiredSessions) {
      const session = this.pollingSessions.get(sessionKey);
      logger.warn(`清理过期轮询会话`, {
        sessionKey,
        sessionId: session?.sessionId,
        meterNumber: session?.electricMeter?.meter_number,
        isTemporary: session?.isTemporary || false,
        age: Math.round((now - session?.startTime?.getTime()) / 1000) + 's'
      });
      this.forceCompleteSession(sessionKey);
    }
    
    if (expiredSessions.length > 0) {
      logger.info(`清理了 ${expiredSessions.length} 个过期会话，当前活跃会话数: ${this.pollingSessions.size}`);
    }
  }

  /**
   * 检查会话是否有最近活动
   * @param {Object} session - 会话对象
   * @param {number} now - 当前时间戳
   * @returns {boolean} 是否有最近活动
   */
  hasRecentSessionActivity(session, now) {
    const recentActivityThreshold = 30000; // 30秒内的活动算作最近活动
    
    // 检查是否有最近接收的数据
    for (const [dataKey, dataInfo] of session.receivedData.entries()) {
      const dataAge = now - dataInfo.receivedAt.getTime();
      if (dataAge < recentActivityThreshold) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 获取会话统计信息
   * @returns {Object} 统计信息
   */
  getSessionStats() {
    const now = Date.now();
    const sessions = Array.from(this.pollingSessions.entries()).map(([key, session]) => {
      const sessionAge = now - session.startTime.getTime();
      const completedCommands = session.expectedCommands.filter(cmd => cmd.completed).length;
      const totalCommands = session.expectedCommands.length;
      const completionRate = totalCommands > 0 ? (completedCommands / totalCommands * 100).toFixed(1) : 0;
      
      return {
        sessionKey: key,
        sessionId: session.sessionId,
        meterNumber: session.electricMeter.meter_number,
        deviceId: session.device.id,
        startTime: session.startTime,
        ageSeconds: Math.round(sessionAge / 1000),
        expectedCommands: totalCommands,
        completedCommands,
        completionRate: `${completionRate}%`,
        receivedDataCount: session.receivedData.size,
        isTemporary: session.isTemporary || false,
        hasRecentActivity: this.hasRecentSessionActivity(session, now)
      };
    });
    
    const temporarySessions = sessions.filter(s => s.isTemporary).length;
    const regularSessions = sessions.filter(s => !s.isTemporary).length;
    const activeWithData = sessions.filter(s => s.receivedDataCount > 0).length;
    const staleThreshold = this.sessionTimeout * 1.5;
    const staleSessions = sessions.filter(s => s.ageSeconds * 1000 > staleThreshold).length;
    
    return {
      activeSessions: this.pollingSessions.size,
      regularSessions,
      temporarySessions,
      activeWithData,
      staleSessions,
      sessionTimeout: this.sessionTimeout,
      cleanupInterval: 30000,
      sessions
    };
  }

  /**
   * 记录会话状态（用于调试）
   */
  logSessionStatus() {
    const stats = this.getSessionStats();
    
    if (stats.activeSessions > 0) {
      logger.info(`电表轮询会话状态`, {
        总会话数: stats.activeSessions,
        常规会话: stats.regularSessions,
        临时会话: stats.temporarySessions,
        有数据会话: stats.activeWithData,
        过期会话: stats.staleSessions,
        会话超时: `${stats.sessionTimeout / 1000}s`,
        清理间隔: `${stats.cleanupInterval / 1000}s`
      });
      
      // 记录详细的会话信息（仅在有问题时）
      if (stats.staleSessions > 0 || stats.temporarySessions > 0) {
        const problemSessions = stats.sessions.filter(s => 
          s.isTemporary || s.ageSeconds * 1000 > this.sessionTimeout * 1.5
        );
        
        logger.debug(`问题会话详情`, {
          sessions: problemSessions.map(s => ({
            电表号: s.meterNumber,
            会话ID: s.sessionId,
            年龄: `${s.ageSeconds}s`,
            完成率: s.completionRate,
            数据数量: s.receivedDataCount,
            是否临时: s.isTemporary,
            最近活动: s.hasRecentActivity
          }))
        });
      }
    }
  }

  /**
   * 销毁聚合器
   */
  destroy() {
    // 清理所有定时器
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
    
    // 强制完成所有活动会话
    for (const sessionKey of this.pollingSessions.keys()) {
      this.forceCompleteSession(sessionKey);
    }
    
    this.pollingSessions.clear();
    
    logger.info('电表数据聚合器已销毁');
  }
}

module.exports = ElectricMeterDataAggregator;