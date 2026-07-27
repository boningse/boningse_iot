const express = require('express');
const { Op, QueryTypes } = require('sequelize');
const { User, Tenant, Device, DeviceLog, DeviceType, sequelize } = require('../models');
const {
  authenticateToken,
  requireAdmin
} = require('../middleware/auth');
const {
  validatePagination
} = require('../middleware/validation');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const router = express.Router();
const mqttService = require('../services/mqttService');
const { version: packageVersion } = require('../package.json');
const appVersion = process.env.APP_VERSION || packageVersion;

const CURRENT_TELEMETRY_TABLES = [
  'switch_status_measurements',
  'switch_electrical_measurements',
  'lighting_status_measurements',
  'lighting_electrical_measurements',
  'air_conditioner_status_measurements',
  'air_conditioner_electrical_measurements',
  'thermostat_status_measurements',
  'thermostat_electrical_measurements'
];

const telemetryUnionSql = CURRENT_TELEMETRY_TABLES
  .map((table) => `SELECT tenant_id, measured_at FROM ${table}`)
  .join(' UNION ALL ');

async function countCurrentTelemetry({ tenantId = null, since = null } = {}) {
  const where = [];
  const replacements = {};
  if (tenantId) {
    where.push('tenant_id = :tenantId');
    replacements.tenantId = tenantId;
  }
  if (since) {
    where.push('measured_at >= :since');
    replacements.since = since;
  }
  const rows = await sequelize.query(
    `SELECT COUNT(*)::bigint AS count FROM (${telemetryUnionSql}) telemetry${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`,
    { replacements, type: QueryTypes.SELECT }
  );
  return Number(rows[0]?.count || 0);
}

async function getCurrentTelemetryTimeline({ tenantId = null, since, until }) {
  const where = ['measured_at >= :since', 'measured_at <= :until'];
  const replacements = { since, until };
  if (tenantId) {
    where.push('tenant_id = :tenantId');
    replacements.tenantId = tenantId;
  }
  return sequelize.query(
    `SELECT to_char(date_trunc('minute', measured_at), 'YYYY-MM-DD HH24:MI:00') AS minute,
            COUNT(*)::bigint AS count
       FROM (${telemetryUnionSql}) telemetry
      WHERE ${where.join(' AND ')}
      GROUP BY date_trunc('minute', measured_at)
      ORDER BY date_trunc('minute', measured_at)`,
    { replacements, type: QueryTypes.SELECT }
  );
}

