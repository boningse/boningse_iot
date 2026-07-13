const logger = require('../utils/logger');
const db = require('../utils/database');

const isAdminRole = (role) => role === 'admin' || role === 'super_admin';

/**
 * 温控器设备权限验证中间件
 * 验证用户是否有权限访问指定的温控器设备
 */
const checkThermostatAccess = async (req, res, next) => {
  try {
    // 确保用户已认证
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '用户未认证',
        code: 'USER_NOT_AUTHENTICATED'
      });
    }

    const { deviceId } = req.params;
    const userId = req.user.id;
    const userTenantId = req.user.tenant_id;
    const userRole = req.user.role;

    // 如果没有设备ID参数，跳过设备级权限检查
    if (!deviceId) {
      return next();
    }

    try {
      // 查询设备信息和权限
      const deviceResult = await db.query(`
        SELECT d.id, d.tenant_id, d.name, d.status,
               tp.id as thermostat_id
        FROM devices d
        LEFT JOIN thermostat_properties tp ON d.id = tp.device_id
        WHERE d.id = $1
      `, [deviceId]);

      if (deviceResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: '设备不存在',
          code: 'DEVICE_NOT_FOUND'
        });
      }

      const device = deviceResult.rows[0];

      // 检查设备是否为温控器设备
      if (!device.thermostat_id) {
        return res.status(400).json({
          success: false,
          message: '该设备不是温控器设备',
          code: 'NOT_THERMOSTAT_DEVICE'
        });
      }

      // 超级管理员可以访问所有设备
      if (isAdminRole(userRole)) {
        req.device = device;
        return next();
      }

      // 租户权限检查
      if (device.tenant_id !== userTenantId) {
        logger.warn('User attempted to access device from different tenant', {
          userId,
          userTenantId,
          deviceId,
          deviceTenantId: device.tenant_id,
          ip: req.ip
        });

        return res.status(403).json({
          success: false,
          message: '无权限访问该设备',
          code: 'DEVICE_ACCESS_DENIED'
        });
      }

      // 检查设备状态
      if (device.status === 'deleted') {
        return res.status(404).json({
          success: false,
          message: '设备已被删除',
          code: 'DEVICE_DELETED'
        });
      }

      // 将设备信息添加到请求对象
      req.device = device;
      next();

    } catch (dbError) {
      logger.error('Database error during device access check', {
        error: dbError.message,
        deviceId,
        userId,
        ip: req.ip
      });

      return res.status(500).json({
        success: false,
        message: '设备权限检查失败',
        code: 'DEVICE_ACCESS_CHECK_ERROR'
      });
    }

  } catch (error) {
    logger.error('Unexpected error in thermostat access check', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      path: req.path
    });

    return res.status(500).json({
      success: false,
      message: '权限检查过程中发生错误',
      code: 'ACCESS_CHECK_ERROR'
    });
  }
};

/**
 * 温控器分组权限验证中间件
 * 验证用户是否有权限访问指定的温控器分组
 */
const checkThermostatGroupAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '用户未认证',
        code: 'USER_NOT_AUTHENTICATED'
      });
    }

    const { groupId } = req.params;
    const userId = req.user.id;
    const userTenantId = req.user.tenant_id;
    const userRole = req.user.role;

    // 如果没有分组ID参数，跳过分组级权限检查
    if (!groupId) {
      return next();
    }

    try {
      // 查询分组信息
      const groupResult = await db.query(`
        SELECT id, name, tenant_id, description
        FROM thermostat_groups
        WHERE id = $1
      `, [groupId]);

      if (groupResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: '温控器分组不存在',
          code: 'GROUP_NOT_FOUND'
        });
      }

      const group = groupResult.rows[0];

      // 超级管理员可以访问所有分组
      if (isAdminRole(userRole)) {
        req.thermostatGroup = group;
        return next();
      }

      // 租户权限检查
      if (group.tenant_id !== userTenantId) {
        logger.warn('User attempted to access group from different tenant', {
          userId,
          userTenantId,
          groupId,
          groupTenantId: group.tenant_id,
          ip: req.ip
        });

        return res.status(403).json({
          success: false,
          message: '无权限访问该分组',
          code: 'GROUP_ACCESS_DENIED'
        });
      }

      // 将分组信息添加到请求对象
      req.thermostatGroup = group;
      next();

    } catch (dbError) {
      logger.error('Database error during group access check', {
        error: dbError.message,
        groupId,
        userId,
        ip: req.ip
      });

      return res.status(500).json({
        success: false,
        message: '分组权限检查失败',
        code: 'GROUP_ACCESS_CHECK_ERROR'
      });
    }

  } catch (error) {
    logger.error('Unexpected error in thermostat group access check', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      path: req.path
    });

    return res.status(500).json({
      success: false,
      message: '权限检查过程中发生错误',
      code: 'ACCESS_CHECK_ERROR'
    });
  }
};

/**
 * 温控器操作权限验证中间件
 * 验证用户是否有权限执行特定的温控器操作
 */
