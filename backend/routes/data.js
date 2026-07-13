const express = require('express');
const { Op } = require('sequelize');
const { DeviceData, Device, Tenant, Manufacturer } = require('../models');
const {
  authenticateToken,
  checkTenantAccess
} = require('../middleware/auth');
const {
  validateDeviceDataQuery,
  validateId
} = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @route GET /api/data/devices/:deviceId
 * @desc 获取设备数据
 * @access Private
 */
router.get('/devices/:deviceId', authenticateToken, validateId, validateDeviceDataQuery, async (req, res) => {
  try {
    const deviceId = parseInt(req.params.deviceId);
    const { page, pageSize, dataType, startTime, endTime } = req.query;
    const offset = (page - 1) * pageSize;

    // 检查设备是否存在并验证权限
    const device = await Device.findByPk(deviceId, {
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      },
      include: [{
        model: Tenant,
        as: 'tenant',
        attributes: ['id', 'name']
      }]
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && req.user.tenant_id !== device.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '没有权限访问该设备数据'
      });
    }

    // 构建查询条件
    const whereClause = { device_id: deviceId };

    if (dataType) {
      whereClause.data_type = dataType;
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

    // 查询设备数据
    const { count, rows: data } = await DeviceData.findAndCountAll({
      where: whereClause,
      limit: pageSize,
      offset,
      order: [['timestamp', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        deviceData: data,
        device: {
          id: device.id,
          name: device.name,
          imei: device.imei,
          tenant: device.tenant
        },
        pagination: {
          page,
          pageSize,
          total: count,
          totalPages: Math.ceil(count / pageSize)
        }
      }
    });
  } catch (error) {
    logger.error('Get device data error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取设备数据失败'
    });
  }
});

/**
 * @route GET /api/data/devices/:deviceId/latest
 * @desc 获取设备最新数据
 * @access Private
 */
router.get('/devices/:deviceId/latest', authenticateToken, validateId, async (req, res) => {
  try {
    const deviceId = parseInt(req.params.deviceId);
    const { dataType } = req.query;

    // 检查设备权限
    const device = await Device.findByPk(deviceId, {
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      }
    });
    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    if (req.user.role !== 'admin' && req.user.tenant_id !== device.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '没有权限访问该设备数据'
      });
    }

    // 构建查询条件
    const whereClause = { device_id: deviceId };
    if (dataType) {
      whereClause.data_type = dataType;
    }

    // 获取最新数据
    const latestData = await DeviceData.findAll({
      where: whereClause,
      order: [['timestamp', 'DESC']],
      limit: dataType ? 1 : 10 // 如果指定了数据类型，只返回1条，否则返回最新10条
    });

    res.json({
      success: true,
      data: {
        latestData,
        device: {
          id: device.id,
          name: device.name,
          status: device.status
        }
      }
    });
  } catch (error) {
    logger.error('Get latest device data error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取设备最新数据失败'
    });
  }
});

/**
 * @route GET /api/data/devices/:deviceId/stats
 * @desc 获取设备数据统计
 * @access Private
 */
router.get('/devices/:deviceId/stats', authenticateToken, validateId, async (req, res) => {
  try {
    const deviceId = parseInt(req.params.deviceId);
    const { dataType, period = '24h' } = req.query;

    // 检查设备权限
    const device = await Device.findByPk(deviceId, {
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      }
    });
    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    if (req.user.role !== 'admin' && req.user.tenant_id !== device.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '没有权限访问该设备数据'
      });
    }

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
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // 构建查询条件
    const whereClause = {
      device_id: deviceId,
      timestamp: {
        [Op.gte]: startTime,
        [Op.lte]: now
      }
    };

    if (dataType) {
      whereClause.data_type = dataType;
    }

    // 获取统计数据
    const stats = await DeviceData.findAll({
      where: whereClause,
      attributes: [
        'data_type',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
        [require('sequelize').fn('AVG', require('sequelize').cast(require('sequelize').col('value'), 'DECIMAL')), 'avg_value'],
        [require('sequelize').fn('MIN', require('sequelize').cast(require('sequelize').col('value'), 'DECIMAL')), 'min_value'],
        [require('sequelize').fn('MAX', require('sequelize').cast(require('sequelize').col('value'), 'DECIMAL')), 'max_value'],
        [require('sequelize').fn('MIN', require('sequelize').col('timestamp')), 'first_timestamp'],
        [require('sequelize').fn('MAX', require('sequelize').col('timestamp')), 'last_timestamp']
      ],
      group: ['data_type'],
      raw: true
    });

    // 获取时间序列数据（用于图表）
    const timeSeriesData = await DeviceData.findAll({
      where: whereClause,
      attributes: [
        'data_type',
        'value',
        'timestamp'
      ],
      order: [['timestamp', 'ASC']]
    });

    // 按数据类型分组时间序列数据
    const groupedTimeSeries = timeSeriesData.reduce((acc, item) => {
      if (!acc[item.data_type]) {
        acc[item.data_type] = [];
      }
      acc[item.data_type].push({
        value: parseFloat(item.value) || 0,
        timestamp: item.timestamp
      });
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        period,
        startTime,
        endTime: now,
        stats: stats.map(stat => ({
          dataType: stat.data_type,
          count: parseInt(stat.count),
          avgValue: parseFloat(stat.avg_value) || 0,
          minValue: parseFloat(stat.min_value) || 0,
          maxValue: parseFloat(stat.max_value) || 0,
          firstTimestamp: stat.first_timestamp,
          lastTimestamp: stat.last_timestamp
        })),
        timeSeries: groupedTimeSeries,
        device: {
          id: device.id,
          name: device.name
        }
      }
    });
  } catch (error) {
    logger.error('Get device data stats error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取设备数据统计失败'
    });
  }
});