/**
 * @route GET /api/system/stats
 * @desc 获取系统统计信息
 * @access Private
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // 根据用户角色设置数据范围
    let deviceWhereClause = {};
    let userWhereClause = {};

    if (user.role !== 'admin') {
      // 非管理员只能看到自己租户的数据
      deviceWhereClause.tenant_id = user.tenant_id;
      userWhereClause.tenant_id = user.tenant_id;
    }

    // 获取基础统计
    const [totalUsers, totalTenants, totalDevices, totalDataPoints] = await Promise.all([
      user.role === 'admin' ? User.count() : User.count({ where: userWhereClause }),
      user.role === 'admin' ? Tenant.count() : 1, // 非管理员只显示自己的租户
      Device.count({ where: deviceWhereClause }),
      countCurrentTelemetry({ tenantId: deviceWhereClause.tenant_id })
    ]);

    // 获取活跃统计
    const [activeUsers, activeTenants, onlineDevices] = await Promise.all([
      user.role === 'admin' ? User.count({ where: { status: 'active' } }) : User.count({ where: { ...userWhereClause, status: 'active' } }),
      user.role === 'admin' ? Tenant.count({ where: { status: 'active' } }) : 1, // 非管理员只显示自己的租户
      Device.count({ where: { ...deviceWhereClause, status: 'online' } })
    ]);

    // 获取最近24小时的数据
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentUsers, recentDevices, recentDataPoints] = await Promise.all([
      user.role === 'admin' ? User.count({ where: { created_at: { [Op.gte]: last24Hours } } }) : User.count({ where: { ...userWhereClause, created_at: { [Op.gte]: last24Hours } } }),
      Device.count({ where: { ...deviceWhereClause, created_at: { [Op.gte]: last24Hours } } }),
      countCurrentTelemetry({ tenantId: deviceWhereClause.tenant_id, since: last24Hours })
    ]);

    // 获取设备类型统计
    const deviceTypeStats = await Device.findAll({
      where: deviceWhereClause,
      attributes: [
        'device_type_id',
        [sequelize.fn('COUNT', sequelize.col('Device.id')), 'count']
      ],
      include: [{
        model: DeviceType,
        as: 'device_type',
        attributes: ['name']
      }],
      group: ['device_type_id', 'device_type.id', 'device_type.name'],
      raw: true
    });

    // 获取租户设备数量排行
    let tenantDeviceStats = [];
    if (user.role === 'admin') {
      tenantDeviceStats = await sequelize.query(`
        SELECT 
          t.id,
          t.name,
          COUNT(d.id) as device_count
        FROM tenants t
        LEFT JOIN devices d ON t.id = d.tenant_id
        GROUP BY t.id, t.name
        ORDER BY device_count DESC
        LIMIT 10
      `, {
        type: sequelize.QueryTypes.SELECT
      });
    } else {
      // 非管理员只显示自己租户的信息
      tenantDeviceStats = await sequelize.query(`
        SELECT 
          t.id,
          t.name,
          COUNT(d.id) as device_count
        FROM tenants t
        LEFT JOIN devices d ON t.id = d.tenant_id
        WHERE t.id = :tenantId
        GROUP BY t.id, t.name
      `, {
        replacements: { tenantId: user.tenant_id },
        type: sequelize.QueryTypes.SELECT
      });
    }

    // 系统资源信息 (仅管理员可见)
    let systemInfo = null;
    if (user.role === 'admin') {
      // 获取磁盘使用率
      let diskUsage = 0;
      try {
        const { execSync } = require('child_process');
        const diskInfo = execSync('df -h / | tail -1', { encoding: 'utf8' });
        const usageMatch = diskInfo.match(/(\d+)%/);
        if (usageMatch) {
          diskUsage = parseInt(usageMatch[1]);
        }
      } catch (error) {
        logger.warn('Failed to get disk usage', { error: error.message });
        diskUsage = 0;
      }

      // 获取CPU使用率
      let cpuUsage = 0;
      try {
        const loadAvg = os.loadavg();
        const cpuCores = os.cpus().length;
        // 使用1分钟平均负载计算CPU使用率
        cpuUsage = Math.min(Math.round((loadAvg[0] / cpuCores) * 100), 100);
      } catch (error) {
        logger.warn('Failed to calculate CPU usage', { error: error.message });
      }

      systemInfo = {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        uptime: process.uptime(),
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem(),
          usage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
        },
        cpu: {
          cores: os.cpus().length,
          model: os.cpus()[0]?.model || 'Unknown',
          usage: cpuUsage
        },
        disk: {
          usage: diskUsage
        },
        loadAverage: os.loadavg()
      };
    }

    const responseData = {
      overview: {
        totalUsers,
        totalTenants,
        totalDevices,
        totalDataPoints,
        activeUsers,
        activeTenants,
        onlineDevices,
        offlineDevices: totalDevices - onlineDevices
      },
      recent24h: {
        newUsers: recentUsers,
        newDevices: recentDevices,
        dataPoints: recentDataPoints
      },
      deviceTypes: deviceTypeStats.reduce((acc, item) => {
        acc[item.device_type] = parseInt(item.count);
        return acc;
      }, {}),
      topTenants: tenantDeviceStats.map(item => ({
        id: item.id,
        name: item.name,
        deviceCount: parseInt(item.device_count)
      }))
    };

    // 只有管理员才能看到系统信息
    if (systemInfo) {
      responseData.system = systemInfo;
    }

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    logger.error('Get system stats error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取系统统计信息失败'
    });
  }
});

/**
 * @route GET /api/system/dashboard-stats
 * @desc 获取数据监控页面统计信息（普通用户可访问）
 * @access Private
 */
