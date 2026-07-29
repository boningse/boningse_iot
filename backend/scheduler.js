const cron = require('node-cron');
const logger = require('./utils/logger');
const lightingTimerService = require('./services/lightingTimerService');
const switchScheduleService = require('./services/switchScheduleService');
const airConditionerScheduleService = require('./services/airConditionerScheduleService');

// 定时任务变量
let scheduledTask = null;

// 启动定时任务调度器
function start() {
  if (scheduledTask) {
    logger.info('定时任务调度器已经在运行');
    return;
  }

  // 每分钟分别检查照明与开关模块自己的策略表。
  scheduledTask = cron.schedule('* * * * *', async () => {
    const results = await Promise.allSettled([
      lightingTimerService.checkAndExecuteLightingTimers(),
      switchScheduleService.checkAndExecuteSwitchSchedules(),
      airConditionerScheduleService.checkAndExecuteAirConditionerSchedules()
    ]);
    if (results[0].status === 'rejected') {
      logger.error('执行照明设备定时任务调度失败:', results[0].reason);
    }
    if (results[1].status === 'rejected') {
      logger.error('执行开关设备策略调度失败:', results[1].reason);
    }
    if (results[2].status === 'rejected') {
      logger.error('执行空调设备策略调度失败:', results[2].reason);
    }
  }, {
    scheduled: false // 不立即启动，等待手动启动
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
  stop
};
