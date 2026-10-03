const cron = require('node-cron');
const logger = require('./utils/logger');
const lightingTimerService = require('./services/lightingTimerService');
const switchScheduleService = require('./services/switchScheduleService');
const airConditionerScheduleService = require('./services/airConditionerScheduleService');
const electricalPushService = require('./services/electricalPushService');
const thermostatRuntimePollingService = require('./services/thermostatRuntimePollingService');

// 定时任务变量
let scheduledTask = null;
let taskRunning = false;

const scheduledJobs = [
  { name: '照明设备定时任务', run: () => lightingTimerService.checkAndExecuteLightingTimers() },
  { name: '开关设备策略调度', run: () => switchScheduleService.checkAndExecuteSwitchSchedules() },
  { name: '空调设备策略调度', run: () => airConditionerScheduleService.checkAndExecuteAirConditionerSchedules() },
  { name: '电气数据推送调度', run: () => electricalPushService.pushDueConfigs() },
  { name: '温控器累计运行时间巡检', run: () => thermostatRuntimePollingService.pollDueDevices() }
];

async function runScheduledJobs() {
  if (taskRunning) {
    logger.warn('定时任务仍在执行，跳过本轮以避免重复执行和数据库连接堆积');
    return { skipped: true };
  }

  taskRunning = true;
  const startedAt = Date.now();
  try {
    // 顺序执行。每个任务内部已有自己的设备级处理和幂等保护，避免分钟边界时
    // 多个独立连接池同时抢占 PostgreSQL 连接。
    for (const job of scheduledJobs) {
      try {
        await job.run();
      } catch (error) {
        logger.error(`执行${job.name}失败:`, error);
      }
    }
    return { skipped: false };
  } finally {
    const elapsed = Date.now() - startedAt;
    taskRunning = false;
    if (elapsed > 55000) {
      logger.warn('定时任务执行接近一分钟', { elapsedMs: elapsed });
    }
  }
}

// 启动定时任务调度器
function start() {
  if (scheduledTask) {
    logger.info('定时任务调度器已经在运行');
    return;
  }

  // 每分钟分别检查照明与开关模块自己的策略表。
  scheduledTask = cron.schedule('* * * * *', runScheduledJobs, {
    scheduled: false,
    noOverlap: true,
    name: 'iot-minute-scheduler'
  });

  // 启动定时任务
  scheduledTask.start();
  logger.info('定时任务调度器已启动');
}

// 停止定时任务调度器
function stop() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('定时任务调度器已停止');
  }
}

module.exports = {
  start,
  stop,
  runScheduledJobs
};
