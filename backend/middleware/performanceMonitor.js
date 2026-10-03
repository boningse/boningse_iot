
const os = require('os');
const process = require('process');
const v8 = require('v8');
const logger = require('../utils/logger');

// 性能指标收集器
class PerformanceCollector {
  constructor() {
    this.metrics = {
      requests: 0,
      errors: 0,
      responseTimes: [],
      activeConnections: 0,
      startTime: Date.now(),
      lastAlertCheckAt: 0,
      lastAlertFingerprint: '',
      lastAlertLogAt: 0
    };
    
    this.thresholds = {
      "cpu": 70,
      "memory": 80,
      "responseTime": 2000,
      "errorRate": 0.02
};
    
  }
  
  // 记录请求
  recordRequest(responseTime, isError = false) {
    this.metrics.requests++;
    if (isError) this.metrics.errors++;
    
    this.metrics.responseTimes.push(responseTime);
    
    // 保持最近1000个响应时间记录
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes = this.metrics.responseTimes.slice(-1000);
    }
  }
  
  // 获取系统指标
  getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        loadAverage: os.loadavg(),
        coreCount: os.cpus().length
      },
      memory: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        systemTotal: os.totalmem(),
        systemFree: os.freemem()
      },
      uptime: process.uptime(),
      platform: os.platform(),
      arch: os.arch()
    };
  }
  
  // 获取应用指标
  getApplicationMetrics() {
    const now = Date.now();
    const runtime = now - this.metrics.startTime;
    
    const avgResponseTime = this.metrics.responseTimes.length > 0 
      ? this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length 
      : 0;
    
    const errorRate = this.metrics.requests > 0 
      ? this.metrics.errors / this.metrics.requests 
      : 0;
    
    const requestRate = this.metrics.requests / (runtime / 1000);
    
    return {
      requests: {
        total: this.metrics.requests,
        errors: this.metrics.errors,
        errorRate,
        requestRate
      },
      performance: {
        avgResponseTime,
        p95ResponseTime: this.calculatePercentile(95),
        p99ResponseTime: this.calculatePercentile(99)
      },
      connections: {
        active: this.metrics.activeConnections
      },
      runtime
    };
  }
  
  // 计算百分位数
  calculatePercentile(percentile) {
    if (this.metrics.responseTimes.length === 0) return 0;
    
    const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }
  
  // 检查告警
  checkAlerts() {
    const systemMetrics = this.getSystemMetrics();
    const appMetrics = this.getApplicationMetrics();
    const alerts = [];
    
    // CPU告警
    const oneMinuteLoad = systemMetrics.cpu.loadAverage[0] || 0;
    const cpuUsage = (oneMinuteLoad / Math.max(systemMetrics.cpu.coreCount, 1)) * 100;
    if (cpuUsage > this.thresholds.cpu) {
      alerts.push({
        type: 'CPU_HIGH',
        value: cpuUsage,
        threshold: this.thresholds.cpu,
        message: `CPU使用率过高: ${cpuUsage.toFixed(2)}%`
      });
    }
    
    // 内存告警
    // heapTotal 是 V8 当前已申请的堆容量，会随 GC 动态伸缩；用它做分母会把
    // 正常的 60~80MB 误判成 80% 以上。告警应以 Node 可用的实际堆上限为准。
    const heapLimit = v8.getHeapStatistics().heap_size_limit || systemMetrics.memory.heapTotal;
    const memoryUsage = (systemMetrics.memory.heapUsed / heapLimit) * 100;
    if (memoryUsage > this.thresholds.memory) {
      alerts.push({
        type: 'MEMORY_HIGH',
        value: memoryUsage,
        threshold: this.thresholds.memory,
        message: `内存使用率过高: ${memoryUsage.toFixed(2)}%`
      });
    }
    
    // 响应时间告警
    if (appMetrics.performance.avgResponseTime > this.thresholds.responseTime) {
      alerts.push({
        type: 'RESPONSE_TIME_HIGH',
        value: appMetrics.performance.avgResponseTime,
        threshold: this.thresholds.responseTime,
        message: `平均响应时间过长: ${appMetrics.performance.avgResponseTime.toFixed(2)}ms`
      });
    }
    
    // 错误率告警
    if (appMetrics.requests.errorRate > this.thresholds.errorRate) {
      alerts.push({
        type: 'ERROR_RATE_HIGH',
        value: appMetrics.requests.errorRate,
        threshold: this.thresholds.errorRate,
        message: `错误率过高: ${(appMetrics.requests.errorRate * 100).toFixed(2)}%`
      });
    }
    
    return alerts;
  }
  
  // 每分钟检查一次；相同告警最多每五分钟写一次，避免监控本身制造大量日志。
  takeAlertLogDecision(now = Date.now()) {
    if (now - this.metrics.lastAlertCheckAt < 60000) return null;
    this.metrics.lastAlertCheckAt = now;
    const alerts = this.checkAlerts();
    const fingerprint = alerts.map((alert) => alert.type).sort().join(',');

    if (!fingerprint) {
      const recovered = this.metrics.lastAlertFingerprint;
      this.metrics.lastAlertFingerprint = '';
      return recovered ? { level: 'info', message: '性能告警已恢复', alerts: [] } : null;
    }

    const changed = fingerprint !== this.metrics.lastAlertFingerprint;
    const dueForRepeat = now - this.metrics.lastAlertLogAt >= 5 * 60 * 1000;
    this.metrics.lastAlertFingerprint = fingerprint;
    if (!changed && !dueForRepeat) return null;
    this.metrics.lastAlertLogAt = now;
    return { level: 'warn', message: '性能告警', alerts };
  }
}

// 全局性能收集器实例
const performanceCollector = new PerformanceCollector();

// 性能监控中间件
const performanceMonitor = (req, res, next) => {
  const startTime = Date.now();
  
  // 增加活跃连接数
  performanceCollector.metrics.activeConnections++;
  
  // 监听响应结束
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const isError = res.statusCode >= 400;
    
    // 记录指标
    performanceCollector.recordRequest(responseTime, isError);
    
    // 减少活跃连接数
    performanceCollector.metrics.activeConnections--;
    
    const alertLog = performanceCollector.takeAlertLogDecision();
    if (alertLog) logger[alertLog.level](alertLog.message, { alerts: alertLog.alerts });
  });
  
  next();
};

const buildPerformanceMetrics = () => {
  const systemMetrics = performanceCollector.getSystemMetrics();
  const appMetrics = performanceCollector.getApplicationMetrics();
  const alerts = performanceCollector.checkAlerts();

  return {
    timestamp: new Date().toISOString(),
    system: systemMetrics,
    application: appMetrics,
    alerts,
    status: alerts.length > 0 ? 'warning' : 'healthy'
  };
};

// 性能指标API
const getPerformanceMetrics = (req, res) => {
  try {
    const metrics = buildPerformanceMetrics();
    if (res && typeof res.json === 'function') {
      return res.json(metrics);
    }
    return metrics;
  } catch (error) {
    if (!res || typeof res.status !== 'function') {
      throw error;
    }
    return res.status(500).json({
      error: 'Failed to get performance metrics',
      message: error.message
    });
  }
};

module.exports = {
  performanceMonitor,
  getPerformanceMetrics,
  buildPerformanceMetrics,
  performanceCollector
};