router.get('/dashboard-stats', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // 根据用户角色和租户限制数据范围
    let deviceWhereClause = {};
    let userWhereClause = {};

    if (user.role !== 'admin') {
      // 非管理员只能看到自己租户的数据
      deviceWhereClause.tenant_id = user.tenant_id;
      userWhereClause.tenant_id = user.tenant_id;
    }

    // 获取基础统计
    const [totalDevices, totalDataPoints] = await Promise.all([
      Device.count({ where: deviceWhereClause }),
      countCurrentTelemetry({ tenantId: deviceWhereClause.tenant_id })
    ]);

    // 获取设备状态统计
    const [onlineDevices, offlineDevices] = await Promise.all([
      Device.count({ where: { ...deviceWhereClause, status: 'online' } }),
      Device.count({ where: { ...deviceWhereClause, status: 'offline' } })
    ]);

    // 获取最近24小时的数据
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentDataPoints = await countCurrentTelemetry({
      tenantId: deviceWhereClause.tenant_id,
      since: last24Hours
    });

    // 获取设备类型统计
    const deviceTypeStats = await Device.findAll({
      where: deviceWhereClause,
      attributes: [
        'device_type_id',
        [sequelize.fn('COUNT', sequelize.col('Device.id')), 'count']
      ],
      include: [{
        model: DeviceType,
        as: 'device_type',
        attributes: ['name']
      }],
      group: ['device_type_id', 'device_type.id', 'device_type.name'],
      raw: true
    });

    res.json({
      success: true,
      data: {
        overview: {
          totalDevices,
          totalDataPoints,
          onlineDevices,
          offlineDevices
        },
        recent24h: {
          dataPoints: recentDataPoints
        },
        deviceTypes: deviceTypeStats.reduce((acc, item) => {
          const typeName = item['device_type.name'] || '未知类型';
          acc[typeName] = parseInt(item.count);
          return acc;
        }, {})
      }
    });
  } catch (error) {
    logger.error('Get dashboard stats error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取数据监控统计失败'
    });
  }
});

/**
 * @route GET /api/system/message-flow
 * @desc 获取消息流统计数据
 * @access Private
 */
router.get('/message-flow', authenticateToken, async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;

    // 获取MQTT消息流统计数据（现在从数据库获取历史数据）
    const messageFlowStats = await mqttService.getMessageFlowStats(timeRange);

    // 获取真实的消息处理统计数据
    let realProcessingStats = null;
    try {
      const MessageProcessingService = require('../services/messageProcessingService');
      const messageProcessingService = global.messageProcessingServiceInstance || new MessageProcessingService();
      realProcessingStats = await messageProcessingService.getRealMessageFlowStats(timeRange);
    } catch (processingError) {
      logger.warn('获取真实消息处理统计失败，使用备用数据', { error: processingError.message });
    }

    // 如果有真实的处理统计数据，使用真实数据；否则使用模拟数据
    let processed, stored;
    if (realProcessingStats) {
      processed = realProcessingStats.processed;
      stored = realProcessingStats.stored;
    } else {
      // 备用：基于接收数据的模拟计算
      processed = messageFlowStats.inbound.map(count => Math.floor(count * 0.95));
      stored = messageFlowStats.inbound.map(count => Math.floor(count * 0.90));
    }

    res.json({
      success: true,
      data: {
        timeLabels: messageFlowStats.timeLabels,
        received: messageFlowStats.inbound,
        processed: processed,
        stored: stored,
        totalReceived: messageFlowStats.totalInbound,
        totalSent: messageFlowStats.totalOutbound
      }
    });
  } catch (error) {
    logger.error('Get message flow stats error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取消息流统计失败'
    });
  }
});

/**
 * @route GET /api/system/health
 * @desc 系统健康检查
 * @access Public
 */
