// 性能监控服务
const os = require('os');
const process = require('process');
const { EventEmitter } = require('events');
const { cacheManager } = require('../config/cache-config');

class PerformanceMonitorService extends EventEmitter {
  constructor() {
    super();
    
    this.metrics = {
      system: {},
      application: {},
      database: {},
      mqtt: {},
      websocket: {},
      cache: {},
    };
    
    this.intervals = {
      system: null,
      application: null,
      database: null,
    };
    
    this.thresholds = {
      cpu: 80,           // CPU使用率阈值 (%)
      memory: 85,        // 内存使用率阈值 (%)
      responseTime: 1000, // 响应时间阈值 (ms)
      errorRate: 5,      // 错误率阈值 (%)
      connectionCount: 1000, // 连接数阈值
    };
    
    this.alertHistory = [];
    this.maxAlertHistory = 100;
    
    this.isMonitoring = false;
  }
  
  // 启动监控
  start() {
    if (this.isMonitoring) {
      console.log('Performance monitoring is already running');
      return;
    }
    
    console.log('Starting performance monitoring...');
    this.isMonitoring = true;
    
    // 系统指标监控 - 每30秒
    this.intervals.system = setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);
    
    // 应用指标监控 - 每60秒
    this.intervals.application = setInterval(() => {
      this.collectApplicationMetrics();
    }, 60000);
    
    // 数据库指标监控 - 每120秒
    this.intervals.database = setInterval(() => {
      this.collectDatabaseMetrics();
    }, 120000);
    
    // 立即收集一次指标
    this.collectAllMetrics();
    
