const thermostatService = require('../services/thermostatService');
const scheduleService = require('../services/scheduleService');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

const getTenantScope = (req) => (
  req.user.role === 'admin' || req.user.role === 'super_admin'
    ? null
    : req.user.tenant_id
);

/**
 * 温控器控制器
 * 处理温控器相关的HTTP请求
 */
class ThermostatController {

  // ============================================
  // 温控器设备管理
  // ============================================

  /**
   * 获取温控器设备列表
   */
  async getThermostatDevices(req, res) {
    try {
      const {
        page = 1,
        pageSize = 1000,
        keyword,
        status,
        groupId,
        buildingId,
        projectGroupId,
        tenantId: requestedTenantId
      } = req.query;

      console.log('温控器设备列表请求参数:', {
        page,
        pageSize,
        keyword,
        status,
        groupId,
        buildingId,
        projectGroupId,
        requestedTenantId,
        originalPageSize: req.query.pageSize,
        parsedPageSize: parseInt(pageSize)
      });

      const tenantId = req.user.role === 'admin'
        ? (requestedTenantId || null)
        : req.user.tenant_id;
      const filters = {
        keyword,
        status,
        groupId,
        buildingId,
        projectGroupId,
        tenantId
      };

      const result = await thermostatService.getThermostatDevices(
        parseInt(page),
        parseInt(pageSize),
        filters
      );

      console.log('温控器设备列表查询结果:', {
        total: result.pagination?.total,
        pageSize: result.pagination?.pageSize,
        page: result.pagination?.page,
        listLength: result.list?.length
      });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('获取温控器设备列表失败:', error);
      res.status(500).json({
        success: false,
        message: '获取温控器设备列表失败',
        error: error.message
      });
    }
  }

  /**
   * 获取单个温控器设备详情
   */
  async getThermostatDevice(req, res) {
    try {
      const { deviceId } = req.params;
      const tenantId = getTenantScope(req);

      const device = await thermostatService.getThermostatDevice(deviceId, tenantId);

      if (!device) {
        return res.status(404).json({
          success: false,
          message: '温控器设备不存在'
        });
      }

      res.json({
        success: true,
        data: device
      });

    } catch (error) {
      logger.error('获取温控器设备详情失败:', error);
      res.status(500).json({
        success: false,
        message: '获取温控器设备详情失败',
        error: error.message
      });
    }
  }