router.get('/health', async (req, res) => {
  try {
    const healthChecks = {
      database: false,
      memory: false,
      disk: false,
      uptime: true
    };

    // 数据库连接检查
    try {
      await require('../config/database').sequelize.authenticate();
      healthChecks.database = true;
    } catch (dbError) {
      logger.error('Database health check failed', { error: dbError.message });
    }

    // 内存使用检查（使用率超过90%为不健康）
    const memoryUsage = (os.totalmem() - os.freemem()) / os.totalmem();
    healthChecks.memory = memoryUsage < 0.9;

    // 磁盘空间检查（简单检查，实际项目中可能需要更复杂的逻辑）
    try {
      const stats = await fs.stat(process.cwd());
      healthChecks.disk = true; // 简化处理
    } catch (diskError) {
      logger.error('Disk health check failed', { error: diskError.message });
    }

    const isHealthy = Object.values(healthChecks).every(check => check === true);
    const status = isHealthy ? 'healthy' : 'unhealthy';

    res.status(isHealthy ? 200 : 503).json({
      success: true,
      status,
      timestamp: new Date().toISOString(),
      checks: healthChecks,
      uptime: process.uptime(),
      version: appVersion
    });
  } catch (error) {
    logger.error('Health check error', { error: error.message, stack: error.stack });
    res.status(503).json({
      success: false,
      status: 'error',
      message: '健康检查失败',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/system/logs
 * @desc 获取系统日志
 * @access Private (Admin only)
 */
router.get('/logs', authenticateToken, requireAdmin, validatePagination, async (req, res) => {
  try {
    const { page, pageSize, level, startTime, endTime } = req.query;
    const offset = (page - 1) * pageSize;

    // 构建查询条件
    const whereClause = {};

    if (level) {
      whereClause.level = level;
    }

    if (startTime || endTime) {
      whereClause.timestamp = {};
      if (startTime) {
        whereClause.timestamp[Op.gte] = new Date(startTime);
      }
      if (endTime) {
        whereClause.timestamp[Op.lte] = new Date(endTime);
      }
    }

    // 查询设备日志作为系统日志的一部分
    const { count, rows: logs } = await DeviceLog.findAndCountAll({
      where: whereClause,
      include: [{
        model: Device,
        as: 'device',
        attributes: ['id', 'name', 'imei'],
        include: [{
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name']
        }]
      }],
      limit: pageSize,
      offset,
      order: [['timestamp', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page,
          pageSize,
          total: count,
          totalPages: Math.ceil(count / pageSize)
        }
      }
    });
  } catch (error) {
    logger.error('Get system logs error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取系统日志失败'
    });
  }
});

/**
 * @route GET /api/system/performance
 * @desc 获取系统性能指标
 * @access Private
 */
router.get('/performance', authenticateToken, async (req, res) => {
  try {
    const { period = '1h' } = req.query;
    const user = req.user;

    // 计算时间范围
    const now = new Date();
    let startTime;

    switch (period) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
    }

    // 根据用户角色设置数据范围
    let deviceWhereClause = {};
    let deviceIds = [];
    
    if (user.role !== 'admin') {
      // 非管理员只能看到自己租户的数据
      deviceWhereClause.tenant_id = user.tenant_id;
      const userDevices = await Device.findAll({ 
        where: deviceWhereClause, 
        attributes: ['id'] 
      });
      deviceIds = userDevices.map(d => d.id);
    }

    const dataWriteStats = await getCurrentTelemetryTimeline({
      tenantId: deviceWhereClause.tenant_id,
      since: startTime,
      until: now
    });

    // 获取设备连接性能
    const deviceConnectionStats = await Device.findAll({
      where: deviceWhereClause,
      attributes: [
        'status',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    // 获取错误日志统计
    const errorWhereClause = {
      level: 'error',
      timestamp: {
        [Op.gte]: startTime,
        [Op.lte]: now
      }
    };
    
    if (deviceIds.length > 0) {
      errorWhereClause.device_id = { [Op.in]: deviceIds };
    }

    const errorStats = await DeviceLog.findAll({
      where: errorWhereClause,
      attributes: [
        [require('sequelize').fn('to_char', require('sequelize').col('timestamp'), 'YYYY-MM-DD HH24:00:00'), 'hour'],
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      group: [require('sequelize').literal('hour')],
      order: [[require('sequelize').literal('hour'), 'ASC']],
      raw: true
    });

    // 系统资源使用情况（仅管理员可见完整信息）
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const responseData = {
      period,
      startTime,
      endTime: now,
      dataWrite: {
        timeline: dataWriteStats.map(stat => ({
          time: stat.minute,
          count: parseInt(stat.count)
        })),
        total: dataWriteStats.reduce((sum, stat) => sum + parseInt(stat.count), 0)
      },
      deviceConnection: deviceConnectionStats.reduce((acc, stat) => {
        acc[stat.status] = parseInt(stat.count);
        return acc;
      }, {}),
      errors: {
        timeline: errorStats.map(stat => ({
          time: stat.hour,
          count: parseInt(stat.count)
        })),
        total: errorStats.reduce((sum, stat) => sum + parseInt(stat.count), 0)
      }
    };

    // 只有管理员才能看到详细的系统资源信息
    if (user.role === 'admin') {
      responseData.resources = {
        memory: {
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external,
          arrayBuffers: memoryUsage.arrayBuffers
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        },
        system: {
          totalMemory: os.totalmem(),
          freeMemory: os.freemem(),
          loadAverage: os.loadavg(),
          uptime: os.uptime()
        }
      };
    } else {
      // 普通用户只能看到基本的资源信息
      responseData.resources = {
        memory: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal
        }
      };
    }

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    logger.error('Get system performance error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取系统性能指标失败'
    });
  }
});

/**
 * @route POST /api/system/cleanup
 * @desc 系统数据清理
 * @access Private (Admin only)
 */
router.post('/cleanup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      cleanupType,
      daysToKeep = 30,
      deviceIds = [],
      dataTypes = []
    } = req.body;

    if (!cleanupType) {
      return res.status(400).json({
        success: false,
        message: '请指定清理类型'
      });
    }

    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    switch (cleanupType) {
      case 'device_data':
        return res.status(410).json({
          success: false,
          message: '通用设备数据表已停用，当前数据由四个控制模块的时序表独立管理'
        });

      case 'device_logs':
        // 清理设备日志
        const logWhereClause = {
          timestamp: { [Op.lt]: cutoffDate }
        };

        if (deviceIds.length > 0) {
          logWhereClause.device_id = { [Op.in]: deviceIds };
        }

        deletedCount = await DeviceLog.destroy({
          where: logWhereClause
        });
        break;

      case 'inactive_devices':
        // 清理长期离线的设备（需要谨慎操作）
        const inactiveDevices = await Device.findAll({
          where: {
            status: 'offline',
            last_seen_at: { [Op.lt]: cutoffDate }
          }
        });

        // 这里只标记为维护状态，不直接删除
        deletedCount = await Device.update(
          { status: 'maintenance' },
          {
            where: {
              status: 'offline',
              last_seen_at: { [Op.lt]: cutoffDate }
            }
          }
        );
        break;

      default:
        return res.status(400).json({
          success: false,
          message: '不支持的清理类型'
        });
    }

    logger.info('System cleanup completed', {
      cleanupType,
      daysToKeep,
      deletedCount,
      performedBy: req.user.id,
      ip: req.ip
    });

    res.json({
      success: true,
      message: `清理完成，处理了 ${deletedCount} 条记录`,
      data: {
        cleanupType,
        daysToKeep,
        deletedCount,
        cutoffDate
      }
    });
  } catch (error) {
    logger.error('System cleanup error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '系统清理失败'
    });
  }
});

/**
 * @route GET /api/system/config
 * @desc 获取系统配置
 * @access Private (Admin only)
 */
router.get('/config', authenticateToken, requireAdmin, (req, res) => {
  try {
    const config = {
      app: {
        name: process.env.APP_NAME || 'IoT Device Management',
        version: appVersion,
        environment: process.env.NODE_ENV || 'development',
        port: process.env.PORT || 3003
      },
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        name: process.env.DB_NAME || 'iot_management'
      },
      mqtt: {
        enabled: process.env.MQTT_ENABLED === 'true',
        defaultPort: process.env.MQTT_DEFAULT_PORT || 1883
      },
      websocket: {
        enabled: process.env.WS_ENABLED === 'true',
        port: process.env.WS_PORT || 3002
      },
      security: {
        jwtExpiration: process.env.JWT_EXPIRES_IN || '24h',
        rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === 'true'
      },
      features: {
        fileUpload: process.env.FILE_UPLOAD_ENABLED === 'true',
        emailNotification: process.env.EMAIL_ENABLED === 'true',
        dataRetention: process.env.DATA_RETENTION_DAYS || 365
      }
    };

    res.json({
      success: true,
      data: {
        config
      }
    });
  } catch (error) {
    logger.error('Get system config error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取系统配置失败'
    });
  }
});