    this.emit('monitoring:started');
  }
  
  // 停止监控
  stop() {
    if (!this.isMonitoring) {
      console.log('Performance monitoring is not running');
      return;
    }
    
    console.log('Stopping performance monitoring...');
    this.isMonitoring = false;
    
    // 清除所有定时器
    Object.values(this.intervals).forEach(interval => {
      if (interval) clearInterval(interval);
    });
    
    this.emit('monitoring:stopped');
  }
  
  // 收集所有指标
  async collectAllMetrics() {
    await Promise.all([
      this.collectSystemMetrics(),
      this.collectApplicationMetrics(),
      this.collectDatabaseMetrics(),
      this.collectCacheMetrics(),
    ]);
  }
  
  // 收集系统指标
  collectSystemMetrics() {
    try {
      const cpus = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      
      // CPU使用率计算
      let totalIdle = 0;
      let totalTick = 0;
      
      cpus.forEach(cpu => {
        for (const type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      });
      
      const cpuUsage = 100 - ~~(100 * totalIdle / totalTick);
      const memoryUsage = (usedMem / totalMem) * 100;
      
      this.metrics.system = {
        timestamp: new Date(),
        cpu: {
          usage: cpuUsage,
          cores: cpus.length,
          model: cpus[0].model,
          speed: cpus[0].speed,
        },
        memory: {
          total: totalMem,
          used: usedMem,
          free: freeMem,
          usage: memoryUsage,
        },
        load: {
          average: os.loadavg(),
          uptime: os.uptime(),
        },
        network: {
          interfaces: Object.keys(os.networkInterfaces()).length,
        },
      };
      
      // 检查阈值并发送警报
      this.checkThresholds('system', {
        cpu: cpuUsage,
        memory: memoryUsage,
      });
      
      this.emit('metrics:system', this.metrics.system);
      
    } catch (error) {
      console.error('Error collecting system metrics:', error);
    }
  }
  
  // 收集应用指标
  collectApplicationMetrics() {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      this.metrics.application = {
        timestamp: new Date(),
        process: {
          pid: process.pid,
          uptime: process.uptime(),
          version: process.version,
          platform: process.platform,
        },
        memory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
          arrayBuffers: memUsage.arrayBuffers,
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        eventLoop: {
          delay: this.measureEventLoopDelay(),
        },
      };
      
      this.emit('metrics:application', this.metrics.application);
      
    } catch (error) {
      console.error('Error collecting application metrics:', error);
    }
  }
  
  // 收集数据库指标
  async collectDatabaseMetrics() {
    try {
      // 这里需要根据实际的数据库连接来获取指标
      // 假设使用 Sequelize
      const { sequelize } = require('../models');
      
      if (sequelize && sequelize.connectionManager) {
        const pool = sequelize.connectionManager.pool;
        
        this.metrics.database = {
          timestamp: new Date(),
          connections: {
            total: pool.size || 0,
            used: pool.used || 0,
            waiting: pool.pending || 0,
            available: pool.available || 0,
          },
          status: 'connected',
        };
        
        // 执行简单查询测试响应时间
        const startTime = Date.now();
        try {
          await sequelize.authenticate();
          this.metrics.database.responseTime = Date.now() - startTime;
        } catch (error) {
          this.metrics.database.status = 'error';
          this.metrics.database.error = error.message;
        }
      } else {
        this.metrics.database = {
          timestamp: new Date(),
          status: 'unavailable',
        };
      }
      
      this.emit('metrics:database', this.metrics.database);
      
    } catch (error) {
      console.error('Error collecting database metrics:', error);
      this.metrics.database = {
        timestamp: new Date(),
        status: 'error',
        error: error.message,
      };
    }
  }
  
  // 收集缓存指标
  async collectCacheMetrics() {
    try {
      const cacheStats = cacheManager.getStats();
      
      this.metrics.cache = {
        timestamp: new Date(),
        ...cacheStats,
      };
      
      this.emit('metrics:cache', this.metrics.cache);
      
    } catch (error) {
      console.error('Error collecting cache metrics:', error);
    }
  }
  
  // 记录MQTT指标
  recordMqttMetrics(metrics) {
    this.metrics.mqtt = {
      timestamp: new Date(),
      ...metrics,
    };
    
    this.emit('metrics:mqtt', this.metrics.mqtt);
  }
  
  // 记录WebSocket指标
  recordWebSocketMetrics(metrics) {
    this.metrics.websocket = {
      timestamp: new Date(),
      ...metrics,
    };
    
    // 检查连接数阈值
    if (metrics.totalConnections > this.thresholds.connectionCount) {
      this.sendAlert('websocket', 'high_connection_count', {
        current: metrics.totalConnections,
        threshold: this.thresholds.connectionCount,
      });
    }
    
    this.emit('metrics:websocket', this.metrics.websocket);
  }
  
  // 测量事件循环延迟
  measureEventLoopDelay() {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const delay = Number(process.hrtime.bigint() - start) / 1000000; // 转换为毫秒
      return delay;
    });
    return 0; // 简化实现
  }
  
  // 检查阈值
  checkThresholds(category, values) {
    Object.entries(values).forEach(([metric, value]) => {
      const threshold = this.thresholds[metric];
      if (threshold && value > threshold) {
        this.sendAlert(category, metric, {
          current: value,
          threshold: threshold,
        });
      }
    });
  }
  
  // 发送警报
  sendAlert(category, metric, data) {
    const alert = {
      id: Date.now().toString(),
      timestamp: new Date(),
      category,
      metric,
      level: this.getAlertLevel(metric, data.current, data.threshold),
      message: this.generateAlertMessage(category, metric, data),
      data,
    };
    
    // 添加到历史记录
    this.alertHistory.unshift(alert);
    if (this.alertHistory.length > this.maxAlertHistory) {
      this.alertHistory.pop();
    }
    
    console.warn(`[ALERT] ${alert.message}`);
    this.emit('alert', alert);
  }
  
  // 获取警报级别
  getAlertLevel(metric, current, threshold) {
    const ratio = current / threshold;
    if (ratio >= 1.5) return 'critical';
    if (ratio >= 1.2) return 'high';
    if (ratio >= 1.0) return 'medium';
    return 'low';
  }
  
  // 生成警报消息
  generateAlertMessage(category, metric, data) {
    const messages = {
      cpu: `CPU使用率过高: ${data.current.toFixed(1)}% (阈值: ${data.threshold}%)`,
      memory: `内存使用率过高: ${data.current.toFixed(1)}% (阈值: ${data.threshold}%)`,
      responseTime: `响应时间过长: ${data.current}ms (阈值: ${data.threshold}ms)`,
      errorRate: `错误率过高: ${data.current.toFixed(1)}% (阈值: ${data.threshold}%)`,
      high_connection_count: `连接数过多: ${data.current} (阈值: ${data.threshold})`,
    };
    
    return messages[metric] || `${category}.${metric} 超过阈值: ${data.current} > ${data.threshold}`;
  }
  
  // 获取当前指标
  getMetrics() {
    return {
      ...this.metrics,
      monitoring: this.isMonitoring,
      thresholds: this.thresholds,
    };
  }
  
  // 获取警报历史
  getAlertHistory(limit = 20) {
    return this.alertHistory.slice(0, limit);
  }
  
  // 更新阈值
  updateThresholds(newThresholds) {
    this.thresholds = {
      ...this.thresholds,
      ...newThresholds,
    };
    
    console.log('Performance thresholds updated:', this.thresholds);
    this.emit('thresholds:updated', this.thresholds);
  }
  
  // 生成性能报告
  generateReport() {
    const report = {
      timestamp: new Date(),
      summary: {
        monitoring: this.isMonitoring,
        uptime: process.uptime(),
        alertCount: this.alertHistory.length,
      },
      metrics: this.metrics,
      alerts: this.getAlertHistory(10),
      recommendations: this.generateRecommendations(),
    };
    
    return report;
  }
  
  // 生成优化建议
  generateRecommendations() {
    const recommendations = [];
    
    // CPU建议
    if (this.metrics.system.cpu && this.metrics.system.cpu.usage > 70) {
      recommendations.push({
        category: 'cpu',
        priority: 'high',
        message: '考虑优化CPU密集型操作或增加服务器资源',
      });
    }
    
    // 内存建议
    if (this.metrics.system.memory && this.metrics.system.memory.usage > 80) {
      recommendations.push({
        category: 'memory',
        priority: 'high',
        message: '考虑优化内存使用或增加内存容量',
      });
    }
    
    // 数据库连接建议
    if (this.metrics.database.connections && this.metrics.database.connections.used > 15) {
      recommendations.push({
        category: 'database',
        priority: 'medium',
        message: '考虑优化数据库连接池配置',
      });
    }
    
    return recommendations;
  }
}

// 创建全局实例
const performanceMonitor = new PerformanceMonitorService();

module.exports = {
  PerformanceMonitorService,
  performanceMonitor,
};