const express = require('express');
const { Op } = require('sequelize');
const { sequelize } = require('../models');
const { Tenant, User, Device } = require('../models');
const { 
  authenticateToken, 
  requireAdmin, 
  requireTenantAdmin,
  checkTenantAccess 
} = require('../middleware/auth');
const {
  validateTenant,
  validateTenantUpdate,
  validatePagination,
  validateId
} = require('../middleware/validation');
const logger = require('../utils/logger');
const WebSocketService = require('../services/websocketService');

const router = express.Router();

/**
 * @route GET /api/tenants
 * @desc 获取租户列表
 * @access Private (Admin and Tenant Admin)
 */
router.get('/', authenticateToken, requireTenantAdmin, validatePagination, async (req, res) => {
  try {
    const { page, pageSize, keyword, status } = req.query;
    const offset = (page - 1) * pageSize;

    // 构建查询条件
    const whereClause = {};
    
    // 根据用户角色过滤数据
    if (req.user.role === 'tenant_admin') {
      // 租户管理员只能看到自己的租户
      whereClause.id = req.user.tenant_id;
    }
    // 系统管理员（admin角色）可以看到所有租户，不添加tenant_id过滤条件
    
    if (keyword) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { code: { [Op.like]: `%${keyword}%` } },
        { contact_person: { [Op.like]: `%${keyword}%` } }
      ];
    }
    
    if (status) {
      whereClause.status = status;
    }

    // 查询租户列表
    const { count, rows: tenants } = await Tenant.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'users',
          attributes: ['id', 'username', 'role', 'status'],
          required: false
        },
        {
          model: Device,
          as: 'devices',
          attributes: ['id', 'name', 'status'],
          required: false
        }
      ],
      limit: pageSize,
      offset,
      order: [['created_at', 'DESC']],
      distinct: true
    });

    // 计算统计信息
    const tenantsWithStats = tenants.map(tenant => {
      const tenantData = tenant.toJSON();
      tenantData.stats = {
        userCount: tenant.users ? tenant.users.length : 0,
        deviceCount: tenant.devices ? tenant.devices.length : 0,
        activeUsers: tenant.users ? tenant.users.filter(u => u.status === 'active').length : 0,
        onlineDevices: tenant.devices ? tenant.devices.filter(d => d.status === 'online').length : 0
      };
      // 移除详细的用户和设备信息，只保留统计
      delete tenantData.users;
      delete tenantData.devices;
      return tenantData;
    });

    res.json({
      success: true,
      data: {
        tenants: tenantsWithStats,
        pagination: {
          page,
          pageSize,
          total: count,
          totalPages: Math.ceil(count / pageSize)
        }
      }
    });
  } catch (error) {
    logger.error('Get tenants error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取租户列表失败'
    });
  }
});

/**
 * @route GET /api/tenants/:id
 * @desc 获取租户详情
 * @access Private (Admin or Tenant Admin)
 */
router.get('/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const tenantId = req.params.id;
    
    // 权限检查：管理员可以查看所有租户，租户管理员只能查看自己的租户
    if (req.user.role !== 'admin' && req.user.tenant_id !== tenantId) {
      return res.status(403).json({
        success: false,
        message: '没有权限访问该租户信息'
      });
    }

    const tenant = await Tenant.findByPk(tenantId, {
      include: [
        {
          model: User,
          as: 'users',
          attributes: ['id', 'username', 'profile', 'role', 'status', 'last_login_at']
        },
        {
          model: Device,
          as: 'devices',
          attributes: ['id', 'name', 'imei', 'device_type', 'status', 'last_seen_at']
        }
      ]
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: '租户不存在'
      });
    }

    // 计算详细统计信息
    const stats = {
      userCount: tenant.users.length,
      deviceCount: tenant.devices.length,
      activeUsers: tenant.users.filter(u => u.status === 'active').length,
      inactiveUsers: tenant.users.filter(u => u.status === 'inactive').length,
      onlineDevices: tenant.devices.filter(d => d.status === 'online').length,
      offlineDevices: tenant.devices.filter(d => d.status === 'offline').length,
      errorDevices: tenant.devices.filter(d => d.status === 'error').length,
      deviceUsageRate: tenant.device_limit > 0 ? (tenant.devices.length / tenant.device_limit * 100).toFixed(2) : 0
    };

    const tenantData = tenant.toJSON();
    tenantData.stats = stats;

    res.json({
      success: true,
      data: {
        tenant: tenantData
      }
    });
  } catch (error) {
    logger.error('Get tenant detail error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取租户详情失败'
    });
  }
});

