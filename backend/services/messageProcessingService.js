const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const logger = require('../utils/logger');

class MessageProcessingService {
  constructor() {
    this.models = null;
    this.anomalyRules = new Map();
    this.statisticsCache = new Map();
    this.batchSize = 100;
    this.batchTimeout = 5000; // 5秒
    this.pendingBatch = [];
    this.batchTimer = null;
    this.dtuMessageHandler = null; // DTU消息处理器

    // 初始化批处理
    this.initBatchProcessing();
  // 定期清理统计数据缓存，防止内存泄漏
  setInterval(() => {
    if (this.statisticsCache && this.statisticsCache.size > 5000) {
      const entries = [...this.statisticsCache.entries()];
      const now = Date.now();
      // 按时间桶排序，删除最老的
      entries.sort((a, b) => (a[0] || '').localeCompare(b[0] || ''));
      const toRemove = entries.slice(0, entries.length - 2000);
      for (const [key] of toRemove) {
        this.statisticsCache.delete(key);
      }
      console.log('statisticsCache cleanup: removed', toRemove.length, 'entries, remaining:', this.statisticsCache.size);
    }
  }, 30 * 60 * 1000); // 每30分钟清理一次
  }

  /**
   * 初始化模型
   */
  async initialize() {
    try {
      this.models = require('../models');
      await this.loadAnomalyRules();
      logger.info('消息处理服务初始化完成');
    } catch (error) {
      logger.error('消息处理服务初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 注册DTU消息处理器
   */
  registerDtuMessageHandler(handler) {
    this.dtuMessageHandler = handler;
    logger.info('DTU消息处理器已注册');
  }

  /**
   * 处理DTU消息
   */
  async processDtuMessage(topic, message) {
    if (this.dtuMessageHandler) {
      try {
        await this.dtuMessageHandler(topic, message);
      } catch (error) {
        logger.error('DTU消息处理失败', { topic, error: error.message });
      }
    }
  }

  /**
   * 加载异常检测规则
   */
  async loadAnomalyRules() {
    try {
      const { AnomalyDetectionRule } = this.models;
      const rules = await AnomalyDetectionRule.findAll({
        where: {
          enabled: true
        }
      });

      this.anomalyRules.clear();
      rules.forEach(rule => {
        this.anomalyRules.set(rule.id, rule);
      });

      logger.info(`加载了 ${rules.length} 条异常检测规则`);
    } catch (error) {
      logger.error('加载异常检测规则失败', { error: error.message });
    }
  }

  /**
   * 记录消息接收
   */
  async recordMessageReceived(deviceId, topic, messageType, payload, direction = 'inbound', messageId = null) {
    // 如果没有传入messageId，则生成一个新的
    const finalMessageId = messageId || uuidv4();
    const receivedAt = new Date();
    const messageSize = JSON.stringify(payload).length;
    const payloadHash = this.generatePayloadHash(payload);

    const processingRecord = {
      id: uuidv4(),
      device_id: deviceId,
      message_id: finalMessageId,
      topic,
      message_type: messageType,
      direction,
      received_at: receivedAt,
      processing_status: 'received',
      storage_status: 'pending',
      message_size: messageSize,
      payload_hash: payloadHash,
      retry_count: 0,
      has_anomaly: false
    };

    try {
      // 直接插入数据库，避免批处理导致的时序问题
      const { MessageProcessingStat } = this.models;
      await MessageProcessingStat.create(processingRecord);
      
      logger.debug('消息处理记录已创建', { messageId: finalMessageId });
    } catch (error) {
      logger.error('创建消息处理记录失败', {
        messageId: finalMessageId,
        error: error.message
      });
      // 如果直接插入失败，则添加到批处理队列作为备选
      this.addToBatch(processingRecord);
    }

    return finalMessageId;
  }

  /**
   * 记录消息处理开始
   */
  async recordProcessingStarted(messageId) {
    try {
      const { MessageProcessingStat } = this.models;
      const processingStartedAt = new Date();

      await MessageProcessingStat.update({
        processing_started_at: processingStartedAt,
        processing_status: 'processing'
      }, {
        where: { message_id: messageId }
      });

      return processingStartedAt;
    } catch (error) {
      logger.error('记录处理开始失败', { messageId, error: error.message });
    }
  }

  /**
   * 记录消息处理完成
   */
  async recordProcessingCompleted(messageId, success = true, error = null) {
    try {
      const { MessageProcessingStat } = this.models;
      const processingCompletedAt = new Date();

      // 获取处理开始时间以计算耗时
      const record = await MessageProcessingStat.findOne({
        where: { message_id: messageId }
      });

      if (!record) {
        logger.warn('未找到消息处理记录', { messageId });
        return;
      }

      const processingDuration = record.processing_started_at ?
        processingCompletedAt.getTime() - record.processing_started_at.getTime() : null;

      const updateData = {
        processing_completed_at: processingCompletedAt,
        processing_status: success ? 'completed' : 'failed',
        processing_duration_ms: processingDuration
      };

      if (error) {
        updateData.processing_error = error;
        updateData.has_anomaly = true;
        updateData.anomaly_type = 'processing_error';
        updateData.anomaly_description = error;
        updateData.anomaly_severity = 'medium';
      }

      await MessageProcessingStat.update(updateData, {
        where: { message_id: messageId }
      });

      // 检测异常
      await this.detectAnomalies(messageId, updateData);

    } catch (error) {
      logger.error('记录处理完成失败', { messageId, error: error.message });
    }
  }

  /**
   * 记录处理失败
   */
  async recordProcessingFailed(messageId, errorMessage, processingTime = null) {
    try {
      const { MessageProcessingStat } = this.models;
      const processingCompletedAt = new Date();

      // 获取现有记录
      const record = await MessageProcessingStat.findOne({
        where: { message_id: messageId }
      });

      if (!record) {
        logger.warn('未找到消息处理记录', { messageId });
        return;
      }

      const processingDuration = processingTime ||
        (record.processing_started_at ?
          processingCompletedAt.getTime() - record.processing_started_at.getTime() : null);

      const updateData = {
        processing_completed_at: processingCompletedAt,
        processing_status: 'failed',
        processing_duration_ms: processingDuration,
        processing_error: errorMessage,
        retry_count: (record.retry_count || 0) + 1,
        has_anomaly: true,
        anomaly_type: 'processing_error',
        anomaly_description: errorMessage,
        anomaly_severity: 'medium'
      };

      await MessageProcessingStat.update(updateData, {
        where: { message_id: messageId }
      });

      // 检测异常
      await this.detectAnomalies(messageId, updateData);

    } catch (error) {
      logger.error('记录处理失败状态失败', { messageId, error: error.message });
    }
  }

  /**
   * 记录存储开始
   */
  async recordStorageStarted(messageId, storageLocation) {
    try {
      const { MessageProcessingStat } = this.models;
      const storageStartedAt = new Date();

      await MessageProcessingStat.update({
        storage_started_at: storageStartedAt,
        storage_status: 'storing',
        storage_location: storageLocation
      }, {
        where: { message_id: messageId }
      });

      return storageStartedAt;
    } catch (error) {
      logger.error('记录存储开始失败', { messageId, error: error.message });
    }
  }

  /**
   * 记录存储完成
   */
  async recordStorageCompleted(messageId, success = true, error = null) {
    try {
      const { MessageProcessingStat } = this.models;
      const storageCompletedAt = new Date();

      // 获取存储开始时间以计算耗时
      const record = await MessageProcessingStat.findOne({
        where: { message_id: messageId }
      });

      if (!record) {
        logger.warn('未找到消息处理记录', { messageId });
        return;
      }

      const storageDuration = record.storage_started_at ?
        storageCompletedAt.getTime() - record.storage_started_at.getTime() : null;

      const updateData = {
        storage_completed_at: storageCompletedAt,
        storage_status: success ? 'stored' : 'failed',
        storage_duration_ms: storageDuration
      };

      if (error) {
        updateData.storage_error = error;
        updateData.has_anomaly = true;
        updateData.anomaly_type = updateData.anomaly_type || 'storage_error';
        updateData.anomaly_description = error;
        updateData.anomaly_severity = 'high';
      }

      await MessageProcessingStat.update(updateData, {
        where: { message_id: messageId }
      });

      // 检测异常
      await this.detectAnomalies(messageId, updateData);

      // 更新统计数据
      await this.updateFlowStatistics(record, updateData);

    } catch (error) {
      logger.error('记录存储完成失败', { messageId, error: error.message });
    }
  }

  /**
   * 异常检测
   */
  async detectAnomalies(messageId, recordData) {
    try {
      const { MessageProcessingStat } = this.models;

      for (const [ruleId, rule] of this.anomalyRules) {
        const isAnomaly = await this.evaluateAnomalyRule(rule, recordData);

        if (isAnomaly) {
          await MessageProcessingStat.update({
            has_anomaly: true,
            anomaly_type: rule.rule_type,
            anomaly_description: rule.description,
            anomaly_severity: rule.severity
          }, {
            where: { message_id: messageId }
          });

          logger.warn('检测到消息异常', {
            messageId,
            ruleId,
            ruleName: rule.name,
            severity: rule.severity
          });

          break; // 只记录第一个匹配的异常
        }
      }
    } catch (error) {
      logger.error('异常检测失败', { messageId, error: error.message });
    }
  }

  /**
   * 评估异常规则
   */
  async evaluateAnomalyRule(rule, recordData) {
    try {
      const expression = rule.condition_expression;

      // 简单的规则评估（实际项目中可以使用更复杂的规则引擎）
      switch (rule.rule_type) {
        case 'threshold':
          return this.evaluateThresholdRule(expression, recordData);
        case 'pattern':
          return this.evaluatePatternRule(expression, recordData);
        case 'statistical':
          return this.evaluateStatisticalRule(expression, recordData);
        default:
          return false;
      }
    } catch (error) {
      logger.error('规则评估失败', { ruleId: rule.id, error: error.message });
      return false;
    }
  }

  /**
   * 评估阈值规则
   */
  evaluateThresholdRule(expression, recordData) {
    // 解析表达式如: "processing_duration_ms > 5000"
    const match = expression.match(/(\w+)\s*([><=!]+)\s*(\d+)/);
    if (!match) return false;

    const [, field, operator, threshold] = match;
    const value = recordData[field];

    if (value === undefined || value === null) return false;

    switch (operator) {
      case '>':
        return value > parseInt(threshold);
      case '<':
        return value < parseInt(threshold);
      case '>=':
        return value >= parseInt(threshold);
      case '<=':
        return value <= parseInt(threshold);
      case '==':
        return value == threshold;
      case '!=':
        return value != threshold;
      default:
        return false;
    }
  }

  /**
   * 评估模式规则
   */
  evaluatePatternRule(expression, recordData) {
    // 解析表达式如: "storage_status = 'failed'"
    const match = expression.match(/(\w+)\s*=\s*["'](\w+)["']/);
    if (!match) return false;

    const [, field, expectedValue] = match;
    const actualValue = recordData[field];

    return actualValue === expectedValue;
  }

  /**
   * 评估统计规则（简化版本）
   */
  evaluateStatisticalRule(expression, recordData) {
    // 这里可以实现更复杂的统计分析
    // 暂时返回false，实际项目中需要根据具体需求实现
    return false;
  }

  /**
   * 更新流量统计
   */
  async updateFlowStatistics(originalRecord, updateData) {
    try {
      const { MessageFlowStatistic } = this.models;
      const now = new Date();

      // 按分钟聚合
      const minuteBucket = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
      await this.updateStatisticsBucket(MessageFlowStatistic, minuteBucket, 'minute', originalRecord, updateData);

      // 按小时聚合
      const hourBucket = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
      await this.updateStatisticsBucket(MessageFlowStatistic, hourBucket, 'hour', originalRecord, updateData);

      // 按天聚合
      const dayBucket = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      await this.updateStatisticsBucket(MessageFlowStatistic, dayBucket, 'day', originalRecord, updateData);

    } catch (error) {
      logger.error('更新流量统计失败', { error: error.message });
    }
  }

  /**
   * 更新统计桶 - 优化版本，使用批量更新和缓存
   */
  async updateStatisticsBucket(model, timeBucket, bucketType, originalRecord, updateData) {
    try {
      // 使用缓存键来减少数据库查询
      const cacheKey = `${timeBucket}_${bucketType}`;
      
      // 如果缓存中没有，则查询数据库
      if (!this.statisticsCache) {
        this.statisticsCache = new Map();
      }
      
      let statRecord = this.statisticsCache.get(cacheKey);
      
      if (!statRecord) {
        const [record, created] = await model.findOrCreate({
          where: {
            time_bucket: timeBucket,
            bucket_type: bucketType
          },
          defaults: {
            total_received: 0,
            total_processed: 0,
            total_stored: 0,
            total_failed: 0,
            total_sent: 0,
            total_sent_success: 0,
            total_sent_failed: 0,
            total_anomalies: 0,
            anomaly_low: 0,
            anomaly_medium: 0,
            anomaly_high: 0,
            anomaly_critical: 0
          }
        });
        
        statRecord = record.toJSON();
        this.statisticsCache.set(cacheKey, statRecord);
      }

      const updates = {};

      // 更新接收统计
      if (originalRecord.direction === 'inbound') {
        updates.total_received = 1;

        if (updateData.processing_status === 'completed') {
          updates.total_processed = 1;
        }

        if (updateData.storage_status === 'stored') {
          updates.total_stored = 1;
        } else if (updateData.storage_status === 'failed') {
          updates.total_failed = 1;
        }
      } else if (originalRecord.direction === 'outbound') {
        updates.total_sent = 1;

        if (updateData.processing_status === 'completed') {
          updates.total_sent_success = 1;
        } else if (updateData.processing_status === 'failed') {
          updates.total_sent_failed = 1;
        }
      }

      // 更新异常统计
      if (updateData.has_anomaly) {
        updates.total_anomalies = 1;

        const severityField = `anomaly_${updateData.anomaly_severity}`;
        if (statRecord[severityField] !== undefined) {
          updates[severityField] = 1;
        }
      }

      // 添加到批量更新队列而不是立即执行UPDATE
      this.addToStatisticsBatch(model, timeBucket, bucketType, updates);

    } catch (error) {
      logger.error('更新统计桶失败', { bucketType, error: error.message });
    }
  }

  /**
   * 添加到统计批量更新队列
   */
  addToStatisticsBatch(model, timeBucket, bucketType, updates) {
    if (!this.statisticsBatch) {
      this.statisticsBatch = new Map();
    }
    
    const key = `${timeBucket}_${bucketType}`;
    
    if (this.statisticsBatch.has(key)) {
      // 合并更新
      const existing = this.statisticsBatch.get(key);
      Object.keys(updates).forEach(field => {
        if (typeof updates[field] === 'number') {
          existing.updates[field] = (existing.updates[field] || 0) + updates[field];
        } else {
          existing.updates[field] = updates[field];
        }
      });
    } else {
      this.statisticsBatch.set(key, {
        model,
        timeBucket,
        bucketType,
        updates: { ...updates }
      });
    }

    // 如果批次达到阈值，立即处理
    if (this.statisticsBatch.size >= 10) {
      this.processStatisticsBatch();
    }
  }

  /**
   * 处理统计批量更新
   */
  async processStatisticsBatch() {
    if (!this.statisticsBatch || this.statisticsBatch.size === 0) return;

    const batch = Array.from(this.statisticsBatch.values());
    this.statisticsBatch.clear();

    try {
      // 使用事务批量更新
      await this.models.sequelize.transaction(async (transaction) => {
        for (const { model, timeBucket, bucketType, updates } of batch) {
          await model.increment(updates, {
            where: {
              time_bucket: timeBucket,
              bucket_type: bucketType
            },
            transaction
          });
        }
      });

      logger.debug(`批量更新 ${batch.length} 条统计记录`);
    } catch (error) {
      logger.error('批量更新统计记录失败', {
        batchSize: batch.length,
        error: error.message
      });
    }
  }

  /**
   * 获取真实的消息流量统计
   */
  async getRealMessageFlowStats(timeRange = '24h') {
    try {
      const { MessageFlowStatistic } = this.models;
      const now = new Date();
      let hours, bucketType, dataPoints;

      // 根据时间范围确定查询参数
      switch (timeRange) {
        case '1h':
          hours = 1;
          bucketType = 'minute';
          dataPoints = 12; // 每5分钟一个点
          break;
        case '6h':
          hours = 6;
          bucketType = 'minute';
          dataPoints = 12; // 每30分钟一个点
          break;
        case '24h':
          hours = 24;
          bucketType = 'hour';
          dataPoints = 12; // 每2小时一个点
          break;
        case '7d':
          hours = 24 * 7;
          bucketType = 'day';
          dataPoints = 7; // 每天一个点
          break;
        default:
          hours = 24;
          bucketType = 'hour';
          dataPoints = 12;
      }

      const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

      const statistics = await MessageFlowStatistic.findAll({
        where: {
          time_bucket: {
            [this.models.Sequelize.Op.gte]: startTime
          },
          bucket_type: bucketType
        },
        order: [['time_bucket', 'ASC']]
      });

      // 生成时间标签和数据数组
      const timeLabels = [];
      const received = [];
      const processed = [];
      const stored = [];
      const abnormal = [];

      // 创建时间桶映射
      const statsMap = new Map();
      statistics.forEach(stat => {
        statsMap.set(stat.time_bucket.getTime(), stat);
      });

      // 生成数据点
      const intervalMs = (hours * 60 * 60 * 1000) / dataPoints;

      for (let i = 0; i < dataPoints; i++) {
        const time = new Date(startTime.getTime() + i * intervalMs);

        // 生成时间标签
        if (timeRange === '7d') {
          timeLabels.push(time.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }));
        } else {
          timeLabels.push(time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
        }

        // 聚合该时间段的数据
        let totalReceived = 0;
        let totalProcessed = 0;
        let totalStored = 0;
        let totalAnomalies = 0;

        const periodStart = time;
        const periodEnd = new Date(time.getTime() + intervalMs);

        for (const [bucketTime, stat] of statsMap) {
          if (bucketTime >= periodStart.getTime() && bucketTime < periodEnd.getTime()) {
            totalReceived += stat.total_received || 0;
            totalProcessed += stat.total_processed || 0;
            totalStored += stat.total_stored || 0;
            totalAnomalies += stat.total_anomalies || 0;
          }
        }

        received.push(totalReceived);
        processed.push(totalProcessed);
        stored.push(totalStored);
        abnormal.push(totalAnomalies);
      }

      return {
        timeLabels,
        received,
        processed,
        stored,
        abnormal,
        totalReceived: statistics.reduce((sum, stat) => sum + (stat.total_received || 0), 0),
        totalProcessed: statistics.reduce((sum, stat) => sum + (stat.total_processed || 0), 0),
        totalStored: statistics.reduce((sum, stat) => sum + (stat.total_stored || 0), 0),
        totalAnomalies: statistics.reduce((sum, stat) => sum + (stat.total_anomalies || 0), 0)
      };

    } catch (error) {
      logger.error('获取真实消息流量统计失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 生成消息内容哈希
   */
  generatePayloadHash(payload) {
    const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * 初始化批处理
   */
  initBatchProcessing() {
    this.batchTimer = setInterval(() => {
      this.processBatch();
    }, this.batchTimeout);
    
    // 添加统计批处理定时器
    this.statisticsBatchTimer = setInterval(() => {
      this.processStatisticsBatch();
    }, 5000); // 每5秒处理一次统计批次
  }

  /**
   * 添加到批处理队列
   */
  addToBatch(record) {
    this.pendingBatch.push(record);

    if (this.pendingBatch.length >= this.batchSize) {
      this.processBatch();
    }
  }

  /**
   * 处理批次
   */
  async processBatch() {
    if (this.pendingBatch.length === 0) return;

    const batch = [...this.pendingBatch];
    this.pendingBatch = [];

    try {
      const { MessageProcessingStat } = this.models;
      await MessageProcessingStat.bulkCreate(batch);

      logger.debug(`批量插入 ${batch.length} 条消息处理记录`);
    } catch (error) {
      logger.error('批量插入消息处理记录失败', {
        batchSize: batch.length,
        error: error.message
      });

      // 重新添加到队列中重试
      this.pendingBatch.unshift(...batch);
    }
  }

  /**
   * 停止服务
   */
  async stop() {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    
    if (this.statisticsBatchTimer) {
      clearInterval(this.statisticsBatchTimer);
      this.statisticsBatchTimer = null;
    }

    // 处理剩余的批次
    await this.processBatch();
    await this.processStatisticsBatch();

    logger.info('消息处理服务已停止');
  }
}

module.exports = MessageProcessingService;
