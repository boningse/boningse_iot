const express = require('express');
const router = express.Router();
const { MessageProcessingStat, MessageFlowStatistic, AnomalyDetectionRule } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * 获取消息处理统计数据
 */
router.get('/stats', async (req, res) => {
  try {
    const {
      startTime,
      endTime,
      deviceId,
      tenantId,
      timeRange = '1h' // 默认1小时
    } = req.query;

    // 构建查询条件
    const whereConditions = {};

    if (deviceId) {
      whereConditions.device_id = deviceId;
    }

    if (tenantId) {
      whereConditions.tenant_id = tenantId;
    }

    // 处理时间范围
    let timeCondition = {};
    if (startTime && endTime) {
      timeCondition = {
        received_at: {
          [Op.between]: [new Date(startTime), new Date(endTime)]
        }
      };
    } else {
      // 根据timeRange设置默认时间范围
      const now = new Date();
      let startDate;

      switch (timeRange) {
        case '1h':
          startDate = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 60 * 60 * 1000);
      }

      timeCondition = {
        received_at: {
          [Op.gte]: startDate
        }
      };
    }

    Object.assign(whereConditions, timeCondition);

    // 获取详细统计数据
    const stats = await MessageProcessingStat.findAll({
      where: whereConditions,
      order: [['received_at', 'DESC']],
      limit: 1000
    });

    // 计算汇总统计
    const summary = {
      totalMessages: stats.length,
      processedMessages: stats.filter(s => s.processing_status === 'completed').length,
      failedMessages: stats.filter(s => s.processing_status === 'failed').length,
      storedMessages: stats.filter(s => s.storing_status === 'completed').length,
      storageFailures: stats.filter(s => s.storing_status === 'failed').length,
      anomalies: stats.filter(s => s.anomaly_detected).length,
      avgProcessingTime: 0,
      avgStoringTime: 0
    };

    // 计算平均处理时间
    const completedMessages = stats.filter(s =>
      s.processing_status === 'completed' &&
      s.processing_started_at &&
      s.processing_completed_at
    );

    if (completedMessages.length > 0) {
      const totalProcessingTime = completedMessages.reduce((sum, msg) => {
        const processingTime = new Date(msg.processing_completed_at) - new Date(msg.processing_started_at);
        return sum + processingTime;
      }, 0);
      summary.avgProcessingTime = Math.round(totalProcessingTime / completedMessages.length);
    }

    // 计算平均存储时间
    const storedMessages = stats.filter(s =>
      s.storing_status === 'completed' &&
      s.storing_started_at &&
      s.storing_completed_at
    );

    if (storedMessages.length > 0) {
      const totalStoringTime = storedMessages.reduce((sum, msg) => {
        const storingTime = new Date(msg.storing_completed_at) - new Date(msg.storing_started_at);
        return sum + storingTime;
      }, 0);
      summary.avgStoringTime = Math.round(totalStoringTime / storedMessages.length);
    }

    res.json({
      success: true,
      data: {
        summary,
        details: stats
      }
    });

  } catch (error) {
    logger.error('获取消息处理统计失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取消息处理统计失败',
      error: error.message
    });
  }
});

/**
 * 获取消息流量统计数据
 */
router.get('/flow-stats', async (req, res) => {
  try {
    const {
      startTime,
      endTime,
      tenantId,
      interval = 'hour' // hour, day, minute
    } = req.query;

    // 构建查询条件
    const whereConditions = {};

    if (tenantId) {
      whereConditions.tenant_id = tenantId;
    }

    // 处理时间范围
    if (startTime && endTime) {
      whereConditions.time_bucket = {
        [Op.between]: [new Date(startTime), new Date(endTime)]
      };
    } else {
      // 默认最近24小时
      const now = new Date();
      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      whereConditions.time_bucket = {
        [Op.gte]: startDate
      };
    }

    whereConditions.bucket_type = interval;

    const flowStats = await MessageFlowStatistic.findAll({
      where: whereConditions,
      order: [['time_bucket', 'ASC']]
    });

    res.json({
      success: true,
      data: flowStats
    });

  } catch (error) {
    logger.error('获取消息流量统计失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取消息流量统计失败',
      error: error.message
    });
  }
});

