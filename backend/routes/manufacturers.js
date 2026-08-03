const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const db = require('../utils/database');
const { authenticateToken, requireAdmin, requireTenantAccess } = require('../middleware/auth');
const { validatePagination, validateId } = require('../middleware/validation');
const logger = require('../utils/logger');
const mqttService = require('../services/mqttService');

const refreshMqttSubscriptions = async (reason) => {
  try {
    return await mqttService.reloadManufacturerSubscriptions();
  } catch (error) {
    logger.warn(`厂商${reason}成功，但MQTT订阅热更新失败`, { error: error.message });
    return null;
  }
};

const normalizeTopicItems = (items = []) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      if (typeof item === 'string') {
        return {
          name: index === 0 ? '默认主题' : `主题${index + 1}`,
          topic: item.trim(),
          enabled: true
        };
      }
      return {
        name: item.name || item.label || (index === 0 ? '默认主题' : `主题${index + 1}`),
        topic: String(item.topic || item.value || '').trim(),
        direction: item.direction || undefined,
        qos: Number.isFinite(Number(item.qos)) ? Number(item.qos) : undefined,
        enabled: item.enabled !== false,
        description: item.description || ''
      };
    })
    .filter(item => item.topic);
};

function getCustomMqttConfig() { return { subscriptionType: "custom", subscribeTopic: "", publishTopic: "", subscribeTopics: [], publishTopics: [] }; }
const getDefaultMqttConfig = (code, subscriptionType) => {
  if (subscriptionType === "custom") return getCustomMqttConfig();
  const type = subscriptionType === 'imei_last' || subscriptionType === 'end' ? 'end' : 'middle';
  const subscribeTopic = type === 'end'
    ? `zhhl/${code}/subscribe/{imei}`
    : `zhhl/${code}/{imei}/subscribe`;
  const publishTopic = type === 'end'
    ? `zhhl/${code}/publish/{imei}`
    : `zhhl/${code}/{imei}/publish`;

  return {
    subscriptionType: type,
    subscribeTopic,
    publishTopic,
    subscribeTopics: [{ name: '默认下行主题', topic: subscribeTopic, enabled: true, qos: 1 }],
    publishTopics: [{ name: '默认上行主题', topic: publishTopic, enabled: true, qos: 1 }]
  };
};

function normalizeCustomMqttConfig(mqttConfig) { return { subscriptionType: "custom", ...mqttConfig, subscribeTopic: mqttConfig.subscribeTopic || "", publishTopic: mqttConfig.publishTopic || "", subscribeTopics: (typeof normalizeTopicItems === "function" ? normalizeTopicItems(mqttConfig.subscribeTopics || mqttConfig.subscribe_topics || []) : (mqttConfig.subscribeTopics || [])), publishTopics: (typeof normalizeTopicItems === "function" ? normalizeTopicItems(mqttConfig.publishTopics || mqttConfig.publish_topics || []) : (mqttConfig.publishTopics || [])) }; }
const normalizeMqttConfig = (code, subscriptionType, mqttConfig = {}) => {
  if (subscriptionType === "custom" || subscriptionType === "imei_custom") return normalizeCustomMqttConfig(mqttConfig);
  const defaults = getDefaultMqttConfig(code, subscriptionType);
  const subscribeTopics = normalizeTopicItems(
    mqttConfig.subscribeTopics ||
    mqttConfig.subscribe_topics ||
    (mqttConfig.subscribeTopic || mqttConfig.subscribe_topic ? [mqttConfig.subscribeTopic || mqttConfig.subscribe_topic] : [])
  );
  const publishTopics = normalizeTopicItems(
    mqttConfig.publishTopics ||
    mqttConfig.publish_topics ||
    (mqttConfig.publishTopic || mqttConfig.publish_topic ? [mqttConfig.publishTopic || mqttConfig.publish_topic] : [])
  );

  return {
    ...defaults,
    ...mqttConfig,
    subscriptionType: mqttConfig.subscriptionType || mqttConfig.subscription_type || defaults.subscriptionType,
    subscribeTopic: (subscribeTopics[0]?.topic || mqttConfig.subscribeTopic || mqttConfig.subscribe_topic || defaults.subscribeTopic),
    publishTopic: (publishTopics[0]?.topic || mqttConfig.publishTopic || mqttConfig.publish_topic || defaults.publishTopic),
    subscribeTopics: subscribeTopics.length ? subscribeTopics : defaults.subscribeTopics,
    publishTopics: publishTopics.length ? publishTopics : defaults.publishTopics
  };
};

