const express = require('express');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * @route GET /api/device-types
 * @desc 获取设备类型列表
 * @access Private (所有用户)
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { name, tenantId, description } = req.query;
    const whereConditions = [];
    const replacements = {};
    
    if (req.user.role !== 'admin') {
      whereConditions.push('dt.tenant_id = :currentTenantId');
      replacements.currentTenantId = req.user.tenant_id;
    } else if (tenantId) {
      whereConditions.push('dt.tenant_id = :filterTenantId');
      replacements.filterTenantId = tenantId;
    }

    if (name) {
      whereConditions.push('dt.name ILIKE :name');
      replacements.name = `%${name}%`;
    }

    if (description) {
      whereConditions.push('dt.description ILIKE :description');
      replacements.description = `%${description}%`;
    }

    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    const query = `
      SELECT 
        dt.id,
        dt.name,
        dt.description,
        dt.tenant_id,
        dt.created_at,
        dt.updated_at,
        t.name as tenant_name
      FROM device_types dt
      LEFT JOIN tenants t ON dt.tenant_id = t.id
      ${whereClause}
      ORDER BY dt.created_at DESC
    `
    
    const [results] = await sequelize.query(query, {
      replacements
    })
    
    res.json({
      success: true,
      data: results,
      total: results.length
    })
    
    logger.info('设备类型列表获取成功')
  } catch (error) {
    logger.error('获取设备类型列表失败:', error)
    res.status(500).json({
      success: false,
      message: '获取设备类型列表失败',
      error: error.message
    })
  }
})

/**
 * @route POST /api/device-types
 * @desc 创建设备类型
 * @access Private (管理员)
 */
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body
    
    // 验证必填字段
    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: '设备类型名称和描述不能为空'
      })
    }
    
    // 检查设备类型名称是否已存在
    const checkQuery = 'SELECT id FROM device_types WHERE name = :name'
    const [checkResults] = await sequelize.query(checkQuery, {
      replacements: { name }
    })
    
    if (checkResults.length > 0) {
      return res.status(400).json({
        success: false,
        message: '设备类型名称已存在'
      })
    }
    
    // 生成设备类型代码（基于名称的简化版本或时间戳）
    const code = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').toLowerCase() + '_' + Date.now()
    
    // 设置租户ID：非管理员只能在自己的租户下创建设备类型
    const tenantId = req.user.role === 'admin' ? (req.body.tenant_id || req.user.tenant_id) : req.user.tenant_id;
    
    // 创建设备类型
    const insertQuery = `
      INSERT INTO device_types (name, code, description, tenant_id, created_at, updated_at)
      VALUES (:name, :code, :description, :tenantId, NOW(), NOW())
      RETURNING id, name, code, description, tenant_id, created_at, updated_at
    `
    
    const [results] = await sequelize.query(insertQuery, {
      replacements: {
        name,
        code,
        description,
        tenantId
      }
    })
    
    res.status(201).json({
      success: true,
      data: results[0],
      message: '设备类型创建成功'
    })
    
    logger.info(`设备类型创建成功: ${name}`)
  } catch (error) {
    logger.error('创建设备类型失败:', error)
    res.status(500).json({
      success: false,
      message: '创建设备类型失败',
      error: error.message
    })
  }
})

/**
 * @route PUT /api/device-types/:id
 * @desc 更新设备类型
 * @access Private (管理员)
 */
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { name, description } = req.body
    
    // 验证必填字段
    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: '设备类型名称和描述不能为空'
      })
    }
    
    // 检查设备类型是否存在并验证租户权限
    const checkQuery = 'SELECT id, tenant_id FROM device_types WHERE id = :id'
    const [checkResults] = await sequelize.query(checkQuery, {
      replacements: { id }
    })
    
    if (checkResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: '设备类型不存在'
      })
    }
    
    // 租户权限检查：非管理员只能修改自己租户的设备类型
    if (req.user.role !== 'admin' && checkResults[0].tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权修改该设备类型'
      })
    }
    
    // 检查设备类型名称是否已被其他记录使用
    const nameCheckQuery = 'SELECT id FROM device_types WHERE name = :name AND id != :id'
    const [nameCheckResults] = await sequelize.query(nameCheckQuery, {
      replacements: { name, id }
    })
    
    if (nameCheckResults.length > 0) {
      return res.status(400).json({
        success: false,
        message: '设备类型名称已存在'
      })
    }
    
    // 生成新的设备类型代码（基于名称的简化版本或时间戳）
    const code = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').toLowerCase() + '_' + Date.now()
    
    // 更新设备类型
    const updateQuery = `
      UPDATE device_types 
      SET name = :name, code = :code, description = :description, updated_at = NOW()
      WHERE id = :id
      RETURNING id, name, code, description, created_at, updated_at
    `
    
    const [results] = await sequelize.query(updateQuery, {
      replacements: {
        id,
        name,
        code,
        description
      }
    })
    
    res.json({
      success: true,
      data: results[0],
      message: '设备类型更新成功'
    })
    
    logger.info(`设备类型更新成功: ${name} (ID: ${id})`)
  } catch (error) {
    logger.error('更新设备类型失败:', error)
    res.status(500).json({
      success: false,
      message: '更新设备类型失败',
      error: error.message
    })
  }
})

/**
 * @route DELETE /api/device-types/:id
 * @desc 删除设备类型
 * @access Private (管理员)
 */
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    
    // 检查设备类型是否存在并验证租户权限
    const checkQuery = 'SELECT id, name, tenant_id FROM device_types WHERE id = :id'
    const [checkResults] = await sequelize.query(checkQuery, {
      replacements: { id }
    })
    
    if (checkResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: '设备类型不存在'
      })
    }
    
    // 租户权限检查：非管理员只能删除自己租户的设备类型
    if (req.user.role !== 'admin' && checkResults[0].tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权删除该设备类型'
      })
    }
    
    const deviceTypeName = checkResults[0].name
    
    // 检查是否有设备使用此类型
    const deviceCheckQuery = 'SELECT COUNT(*) as count FROM devices WHERE device_type_id = :id'
    const [deviceCheckResults] = await sequelize.query(deviceCheckQuery, {
      replacements: { id }
    })
    
    if (parseInt(deviceCheckResults[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: '该设备类型正在被使用，无法删除'
      })
    }
    
    // 删除设备类型
    const deleteQuery = 'DELETE FROM device_types WHERE id = :id'
    await sequelize.query(deleteQuery, {
      replacements: { id }
    })
    
    res.json({
      success: true,
      message: '设备类型删除成功'
    })
    
    logger.info(`设备类型删除成功: ${deviceTypeName} (ID: ${id})`)
  } catch (error) {
    logger.error('删除设备类型失败:', error)
    res.status(500).json({
      success: false,
      message: '删除设备类型失败',
      error: error.message
    })
  }
})

/**
 * @route GET /api/device-types/:id
 * @desc 获取单个设备类型详情
 * @access Private
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    
    const query = `
      SELECT 
        id,
        name,
        code,
        description,
        created_at,
        updated_at
      FROM device_types 
      WHERE id = :id
    `
    
    const [results] = await sequelize.query(query, {
      replacements: { id }
    })
    
    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: '设备类型不存在'
      })
    }
    
    res.json({
      success: true,
      data: results[0]
    })
    
    logger.info(`设备类型详情获取成功: ID ${id}`)
  } catch (error) {
    logger.error('获取设备类型详情失败:', error)
    res.status(500).json({
      success: false,
      message: '获取设备类型详情失败',
      error: error.message
    })
  }
})

module.exports = router;