/**
 * @route PUT /api/system/config
 * @desc 更新系统配置
 * @access Private (Admin only)
 */
router.put('/config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      system_name,
      admin_email,
      data_retention_days,
      auto_backup,
      backup_frequency
    } = req.body;

    // 这里可以将配置保存到数据库或配置文件
    // 目前简单返回成功，实际项目中需要实现配置持久化

    logger.info('System config updated', {
      userId: req.user.id,
      config: req.body
    });

    res.json({
      success: true,
      message: '系统配置更新成功'
    });
  } catch (error) {
    logger.error('Update system config error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '更新系统配置失败'
    });
  }
});

/**
 * @route GET /api/system/notification-config
 * @desc 获取通知配置
 * @access Private (Admin only)
 */
router.get('/notification-config', authenticateToken, requireAdmin, (req, res) => {
  try {
    const config = {
      email_enabled: process.env.EMAIL_ENABLED === 'true',
      sms_enabled: process.env.SMS_ENABLED === 'true',
      wechat_enabled: process.env.WECHAT_ENABLED === 'true',
      temperature_threshold: parseInt(process.env.TEMP_THRESHOLD) || 30,
      humidity_threshold: parseInt(process.env.HUMIDITY_THRESHOLD) || 80
    };

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error('Get notification config error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取通知配置失败'
    });
  }
});

