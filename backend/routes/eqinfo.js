const express = require('express');
const { Pool } = require('pg');
const { getPoolConfig } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();
const pool = new Pool(getPoolConfig());

router.post('/', async (req, res) => {
  try {
    const { user } = req.body;
    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: '缺少 user 参数' 
      });
    }

    // 1. 通过账号验证查询租户ID
    const userQuery = 'SELECT id, tenant_id FROM users WHERE username = $1';
    const userResult = await pool.query(userQuery, [user]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: '用户不存在' 
      });
    }

    const { tenant_id } = userResult.rows[0];

    // 2. 查询指定用户下所有照明控制设备的在线离线统计
    const statsQuery = `
      SELECT 
        COUNT(*) as all_count,
        SUM(CASE WHEN d.status = 'online' THEN 1 ELSE 0 END) as online_count,
        SUM(CASE WHEN d.status = 'offline' THEN 1 ELSE 0 END) as offline_count
      FROM control_device_assignments lc
      JOIN devices d ON lc.device_id = d.id
      WHERE lc.tenant_id = $1 AND lc.module_type = 'lighting' AND lc.is_active = true
    `;

    const statsResult = await pool.query(statsQuery, [tenant_id]);
    const row = statsResult.rows[0];

    res.json({
      data: {
        online: parseInt(row.online_count || 0, 10),
        offline: parseInt(row.offline_count || 0, 10),
        all: parseInt(row.all_count || 0, 10)
      }
    });

  } catch (error) {
    logger.error('获取设备统计失败:', error);
    res.status(500).json({ 
      success: false,
      message: '服务器内部错误',
      error: error.message 
    });
  }
});
  
module.exports = router;
