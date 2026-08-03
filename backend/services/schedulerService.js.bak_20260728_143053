const { Pool } = require('pg');
const logger = require('../utils/logger');
const { getPoolConfig } = require('../config/database');


// 查询结果缓存（已优化：添加容量限制和定期清理，防止内存泄漏）
const queryCache = new Map();
const CACHE_TTL = 60000; // 1分钟缓存
const MAX_CACHE_SIZE = 1000; // 最大缓存条目数
const CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5分钟清理一次过期条目

// 定期清理过期缓存
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of queryCache) {
    if (now - entry.timestamp > CACHE_TTL * 3) {
      queryCache.delete(key);
      cleaned++;
    }
  }
  // LRU淘汰：如果还超额，删除最老的
  if (queryCache.size > MAX_CACHE_SIZE) {
    const entries = [...queryCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, queryCache.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) { queryCache.delete(key); cleaned++; }
  }
  if (cleaned > 0) {
    console.log('queryCache cleanup: removed', cleaned, 'entries, remaining:', queryCache.size);
  }
}, CACHE_CLEANUP_INTERVAL);
class SchedulerService {
  constructor() {
    this.pool = new Pool(getPoolConfig());
    this.schedulerTimer = null;
    this.isRunning = false;
  }

  /**
   * 启动定时任务调度器
   */
  start() {
    if (this.isRunning) {
      logger.warn('定时任务调度器已在运行');
      return;
    }

    this.isRunning = true;
    // 每分钟检查一次定时任务
    this.schedulerTimer = setInterval(() => {
      this.checkAndExecuteScheduledScenes();
    }, 60 * 1000); // 60秒

    logger.info('定时任务调度器已启动');
  }