  /**
   * 添加温控器设备
   */
  async addThermostatDevice(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: '参数验证失败',
          errors: errors.array()
        });
      }

      const deviceData = req.body;
      const tenantId = getTenantScope(req);
      const userId = req.user.id;

      const device = await thermostatService.addThermostatDevice(deviceData, tenantId, userId);

      res.status(201).json({
        success: true,
        message: '温控器设备添加成功',
        data: device
      });

    } catch (error) {
      logger.error('添加温控器设备失败:', error);
      const validationMessages = [
        '设备ID不能为空',
        '设备不存在或无权访问',
        '网关设备不能加入温控管理',
        '只能添加设备类型为空调温控器的设备'
      ];
      res.status(validationMessages.includes(error.message) ? 400 : 500).json({
        success: false,
        message: '添加温控器设备失败',
        error: error.message
      });
    }
  }

  /**
   * 删除温控器设备
   */
  async deleteThermostatDevice(req, res) {
    try {
      const { deviceId } = req.params;
      const tenantId = getTenantScope(req);
      const userId = req.user.id;

      const result = await thermostatService.deleteThermostatDevice(deviceId, tenantId, userId);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: '温控器设备不存在'
        });
      }

      res.json({
        success: true,
        message: '温控器设备删除成功'
      });

    } catch (error) {
      logger.error('删除温控器设备失败:', error);
      res.status(500).json({
        success: false,
        message: '删除温控器设备失败',
        error: error.message
      });
    }
  }

  // ============================================
  // 温控器设备控制
  // ============================================

  /**
   * 开启温控器
   */
  async powerOnDevice(req, res) {
    try {
      const { deviceId } = req.params;
      const { target_temp, fan_speed, ac_mode } = req.body;
      const tenantId = getTenantScope(req);
      const userId = req.user.id;

      // 详细的请求日志
      logger.info('🔥 温控器开机API调用:', {
        deviceId,
        requestBody: req.body,
        userId,
        tenantId,
        userInfo: {
          username: req.user.username,
          tenant_name: req.user.tenant_name
        },
        timestamp: new Date().toISOString()
      });

      // 只传入明确提供的参数，避免undefined值
      const settings = {};
      if (target_temp !== undefined && target_temp !== null) {
        settings.target_temp = target_temp;
      }
      if (fan_speed !== undefined && fan_speed !== null) {
        settings.fan_speed = fan_speed;
      }
      if (ac_mode !== undefined && ac_mode !== null) {
        settings.mode = ac_mode;
      }

      logger.info('🔧 调用thermostatService.powerOnDevice:', {
        deviceId,
        settings,
        tenantId,
        userId
      });

      const result = await thermostatService.powerOnDevice(
        deviceId,
        settings,
        tenantId,
        userId
      );

      // 获取设备最新状态
      const deviceStatus = await thermostatService.getThermostatDevice(deviceId, tenantId);

      logger.info('✅ 温控器开机成功:', {
        deviceId,
        result,
        deviceStatus
      });

      res.json({
        success: true,
        message: '温控器开启成功',
        data: {
          command: result,
          device: deviceStatus
        }
      });

    } catch (error) {
      logger.error('❌ 开启温控器失败 - 详细错误信息:', {
        deviceId: req.params.deviceId,
        requestBody: req.body,
        userId: req.user?.id,
        tenantId: req.user?.tenant_id,
        errorMessage: error.message,
        errorStack: error.stack,
        timestamp: new Date().toISOString()
      });
      res.status(500).json({
        success: false,
        message: '开启温控器失败',
        error: error.message
      });
    }
  }

  /**
   * 关闭温控器
   */
  async powerOffDevice(req, res) {
    try {
      const { deviceId } = req.params;
      const tenantId = getTenantScope(req);
      const userId = req.user.id;

      const result = await thermostatService.powerOffDevice(deviceId, tenantId, userId);

      // 获取设备最新状态
      const deviceStatus = await thermostatService.getThermostatDevice(deviceId, tenantId);

      res.json({
        success: true,
        message: '温控器关闭成功',
        data: {
          command: result,
          device: deviceStatus
        }
      });

    } catch (error) {
      logger.error('关闭温控器失败:', error);
      res.status(500).json({
        success: false,
        message: '关闭温控器失败',
        error: error.message
      });
    }
  }

  /**
   * 设置目标温度
   */
  async setTemperature(req, res) {
    try {
      const { deviceId } = req.params;
      const { temperature, target_temp } = req.body;
      const targetTemp = temperature || target_temp; // 支持两种字段名
      const tenantId = getTenantScope(req);
      const userId = req.user.id;

      console.log('🔍 温度设置调试信息:');
      console.log('  - deviceId:', deviceId);
      console.log('  - temperature:', temperature, typeof temperature);
      console.log('  - target_temp:', target_temp, typeof target_temp);
      console.log('  - targetTemp:', targetTemp, typeof targetTemp);
      console.log('  - 验证条件:', !targetTemp, targetTemp < 16, targetTemp > 30);
      console.log('  - 数值检查:', Number(targetTemp), Number.isNaN(Number(targetTemp)));

      // 确保targetTemp是数字类型
      const numericTemp = Number(targetTemp);
      
      if (!targetTemp || Number.isNaN(numericTemp) || numericTemp < 16 || numericTemp > 30) {
        console.log('❌ 温度验证失败');
        return res.status(400).json({
          success: false,
          message: '目标温度必须在16-30度之间'
        });
      }

      console.log('✅ 温度验证通过，调用服务');
      const result = await thermostatService.setTemperature(deviceId, numericTemp, tenantId, userId);

      // 获取设备最新状态
      const deviceStatus = await thermostatService.getThermostatDevice(deviceId, tenantId);

      res.json({
        success: true,
        message: '温度设置成功',
        data: {
          command: result,
          device: deviceStatus
        }
      });

    } catch (error) {
      logger.error('设置温度失败:', error);
      res.status(500).json({
        success: false,
        message: '设置温度失败',
        error: error.message
      });
    }
  }

  /**
   * 设置风速
   */
  async setFanSpeed(req, res) {
    try {
      const { deviceId } = req.params;
      const { fan_speed } = req.body;
      const tenantId = getTenantScope(req);
      const userId = req.user.id;

      if (fan_speed === undefined || fan_speed === null || fan_speed < 0 || fan_speed > 3) {
        return res.status(400).json({
          success: false,
          message: '风速必须在0-3之间（0为自动，1-3为档位）'
        });
      }

      const result = await thermostatService.setFanSpeed(deviceId, fan_speed, tenantId, userId);

      // 获取设备最新状态
      const deviceStatus = await thermostatService.getThermostatDevice(deviceId, tenantId);

      res.json({
        success: true,
        message: '风速设置成功',
        data: {
          command: result,
          device: deviceStatus
        }
      });

    } catch (error) {
      logger.error('设置风速失败:', error);
      res.status(500).json({
        success: false,
        message: '设置风速失败',
        error: error.message
      });
    }
  }

  /**
   * 设置空调模式
   */
  async setMode(req, res) {
    try {
      const { deviceId } = req.params;
      const { ac_mode } = req.body;
      const tenantId = getTenantScope(req);
      const userId = req.user.id;

      const validModes = ['cool', 'heat', 'dehumidify', 'fan'];
      if (!ac_mode || !validModes.includes(ac_mode)) {
        return res.status(400).json({
          success: false,
          message: '无效的空调模式'
        });
      }

      const result = await thermostatService.setMode(deviceId, ac_mode, tenantId, userId);

      // 获取设备最新状态
      const deviceStatus = await thermostatService.getThermostatDevice(deviceId, tenantId);

      res.json({
        success: true,
        message: '模式设置成功',
        data: {
          command: result,
          device: deviceStatus
        }
      });

    } catch (error) {
      logger.error('设置模式失败:', error);
      res.status(500).json({
        success: false,
        message: '设置模式失败',
        error: error.message
      });
    }
  }

  /**
   * 切换童锁状态 - 锁定/解锁温控器现场控制
   * 当童锁开启时，温控器现场面板将无法操作，只能通过远程控制
   */
  async toggleTempLock(req, res) {
    try {
      const { deviceId } = req.params;
      const { locked } = req.body;
      const tenantId = getTenantScope(req);
      const userId = req.user.id;

      const result = await thermostatService.toggleTempLock(deviceId, locked, tenantId, userId);

      // 获取设备最新状态
      const deviceStatus = await thermostatService.getThermostatDevice(deviceId, tenantId);

      res.json({
        success: true,
        message: locked ? '温控器现场控制已锁定，只能远程操作' : '温控器现场控制已解锁，可现场操作',
        data: {
          command: result,
          device: deviceStatus
        }
      });

    } catch (error) {
      logger.error('童锁操作失败:', error);
      res.status(500).json({
        success: false,
        message: '童锁操作失败',
        error: error.message
      });
    }
  }

  /**
   * 读取设备状态
   */
  async getDeviceStatus(req, res) {
    try {
      const { deviceId } = req.params;
      const tenantId = getTenantScope(req);
      const userId = req.user.id;

      const result = await thermostatService.getDeviceStatus(deviceId, tenantId, userId);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          message: '设备状态查询成功'
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message || '设备状态查询失败'
        });
      }

    } catch (error) {
      logger.error('设备状态查询失败:', error);
      res.status(500).json({
        success: false,
        message: '设备状态查询失败',
        error: error.message
      });
    }
  }

  /**
   * 强制刷新设备状态
   */
  async forceRefreshDeviceStatus(req, res) {
    try {
      const { deviceId } = req.params;
      const tenantId = getTenantScope(req);

      // 检查设备是否存在且属于当前租户
      const device = await thermostatService.getThermostatDevice(deviceId, tenantId);
      if (!device) {
        return res.status(404).json({
          success: false,
          message: '设备不存在或无权限访问'
        });
      }

      const result = await thermostatService.forceRefreshDeviceStatus(deviceId, tenantId, req.user.id);

      res.json({
        success: true,
        message: '设备状态强制刷新成功',
        data: result
      });

    } catch (error) {
      logger.error('强制刷新设备状态失败:', error);
      res.status(500).json({
        success: false,
        message: '强制刷新设备状态失败',
        error: error.message
      });
    }
  }

  /**
   * 获取设备协议配置
   */
  async getDeviceProtocolConfig(req, res) {
    try {
      const { deviceId } = req.params;
      const tenantId = getTenantScope(req);
      const userId = req.user.id;

      const result = await thermostatService.getDeviceProtocolConfig(deviceId, tenantId, userId);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          message: '设备协议配置获取成功'
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message || '设备协议配置获取失败'
        });
      }

    } catch (error) {
      logger.error('设备协议配置获取失败:', error);
      res.status(500).json({
        success: false,
        message: '设备协议配置获取失败',
        error: error.message
      });
    }
  }

  // ============================================
  // 开关机计划管理
  // ============================================

  /**
   * 获取租户的所有计划列表
   */
  async getScheduleList(req, res) {
    try {
      const tenantId = getTenantScope(req);

      const schedules = await scheduleService.getScheduleList(tenantId);

      res.json({
        success: true,
        data: schedules
      });

    } catch (error) {
      logger.error('获取计划列表失败:', error);
      res.status(500).json({
        success: false,
        message: '获取计划列表失败',
        error: error.message
      });
    }
  }

  /**
   * 根据ID获取计划详情
   */
  async getScheduleById(req, res) {
    try {
      const { scheduleId } = req.params;
      const tenantId = getTenantScope(req);
      
      const schedule = await scheduleService.getScheduleById(scheduleId, tenantId);
      
      if (!schedule) {
        return res.status(404).json({
          success: false,
          message: '计划不存在'
        });
      }
      
      res.json({
        success: true,
        data: schedule
      });
    } catch (error) {
      logger.error('获取计划详情失败:', error);
      res.status(500).json({
        success: false,
        message: '获取计划详情失败',
        error: error.message
      });
    }
  }

  /**
   * 获取设备的计划列表（兼容旧接口）
   */
  async getDeviceSchedules(req, res) {
    try {
      const { deviceId } = req.params;
      const tenantId = getTenantScope(req);

      const schedules = await scheduleService.getDeviceSchedules(deviceId, tenantId);

      res.json({
        success: true,
        data: schedules
      });

    } catch (error) {
      logger.error('获取设备计划失败:', error);
      res.status(500).json({
        success: false,
        message: '获取设备计划失败',
        error: error.message
      });
    }
  }

  /**
   * 创建计划
   */
  async createSchedule(req, res) {
    try {
      const scheduleData = req.body;
      const tenantId = getTenantScope(req);

      // 验证必填字段
      if (!scheduleData.name || !scheduleData.executeTime || !scheduleData.repeatType) {
        return res.status(400).json({
          success: false,
          message: '计划名称、执行时间和重复类型为必填项'
        });
      }

      const schedule = await scheduleService.createSchedule(scheduleData, tenantId);

      res.status(201).json({
        success: true,
        message: '计划创建成功',
        data: schedule
      });

    } catch (error) {
      logger.error('创建计划失败:', error);
      res.status(500).json({
        success: false,
        message: '创建计划失败',
        error: error.message
      });
    }
  }

  /**
   * 更新计划
   */
  async updateSchedule(req, res) {
    try {
      const { scheduleId } = req.params;
      const scheduleData = req.body;
      const tenantId = getTenantScope(req);

      // 验证必填字段
      if (!scheduleData.name || !scheduleData.executeTime || !scheduleData.repeatType) {
        return res.status(400).json({
          success: false,
          message: '计划名称、执行时间和重复类型为必填项'
        });
      }

      const schedule = await scheduleService.updateSchedule(scheduleId, scheduleData, tenantId);

      if (!schedule) {
        return res.status(404).json({
          success: false,
          message: '计划不存在'
        });
      }

      res.json({
        success: true,
        message: '计划更新成功',
        data: schedule
      });

    } catch (error) {
      logger.error('更新计划失败:', error);
      res.status(500).json({
        success: false,
        message: '更新计划失败',
        error: error.message
      });
    }
  }

  /**
   * 删除计划
   */
  async deleteSchedule(req, res) {
    try {
      const { scheduleId } = req.params;
      const tenantId = getTenantScope(req);

      const result = await scheduleService.deleteSchedule(scheduleId, tenantId);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: '计划不存在'
        });
      }

      res.json({
        success: true,
        message: '计划删除成功'
      });

    } catch (error) {
      logger.error('删除计划失败:', error);
      res.status(500).json({
        success: false,
        message: '删除计划失败',
        error: error.message
      });
    }
  }

  /**
   * 启用/禁用计划
   */
  async toggleSchedule(req, res) {
    try {
      const { scheduleId } = req.params;
      const { enabled } = req.body;
      const tenantId = getTenantScope(req);

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'enabled字段必须为布尔值'
        });
      }

      const schedule = await scheduleService.toggleSchedule(scheduleId, enabled, tenantId);

      if (!schedule) {
        return res.status(404).json({
          success: false,
          message: '计划不存在'
        });
      }

      res.json({
        success: true,
        message: enabled ? '计划已启用' : '计划已禁用',
        data: schedule
      });

    } catch (error) {
      logger.error('切换计划状态失败:', error);
      res.status(500).json({
        success: false,
        message: '切换计划状态失败',
        error: error.message
      });
    }
  }

  // ============================================
  // 运行统计
  // ============================================

  /**
   * 获取设备运行统计
   */
  async getDeviceStats(req, res) {
    try {
      const { deviceId } = req.params;
      const { date } = req.query;
      const tenantId = getTenantScope(req);

      const stats = await thermostatService.getDeviceStats(deviceId, date, tenantId);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('获取设备统计失败:', error);
      res.status(500).json({
        success: false,
        message: '获取设备统计失败',
        error: error.message
      });
    }
  }

  /**
   * 获取设备运行统计（按日期范围）
   */
  async getDeviceStatsRange(req, res) {
    try {
      const { deviceId } = req.params;
      const { startDate, endDate } = req.query;
      const tenantId = getTenantScope(req);

      const stats = await thermostatService.getDeviceStatsRange(deviceId, startDate, endDate, tenantId);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('获取设备统计范围失败:', error);
      res.status(500).json({
        success: false,
        message: '获取设备统计范围失败',
        error: error.message
      });
    }
  }

  /**
   * 获取租户下所有设备统计汇总
   */
  async getTenantStatsSummary(req, res) {
    try {
      const tenantId = getTenantScope(req);
      const { date } = req.query;

      const summary = await thermostatService.getTenantStatsSummary(tenantId, date);

      res.json({
        success: true,
        data: summary
      });

    } catch (error) {
      logger.error('获取租户统计汇总失败:', error);
      res.status(500).json({
        success: false,
        message: '获取租户统计汇总失败',
        error: error.message
      });
    }
  }

  /**
   * 获取运行统计数据（支持运行模式过滤）
   */
  async getRunningStats(req, res) {
    try {
      const tenantId = getTenantScope(req);
      const { dateRange, startDate, endDate, deviceId, groupId, mode } = req.query;
      
      const options = {
        dateRange: startDate && endDate
          ? [startDate, endDate]
          : (dateRange ? JSON.parse(dateRange) : []),
        deviceId: deviceId || null,
        groupId: groupId || null,
        mode: mode || null
      };
      
      const stats = await thermostatService.getRunningStats(tenantId, options);
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('获取运行统计数据失败:', error);
      res.status(500).json({
        success: false,
        message: '获取运行统计数据失败',
        error: error.message
      });
    }
  }

  /**
   * 获取运行时间统计数据
   */
  async getRuntimeStats(req, res) {
    try {
      const tenantId = getTenantScope(req);
      const { startDate, endDate, deviceId, groupId } = req.query;
      
      const options = {
        dateRange: startDate && endDate ? [startDate, endDate] : [],
        deviceId: deviceId || null,
        groupId: groupId || null
      };
      
      const stats = await thermostatService.getRunningStats(tenantId, options);
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('获取运行时间统计数据失败:', error);
      res.status(500).json({
        success: false,
        message: '获取运行时间统计数据失败',
        error: error.message
      });
    }
  }

  // ============================================
  // 情景模式
  // ============================================

  /**
   * 获取情景模式列表
   */
  async getScenes(req, res) {
    try {
      const tenantId = getTenantScope(req);
      const scenes = await thermostatService.getScenes(tenantId);

      res.json({
        success: true,
        data: scenes
      });

    } catch (error) {
      logger.error('获取情景模式列表失败:', error);
      res.status(500).json({
        success: false,
        message: '获取情景模式列表失败',
        error: error.message
      });
    }
  }

  /**
   * 创建自定义情景模式
   */
  async createScene(req, res) {
    try {
      const sceneData = req.body;
      const tenantId = getTenantScope(req);

      const scene = await thermostatService.createScene(sceneData, tenantId);

      res.status(201).json({
        success: true,
        message: '情景模式创建成功',
        data: scene
      });

    } catch (error) {
      logger.error('创建情景模式失败:', error);
      res.status(500).json({
        success: false,
        message: '创建情景模式失败',
        error: error.message
      });
    }
  }

  /**
   * 更新情景模式
   */
  async updateScene(req, res) {
    try {
      const { sceneId } = req.params;
      const sceneData = req.body;
      const tenantId = getTenantScope(req);

      const scene = await thermostatService.updateScene(sceneId, sceneData, tenantId);

      if (!scene) {
        return res.status(404).json({
          success: false,
          message: '情景模式不存在'
        });
      }

      res.json({
        success: true,
        message: '情景模式更新成功',
        data: scene
      });

    } catch (error) {
      logger.error('更新情景模式失败:', error);
      res.status(500).json({
        success: false,
        message: '更新情景模式失败',
        error: error.message
      });
    }
  }

  /**
   * 删除情景模式
   */
  async deleteScene(req, res) {
    try {
      const { sceneId } = req.params;
      const tenantId = getTenantScope(req);

      const result = await thermostatService.deleteScene(sceneId, tenantId);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: '情景模式不存在'
        });
      }

      res.json({
        success: true,
        message: '情景模式删除成功'
      });

    } catch (error) {
      logger.error('删除情景模式失败:', error);
      res.status(500).json({
        success: false,
        message: '删除情景模式失败',
        error: error.message
      });
    }
  }

  /**
   * 执行情景模式
   */
  async executeScene(req, res) {
    try {
      const { sceneId } = req.params;
      const { deviceIds } = req.body;
      const tenantId = getTenantScope(req);
      const userId = req.user.id;

      const result = await thermostatService.executeScene(sceneId, deviceIds, tenantId, userId);

      res.json({
        success: true,
        message: '情景模式执行成功',
        data: result
      });

    } catch (error) {
      logger.error('执行情景模式失败:', error);
      res.status(500).json({
        success: false,
        message: '执行情景模式失败',
        error: error.message
      });
    }
  }

  // ============================================
  // 控制日志
  // ============================================

  /**
   * 获取设备控制日志
   */
  async getDeviceLogs(req, res) {
    try {
      const { deviceId } = req.params;
      const { page = 1, pageSize = 20 } = req.query;
      const tenantId = getTenantScope(req);

      const result = await thermostatService.getDeviceLogs(
        deviceId,
        parseInt(page),
        parseInt(pageSize),
        tenantId
      );

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('获取设备控制日志失败:', error);
      res.status(500).json({
        success: false,
        message: '获取设备控制日志失败',
        error: error.message
      });
    }
  }

  /**
   * 获取租户控制日志
   */
  async getTenantLogs(req, res) {
    try {
      const { page = 1, pageSize = 20 } = req.query;
      const tenantId = getTenantScope(req);

      const result = await thermostatService.getTenantLogs(
        parseInt(page),
        parseInt(pageSize),
        tenantId
      );

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('获取租户控制日志失败:', error);
      res.status(500).json({
        success: false,
        message: '获取租户控制日志失败',
        error: error.message
      });
    }
  }

  // ============================================
  // 批量操作
  // ============================================

  /**
   * 批量开启设备
   */
  async batchPowerOn(req, res) {
    try {
      const { deviceIds, settings } = req.body;
      const tenantId = getTenantScope(req);
      const userId = req.user.id;

      if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: '设备ID列表不能为空'
        });
      }

      const result = await thermostatService.batchPowerOn(deviceIds, settings, tenantId, userId);

      res.json({
        success: true,
        message: '批量开启设备成功',
        data: result
      });

    } catch (error) {
      logger.error('批量开启设备失败:', error);
      res.status(500).json({
        success: false,
        message: '批量开启设备失败',
        error: error.message
      });
    }
  }

  /**
   * 批量关闭设备
   */
  async batchPowerOff(req, res) {
    try {
      const { deviceIds } = req.body;
      const tenantId = getTenantScope(req);
      const userId = req.user.id;

      if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: '设备ID列表不能为空'
        });
      }

      const result = await thermostatService.batchPowerOff(deviceIds, tenantId, userId);

      res.json({
        success: true,
        message: '批量关闭设备成功',
        data: result
      });

    } catch (error) {
      logger.error('批量关闭设备失败:', error);
      res.status(500).json({
        success: false,
        message: '批量关闭设备失败',
        error: error.message
      });
    }
  }

  /**
   * 批量设置温度
   */
  async batchSetTemperature(req, res) {
    try {
      const { deviceIds, target_temp } = req.body;
      const tenantId = getTenantScope(req);
      const userId = req.user.id;

      if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: '设备ID列表不能为空'
        });
      }

      if (!target_temp || target_temp < 16 || target_temp > 30) {
        return res.status(400).json({
          success: false,
          message: '目标温度必须在16-30度之间'
        });
      }

      const result = await thermostatService.batchSetTemperature(deviceIds, target_temp, tenantId, userId);

      res.json({
        success: true,
        message: '批量设置温度成功',
        data: result
      });

    } catch (error) {
      logger.error('批量设置温度失败:', error);
      res.status(500).json({
        success: false,
        message: '批量设置温度失败',
        error: error.message
      });
    }
  }

  /**
   * 批量设置模式
   */
  async batchSetMode(req, res) {
    try {
      const { deviceIds, ac_mode } = req.body;
      const tenantId = getTenantScope(req);
      const userId = req.user.id;

      if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: '设备ID列表不能为空'
        });
      }

      const validModes = ['cool', 'heat', 'dehumidify', 'fan'];
      if (!ac_mode || !validModes.includes(ac_mode)) {
        return res.status(400).json({
          success: false,
          message: '无效的空调模式'
        });
      }

      const result = await thermostatService.batchSetMode(deviceIds, ac_mode, tenantId, userId);

      res.json({
        success: true,
        message: '批量设置模式成功',
        data: result
      });

    } catch (error) {
      logger.error('批量设置模式失败:', error);
      res.status(500).json({
        success: false,
        message: '批量设置模式失败',
        error: error.message
      });
    }
  }
}

module.exports = new ThermostatController();