const checkThermostatOperation = (operation) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '用户未认证',
        code: 'USER_NOT_AUTHENTICATED'
      });
    }

    const userRole = req.user.role;
    const userPermissions = req.user.permissions || [];

    // 定义操作权限映射
    const operationPermissions = {
      'read': ['thermostat:read', 'thermostat:write', 'thermostat:admin'],
      'write': ['thermostat:write', 'thermostat:admin'],
      'control': ['thermostat:control', 'thermostat:write', 'thermostat:admin'],
      'admin': ['thermostat:admin'],
      'delete': ['thermostat:admin']
    };

    // 超级管理员和管理员拥有所有权限
    if (isAdminRole(userRole)) {
      return next();
    }

    // 检查用户是否有执行该操作的权限
    const requiredPermissions = operationPermissions[operation] || [];
    const hasPermission = requiredPermissions.some(permission => 
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      logger.warn('User attempted operation without permission', {
        userId: req.user.id,
        userRole,
        userPermissions,
        operation,
        requiredPermissions,
        ip: req.ip,
        path: req.path
      });

      return res.status(403).json({
        success: false,
        message: `无权限执行${operation}操作`,
        code: 'OPERATION_NOT_PERMITTED'
      });
    }

    next();
  };
};

/**
 * 温控器批量操作权限验证中间件
 * 验证用户是否有权限对多个设备执行批量操作
 */
const checkBatchThermostatAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '用户未认证',
        code: 'USER_NOT_AUTHENTICATED'
      });
    }

    const { deviceIds } = req.body;
    const userId = req.user.id;
    const userTenantId = req.user.tenant_id;
    const userRole = req.user.role;

    // 检查设备ID列表
    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '设备ID列表不能为空',
        code: 'DEVICE_IDS_REQUIRED'
      });
    }

    // 超级管理员可以操作所有设备
    if (isAdminRole(userRole)) {
      return next();
    }

    try {
      // 批量查询设备权限
      const deviceResult = await db.query(`
        SELECT d.id, d.tenant_id, d.name, d.status,
               tp.id as thermostat_id
        FROM devices d
        LEFT JOIN thermostat_properties tp ON d.id = tp.device_id
        WHERE d.id = ANY($1)
      `, [deviceIds]);

      const devices = deviceResult.rows;

      // 检查是否所有设备都存在
      if (devices.length !== deviceIds.length) {
        const foundDeviceIds = devices.map(d => d.id);
        const missingDeviceIds = deviceIds.filter(id => !foundDeviceIds.includes(id));
        
        return res.status(404).json({
          success: false,
          message: '部分设备不存在',
          code: 'DEVICES_NOT_FOUND',
          data: { missingDeviceIds }
        });
      }

      // 检查是否所有设备都是温控器设备
      const nonThermostatDevices = devices.filter(d => !d.thermostat_id);
      if (nonThermostatDevices.length > 0) {
        return res.status(400).json({
          success: false,
          message: '部分设备不是温控器设备',
          code: 'NOT_THERMOSTAT_DEVICES',
          data: { nonThermostatDevices: nonThermostatDevices.map(d => d.id) }
        });
      }

      // 检查租户权限
      const unauthorizedDevices = devices.filter(d => d.tenant_id !== userTenantId);
      if (unauthorizedDevices.length > 0) {
        logger.warn('User attempted batch operation on unauthorized devices', {
          userId,
          userTenantId,
          unauthorizedDevices: unauthorizedDevices.map(d => d.id),
          ip: req.ip
        });

        return res.status(403).json({
          success: false,
          message: '无权限访问部分设备',
          code: 'BATCH_ACCESS_DENIED',
          data: { unauthorizedDevices: unauthorizedDevices.map(d => d.id) }
        });
      }

      // 检查设备状态
      const deletedDevices = devices.filter(d => d.status === 'deleted');
      if (deletedDevices.length > 0) {
        return res.status(400).json({
          success: false,
          message: '部分设备已被删除',
          code: 'DEVICES_DELETED',
          data: { deletedDevices: deletedDevices.map(d => d.id) }
        });
      }

      // 将设备信息添加到请求对象
      req.devices = devices;
      next();

    } catch (dbError) {
      logger.error('Database error during batch device access check', {
        error: dbError.message,
        deviceIds,
        userId,
        ip: req.ip
      });

      return res.status(500).json({
        success: false,
        message: '批量设备权限检查失败',
        code: 'BATCH_ACCESS_CHECK_ERROR'
      });
    }

  } catch (error) {
    logger.error('Unexpected error in batch thermostat access check', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      path: req.path
    });

    return res.status(500).json({
      success: false,
      message: '权限检查过程中发生错误',
      code: 'ACCESS_CHECK_ERROR'
    });
  }
};

module.exports = {
  checkThermostatAccess,
  checkThermostatGroupAccess,
  checkThermostatOperation,
  checkBatchThermostatAccess
};