  /**
   * 停止定时任务调度器
   */
  stop() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.isRunning = false;
    logger.info('定时任务调度器已停止');
  }

  /**
   * 检查并执行定时任务
   */
  async checkAndExecuteScheduledScenes() {
    try {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS
      const currentDay = now.getDay(); // 0=周日, 1=周一, ..., 6=周六

      logger.info(`定时任务检查: 当前时间=${currentTime}, 星期=${currentDay}`);

      // 检查温控器计划
      await this.checkAndExecuteThermostatSchedules(currentTime, currentDay);
      
      // 检查照明情景模式
      await this.checkAndExecuteLightingScenes(currentTime, currentDay);
      
    } catch (error) {
      logger.error('检查定时任务失败:', error);
    }
  }

  /**
   * 检查并执行温控器计划
   */
  async checkAndExecuteThermostatSchedules(currentTime, currentDay) {
    try {
      const currentTimeMinute = currentTime.slice(0, 5); // HH:MM
      
      // 查询需要执行的温控器计划
      const query = `
        SELECT ts.*, 
               COALESCE(
                 JSON_AGG(
                   CASE WHEN d.id IS NOT NULL THEN
                     JSON_BUILD_OBJECT(
                       'device_id', d.id,
                       'device_name', d.name,
                       'device_code', d.device_id
                     )
                   END
                 ) FILTER (WHERE d.id IS NOT NULL), 
                 '[]'::json
               ) as devices
        FROM thermostat_schedules ts
        LEFT JOIN thermostat_schedule_devices tsd ON ts.id = tsd.schedule_id
        LEFT JOIN devices d ON tsd.device_id = d.id
        WHERE ts.enabled = true 
          AND ts.execute_time = $1::time
          AND (
            ts.repeat_type = 'daily' OR
            (ts.repeat_type = 'weekly' AND $2 = ANY(ts.week_days)) OR
            (ts.repeat_type = 'once' AND (ts.custom_dates IS NULL OR CURRENT_DATE = ANY(ts.custom_dates)))
          )
        GROUP BY ts.id
        LIMIT 100
      `;

      const result = await this.pool.query(query, [currentTimeMinute, currentDay]);
      
      logger.info(`温控器计划查询结果: 找到 ${result.rows.length} 个匹配的计划`);
      
      if (result.rows.length > 0) {
        for (const schedule of result.rows) {
          await this.executeThermostatSchedule(schedule);
        }
      }
    } catch (error) {
      logger.error('检查温控器计划失败:', error);
    }
  }

  /**
   * 检查并执行照明情景模式
   */
  async checkAndExecuteLightingScenes(currentTime, currentDay) {
    try {
      const currentTimeMinute = currentTime.slice(0, 5); // HH:MM
      
      // 1. 检查需要开启(start_time)的情景模式
      const startQuery = `
        SELECT id, scene_name, devices_config, start_time, repeat_days
        FROM lighting_scenes 
        WHERE enable_timer = true 
          AND is_active = true 
          AND start_time IS NOT NULL
          AND SUBSTRING(start_time::text FROM 1 FOR 5) = $1
          AND $2 = ANY(repeat_days)
      `;

      const startResult = await this.pool.query(startQuery, [currentTimeMinute, currentDay]);
      
      logger.info(`照明情景模式(开启)查询结果: 找到 ${startResult.rows.length} 个匹配的情景模式`);
      
      if (startResult.rows.length > 0) {
        for (const scene of startResult.rows) {
          await this.executeSceneOnAction(scene);
        }
      }

      // 2. 检查需要关闭(end_time)的情景模式
      const endQuery = `
        SELECT id, scene_name, devices_config, end_time, repeat_days
        FROM lighting_scenes 
        WHERE enable_timer = true 
          AND is_active = true 
          AND end_time IS NOT NULL
          AND SUBSTRING(end_time::text FROM 1 FOR 5) = $1
          AND $2 = ANY(repeat_days)
      `;

      const endResult = await this.pool.query(endQuery, [currentTimeMinute, currentDay]);
      
      logger.info(`照明情景模式(关闭)查询结果: 找到 ${endResult.rows.length} 个匹配的情景模式`);
      
      if (endResult.rows.length > 0) {
        for (const scene of endResult.rows) {
          await this.executeSceneOffAction(scene);
        }
      }
    } catch (error) {
      logger.error('检查照明情景模式失败:', error);
    }
  }

  /**
   * 执行温控器计划
   */
  async executeThermostatSchedule(schedule) {
    try {
      logger.info(`执行温控器计划: ${schedule.name} (ID: ${schedule.id})`);
      
      const devices = schedule.devices;
      if (!devices || !Array.isArray(devices) || devices.length === 0) {
        logger.warn(`温控器计划 ${schedule.name} 没有关联的设备`);
        return;
      }

      // 获取温控器服务实例
      const thermostatService = require('./thermostatService');
      
      // 为每个设备执行计划动作
      for (const device of devices) {
        await this.executeThermostatAction(thermostatService, device, schedule);
      }

      logger.info(`温控器计划 ${schedule.name} 执行完成`);
    } catch (error) {
      logger.error(`执行温控器计划 ${schedule.name} 失败:`, error);
    }
  }

  /**
   * 执行单个设备的温控器动作
   */
  async executeThermostatAction(thermostatService, device, schedule) {
    try {
      const { device_id, device_name } = device;
      const { power_action, ac_mode, target_temp, fan_speed, tenant_id } = schedule;
      
      logger.info(`执行设备 ${device_name} (${device_id}) 的温控器动作: ${power_action}`);
      
      if (power_action === 'on') {
        // 开机动作
        const settings = {};
        if (target_temp !== undefined && target_temp !== null) {
          settings.target_temp = target_temp;
        }
        if (ac_mode !== undefined && ac_mode !== null) {
          settings.mode = ac_mode;
        }
        if (fan_speed !== undefined && fan_speed !== null) {
          settings.fan_speed = fan_speed;
        }
        
        await thermostatService.powerOnDevice(device_id, settings, tenant_id, null);
        logger.info(`设备 ${device_name} 开机指令已发送`, settings);
        
      } else if (power_action === 'off') {
        // 关机动作
        await thermostatService.powerOffDevice(device_id, tenant_id, null);
        logger.info(`设备 ${device_name} 关机指令已发送`);
        
      } else {
        logger.warn(`未知的温控器动作: ${power_action}`);
      }
      
    } catch (error) {
      logger.error(`执行设备 ${device.device_name} 的温控器动作失败:`, error);
    }
  }

  /**
   * 执行情景模式的开灯/应用配置动作
   */
  async executeSceneOnAction(scene) {
    try {
      logger.info(`执行定时开启情景模式: ${scene.scene_name}`);
      
      const sceneConfig = scene.devices_config;
      if (!sceneConfig || !Array.isArray(sceneConfig)) {
        logger.warn(`情景模式 ${scene.scene_name} 配置无效`);
        return;
      }

      // 获取MQTT服务实例
      const mqttService = global.mqttServiceInstance;
      if (!mqttService || !mqttService.isConnected) {
        logger.error('MQTT服务未连接，无法执行定时开启');
        return;
      }

      // 为每个设备执行应用配置操作
      for (const device of sceneConfig) {
        await this.applyDeviceConfig(mqttService, device);
      }

      logger.info(`定时开启情景模式 ${scene.scene_name} 执行完成`);
    } catch (error) {
      logger.error(`执行定时开启情景模式 ${scene.scene_name} 失败:`, error);
    }
  }

  /**
   * 应用设备的配置状态
   */
  async applyDeviceConfig(mqttService, device) {
    try {
      const { deviceId, type, config } = device;
      
      if (!config) {
        logger.warn(`设备 ${deviceId} 缺少配置信息`);
        return;
      }

      const command = {
        type: 'event',
        ...config
      };

      // 查询设备信息
      const deviceQuery = `
        SELECT d.*, dt.name as device_type_name
        FROM devices d
        LEFT JOIN device_types dt ON d.device_type_id = dt.id
        WHERE d.device_id = $1
      `;
      
      const deviceResult = await this.pool.query(deviceQuery, [deviceId]);
      if (deviceResult.rows.length === 0) {
        logger.warn(`设备不存在: ${deviceId}`);
        return;
      }

      const deviceInfo = deviceResult.rows[0];
      
      // 发送MQTT控制指令
      await mqttService.sendCommandToDevice(deviceInfo.imei || deviceInfo.device_id, command);
      
      // 通过WebSocket推送设备状态更新通知
      const websocketService = require('./websocketService');
      const statusUpdate = {
        deviceId: deviceInfo.imei || deviceInfo.device_id,
        switches: { ...command }
      };
      
      delete statusUpdate.switches.type;
      
      websocketService.broadcastToClients('lighting_switch_status', statusUpdate);
      
      logger.info(`设备 ${deviceInfo.name} (${deviceId}) 定时开启指令已发送`, {
        deviceId: statusUpdate.deviceId,
        switches: statusUpdate.switches
      });
    } catch (error) {
      logger.error(`开启设备 ${device.deviceId} 失败:`, error);
    }
  }

  /**
   * 执行情景模式的关灯动作
   */
  async executeSceneOffAction(scene) {
    try {
      logger.info(`执行定时关灯情景模式: ${scene.scene_name}`);
      
      const sceneConfig = scene.devices_config;
      if (!sceneConfig || !Array.isArray(sceneConfig)) {
        logger.warn(`情景模式 ${scene.scene_name} 配置无效`);
        return;
      }

      // 获取MQTT服务实例
      const mqttService = global.mqttServiceInstance;
      if (!mqttService || !mqttService.isConnected) {
        logger.error('MQTT服务未连接，无法执行定时关灯');
        return;
      }

      // 为每个设备执行关灯操作
      for (const device of sceneConfig) {
        await this.turnOffDevice(mqttService, device);
      }

      logger.info(`定时关灯情景模式 ${scene.scene_name} 执行完成`);
    } catch (error) {
      logger.error(`执行定时关灯情景模式 ${scene.scene_name} 失败:`, error);
    }
  }

  /**
   * 关闭单个设备
   */
  async turnOffDevice(mqttService, device) {
    try {
      const { deviceId, type } = device;
      
      // 根据设备类型构造关灯指令
      let command;
      switch (type) {
        case 'single':
          command = { type: 'event', key2: 0 };
          break;
        case 'double':
          command = { type: 'event', key1: 0, key3: 0 };
          break;
        case 'triple':
          command = { type: 'event', key1: 0, key2: 0, key3: 0 };
          break;
        default:
          logger.warn(`未知的设备类型: ${type}`);
          return;
      }

      // 查询设备信息
      const deviceQuery = `
        SELECT d.*, dt.name as device_type_name
        FROM devices d
        LEFT JOIN device_types dt ON d.device_type_id = dt.id
        WHERE d.device_id = $1
      `;
      
      const deviceResult = await this.pool.query(deviceQuery, [deviceId]);
      if (deviceResult.rows.length === 0) {
        logger.warn(`设备不存在: ${deviceId}`);
        return;
      }

      const deviceInfo = deviceResult.rows[0];
      
      // 发送MQTT控制指令
      await mqttService.sendCommandToDevice(deviceInfo.imei || deviceInfo.device_id, command);
      
      // 通过WebSocket推送设备状态更新通知
      const websocketService = require('./websocketService');
      const statusUpdate = {
        deviceId: deviceInfo.imei || deviceInfo.device_id, // 使用IMEI作为deviceId，与前端保持一致
        switches: { ...command }
      };
      
      // 移除type字段，只保留开关状态
      delete statusUpdate.switches.type;
      
      websocketService.broadcastToClients('lighting_switch_status', statusUpdate);
      
      logger.info(`设备 ${deviceInfo.name} (${deviceId}) 定时关灯指令已发送，WebSocket状态更新已推送`, {
        deviceId: statusUpdate.deviceId,
        switches: statusUpdate.switches
      });
    } catch (error) {
      logger.error(`关闭设备 ${device.deviceId} 失败:`, error);
    }
  }

  /**
   * 获取当前活跃的定时情景模式
   */
  async getActiveScheduledScenes() {
    try {
      const query = `
        SELECT id, scene_name, end_time, repeat_days, created_at
        FROM lighting_scenes 
        WHERE enable_timer = true 
          AND is_active = true
        ORDER BY end_time
      `;
      
      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      logger.error('获取活跃定时情景模式失败:', error);
      return [];
    }
  }
}

module.exports = new SchedulerService();