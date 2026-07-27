const logger = require('../utils/logger.js')
const mqttService = require('../services/mqttService.js')
const { MultiUnitAc, MultiUnitAcHost, MultiUnitAcIndoorUnit, MultiUnitAcControlLog, Device, User, Sequelize } = require('../models')

const { Op } = Sequelize

class MultiUnitAcController {

  /**
   * 构建MQTT主题 - 改进版本
   * @param {Object} device - 设备对象
   * @returns {string} MQTT主题
   */
  buildMqttTopic(device) {
    const mqttConfig = device.mqtt_config
    
    // 直接使用厂家配置的订阅主题
    if (mqttConfig && mqttConfig.subscribe_topics && mqttConfig.subscribe_topics.length > 0) {
      const topic = mqttConfig.subscribe_topics[0].topic
      logger.debug(`使用厂家配置的MQTT主题: ${topic}`)
      return topic
    }
    
    // 没有厂商配置的多联机控制器，不需要配置主题
    logger.error(`设备 ${device.device_id} 没有配置厂商MQTT主题`)
    throw new Error(`设备没有配置厂商MQTT主题`)
  }

  /**
   * 构建控制消息
   * @param {Object} indoorUnit - 内机对象
   * @param {string} action - 控制动作
   * @param {Object} value - 控制值
   * @returns {Object} 控制消息
   */
  buildControlMessage(indoorUnit, action, value) {
    // 构建四段地址格式：concentrator_id-channel_number-outdoor_unit_address-indoor_unit_address
    const airConditionerAddress = `${indoorUnit.host.concentrator_id}-${indoorUnit.channel_number}-${indoorUnit.outdoor_unit_address}-${indoorUnit.indoor_unit_address}`

    // 根据协议文档构建控制数据
    const protocolData = this.buildProtocolCommandData(action, value, indoorUnit)
    
    // 根据协议文档构建控制消息
    return {
      sn: Math.floor(Date.now() / 1000), // 使用时间戳作为序列号
      cmd: "control_write",
      uuid: indoorUnit.host.device.device_id, // 使用device_id作为UUID (fa开头的格式)
      body: {
        addrs: [airConditionerAddress], // 空调地址数组
        ...protocolData
      }
    }
  }

  /**
   * 发送MQTT控制指令并记录日志 - 优化版本
   * @param {Object} controlMessage - 控制消息
   * @param {string} topic - MQTT主题
   * @param {string} hostId - 主机ID
   * @param {string} unitId - 内机ID (可选)
   * @param {string} action - 控制动作
   * @param {Object} value - 控制值
   * @param {string} userId - 用户ID
   * @param {string} tenantId - 租户ID
   */
  async sendControlCommand(controlMessage, topic, hostId, unitId, action, value, userId, tenantId) {
    const startTime = Date.now()
    const logContext = {
      hostId,
      unitId: unitId || 'N/A',
      action,
      topic,
      userId,
      tenantId
    }

    try {
      // 参数验证
      if (!controlMessage || !topic || !hostId || !action || !userId || !tenantId) {
        throw new Error('缺少必要的参数')
      }

      // 记录发送前的日志
      logger.info('准备发送MQTT控制指令', {
        ...logContext,
        controlMessage: JSON.stringify(controlMessage)
      })

      // 发送MQTT控制指令
      await mqttService.publish(topic, JSON.stringify(controlMessage))

      const duration = Date.now() - startTime

      // 记录成功日志到数据库
      await MultiUnitAcControlLog.create({
        host_id: hostId,
        indoor_unit_id: unitId,
        operation_type: action,
        operation_value: JSON.stringify({ action, value }),
        user_id: userId,
        tenant_id: tenantId,
        result: 'success',
        response_time: duration
      })

      // 记录成功日志
      logger.info('控制指令发送成功', {
        ...logContext,
        duration: `${duration}ms`
      })

    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error.message || '未知错误'

      // 记录失败日志到数据库
      try {
        await MultiUnitAcControlLog.create({
          host_id: hostId,
          indoor_unit_id: unitId,
          operation_type: action,
          operation_value: JSON.stringify({ action, value }),
          user_id: userId,
          tenant_id: tenantId,
          result: 'failed',
          error_message: errorMessage,
          response_time: duration
        })
      } catch (dbError) {
        logger.error('记录控制日志失败', {
          originalError: errorMessage,
          dbError: dbError.message,
          ...logContext
        })
      }

      // 记录详细的错误日志
      logger.error('控制指令发送失败', {
        ...logContext,
        error: errorMessage,
        stack: error.stack,
        duration: `${duration}ms`
      })

      // 重新抛出错误，让上层处理
      throw new Error(`控制指令发送失败: ${errorMessage}`)
    }
  }