/**
 * @route POST /api/tenants
 * @desc 创建租户
 * @access Private (Admin only)
 */
router.post('/', authenticateToken, requireAdmin, validateTenant, async (req, res) => {
  try {
    const {
      name,
      code,
      type,
      contact_person,
      contact_phone,
      contact_email,
      address,
      device_limit,
      expire_date,
      settings
    } = req.body;

    // 检查租户编码是否已存在
    const existingTenant = await Tenant.findOne({
      where: { code }
    });

    if (existingTenant) {
      return res.status(400).json({
        success: false,
        message: '租户编码已存在'
      });
    }

    // 创建租户
    const tenant = await Tenant.create({
      name,
      code,
      type,
      contact_person,
      contact_phone,
      contact_email,
      address,
      device_limit,
      expire_date,
      settings: settings || {},
      status: 'active',
      created_by: req.user.id
    });

    logger.info('Tenant created', {
      tenantId: tenant.id,
      tenantName: tenant.name,
      createdBy: req.user.id,
      ip: req.ip
    });

    // 通过WebSocket通知相关用户
    WebSocketService.broadcastToClients('tenant_created', {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        code: tenant.code,
        status: tenant.status
      }
    });

    res.status(201).json({
      success: true,
      message: '租户创建成功',
      data: {
        tenant
      }
    });
  } catch (error) {
    logger.error('Create tenant error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '创建租户失败'
    });
  }
});

/**
 * @route PUT /api/tenants/:id
 * @desc 更新租户信息
 * @access Private (Admin only)
 */
router.put('/:id', authenticateToken, requireAdmin, validateId, validateTenantUpdate, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const updateData = req.body;

    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: '租户不存在'
      });
    }

    // 设备数量限制已移除 - 允许更新任意设备限制值

    // 更新租户信息
    await tenant.update({
      ...updateData,
      updated_at: new Date()
    });

    logger.info('Tenant updated', {
      tenantId: tenant.id,
      tenantName: tenant.name,
      updatedBy: req.user.id,
      changes: updateData,
      ip: req.ip
    });

    // 通过WebSocket通知租户用户
    WebSocketService.broadcastToTenant(tenantId, 'tenant_updated', {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        device_limit: tenant.device_limit,
        expire_date: tenant.expire_date
      }
    });

    res.json({
      success: true,
      message: '租户信息更新成功',
      data: {
        tenant
      }
    });
  } catch (error) {
    logger.error('Update tenant error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '更新租户信息失败'
    });
  }
});

/**
 * @route DELETE /api/tenants/:id
 * @desc 删除租户
 * @access Private (Admin only)
 */
router.delete('/:id', authenticateToken, requireAdmin, validateId, async (req, res) => {
  try {
    const tenantId = req.params.id;

    const tenant = await Tenant.findByPk(tenantId, {
      include: [
        { model: User, as: 'users' },
        { model: Device, as: 'devices' }
      ]
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: '租户不存在'
      });
    }

    // 检查是否有关联的用户或设备
    if (tenant.users.length > 0) {
      return res.status(400).json({
        success: false,
        message: `无法删除租户，还有 ${tenant.users.length} 个关联用户`
      });
    }

    if (tenant.devices.length > 0) {
      return res.status(400).json({
        success: false,
        message: `无法删除租户，还有 ${tenant.devices.length} 个关联设备`
      });
    }

    // 删除租户
    await tenant.destroy();

    logger.info('Tenant deleted', {
      tenantId: tenant.id,
      tenantName: tenant.name,
      deletedBy: req.user.id,
      ip: req.ip
    });

    // 通过WebSocket通知
    WebSocketService.broadcastToClients('tenant_deleted', {
      tenantId: tenant.id,
      tenantName: tenant.name
    });

    res.json({
      success: true,
      message: '租户删除成功'
    });
  } catch (error) {
    logger.error('Delete tenant error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '删除租户失败'
    });
  }
});

/**
 * @route GET /api/tenants/:id/users
 * @desc 获取租户用户列表
 * @access Private (Admin or Tenant Admin)
 */
