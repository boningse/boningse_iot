const cron = require('node-cron');
const logger = require('./utils/logger');
const lightingTimerService = require('./services/lightingTimerService');

// 定时任务变量
let scheduledTask = null;

// 启动定时任务调度器
function start() {
  if (scheduledTask) {
    logger.info('定时任务调度器已经在运行');
    return;
  }

  // 每分钟检查一次照明设备定时任务
  scheduledTask = cron.schedule('* * * * *', async () => {
    try {
      await lightingTimerService.checkAndExecuteLightingTimers();
    } catch (error) {
      logger.error('执行照明设备定时任务调度失败:', error);
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