const buildManufacturerResponse = (manufacturerData) => {
  const mqttConfig = normalizeMqttConfig(
    manufacturerData.code,
    manufacturerData.subscription_type,
    manufacturerData.mqtt_config || {}
  );
  return {
    ...manufacturerData,
    mqttConfig
  };
};

/**
 * @route GET /api/manufacturers
 * @desc 获取厂商列表
 * @access Private
 */
router.get('/', authenticateToken, validatePagination, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, keyword, name, tenantName, contact, status, type } = req.query;
    const offset = (page - 1) * pageSize;

    // 构建查询条件
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    // 租户权限控制：非管理员只能查看自己租户的厂商
    if (req.user.role !== 'admin') {
      whereConditions.push(`m.tenant_id = $${paramIndex}`);
      queryParams.push(req.user.tenant_id);
      paramIndex++;
    }

    if (keyword) {
      whereConditions.push(`(m.name ILIKE $${paramIndex} OR m.code ILIKE $${paramIndex} OR m.contact ILIKE $${paramIndex})`);
      queryParams.push(`%${keyword}%`);
      paramIndex++;
    }

    if (name) {
      whereConditions.push(`m.name ILIKE $${paramIndex}`);
      queryParams.push(`%${name}%`);
      paramIndex++;
    }

    if (tenantName && req.user.role === 'admin') {
      whereConditions.push(`EXISTS (SELECT 1 FROM tenants t_filter WHERE t_filter.id = m.tenant_id AND t_filter.name ILIKE $${paramIndex})`);
      queryParams.push(`%${tenantName}%`);
      paramIndex++;
    }

    if (contact) {
      whereConditions.push(`m.contact ILIKE $${paramIndex}`);
      queryParams.push(`%${contact}%`);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`m.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    // 构建WHERE子句
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 查询总数
    const countQuery = `SELECT COUNT(*) as total FROM manufacturers m ${whereClause}`;
    const countResult = await db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // 查询厂商列表（带分页）
    const dataQuery = `
      SELECT m.id, m.code, m.name, m.contact, m.phone, m.email, m.address, m.website, m.description, 
             m.logo_url, m.status, m.subscription_type, m.mqtt_config, m.tenant_id, m.created_by, m.created_at, m.updated_at,
             t.name as tenant_name
      FROM manufacturers m
      LEFT JOIN tenants t ON m.tenant_id = t.id
      ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    queryParams.push(parseInt(pageSize), offset);

    const result = await db.query(dataQuery, queryParams);

    const manufacturers = result.rows.map(manufacturer => buildManufacturerResponse({
      ...manufacturer,
      created_at: manufacturer.created_at ? manufacturer.created_at.toISOString() : null,
      updated_at: manufacturer.updated_at ? manufacturer.updated_at.toISOString() : null
    }));
    logger.info('获取厂商列表成功', result.rows);
    logger.info('获取厂商列表成功', manufacturers);
    logger.info(`获取厂商列表成功，共 ${total} 条记录`);

    res.json({
      success: true,
      data: {
        manufacturers,
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      }
    });
  } catch (error) {
    logger.error('获取厂商列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取厂商列表失败',
      error: error.message
    });
  }
});

/**
 * @route GET /api/manufacturers/:id
 * @desc 获取单个厂商信息
 * @access Private (Admin only)
 */
router.get('/:id', authenticateToken, requireAdmin, validateId, async (req, res) => {
  try {
    const { id } = req.params;

    // 从数据库查询厂商信息
    const query = `
      SELECT id, code, name, contact, phone, email, address, website, description, 
             logo_url, status, subscription_type, mqtt_config, created_by, created_at, updated_at
      FROM manufacturers 
      WHERE id = $1
    `;

    const result = await db.query(query, [id]);
    const manufacturerData = result.rows[0];

    if (!manufacturerData) {
      return res.status(404).json({
        success: false,
        message: '厂商不存在'
      });
    }

    const manufacturer = buildManufacturerResponse(manufacturerData);

    logger.info(`获取厂商信息成功: ${manufacturer.name}`);

    res.json({
      success: true,
      data: manufacturer
    });
  } catch (error) {
    logger.error('获取厂商信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取厂商信息失败',
      error: error.message
    });
  }
});

/**
 * @route GET /api/manufacturers/code/:code
 * @desc 根据厂商代码获取厂商信息
 * @access Private
 */