/**
 * 获取异常检测规则
 */
router.get('/anomaly-rules', async (req, res) => {
  try {
    const { tenantId } = req.query;

    const whereConditions = {
      is_active: true
    };

    if (tenantId) {
      whereConditions.tenant_id = tenantId;
    }

    const rules = await AnomalyDetectionRule.findAll({
      where: whereConditions,
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: rules
    });

  } catch (error) {
    logger.error('获取异常检测规则失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取异常检测规则失败',
      error: error.message
    });
  }
});

/**
 * 创建异常检测规则
 */
router.post('/anomaly-rules', async (req, res) => {
  try {
    const {
      rule_name,
      rule_type,
      conditions,
      threshold_value,
      time_window_minutes,
      tenant_id,
      description
    } = req.body;

    const rule = await AnomalyDetectionRule.create({
      rule_name,
      rule_type,
      conditions,
      threshold_value,
      time_window_minutes,
      tenant_id,
      description,
      is_active: true
    });

    res.json({
      success: true,
      data: rule,
      message: '异常检测规则创建成功'
    });

  } catch (error) {
    logger.error('创建异常检测规则失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '创建异常检测规则失败',
      error: error.message
    });
  }
});

/**
 * 更新异常检测规则
 */
router.put('/anomaly-rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const [updatedCount] = await AnomalyDetectionRule.update(updateData, {
      where: { id }
    });

    if (updatedCount === 0) {
      return res.status(404).json({
        success: false,
        message: '异常检测规则不存在'
      });
    }

    const updatedRule = await AnomalyDetectionRule.findByPk(id);

    res.json({
      success: true,
      data: updatedRule,
      message: '异常检测规则更新成功'
    });

  } catch (error) {
    logger.error('更新异常检测规则失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '更新异常检测规则失败',
      error: error.message
    });
  }
});

/**
 * 删除异常检测规则
 */
router.delete('/anomaly-rules/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deletedCount = await AnomalyDetectionRule.destroy({
      where: { id }
    });

    if (deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: '异常检测规则不存在'
      });
    }

    res.json({
      success: true,
      message: '异常检测规则删除成功'
    });

  } catch (error) {
    logger.error('删除异常检测规则失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '删除异常检测规则失败',
      error: error.message
    });
  }
});

/**
 * 获取实时处理状态
 */
router.get('/realtime-status', async (req, res) => {
  try {
    const { tenantId } = req.query;

    // 获取最近5分钟的数据
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const whereConditions = {
      received_at: {
        [Op.gte]: fiveMinutesAgo
      }
    };

    if (tenantId) {
      whereConditions.tenant_id = tenantId;
    }

    const recentStats = await MessageProcessingStat.findAll({
      where: whereConditions,
      order: [['received_at', 'DESC']]
    });

    // 计算实时指标
    const realTimeMetrics = {
      messagesPerMinute: Math.round(recentStats.length / 5), // 每分钟消息数
      processingSuccessRate: recentStats.length > 0 ?
        Math.round((recentStats.filter(s => s.processing_status === 'completed').length / recentStats.length) * 100) : 0,
      storageSuccessRate: recentStats.length > 0 ?
        Math.round((recentStats.filter(s => s.storing_status === 'completed').length / recentStats.length) * 100) : 0,
      anomalyRate: recentStats.length > 0 ?
        Math.round((recentStats.filter(s => s.anomaly_detected).length / recentStats.length) * 100) : 0,
      activeProcessing: recentStats.filter(s => s.processing_status === 'processing').length,
      activeStoring: recentStats.filter(s => s.storing_status === 'storing').length
    };

    res.json({
      success: true,
      data: realTimeMetrics
    });

  } catch (error) {
    logger.error('获取实时处理状态失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取实时处理状态失败',
      error: error.message
    });
  }
});

module.exports = router;