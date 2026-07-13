
const os = require('os');
const process = require('process');
const logger = require('../utils/logger');

// 性能指标收集器
class PerformanceCollector {
  constructor() {
    this.metrics = {
      requests: 0,
      errors: 0,
      responseTimes: [],
      activeConnections: 0,
      startTime: Date.now()
    };
    
    this.thresholds = {
      "cpu": 70,
      "memory": 80,
      "responseTime": 2000,
      "errorRate": 0.02
};
    
    // 定期清理指标
    setInterval(() => {
      this.cleanupMetrics();
    }, 30000);
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
    const memoryUsage = (systemMetrics.memory.heapUsed / systemMetrics.memory.heapTotal) * 100;
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
  
  // 清理指标
  cleanupMetrics() {
    // 重置计数器（保留历史趋势）
    const errorRate = this.metrics.requests > 0 ? this.metrics.errors / this.metrics.requests : 0;
    
    // 如果错误率正常，重置计数器
    if (errorRate < this.thresholds.errorRate) {
      this.metrics.requests = Math.floor(this.metrics.requests * 0.1);
      this.metrics.errors = Math.floor(this.metrics.errors * 0.1);
    }
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
    
    // 检查告警
    if (true) {
      const alerts = performanceCollector.checkAlerts();
      if (alerts.length > 0) {
        logger.warn('性能告警', { alerts });
      }
    }
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