router.get('/code/:code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;

    // 从数据库查询厂商信息
    const query = `
      SELECT id, code, name, contact, phone, email, address, website, description, 
             logo_url, status, subscription_type, mqtt_config, created_by, created_at, updated_at
      FROM manufacturers 
      WHERE code = $1 AND status = 'active'
    `;

    const result = await db.query(query, [code]);
    const manufacturerData = result.rows[0];

    if (!manufacturerData) {
      return res.status(404).json({
        success: false,
        message: '厂商不存在或已停用'
      });
    }

    const manufacturer = buildManufacturerResponse(manufacturerData);

    logger.info(`根据代码获取厂商信息成功: ${manufacturer.name}`);

    res.json({
      success: true,
      data: manufacturer
    });
  } catch (error) {
    logger.error('根据代码获取厂商信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取厂商信息失败',
      error: error.message
    });
  }
});

/**
 * @route POST /api/manufacturers
 * @desc 创建新厂商
 * @access Private (Admin only)
 */
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      code,
      name,
      contact,
      phone,
      email,
      address,
      website,
      description,
      status = 'active',
      mqttConfig
    } = req.body;

    // 验证必填字段
    if (!code || !name || !contact || !phone || !email) {
      return res.status(400).json({
        success: false,
        message: '请填写所有必填字段'
      });
    }

    // 检查厂商编码是否已存在
    const checkCodeQuery = 'SELECT id FROM manufacturers WHERE code = $1';
    const existingCode = await db.query(checkCodeQuery, [code]);

    if (existingCode.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: '厂商编码已存在'
      });
    }

    // 设置租户ID：非管理员只能在自己的租户下创建厂商
    const tenantId = req.user.role === 'admin' ? (req.body.tenant_id || req.user.tenant_id) : req.user.tenant_id;

    // 插入新厂商到数据库
    let subscriptionType; if (mqttConfig?.subscriptionType === "end") subscriptionType = "imei_last"; else if (mqttConfig?.subscriptionType === "custom") subscriptionType = "custom"; else subscriptionType = "imei_middle";
    const normalizedMqttConfig = normalizeMqttConfig(code, subscriptionType, mqttConfig || {});

    const insertQuery = `
      INSERT INTO manufacturers (code, name, contact, phone, email, address, website, description, status, subscription_type, mqtt_config, tenant_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, code, name, contact, phone, email, address, website, description, status, subscription_type, mqtt_config, tenant_id, created_by, created_at, updated_at
    `;

    const result = await db.query(insertQuery, [
      code,
      name,
      contact,
      phone,
      email,
      address || '',
      website || '',
      description || '',
      status || 'active',
      subscriptionType,
      JSON.stringify(normalizedMqttConfig),
      tenantId,
      req.user?.id || null
    ]);

    const manufacturerData = result.rows[0];
    const newManufacturer = buildManufacturerResponse(manufacturerData);

    logger.info(`创建厂商成功: ${newManufacturer.name}`);
    await refreshMqttSubscriptions('创建');

    res.status(201).json({
      success: true,
      message: '创建厂商成功',
      data: newManufacturer
    });
  } catch (error) {
    logger.error('创建厂商失败:', error);
    res.status(500).json({
      success: false,
      message: '创建厂商失败',
      error: error.message
    });
  }
});

/**
 * @route PUT /api/manufacturers/:id
 * @desc 更新厂商信息
 * @access Private (Admin only)
 */
