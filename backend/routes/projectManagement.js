const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const { authenticateToken, requireTenantAdmin } = require('../middleware/auth');
const { getPoolConfig } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();
const pool = new Pool(getPoolConfig());

router.use(authenticateToken);

const getReadableTenantId = (req) => {
  if (req.user.role === 'admin') {
    return req.query.tenantId || '';
  }
  return req.user.tenant_id;
};

const getWritableTenantId = (req, bodyTenantId) => {
  if (req.user.role === 'admin') {
    return bodyTenantId;
  }
  return req.user.tenant_id;
};

const requireTenantScope = (tenantId, res) => {
  if (tenantId) return true;
  res.status(403).json({ success: false, message: '当前账号未绑定租户，不能管理项目数据' });
  return false;
};

const buildTenantFilter = (tenantId, params, alias = '') => {
  if (!tenantId) return '';
  params.push(tenantId);
  return ` AND ${alias}tenant_id = $${params.length}`;
};

const normalizeText = (value) => (value === undefined || value === null ? null : String(value).trim());

const ensureName = (name, res) => {
  if (!normalizeText(name)) {
    res.status(400).json({ success: false, message: '名称不能为空' });
    return false;
  }
  return true;
};

router.get('/buildings', async (req, res) => {
  try {
    const { keyword, status } = req.query;
    const tenantId = getReadableTenantId(req);
    if (req.user.role !== 'admin' && !requireTenantScope(tenantId, res)) return;
    const params = [];
    let where = 'WHERE b.is_active = true';

    where += buildTenantFilter(tenantId, params, 'b.');

    if (keyword) {
      params.push(`%${keyword}%`);
      where += ` AND (b.name ILIKE $${params.length} OR b.code ILIKE $${params.length} OR b.address ILIKE $${params.length})`;
    }

    if (status) {
      params.push(status);
      where += ` AND b.status = $${params.length}`;
    }

    const result = await pool.query(`
      SELECT b.*, t.name AS tenant_name
      FROM project_buildings b
      LEFT JOIN tenants t ON b.tenant_id = t.id
      ${where}
      ORDER BY b.created_at DESC
    `, params);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('获取建筑列表失败:', error);
    res.status(500).json({ success: false, message: '获取建筑列表失败', error: error.message });
  }
});

