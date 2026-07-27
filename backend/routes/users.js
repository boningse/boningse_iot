const express = require('express');
const router = express.Router();
const { User, Tenant, sequelize } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateAdminUserUpdate } = require('../middleware/validation');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

const USER_ROLES = ['admin', 'tenant_admin', 'user', 'building_user', 'group_user'];
const ROLE_LEVEL = {
  admin: 5,
  tenant_admin: 4,
  user: 3,
  building_user: 2,
  group_user: 1
};

const roleLabel = {
  admin: '超级管理员',
  tenant_admin: '租户管理员',
  user: '普通租户',
  building_user: '建筑级用户',
  group_user: '分组级用户'
};

const getProfile = (user) => user?.profile || {};
const getBuildingId = (user) => getProfile(user).project_building_id || getProfile(user).building_id || '';
const getGroupId = (user) => getProfile(user).project_group_id || getProfile(user).group_id || '';

const canManageUser = (actor, target) => {
  if (!actor || !target) return false;
  if (actor.role === 'admin') return true;
  if (target.role === 'admin' || actor.tenant_id !== target.tenant_id) return false;
  if ((ROLE_LEVEL[actor.role] || 0) <= (ROLE_LEVEL[target.role] || 0)) return false;
  if (actor.role === 'building_user') {
    return target.role === 'group_user' && getBuildingId(actor) && getBuildingId(actor) === getBuildingId(target);
  }
  return ['tenant_admin', 'user'].includes(actor.role);
};

const buildManagedUserWhere = (actor, baseWhere = {}) => {
  const where = { ...baseWhere };
  if (actor.role === 'admin') return where;

  where.tenant_id = actor.tenant_id;
  if (actor.role === 'tenant_admin') {
    where.role = { [Op.in]: ['user', 'building_user', 'group_user'] };
  } else if (actor.role === 'user') {
    where.role = { [Op.in]: ['building_user', 'group_user'] };
  } else if (actor.role === 'building_user') {
    where.role = 'group_user';
    const requestedScope = where.profile?.[Op.contains] || {};
    where.profile = {
      [Op.contains]: {
        ...requestedScope,
        project_building_id: getBuildingId(actor)
      }
    };
  } else {
    where.id = actor.id;
  }
  return where;
};

const mergeScopedProfile = (actor, role, tenantId, profile = {}) => {
  const nextProfile = { ...profile };
  if (role === 'building_user' && !nextProfile.project_building_id) {
    throw new Error('建筑级用户必须选择所属建筑');
  }
  if (role === 'group_user' && !nextProfile.project_group_id) {
    throw new Error('分组级用户必须选择所属分组');
  }
  if (actor.role !== 'admin') {
    nextProfile.managed_by = actor.id;
  }
  if (actor.role === 'building_user') {
    nextProfile.project_building_id = getBuildingId(actor);
  }
  return nextProfile;
};

const validateProjectScope = async (tenantId, profile = {}) => {
  if (profile.project_building_id) {
    const [rows] = await sequelize.query(
      'SELECT id FROM project_buildings WHERE id = $1 AND tenant_id = $2 AND is_active = true',
      { bind: [profile.project_building_id, tenantId] }
    );
    if (rows.length === 0) throw new Error('所属建筑不属于当前租户或不存在');
  }
  if (profile.project_group_id) {
    const [rows] = await sequelize.query(
      'SELECT id, building_id FROM project_groups WHERE id = $1 AND tenant_id = $2 AND is_active = true',
      { bind: [profile.project_group_id, tenantId] }
    );
    if (rows.length === 0) throw new Error('所属分组不属于当前租户或不存在');
    if (profile.project_building_id && rows[0].building_id && rows[0].building_id !== profile.project_building_id) {
      throw new Error('所属分组不属于所选建筑');
    }
    if (!profile.project_building_id && rows[0].building_id) {
      profile.project_building_id = rows[0].building_id;
    }
  }
};

const resolveTenantId = (actor, role, requestedTenantId) => {
  if (actor.role === 'admin') {
    return role === 'admin' ? (requestedTenantId || null) : requestedTenantId;
  }
  return actor.tenant_id;
};

const reject = (res, status, message) => res.status(status).json({ success: false, message });

/**
 * 获取用户列表
 * GET /api/users
 */
