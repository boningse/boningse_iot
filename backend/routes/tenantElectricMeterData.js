/**
 * 按租户分表的电表数据路由
 * 提供电表数据的查询、统计等API路由
 */

const express = require('express');
const router = express.Router();
const tenantElectricMeterDataController = require('../controllers/tenantElectricMeterDataController');
const { authenticateToken } = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');

/**
 * 验证请求参数的中间件
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: '请求参数验证失败',
      errors: errors.array()
    });
  }
  next();
};

/**
 * 租户代码验证规则
 */
const tenantCodeValidation = [
  param('tenantCode')
    .isLength({ min: 1, max: 50 })
    .withMessage('租户代码长度必须在1-50个字符之间')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('租户代码只能包含字母、数字、下划线和连字符')
];

/**
 * 时间范围验证规则
 */
const timeRangeValidation = [
  query('startTime')
    .optional()
    .isISO8601()
    .withMessage('开始时间格式无效，请使用ISO8601格式'),
  query('endTime')
    .optional()
    .isISO8601()
    .withMessage('结束时间格式无效，请使用ISO8601格式')
];

/**
 * 分页验证规则
 */
const paginationValidation = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('limit必须是1-1000之间的整数'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('offset必须是非负整数')
];

/**
 * 获取所有租户的电表数据概览
 * GET /api/tenant-electric-meter-data/overview
 */
router.get('/overview',
  authenticateToken,
  tenantElectricMeterDataController.getAllTenantsOverview
);

/**
 * 查询租户的电表数据
 * GET /api/tenant-electric-meter-data/:tenantCode
 */
router.get('/:tenantCode',
  authenticateToken,
  ...tenantCodeValidation,
  ...timeRangeValidation,
  ...paginationValidation,
  query('electricMeterId')
    .optional()
    .isUUID()
    .withMessage('电表ID格式无效'),
  query('deviceId')
    .optional()
    .isUUID()
    .withMessage('设备ID格式无效'),
  query('meterNumber')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('电表编号长度必须在1-100个字符之间'),
  query('orderBy')
    .optional()
    .isIn(['collection_timestamp', 'created_at', 'meter_number'])
    .withMessage('排序字段无效'),
  query('orderDirection')
    .optional()
    .isIn(['ASC', 'DESC', 'asc', 'desc'])
    .withMessage('排序方向无效'),
  validateRequest,
  tenantElectricMeterDataController.getTenantElectricMeterData
);

/**
 * 获取租户电表数据统计信息
 * GET /api/tenant-electric-meter-data/:tenantCode/stats
 */
router.get('/:tenantCode/stats',
  authenticateToken,
  ...tenantCodeValidation,
  ...timeRangeValidation,
  query('electricMeterId')
    .optional()
    .isUUID()
    .withMessage('电表ID格式无效'),
  validateRequest,
  tenantElectricMeterDataController.getTenantElectricMeterDataStats
);

/**
 * 获取租户的电表列表
 * GET /api/tenant-electric-meter-data/:tenantCode/meters
 */
router.get('/:tenantCode/meters',
  authenticateToken,
  ...tenantCodeValidation,
  validateRequest,
  tenantElectricMeterDataController.getTenantElectricMeters
);

/**
 * 获取电表的最新数据
 * GET /api/tenant-electric-meter-data/:tenantCode/meters/:meterId/latest
 */
router.get('/:tenantCode/meters/:meterId/latest',
  authenticateToken,
  ...tenantCodeValidation,
  param('meterId')
    .isUUID()
    .withMessage('电表ID格式无效'),
  validateRequest,
  tenantElectricMeterDataController.getElectricMeterLatestData
);

/**
 * 删除过期的电表数据
 * DELETE /api/tenant-electric-meter-data/:tenantCode/cleanup
 */
router.delete('/:tenantCode/cleanup',
  authenticateToken,
  ...tenantCodeValidation,
  query('beforeDays')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('beforeDays必须是1-365之间的整数'),
  validateRequest,
  tenantElectricMeterDataController.cleanupExpiredData
);

module.exports = router;