router.put('/:id', authenticateToken, requireAdmin, validateId, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      code,
      name,
      contact,
      phone,
      email,
      address,
      website,
      description,
      status,
      mqttConfig
    } = req.body;

    // 验证必填字段
    if (!code || !name || !contact || !phone || !email) {
      return res.status(400).json({
        success: false,
        message: '请填写所有必填字段'
      });
    }

    // 检查厂商是否存在并验证租户权限
    const checkQuery = 'SELECT id, tenant_id FROM manufacturers WHERE id = $1';
    const existingManufacturer = await db.query(checkQuery, [id]);

    if (existingManufacturer.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '厂商不存在'
      });
    }

    // 租户权限检查：非管理员只能修改自己租户的厂商
    if (req.user.role !== 'admin' && existingManufacturer.rows[0].tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权修改该厂商'
      });
    }

    // 检查厂商编码是否被其他厂商使用
    const checkCodeQuery = 'SELECT id FROM manufacturers WHERE code = $1 AND id != $2';
    const existingCode = await db.query(checkCodeQuery, [code, id]);

    if (existingCode.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: '厂商编码已被其他厂商使用'
      });
    }

    // 设置租户ID：只有管理员可以修改租户归属
    const tenantId = req.user.role === 'admin' ? (req.body.tenant_id || existingManufacturer.rows[0].tenant_id) : existingManufacturer.rows[0].tenant_id;

    // 更新厂商信息
    let subscriptionType; if (mqttConfig?.subscriptionType === "end") subscriptionType = "imei_last"; else if (mqttConfig?.subscriptionType === "custom") subscriptionType = "custom"; else subscriptionType = "imei_middle";
    const normalizedMqttConfig = normalizeMqttConfig(code, subscriptionType, mqttConfig || {});

    const updateQuery = `
      UPDATE manufacturers 
      SET code = $1, name = $2, contact = $3, phone = $4, email = $5, 
          address = $6, website = $7, description = $8, status = $9, subscription_type = $10, mqtt_config = $11, tenant_id = $12, updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING id, code, name, contact, phone, email, address, website, description, status, subscription_type, mqtt_config, tenant_id, created_by, created_at, updated_at
    `;

    const result = await db.query(updateQuery, [
      code,
      name,
      contact,
      phone,
      email,
      address || '',
      website || '',
      description || '',
      status,
      subscriptionType,
      JSON.stringify(normalizedMqttConfig),
      tenantId,
      id
    ]);

    const manufacturerData = result.rows[0];
    const updatedManufacturer = buildManufacturerResponse(manufacturerData);

    logger.info(`更新厂商成功: ${updatedManufacturer.name}`);
    await refreshMqttSubscriptions('更新');

    res.json({
      success: true,
      message: '更新厂商成功',
      data: updatedManufacturer
    });
  } catch (error) {
    logger.error('更新厂商失败:', error);
    res.status(500).json({
      success: false,
      message: '更新厂商失败',
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/manufacturers/:id
 * @desc 删除厂商
 * @access Private (Admin only)
 */
router.delete('/:id', authenticateToken, requireAdmin, validateId, async (req, res) => {
  try {
    const { id } = req.params;

    // 检查厂商是否存在并验证租户权限
    const checkQuery = 'SELECT id, name, code, tenant_id FROM manufacturers WHERE id = $1';
    const existingManufacturer = await db.query(checkQuery, [id]);

    if (existingManufacturer.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '厂商不存在'
      });
    }

    // 租户权限检查：非管理员只能删除自己租户的厂商
    if (req.user.role !== 'admin' && existingManufacturer.rows[0].tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权删除该厂商'
      });
    }

    // 检查是否有关联的设备
    const manufacturerCode = existingManufacturer.rows[0].code || existingManufacturer.rows[0].name;
    const checkDevicesQuery = 'SELECT COUNT(*) as count FROM devices WHERE manufacturer_code = $1';
    const devicesResult = await db.query(checkDevicesQuery, [manufacturerCode]);
    const hasDevices = parseInt(devicesResult.rows[0].count) > 0;

    if (hasDevices) {
      return res.status(400).json({
        success: false,
        message: '该厂商下还有设备，无法删除'
      });
    }

    // 删除厂商
    const deleteQuery = 'DELETE FROM manufacturers WHERE id = $1';
    await db.query(deleteQuery, [id]);

    logger.info(`删除厂商成功: ${existingManufacturer.rows[0].name} (ID: ${id})`);
    await refreshMqttSubscriptions('删除');

    res.json({
      success: true,
      message: '删除厂商成功'
    });
  } catch (error) {
    logger.error('删除厂商失败:', error);
    res.status(500).json({
      success: false,
      message: '删除厂商失败',
      error: error.message
    });
  }
});

/**
 * @route PATCH /api/manufacturers/:id/status
 * @desc 切换厂商状态
 * @access Private (Admin only)
 */
router.patch('/:id/status', authenticateToken, requireAdmin, validateId, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: '无效的状态值'
      });
    }

    // 检查厂商是否存在并验证租户权限
    const checkQuery = 'SELECT id, tenant_id FROM manufacturers WHERE id = $1';
    const existingManufacturer = await db.query(checkQuery, [id]);

    if (existingManufacturer.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '厂商不存在'
      });
    }

    // 租户权限检查：非管理员只能修改自己租户的厂商状态
    if (req.user.role !== 'admin' && existingManufacturer.rows[0].tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权修改该厂商状态'
      });
    }

    // 更新厂商状态
    const updateQuery = `
      UPDATE manufacturers 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, status, updated_at
    `;

    const result = await db.query(updateQuery, [status, id]);
    const responseData = result.rows[0];

    logger.info(`更新厂商状态成功: ID ${id}, 状态: ${status}`);
    await refreshMqttSubscriptions('状态更新');

    res.json({
      success: true,
      message: '更新状态成功',
      data: responseData
    });
  } catch (error) {
    logger.error('更新厂商状态失败:', error);
    res.status(500).json({
      success: false,
      message: '更新厂商状态失败',
      error: error.message
    });
  }
});

module.exports = router;