  /**
   * 优化后的内机控制方法 - 增强错误处理
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async controlIndoorUnitOptimized(req, res) {
    const startTime = Date.now()
    const { hostId, unitId } = req.params
    const { action, value } = req.body
    const tenantId = req.user.tenant_id
    const userId = req.user.id

    const logContext = {
      hostId,
      unitId,
      action,
      userId,
      tenantId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    }

    try {
      // 输入参数验证
      if (!hostId || !unitId || !action) {
        return res.status(400).json({
          success: false,
          message: '缺少必要的参数: hostId, unitId, action',
          code: 'MISSING_PARAMETERS'
        })
      }

      // 动作类型验证
      const validActions = ['turn_on', 'turn_off', 'set_temperature', 'set_mode', 'set_fan_speed']
      if (!validActions.includes(action)) {
        return res.status(400).json({
          success: false,
          message: `不支持的操作类型: ${action}`,
          code: 'INVALID_ACTION',
          validActions
        })
      }

      logger.info('开始处理内机控制请求', logContext)

      // 查找内机及其主机信息
      const indoorUnit = await MultiUnitAcIndoorUnit.findOne({
        where: { id: unitId, host_id: hostId },
        include: [{
          model: MultiUnitAcHost,
          as: 'host',
          where: { tenant_id: tenantId },
          include: [{
            model: Device,
            as: 'device'
          }]
        }]
      })

      if (!indoorUnit) {
        logger.warn('内机不存在或无权限访问', logContext)
        return res.status(404).json({
          success: false,
          message: '内机不存在或无权限访问',
          code: 'INDOOR_UNIT_NOT_FOUND'
        })
      }

      // 检查设备状态
      if (!indoorUnit.host.device) {
        logger.error('内机关联的设备不存在', logContext)
        return res.status(500).json({
          success: false,
          message: '内机关联的设备不存在',
          code: 'DEVICE_NOT_FOUND'
        })
      }

      // 使用优化的方法构建控制消息和MQTT主题
      const controlMessage = this.buildControlMessage(indoorUnit, action, value)
      const topic = this.buildMqttTopic(indoorUnit.host.device)

      // 发送控制指令并记录日志
      await this.sendControlCommand(
        controlMessage,
        topic,
        hostId,
        unitId,
        action,
        value,
        userId,
        tenantId
      )

      const duration = Date.now() - startTime

      logger.info('内机控制请求处理成功', {
        ...logContext,
        duration: `${duration}ms`
      })

      res.json({
        success: true,
        message: '内机控制指令已发送',
        data: { 
          action, 
          value,
          topic,
          timestamp: new Date().toISOString()
        },
        meta: {
          duration: `${duration}ms`
        }
      })

    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error.message || '未知错误'

      logger.error('内机控制请求处理失败', {
        ...logContext,
        error: errorMessage,
        stack: error.stack,
        duration: `${duration}ms`
      })

      // 根据错误类型返回不同的状态码
      let statusCode = 500
      let errorCode = 'INTERNAL_ERROR'

      if (errorMessage.includes('MQTT')) {
        statusCode = 503
        errorCode = 'MQTT_SERVICE_UNAVAILABLE'
      } else if (errorMessage.includes('数据库') || errorMessage.includes('database')) {
        statusCode = 503
        errorCode = 'DATABASE_ERROR'
      }

      res.status(statusCode).json({
        success: false,
        message: '内机控制失败',
        error: errorMessage,
        code: errorCode,
        meta: {
          duration: `${duration}ms`,
          timestamp: new Date().toISOString()
        }
      })
    }
  }

  buildProtocolCommandData(action, value, indoorUnit) {
    const baseData = {
      tempSet: indoorUnit.target_temp || 26, // 设定温度，默认26度
      workMode: indoorUnit.operation_mode || 0, // 模式：0自动，1制冷，2制热，3送风，4除湿
      fanSpeed: indoorUnit.fan_speed || 0, // 风速：0自动，1高速，2中速，4低速，6微风
      fanDirect: 1 // 风向，预留字段
    }

    switch (action) {
      case 'turn_on':
      case 'power_on':
        return {
          onOff: 1, // 开机
          ...baseData
        }
      case 'turn_off':
      case 'power_off':
        return {
          onOff: 0, // 关机
          ...baseData
        }
      case 'set_temp':
      case 'set_temperature':
        return {
          onOff: indoorUnit.power_status ? 1 : 0,
          tempSet: value.temperature || value,
          workMode: indoorUnit.operation_mode || 0,
          fanSpeed: indoorUnit.fan_speed || 0,
          fanDirect: 1
        }
      case 'set_mode':
        return {
          onOff: indoorUnit.power_status ? 1 : 0,
          tempSet: indoorUnit.target_temp || 26,
          workMode: value.mode || value,
          fanSpeed: indoorUnit.fan_speed || 0,
          fanDirect: 1
        }
      case 'set_fan_speed':
        return {
          onOff: indoorUnit.power_status ? 1 : 0,
          tempSet: indoorUnit.target_temp || 26,
          workMode: indoorUnit.operation_mode || 0,
          fanSpeed: value.fan_speed || value,
          fanDirect: 1
        }
      default:
        return {
          onOff: indoorUnit.power_status ? 1 : 0,
          ...baseData
        }
    }
  }
}

module.exports = new MultiUnitAcController()