router.get('/', authenticateToken, requireRole(['admin', 'tenant_admin', 'user', 'building_user']), async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      search = '',
      role = '',
      status = '',
      tenantId = '',
      buildingId = '',
      groupId = ''
    } = req.query;

    const offset = (page - 1) * pageSize;
    const limit = parseInt(pageSize);

    // 构建查询条件
    const whereConditions = {};
    
    if (search) {
      whereConditions[Op.or] = [
        { username: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }
    
    if (role) {
      whereConditions.role = role;
    }
    
    if (status) {
      whereConditions.status = status;
    }
    
    if (tenantId) {
      whereConditions.tenant_id = tenantId;
    }

    const projectScope = {};
    if (buildingId) projectScope.project_building_id = buildingId;
    if (groupId) projectScope.project_group_id = groupId;
    if (Object.keys(projectScope).length > 0) {
      whereConditions.profile = { [Op.contains]: projectScope };
    }

    const scopedWhere = buildManagedUserWhere(req.user, whereConditions);

    const { count, rows } = await User.findAndCountAll({
      where: scopedWhere,
      include: [{
        model: Tenant,
        as: 'tenant',
        attributes: ['id', 'name', 'code']
      }],
      attributes: {
        exclude: ['password_hash']
      },
      offset,
      limit,
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        users: rows,
        total: count,
        page: parseInt(page),
        pageSize: limit,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    logger.error('Get users error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取用户列表失败',
      error: error.message
    });
  }
});

/**
 * 获取用户详情
 * GET /api/users/:id
 */
router.get('/:id', authenticateToken, requireRole(['admin', 'tenant_admin', 'user', 'building_user']), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, {
      include: [{
        model: Tenant,
        as: 'tenant',
        attributes: ['id', 'name', 'code']
      }],
      attributes: {
        exclude: ['password_hash']
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    if (!canManageUser(req.user, user) && req.user.id !== user.id) {
      return reject(res, 403, '无权查看该用户');
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Get user error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取用户详情失败',
      error: error.message
    });
  }
});

/**
 * 创建用户
 * POST /api/users
 */
router.post('/', authenticateToken, requireRole(['admin', 'tenant_admin', 'user', 'building_user']), async (req, res) => {
  try {
    const { username, email, password, role = 'user', tenant_id, profile = {} } = req.body;

    if (!USER_ROLES.includes(role)) {
      return reject(res, 400, '无效的用户角色');
    }

    const effectiveTenantId = resolveTenantId(req.user, role, tenant_id);
    if (role !== 'admin' && !effectiveTenantId) {
      return reject(res, 400, '非超级管理员用户必须选择所属租户');
    }
    const scopedProfile = mergeScopedProfile(req.user, role, effectiveTenantId, profile);
    if (!canManageUser(req.user, { role, tenant_id: effectiveTenantId, profile: scopedProfile })) {
      return reject(res, 403, `当前账号无权创建${roleLabel[role] || role}`);
    }
    await validateProjectScope(effectiveTenantId, scopedProfile);

    // 检查用户名和邮箱是否已存在
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          { username },
          { email }
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.username === username ? '用户名已存在' : '邮箱已存在'
      });
    }

    // 如果指定了租户ID，检查租户是否存在
    if (effectiveTenantId) {
      const tenant = await Tenant.findByPk(effectiveTenantId);
      if (!tenant) {
        return res.status(400).json({
          success: false,
          message: '指定的租户不存在'
        });
      }
    }

    // 加密密码
    const password_hash = await bcrypt.hash(password, 10);

    // 创建用户
    const user = await User.create({
      username,
      email,
      password_hash,
      role,
      tenant_id: effectiveTenantId,
      profile: scopedProfile,
      status: 'active'
    });

    // 返回用户信息（不包含密码）
    const userResponse = await User.findByPk(user.id, {
      include: [{
        model: Tenant,
        as: 'tenant',
        attributes: ['id', 'name', 'code']
      }],
      attributes: {
        exclude: ['password_hash']
      }
    });

    logger.info('User created', { userId: user.id, username, createdBy: req.user.id });

    res.status(201).json({
      success: true,
      message: '用户创建成功',
      data: userResponse
    });
  } catch (error) {
    logger.error('Create user error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '创建用户失败',
      error: error.message
    });
  }
});

