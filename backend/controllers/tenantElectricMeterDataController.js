/**
 * 按租户分表的电表数据控制器
 * 提供电表数据的查询、统计等API接口
 */

const tenantElectricMeterDataService = require('../services/tenantElectricMeterDataService');
const { Tenant, ElectricMeter, Device } = require('../models');
const logger = require('../utils/logger');

class TenantElectricMeterDataController {
  /**
   * 查询租户的电表数据
   * GET /api/tenant-electric-meter-data/:tenantCode
   */
  async getTenantElectricMeterData(req, res) {
    try {
      const { tenantCode } = req.params;
      const {
        electricMeterId,
        deviceId,
        meterNumber,
        startTime,
        endTime,
        limit = 100,
        offset = 0,
        orderBy = 'collection_timestamp',
        orderDirection = 'DESC'
      } = req.query;

      // 验证租户是否存在
      const tenant = await Tenant.findOne({ where: { code: tenantCode, status: 'active' } });
      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: `租户 ${tenantCode} 不存在或未激活`
        });
      }

      // 构造查询选项
      const options = {
        electricMeterId,
        deviceId,
        meterNumber,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        limit: Math.min(parseInt(limit), 1000), // 限制最大查询数量
        offset: parseInt(offset),
        orderBy,
        orderDirection: orderDirection.toUpperCase()
      };

      // 查询电表数据
      const data = await tenantElectricMeterDataService.queryMeterData(tenantCode, options);

      res.json({
        success: true,
        data: {
          tenantCode,
          tenantName: tenant.name,
          records: data,
          pagination: {
            limit: options.limit,
            offset: options.offset,
            count: data.length
          }
        }
      });
    } catch (error) {
      logger.error('查询租户电表数据失败:', error);
      res.status(500).json({
        success: false,
        message: '查询电表数据失败',
        error: error.message
      });
    }
  }

  /**
   * 获取租户电表数据统计信息
   * GET /api/tenant-electric-meter-data/:tenantCode/stats
   */
  async getTenantElectricMeterDataStats(req, res) {
    try {
      const { tenantCode } = req.params;
      const {
        electricMeterId,
        startTime,
        endTime
      } = req.query;

      // 验证租户是否存在
      const tenant = await Tenant.findOne({ where: { code: tenantCode, status: 'active' } });
      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: `租户 ${tenantCode} 不存在或未激活`
        });
      }

      // 构造查询选项
      const options = {
        electricMeterId,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined
      };

      // 获取统计信息
      const stats = await tenantElectricMeterDataService.getMeterDataStats(tenantCode, options);

      res.json({
        success: true,
        data: {
          tenantCode,
          tenantName: tenant.name,
          statistics: stats
        }
      });
    } catch (error) {
      logger.error('获取租户电表数据统计失败:', error);
      res.status(500).json({
        success: false,
        message: '获取统计信息失败',
        error: error.message
      });
    }
  }

  /**
   * 获取租户的电表列表
   * GET /api/tenant-electric-meter-data/:tenantCode/meters
   */
  async getTenantElectricMeters(req, res) {
    try {
      const { tenantCode } = req.params;

      // 验证租户是否存在
      const tenant = await Tenant.findOne({ where: { code: tenantCode, status: 'active' } });
      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: `租户 ${tenantCode} 不存在或未激活`
        });
      }

      // 查询租户的电表列表
      const electricMeters = await ElectricMeter.findAll({
        where: {
          tenant_id: tenant.id,
          status: 'active'
        },
        include: [{
          model: Device,
          as: 'device',
          attributes: ['id', 'name', 'imei', 'status']
        }],
        attributes: ['id', 'name', 'meter_number', 'meter_address', 'status', 'created_at']
      });

      res.json({
        success: true,
        data: {
          tenantCode,
          tenantName: tenant.name,
          electricMeters
        }
      });
    } catch (error) {
      logger.error('获取租户电表列表失败:', error);
      res.status(500).json({
        success: false,
        message: '获取电表列表失败',
        error: error.message
      });
    }
  }

  /**
   * 获取电表的最新数据
   * GET /api/tenant-electric-meter-data/:tenantCode/meters/:meterId/latest
   */
  async getElectricMeterLatestData(req, res) {
    try {
      const { tenantCode, meterId } = req.params;

      // 验证租户是否存在
      const tenant = await Tenant.findOne({ where: { code: tenantCode, status: 'active' } });
      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: `租户 ${tenantCode} 不存在或未激活`
        });
      }

      // 验证电表是否属于该租户
      const electricMeter = await ElectricMeter.findOne({
        where: {
          id: meterId,
          tenant_id: tenant.id,
          status: 'active'
        },
        include: [{
          model: Device,
          as: 'device',
          attributes: ['id', 'name', 'imei']
        }]
      });

      if (!electricMeter) {
        return res.status(404).json({
          success: false,
          message: '电表不存在或不属于该租户'
        });
      }

      // 查询最新的电表数据
      const latestData = await tenantElectricMeterDataService.queryMeterData(tenantCode, {
        electricMeterId: meterId,
        limit: 1,
        orderBy: 'collection_timestamp',
        orderDirection: 'DESC'
      });

      res.json({
        success: true,
        data: {
          tenantCode,
          tenantName: tenant.name,
          electricMeter: {
            id: electricMeter.id,
            name: electricMeter.name,
            meterNumber: electricMeter.meter_number,
            meterAddress: electricMeter.meter_address,
            device: electricMeter.device
          },
          latestData: latestData.length > 0 ? latestData[0] : null
        }
      });
    } catch (error) {
      logger.error('获取电表最新数据失败:', error);
      res.status(500).json({
        success: false,
        message: '获取电表最新数据失败',
        error: error.message
      });
    }
  }

  /**
   * 删除过期的电表数据
   * DELETE /api/tenant-electric-meter-data/:tenantCode/cleanup
   */
  async cleanupExpiredData(req, res) {
    try {
      const { tenantCode } = req.params;
      const { beforeDays = 30 } = req.query;

      // 验证租户是否存在
      const tenant = await Tenant.findOne({ where: { code: tenantCode, status: 'active' } });
      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: `租户 ${tenantCode} 不存在或未激活`
        });
      }

      // 计算过期时间
      const beforeTime = new Date();
      beforeTime.setDate(beforeTime.getDate() - parseInt(beforeDays));

      // 删除过期数据
      const deletedCount = await tenantElectricMeterDataService.deleteMeterData(tenantCode, {
        beforeTime
      });

      res.json({
        success: true,
        data: {
          tenantCode,
          tenantName: tenant.name,
          deletedCount,
          beforeTime
        }
      });
    } catch (error) {
      logger.error('清理过期电表数据失败:', error);
      res.status(500).json({
        success: false,
        message: '清理过期数据失败',
        error: error.message
      });
    }
  }

  /**
   * 获取所有租户的电表数据概览
   * GET /api/tenant-electric-meter-data/overview
   */
  async getAllTenantsOverview(req, res) {
    try {
      // 获取所有活跃租户
      const tenants = await Tenant.findAll({
        where: { status: 'active' },
        attributes: ['id', 'name', 'code']
      });

      const overview = [];

      for (const tenant of tenants) {
        // 获取租户的电表数量
        const meterCount = await ElectricMeter.count({
          where: {
            tenant_id: tenant.id,
            status: 'active'
          }
        });

        // 获取租户电表数据统计
        const stats = await tenantElectricMeterDataService.getMeterDataStats(tenant.code);

        overview.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantCode: tenant.code,
          meterCount,
          dataStats: stats
        });
      }

      res.json({
        success: true,
        data: {
          overview,
          totalTenants: tenants.length
        }
      });
    } catch (error) {
      logger.error('获取租户电表数据概览失败:', error);
      res.status(500).json({
        success: false,
        message: '获取概览数据失败',
        error: error.message
      });
    }
  }
}

module.exports = {
  getTenantElectricMeterData: async (req, res) => {
    const controller = new TenantElectricMeterDataController();
    return controller.getTenantElectricMeterData(req, res);
  },
  getTenantElectricMeterDataStats: async (req, res) => {
    const controller = new TenantElectricMeterDataController();
    return controller.getTenantElectricMeterDataStats(req, res);
  },
  getTenantElectricMeters: async (req, res) => {
    const controller = new TenantElectricMeterDataController();
    return controller.getTenantElectricMeters(req, res);
  },
  getElectricMeterLatestData: async (req, res) => {
    const controller = new TenantElectricMeterDataController();
    return controller.getElectricMeterLatestData(req, res);
  },
  cleanupExpiredData: async (req, res) => {
    const controller = new TenantElectricMeterDataController();
    return controller.cleanupExpiredData(req, res);
  },
  getAllTenantsOverview: async (req, res) => {
    const controller = new TenantElectricMeterDataController();
    return controller.getAllTenantsOverview(req, res);
  }
};