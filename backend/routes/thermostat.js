const express = require('express');
const router = express.Router();
const thermostatController = require('../controllers/thermostatController');
const { authenticateToken, requireTenantAccess } = require('../middleware/auth');
const { checkThermostatAccess } = require('../middleware/thermostatAuth');
const { validatePagination } = require('../middleware/validation');

// 应用认证和租户验证中间件
router.use(authenticateToken);
router.use(requireTenantAccess);

// ============================================
// 温控器设备管理路由
// ============================================

// 获取温控器设备列表
router.get('/devices', validatePagination, thermostatController.getThermostatDevices);

// 获取单个温控器设备详情
router.get('/devices/:deviceId', checkThermostatAccess, thermostatController.getThermostatDevice);

// 添加温控器设备
router.post('/devices', thermostatController.addThermostatDevice);

// 删除温控器设备
router.delete('/devices/:deviceId', checkThermostatAccess, thermostatController.deleteThermostatDevice);

// ============================================
// 温控器设备控制路由
// ============================================

// 开启温控器
router.post('/devices/:deviceId/power-on', checkThermostatAccess, thermostatController.powerOnDevice);

// 关闭温控器
router.post('/devices/:deviceId/power-off', checkThermostatAccess, thermostatController.powerOffDevice);

// 设置目标温度
router.post('/devices/:deviceId/temperature', checkThermostatAccess, thermostatController.setTemperature);

// 设置风速
router.post('/devices/:deviceId/fan-speed', checkThermostatAccess, thermostatController.setFanSpeed);

// 设置空调模式
router.post('/devices/:deviceId/mode', checkThermostatAccess, thermostatController.setMode);

// 锁定/解锁温度
router.post('/devices/:deviceId/temp-lock', checkThermostatAccess, thermostatController.toggleTempLock);

// 读取设备状态
router.get('/devices/:deviceId/status', checkThermostatAccess, thermostatController.getDeviceStatus);

// 强制同步设备状态
router.post('/devices/:deviceId/force-refresh', checkThermostatAccess, thermostatController.forceRefreshDeviceStatus);

// 获取设备协议配置
router.get('/devices/:deviceId/protocol-config', checkThermostatAccess, thermostatController.getDeviceProtocolConfig);

// ============================================
// 温控器分组管理路由
// ============================================

// 获取分组列表
router.get('/groups', thermostatController.getGroups);

// 创建分组
router.post('/groups', thermostatController.createGroup);

// 更新分组
router.put('/groups/:groupId', thermostatController.updateGroup);

// 删除分组
router.delete('/groups/:groupId', thermostatController.deleteGroup);

// 将设备添加到分组
router.post('/groups/:groupId/devices', thermostatController.addDeviceToGroup);

// 从分组中移除设备
router.delete('/groups/:groupId/devices/:deviceId', thermostatController.removeDeviceFromGroup);

// ============================================
// 开关机计划管理路由
// ============================================

// 获取租户所有计划列表
router.get('/schedules', thermostatController.getScheduleList);

// 获取设备的计划列表（兼容旧接口）
router.get('/devices/:deviceId/schedules', thermostatController.getDeviceSchedules);

// 根据ID获取计划详情
router.get('/schedules/:scheduleId', thermostatController.getScheduleById);

// 创建计划
router.post('/schedules', thermostatController.createSchedule);

// 更新计划
router.put('/schedules/:scheduleId', thermostatController.updateSchedule);

// 删除计划
router.delete('/schedules/:scheduleId', thermostatController.deleteSchedule);

// 启用/禁用计划
router.post('/schedules/:scheduleId/toggle', thermostatController.toggleSchedule);

// ============================================
// 运行统计路由
// ============================================

// 获取设备运行统计
router.get('/devices/:deviceId/stats', thermostatController.getDeviceStats);

// 获取设备运行统计（按日期范围）
router.get('/devices/:deviceId/stats/range', thermostatController.getDeviceStatsRange);

// 获取租户下所有设备统计汇总
router.get('/stats/summary', thermostatController.getTenantStatsSummary);

// 获取运行统计数据
router.get('/stats/running', thermostatController.getRunningStats);

// 获取运行时间统计数据
router.get('/stats/runtime', thermostatController.getRuntimeStats);

// ============================================
// 情景模式路由
// ============================================

// 获取情景模式列表
router.get('/scenes', thermostatController.getScenes);

// 创建自定义情景模式
router.post('/scenes', thermostatController.createScene);

// 更新情景模式
router.put('/scenes/:sceneId', thermostatController.updateScene);

// 删除情景模式
router.delete('/scenes/:sceneId', thermostatController.deleteScene);

// 执行情景模式
router.post('/scenes/:sceneId/execute', thermostatController.executeScene);

// ============================================
// 控制日志路由
// ============================================

// 获取设备控制日志
router.get('/devices/:deviceId/logs', thermostatController.getDeviceLogs);

// 获取租户控制日志
router.get('/logs', thermostatController.getTenantLogs);

// ============================================
// 批量操作路由
// ============================================

// 批量开启设备
router.post('/batch/power-on', thermostatController.batchPowerOn);

// 批量关闭设备
router.post('/batch/power-off', thermostatController.batchPowerOff);

// 批量设置温度
router.post('/batch/temperature', thermostatController.batchSetTemperature);

// 批量设置模式
router.post('/batch/mode', thermostatController.batchSetMode);

module.exports = router;