/**
 * @route PUT /api/system/notification-config
 * @desc 更新通知配置
 * @access Private (Admin only)
 */
router.put('/notification-config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      email_enabled,
      sms_enabled,
      wechat_enabled,
      temperature_threshold,
      humidity_threshold
    } = req.body;

    logger.info('Notification config updated', {
      userId: req.user.id,
      config: req.body
    });

    res.json({
      success: true,
      message: '通知配置更新成功'
    });
  } catch (error) {
    logger.error('Update notification config error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '更新通知配置失败'
    });
  }
});

/**
 * @route GET /api/system/security-config
 * @desc 获取安全配置
 * @access Private (Admin only)
 */
router.get('/security-config', authenticateToken, requireAdmin, (req, res) => {
  try {
    const config = {
      min_password_length: parseInt(process.env.MIN_PASSWORD_LENGTH) || 8,
      password_complexity: ['lowercase', 'numbers'], // 默认复杂度要求
      password_expire_days: parseInt(process.env.PASSWORD_EXPIRE_DAYS) || 90,
      login_lock_enabled: process.env.LOGIN_LOCK_ENABLED === 'true',
      max_login_attempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5
    };

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error('Get security config error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取安全配置失败'
    });
  }
});

/**
 * @route PUT /api/system/security-config
 * @desc 更新安全配置
 * @access Private (Admin only)
 */
router.put('/security-config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      min_password_length,
      password_complexity,
      password_expire_days,
      login_lock_enabled,
      max_login_attempts
    } = req.body;

    logger.info('Security config updated', {
      userId: req.user.id,
      config: req.body
    });

    res.json({
      success: true,
      message: '安全配置更新成功'
    });
  } catch (error) {
    logger.error('Update security config error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '更新安全配置失败'
    });
  }
});

/**
 * @route POST /api/system/check-update
 * @desc 检查系统更新
 * @access Private (Admin only)
 */
router.post('/check-update', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 模拟检查更新逻辑
    const currentVersion = process.env.APP_VERSION || '1.0.0';
    const latestVersion = '1.0.1'; // 这里应该从远程服务器获取

    const hasUpdate = currentVersion !== latestVersion;

    res.json({
      success: true,
      data: {
        hasUpdate,
        currentVersion,
        latestVersion,
        releaseNotes: hasUpdate ? '修复了一些已知问题，提升了系统稳定性' : null
      }
    });
  } catch (error) {
    logger.error('Check update error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '检查更新失败'
    });
  }
});

/**
 * @route GET /api/system/info
 * @desc 获取系统信息
 * @access Public
 */
router.get('/info', (req, res) => {
  try {
    const info = {
      name: process.env.APP_NAME || 'IoT Device Management System',
      version: appVersion,
      description: 'Internet of Things Device Management Platform',
      author: 'IoT Team',
      license: 'MIT',
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: info
    });
  } catch (error) {
    logger.error('Get system info error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取系统信息失败'
    });
  }
});

module.exports = router;