router.get('/:id/users', authenticateToken, validateId, validatePagination, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const { page, pageSize, keyword, status } = req.query;
    const offset = (page - 1) * pageSize;

    // 权限检查
    if (req.user.role !== 'admin' && req.user.tenant_id !== tenantId) {
      return res.status(403).json({
        success: false,
        message: '没有权限访问该租户用户信息'
      });
    }

    // 构建查询条件
    const whereClause = { tenant_id: tenantId };
    
    if (keyword) {
      whereClause[Op.or] = [
        { username: { [Op.like]: `%${keyword}%` } },
        sequelize.where(
          sequelize.cast(sequelize.col('profile'), 'text'),
          { [Op.like]: `%${keyword}%` }
        )
      ];
    }
    
    if (status) {
      whereClause.status = status;
    }

    const { count, rows: users } = await User.findAndCountAll({
      where: whereClause,
      attributes: { exclude: ['password'] },
      limit: pageSize,
      offset,
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          pageSize,
          total: count,
          totalPages: Math.ceil(count / pageSize)
        }
      }
    });
  } catch (error) {
    logger.error('Get tenant users error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取租户用户列表失败'
    });
  }
});

/**
 * @route GET /api/tenants/:id/devices
 * @desc 获取租户设备列表
 * @access Private (Admin or Tenant Admin)
 */
router.get('/:id/devices', authenticateToken, validateId, validatePagination, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const { page, pageSize, keyword, status, type } = req.query;
    const offset = (page - 1) * pageSize;

    // 权限检查
    if (req.user.role !== 'admin' && req.user.tenant_id !== tenantId) {
      return res.status(403).json({
        success: false,
        message: '没有权限访问该租户设备信息'
      });
    }

    // 构建查询条件
    const whereClause = { tenant_id: tenantId };
    
    if (keyword) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { imei: { [Op.like]: `%${keyword}%` } },
        { location: { [Op.like]: `%${keyword}%` } }
      ];
    }
    
    if (status) {
      whereClause.status = status;
    }
    
    if (type) {
      whereClause.device_type = type;
    }

    const { count, rows: devices } = await Device.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'profile']
        }
      ],
      limit: pageSize,
      offset,
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        devices,
        pagination: {
          page,
          pageSize,
          total: count,
          totalPages: Math.ceil(count / pageSize)
        }
      }
    });
  } catch (error) {
    logger.error('Get tenant devices error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取租户设备列表失败'
    });
  }
});

/**
 * @route GET /api/tenants/stats/overview
 * @desc 获取租户统计概览
 * @access Private (Admin only)
 */
router.get('/stats/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 获取租户统计
    const totalTenants = await Tenant.count();
    const activeTenants = await Tenant.count({ where: { status: 'active' } });
    const inactiveTenants = await Tenant.count({ where: { status: 'inactive' } });
    const suspendedTenants = await Tenant.count({ where: { status: 'suspended' } });

    // 获取即将过期的租户（30天内）
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const expiringTenants = await Tenant.count({
      where: {
        expire_date: {
          [Op.between]: [new Date(), thirtyDaysFromNow]
        },
        status: 'active'
      }
    });

    // 按类型统计
    const tenantsByType = await Tenant.findAll({
      attributes: [
        'type',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      group: ['type']
    });

    // 设备使用率统计
    const tenantsWithDeviceUsage = await Tenant.findAll({
      attributes: [
        'id',
        'name',
        'device_limit',
        [require('sequelize').fn('COUNT', require('sequelize').col('devices.id')), 'device_count']
      ],
      include: [{
        model: Device,
        as: 'devices',
        attributes: []
      }],
      group: ['Tenant.id'],
      having: require('sequelize').literal('device_count > 0'),
      order: [[require('sequelize').literal('device_count / device_limit'), 'DESC']],
      limit: 10
    });

    res.json({
      success: true,
      data: {
        overview: {
          total: totalTenants,
          active: activeTenants,
          inactive: inactiveTenants,
          suspended: suspendedTenants,
          expiring: expiringTenants
        },
        byType: tenantsByType.reduce((acc, item) => {
          acc[item.type] = parseInt(item.dataValues.count);
          return acc;
        }, {}),
        topDeviceUsage: tenantsWithDeviceUsage.map(tenant => ({
          id: tenant.id,
          name: tenant.name,
          deviceLimit: tenant.device_limit,
          deviceCount: parseInt(tenant.dataValues.device_count),
          usageRate: ((parseInt(tenant.dataValues.device_count) / tenant.device_limit) * 100).toFixed(2)
        }))
      }
    });
  } catch (error) {
    logger.error('Get tenant stats error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取租户统计信息失败'
    });
  }
});

module.exports = router;