/**
 * @route GET /api/data/tenant/:tenantId/overview
 * @desc 获取租户数据概览
 * @access Private
 */
router.get('/tenant/:tenantId/overview', authenticateToken, validateId, async (req, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);

    // 权限检查
    if (req.user.role !== 'admin' && req.user.tenant_id !== tenantId) {
      return res.status(403).json({
        success: false,
        message: '没有权限访问该租户数据'
      });
    }

    // 获取租户设备列表
    const devices = await Device.findAll({
      where: { tenant_id: tenantId },
      attributes: ['id', 'name', 'status', 'last_seen_at']
    });

    if (devices.length === 0) {
      return res.json({
        success: true,
        data: {
          devices: [],
          overview: {
            totalDevices: 0,
            onlineDevices: 0,
            totalDataPoints: 0,
            dataTypes: []
          }
        }
      });
    }

    const deviceIds = devices.map(d => d.id);
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 获取最近24小时的数据统计
    const dataStats = await DeviceData.findAll({
      where: {
        device_id: {
          [Op.in]: deviceIds
        },
        timestamp: {
          [Op.gte]: last24Hours
        }
      },
      attributes: [
        'device_id',
        'data_type',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
        [require('sequelize').fn('MAX', require('sequelize').col('timestamp')), 'last_timestamp']
      ],
      group: ['device_id', 'data_type'],
      raw: true
    });

    // 获取数据类型统计
    const dataTypeStats = await DeviceData.findAll({
      where: {
        device_id: {
          [Op.in]: deviceIds
        }
      },
      attributes: [
        'data_type',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'total_count']
      ],
      group: ['data_type'],
      raw: true
    });

    // 计算设备数据概览
    const deviceOverview = devices.map(device => {
      const deviceStats = dataStats.filter(stat => stat.device_id === device.id);
      const totalDataPoints = deviceStats.reduce((sum, stat) => sum + parseInt(stat.count), 0);
      const dataTypes = deviceStats.map(stat => stat.data_type);
      const lastDataTime = deviceStats.length > 0 ?
        Math.max(...deviceStats.map(stat => new Date(stat.last_timestamp).getTime())) : null;

      return {
        id: device.id,
        name: device.name,
        status: device.status,
        lastSeenAt: device.last_seen_at,
        last24hDataPoints: totalDataPoints,
        dataTypes,
        lastDataTime: lastDataTime ? new Date(lastDataTime) : null
      };
    });

    // 总体统计
    const totalDataPoints = dataStats.reduce((sum, stat) => sum + parseInt(stat.count), 0);
    const onlineDevices = devices.filter(d => d.status === 'online').length;

    res.json({
      success: true,
      data: {
        devices: deviceOverview,
        overview: {
          totalDevices: devices.length,
          onlineDevices,
          offlineDevices: devices.length - onlineDevices,
          totalDataPoints,
          dataTypes: dataTypeStats.map(stat => ({
            type: stat.data_type,
            count: parseInt(stat.total_count)
          }))
        },
        period: {
          start: last24Hours,
          end: now
        }
      }
    });
  } catch (error) {
    logger.error('Get tenant data overview error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取租户数据概览失败'
    });
  }
});