/**
 * 更新用户
 * PUT /api/users/:id
 */
router.put('/:id', authenticateToken, requireRole(['admin', 'tenant_admin', 'user', 'building_user']), validateAdminUserUpdate, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, role, tenant_id, profile, status } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    if (!canManageUser(req.user, user)) {
      return reject(res, 403, '无权编辑该用户');
    }

    const nextRole = role !== undefined ? role : user.role;
    if (!USER_ROLES.includes(nextRole)) {
      return reject(res, 400, '无效的用户角色');
    }
    const effectiveTenantId = resolveTenantId(req.user, nextRole, tenant_id !== undefined ? tenant_id : user.tenant_id);
    const scopedProfile = mergeScopedProfile(req.user, nextRole, effectiveTenantId, { ...user.profile, ...(profile || {}) });
    const targetUser = { role: nextRole, tenant_id: effectiveTenantId, profile: scopedProfile };
    if (!canManageUser(req.user, targetUser)) {
      return reject(res, 403, `当前账号无权设置${roleLabel[nextRole] || nextRole}`);
    }

    // 检查用户名和邮箱是否被其他用户使用
    if (username || email) {
      const whereConditions = {
        id: { [Op.ne]: id }
      };
      
      const orConditions = [];
      if (username) orConditions.push({ username });
      if (email) orConditions.push({ email });
      
      if (orConditions.length > 0) {
        whereConditions[Op.or] = orConditions;
      }

      const existingUser = await User.findOne({ where: whereConditions });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: existingUser.username === username ? '用户名已存在' : '邮箱已存在'
        });
      }
    }

    // 如果指定了租户ID，检查租户是否存在
    if (effectiveTenantId) {
      const tenant = await Tenant.findByPk(effectiveTenantId);
      if (!tenant) {
        return res.status(400).json({
          success: false,
          message: '指定的租户不存在'
        });
      }
    }

    // 更新用户信息
    const updateData = {};
    if (username !== undefined) updateData.username = username;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (tenant_id !== undefined || req.user.role !== 'admin') updateData.tenant_id = effectiveTenantId;
    if (profile !== undefined || role !== undefined) {
      await validateProjectScope(effectiveTenantId, scopedProfile);
      updateData.profile = scopedProfile;
    }
    if (status !== undefined) updateData.status = status;

    await user.update(updateData);

    // 返回更新后的用户信息
    const updatedUser = await User.findByPk(id, {
      include: [{
        model: Tenant,
        as: 'tenant',
        attributes: ['id', 'name', 'code']
      }],
      attributes: {
        exclude: ['password_hash']
      }
    });

    logger.info('User updated', { userId: id, updatedBy: req.user.id });

    res.json({
      success: true,
      message: '用户更新成功',
      data: updatedUser
    });
  } catch (error) {
    logger.error('Update user error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '更新用户失败',
      error: error.message
    });
  }
});

/**
 * 切换用户状态
 * PUT /api/users/:id/status
 */
router.put('/:id/status', authenticateToken, requireRole(['admin', 'tenant_admin', 'user', 'building_user']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive', 'locked'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: '无效的用户状态'
      });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 不能修改自己的状态
    if (user.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: '不能修改自己的状态'
      });
    }

    if (!canManageUser(req.user, user)) {
      return reject(res, 403, '无权修改该用户状态');
    }

    await user.update({ status });

    logger.info('User status changed', { userId: id, newStatus: status, changedBy: req.user.id });

    res.json({
      success: true,
      message: '用户状态更新成功',
      data: { id, status }
    });
  } catch (error) {
    logger.error('Update user status error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '更新用户状态失败',
      error: error.message
    });
  }
});

/**
 * 管理员修改用户密码
 * PUT /api/users/:id/password
 */
router.put('/:id/password', authenticateToken, requireRole(['admin', 'tenant_admin', 'user', 'building_user']), async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    // 验证输入
    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: '新密码不能为空'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: '新密码长度不能少于6位'
      });
    }

    // 获取用户信息
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    if (!canManageUser(req.user, user)) {
      return reject(res, 403, '无权修改该用户密码');
    }

    // 加密新密码
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // 更新密码
    await user.update({ password_hash: newPasswordHash });

    logger.info('Admin changed user password', { 
      adminId: req.user.id, 
      targetUserId: id, 
      changedAt: new Date() 
    });

    res.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    logger.error('Admin change user password error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '修改密码失败',
      error: error.message
    });
  }
});