router.post('/buildings', requireTenantAdmin, async (req, res) => {
  try {
    const { name, code, address, description, status = 'active' } = req.body;
    const tenant_id = getWritableTenantId(req, req.body.tenant_id);
    if (!tenant_id) return res.status(400).json({ success: false, message: '所属租户不能为空' });
    if (!ensureName(name, res)) return;

    const id = crypto.randomUUID();
    const result = await pool.query(`
      INSERT INTO project_buildings (id, tenant_id, name, code, address, description, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [id, tenant_id, normalizeText(name), normalizeText(code), normalizeText(address), normalizeText(description), status]);

    res.status(201).json({ success: true, data: result.rows[0], message: '建筑添加成功' });
  } catch (error) {
    logger.error('添加建筑失败:', error);
    res.status(500).json({ success: false, message: '添加建筑失败', error: error.message });
  }
});

router.put('/buildings/:id', requireTenantAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, address, description, status = 'active' } = req.body;
    const tenant_id = getWritableTenantId(req, req.body.tenant_id);
    if (!tenant_id) return res.status(400).json({ success: false, message: '所属租户不能为空' });
    if (!ensureName(name, res)) return;

    const params = [tenant_id, normalizeText(name), normalizeText(code), normalizeText(address), normalizeText(description), status, id];
    let where = 'id = $7 AND is_active = true';
    if (req.user.role !== 'admin') {
      params.push(req.user.tenant_id);
      where += ` AND tenant_id = $${params.length}`;
    }

    const result = await pool.query(`
      UPDATE project_buildings
      SET tenant_id = $1, name = $2, code = $3, address = $4, description = $5, status = $6, updated_at = CURRENT_TIMESTAMP
      WHERE ${where}
      RETURNING *
    `, params);

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: '建筑不存在' });
    res.json({ success: true, data: result.rows[0], message: '建筑更新成功' });
  } catch (error) {
    logger.error('更新建筑失败:', error);
    res.status(500).json({ success: false, message: '更新建筑失败', error: error.message });
  }
});

router.delete('/buildings/:id', requireTenantAdmin, async (req, res) => {
  try {
    const params = [req.params.id];
    let where = 'id = $1 AND is_active = true';
    if (req.user.role !== 'admin') {
      params.push(req.user.tenant_id);
      where += ` AND tenant_id = $${params.length}`;
    }
    const result = await pool.query(
      `UPDATE project_buildings SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE ${where} RETURNING id`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: '建筑不存在' });
    res.json({ success: true, message: '建筑删除成功' });
  } catch (error) {
    logger.error('删除建筑失败:', error);
    res.status(500).json({ success: false, message: '删除建筑失败', error: error.message });
  }
});

router.get('/groups', async (req, res) => {
  try {
    const { buildingId, keyword, status } = req.query;
    const tenantId = getReadableTenantId(req);
    if (req.user.role !== 'admin' && !requireTenantScope(tenantId, res)) return;
    const params = [];
    let where = 'WHERE g.is_active = true';

    where += buildTenantFilter(tenantId, params, 'g.');

    if (buildingId) {
      params.push(buildingId);
      where += ` AND g.building_id = $${params.length}`;
    }

    if (keyword) {
      params.push(`%${keyword}%`);
      where += ` AND (g.name ILIKE $${params.length} OR g.code ILIKE $${params.length} OR g.description ILIKE $${params.length})`;
    }

    if (status) {
      params.push(status);
      where += ` AND g.status = $${params.length}`;
    }

    const result = await pool.query(`
      SELECT g.*, t.name AS tenant_name, b.name AS building_name
      FROM project_groups g
      LEFT JOIN tenants t ON g.tenant_id = t.id
      LEFT JOIN project_buildings b ON g.building_id = b.id
      ${where}
      ORDER BY g.created_at DESC
    `, params);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('获取项目分组失败:', error);
    res.status(500).json({ success: false, message: '获取项目分组失败', error: error.message });
  }
});

router.post('/groups', requireTenantAdmin, async (req, res) => {
  try {
    const { building_id, name, code, description, status = 'active' } = req.body;
    const tenant_id = getWritableTenantId(req, req.body.tenant_id);
    if (!tenant_id) return res.status(400).json({ success: false, message: '所属租户不能为空' });
    if (!ensureName(name, res)) return;

    const id = crypto.randomUUID();
    const result = await pool.query(`
      INSERT INTO project_groups (id, tenant_id, building_id, name, code, description, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [id, tenant_id, building_id || null, normalizeText(name), normalizeText(code), normalizeText(description), status]);

    res.status(201).json({ success: true, data: result.rows[0], message: '分组添加成功' });
  } catch (error) {
    logger.error('添加项目分组失败:', error);
    res.status(500).json({ success: false, message: '添加项目分组失败', error: error.message });
  }
});

router.put('/groups/:id', requireTenantAdmin, async (req, res) => {
  try {
    const { building_id, name, code, description, status = 'active' } = req.body;
    const tenant_id = getWritableTenantId(req, req.body.tenant_id);
    if (!tenant_id) return res.status(400).json({ success: false, message: '所属租户不能为空' });
    if (!ensureName(name, res)) return;

    const params = [tenant_id, building_id || null, normalizeText(name), normalizeText(code), normalizeText(description), status, req.params.id];
    let where = 'id = $7 AND is_active = true';
    if (req.user.role !== 'admin') {
      params.push(req.user.tenant_id);
      where += ` AND tenant_id = $${params.length}`;
    }

    const result = await pool.query(`
      UPDATE project_groups
      SET tenant_id = $1, building_id = $2, name = $3, code = $4, description = $5, status = $6, updated_at = CURRENT_TIMESTAMP
      WHERE ${where}
      RETURNING *
    `, params);

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: '分组不存在' });
    res.json({ success: true, data: result.rows[0], message: '分组更新成功' });
  } catch (error) {
    logger.error('更新项目分组失败:', error);
    res.status(500).json({ success: false, message: '更新项目分组失败', error: error.message });
  }
});

router.delete('/groups/:id', requireTenantAdmin, async (req, res) => {
  try {
    const params = [req.params.id];
    let where = 'id = $1 AND is_active = true';
    if (req.user.role !== 'admin') {
      params.push(req.user.tenant_id);
      where += ` AND tenant_id = $${params.length}`;
    }
    const result = await pool.query(
      `UPDATE project_groups SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE ${where} RETURNING id`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: '分组不存在' });
    res.json({ success: true, message: '分组删除成功' });
  } catch (error) {
    logger.error('删除项目分组失败:', error);
    res.status(500).json({ success: false, message: '删除项目分组失败', error: error.message });
  }
});

module.exports = router;