/**
 * @route GET /api/data/devices/imei/:imei/latest
 * @desc 根据IMEI获取设备最新payload数据
 * @access Private
 */
router.get('/devices/imei/:imei/latest', authenticateToken, async (req, res) => {
  try {
    const imei = req.params.imei;
    const { dataType = 'statistic' } = req.query;

    // 根据IMEI查找设备
    const device = await Device.findOne({
      where: { imei },
      include: [{
        model: Tenant,
        as: 'tenant',
        attributes: ['id', 'name']
      }, {
        model: Manufacturer,
        as: 'manufacturer',
        attributes: ['id', 'name', 'code']
      }]
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && req.user.tenant_id !== device.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '没有权限访问该设备数据'
      });
    }

    let payload = {};
    let timestamp = null;

    // 如果是照明设备，从分离的表中获取电量数据
    if (dataType === 'statistic') {
      try {
        // 使用原生SQL查询从lighting_electrical_bndk表获取最新电量数据
        const { QueryTypes } = require('sequelize');
        const sequelize = require('../models').sequelize;

        // 构建最近几个月的分月表名进行查询
        const now = new Date();
        let electricalData = [];
        let queryTable = '';
        
        // 尝试查询租户分表
        if (device.tenant_id && device.manufacturer?.code) {
          const manufacturerCode = device.manufacturer.code.toLowerCase();
          const tenantTable = `lighting_electrical_${manufacturerCode}_${device.tenant_id}`;
          
          try {
            const result = await sequelize.query(
              `SELECT voltage, current, power, energy, data_timestamp 
               FROM ${tenantTable} 
               WHERE device_imei = :imei 
               ORDER BY data_timestamp DESC 
               LIMIT 1`,
              {
                replacements: { imei },
                type: QueryTypes.SELECT
              }
            );
            
            if (result && result.length > 0) {
              electricalData = result;
              queryTable = tenantTable;
            }
          } catch (tenantTableError) {
            logger.debug('租户分表查询失败', {
              table: tenantTable,
              error: tenantTableError.message,
              imei,
              tenantId: device.tenant_id
            });
          }
        }
        
        // 如果租户分表没有数据，回退到原始表
        if (!electricalData || electricalData.length === 0) {
          logger.warn('租户分表没有数据，回退到原始表查询', { imei, tenantId: device.tenant_id });
          
          try {
            electricalData = await sequelize.query(
              `SELECT voltage, current, power, energy, data_timestamp 
               FROM lighting_electrical_bndk 
               WHERE imei = :imei 
               ORDER BY data_timestamp DESC 
               LIMIT 1`,
              {
                replacements: { imei },
                type: QueryTypes.SELECT
              }
            );
            queryTable = 'lighting_electrical_bndk';
          } catch (originalTableError) {
            logger.error('原始表查询也失败', {
              error: originalTableError.message,
              imei
            });
          }
        }

        if (electricalData && electricalData.length > 0) {
          const data = electricalData[0];
          payload = {
            voltage: data.voltage || 0,
            current: data.current || 0,
            power: data.power || 0,
            energy: data.energy || 0
          };
          timestamp = data.data_timestamp;

          logger.info('从租户分表获取电量数据成功', {
            deviceId: device.id,
            imei: device.imei,
            table: queryTable,
            tenantId: device.tenant_id,
            payload,
            timestamp
          });
        } else {
          // 如果分离表中没有数据，尝试从原始表获取
          const latestData = await DeviceData.findOne({
            where: {
              device_id: device.id,
              data_type: dataType
            },
            order: [['timestamp', 'DESC']]
          });

          if (latestData) {
            try {
              payload = typeof latestData.payload === 'string' ?
                JSON.parse(latestData.payload) : latestData.payload || {};
              timestamp = latestData.timestamp;

              logger.info('从device_data表获取数据作为备选', {
                deviceId: device.id,
                imei: device.imei,
                payload
              });
            } catch (error) {
              logger.warn('Failed to parse payload from device_data', {
                deviceId: device.id,
                imei: device.imei,
                error: error.message
              });
            }
          }
        }
      } catch (error) {
        logger.error('查询lighting_electrical_bndk表失败，使用备选方案', {
          error: error.message,
          imei
        });

        // 备选方案：从原始表获取数据
        const latestData = await DeviceData.findOne({
          where: {
            device_id: device.id,
            data_type: dataType
          },
          order: [['timestamp', 'DESC']]
        });

        if (latestData) {
          try {
            payload = typeof latestData.payload === 'string' ?
              JSON.parse(latestData.payload) : latestData.payload || {};
            timestamp = latestData.timestamp;
          } catch (parseError) {
            logger.warn('Failed to parse payload', {
              deviceId: device.id,
              imei: device.imei,
              error: parseError.message
            });
          }
        }
      }
    } else {
      // 非电量数据，继续使用原有逻辑
      const latestData = await DeviceData.findOne({
        where: {
          device_id: device.id,
          data_type: dataType
        },
        order: [['timestamp', 'DESC']]
      });

      if (latestData) {
        try {
          payload = typeof latestData.payload === 'string' ?
            JSON.parse(latestData.payload) : latestData.payload || {};
          timestamp = latestData.timestamp;
        } catch (error) {
          logger.warn('Failed to parse payload', {
            deviceId: device.id,
            imei: device.imei,
            error: error.message
          });
        }
      }
    }

    res.json({
      success: true,
      data: {
        device: {
          id: device.id,
          name: device.name,
          imei: device.imei
        },
        payload,
        timestamp
      }
    });
  } catch (error) {
    logger.error('Get device data by IMEI error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取设备数据失败'
    });
  }
});