/**
 * 获取用户权限
 * GET /api/users/:id/permissions
 */
router.get('/:id/permissions', authenticateToken, requireRole(['admin', 'tenant_admin', 'user', 'building_user']), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, {
      attributes: ['id', 'username', 'role', 'tenant_id', 'profile']
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    if (!canManageUser(req.user, user)) {
      return reject(res, 403, '无权查看该用户权限');
    }

    const permissions = user.profile?.permissions || [];

    res.json({
      success: true,
      data: {
        userId: user.id,
        username: user.username,
        role: user.role,
        permissions
      }
    });
  } catch (error) {
    logger.error('Get user permissions error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取用户权限失败',
      error: error.message
    });
  }
});

/**
 * 更新用户权限
 * PUT /api/users/:id/permissions
 */
router.put('/:id/permissions', authenticateToken, requireRole(['admin', 'tenant_admin', 'user', 'building_user']), async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: '权限列表必须是数组格式'
      });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    if (!canManageUser(req.user, user)) {
      return reject(res, 403, '无权设置该用户权限');
    }

    // 只有业务用户可以设置页面权限，超级管理员不走页面权限
    if (!['tenant_admin', 'user', 'building_user', 'group_user'].includes(user.role)) {
      return res.status(400).json({
        success: false,
        message: '只能为业务用户设置页面权限'
      });
    }

    // 定义可用的页面权限
    const availablePermissions = [
      'dashboard',
      'tenants',
      'manufacturers', 
      'device-types',
      'devices',
      'protocols',
      'lighting',
      'switch-control',
      'thermostat',
      'air-conditioner',
      'alarms',
      'multi-unit-ac',
      'system-settings'
    ];

    // 定义租户管理员不能修改的权限（仅管理员可以修改）
    const adminOnlyPermissions = [
      'manufacturers',
      'device-types'
    ];

    // 如果是租户管理员，过滤掉管理员专用权限
    let validPermissions = availablePermissions;
    if (user.role === 'tenant_admin') {
      validPermissions = availablePermissions.filter(p => !adminOnlyPermissions.includes(p));
      
      // 检查是否包含管理员专用权限
      const hasAdminOnlyPermissions = permissions.some(p => adminOnlyPermissions.includes(p));
      if (hasAdminOnlyPermissions) {
        return res.status(403).json({
          success: false,
          message: '租户管理员无法修改厂商、设备类型等管理员专用权限'
        });
      }
    }

    // 验证权限是否有效
    const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
    if (invalidPermissions.length > 0) {
      return res.status(400).json({
        success: false,
        message: `无效的权限: ${invalidPermissions.join(', ')}`
      });
    }

    // 更新用户权限
    const currentProfile = user.profile || {};
    const updatedProfile = {
      ...currentProfile,
      permissions
    };

    await user.update({ profile: updatedProfile });

    logger.info('User permissions updated', { 
      userId: id, 
      permissions, 
      updatedBy: req.user.id 
    });

    res.json({
      success: true,
      message: '用户权限更新成功',
      data: {
        userId: id,
        permissions
      }
    });
  } catch (error) {
    logger.error('Update user permissions error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '更新用户权限失败',
      error: error.message
    });
  }
});

/**
 * 删除用户
 * DELETE /api/users/:id
 */
router.delete('/:id', authenticateToken, requireRole(['admin', 'tenant_admin', 'user', 'building_user']), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 不能删除自己
    if (user.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: '不能删除自己的账户'
      });
    }

    if (!canManageUser(req.user, user)) {
      return reject(res, 403, '无权删除该用户');
    }

    // 检查用户是否有关联的设备或其他数据
    // 这里可以根据业务需求添加更多检查

    await user.destroy();

    logger.info('User deleted', { userId: id, deletedBy: req.user.id });

    res.json({
      success: true,
      message: '用户删除成功'
    });
  } catch (error) {
    logger.error('Delete user error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '删除用户失败',
      error: error.message
    });
  }
});

module.exports = router;