/**
 * @route GET /api/data/devices/imei/:imei
 * @desc 根据IMEI获取设备历史数据
 * @access Private
 */
router.get('/devices/imei/:imei', authenticateToken, validateDeviceDataQuery, async (req, res) => {
  try {
    const imei = req.params.imei;
    const { page, pageSize, dataType, startTime, endTime } = req.query;
    const offset = (page - 1) * pageSize;

    // 根据IMEI查找设备
    const device = await Device.findOne({
      where: { imei },
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      },
      include: [{
        model: Tenant,
        as: 'tenant',
        attributes: ['id', 'name']
      }]
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && req.user.tenant_id !== device.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '没有权限访问该设备数据'
      });
    }

    // 构建查询条件
    const whereClause = { device_id: device.id };

    if (dataType) {
      whereClause.data_type = dataType;
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

    // 查询设备数据
    const { count, rows: data } = await DeviceData.findAndCountAll({
      where: whereClause,
      limit: pageSize,
      offset,
      order: [['timestamp', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        deviceData: data,
        device: {
          id: device.id,
          name: device.name,
          imei: device.imei,
          tenant: device.tenant
        },
        pagination: {
          page,
          pageSize,
          total: count,
          totalPages: Math.ceil(count / pageSize)
        }
      }
    });
  } catch (error) {
    logger.error('Get device data by IMEI error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取设备数据失败'
    });
  }
});

/**
 * @route DELETE /api/data/devices/:deviceId
 * @desc 删除设备历史数据
 * @access Private
 */
router.delete('/devices/:deviceId', authenticateToken, validateId, async (req, res) => {
  try {
    const deviceId = parseInt(req.params.deviceId);
    const { startTime, endTime, dataType } = req.query;

    // 检查设备权限
    const device = await Device.findByPk(deviceId, {
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      }
    });
    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 权限检查：只有管理员或设备所属租户的管理员可以删除数据
    if (req.user.role !== 'admin' &&
      (req.user.tenant_id !== device.tenant_id || req.user.role !== 'tenant_admin')) {
      return res.status(403).json({
        success: false,
        message: '没有权限删除该设备数据'
      });
    }

    // 构建删除条件
    const whereClause = { device_id: deviceId };

    if (startTime || endTime) {
      whereClause.timestamp = {};
      if (startTime) {
        whereClause.timestamp[Op.gte] = new Date(startTime);
      }
      if (endTime) {
        whereClause.timestamp[Op.lte] = new Date(endTime);
      }
    }

    if (dataType) {
      whereClause.data_type = dataType;
    }

    // 删除数据
    const deletedCount = await DeviceData.destroy({
      where: whereClause
    });

    logger.info('Device data deleted', {
      deviceId,
      deletedCount,
      deletedBy: req.user.id,
      conditions: whereClause,
      ip: req.ip
    });

    res.json({
      success: true,
      message: `成功删除 ${deletedCount} 条数据`,
      data: {
        deletedCount
      }
    });
  } catch (error) {
    logger.error('Delete device data error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '删除设备数据失败'
    });
  }
});



module.exports = router;