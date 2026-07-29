const db = require('../utils/database');
const logger = require('../utils/logger');

/**
 * 温控器计划服务层
 * 处理温控器计划相关的业务逻辑
 */
class ScheduleService {

  /**
   * 获取租户的所有计划
   */
  async getScheduleList(tenantId) {
    const tenantWhere = tenantId ? 'WHERE ts.tenant_id = $1' : '';
    const query = `
      SELECT 
        ts.*,
        COALESCE(
          JSON_AGG(
            CASE WHEN d.id IS NOT NULL THEN
              JSON_BUILD_OBJECT(
                'device_id', d.id,
                'device_name', d.name,
                'device_code', d.device_id
              )
            END
          ) FILTER (WHERE d.id IS NOT NULL), 
          '[]'::json
        ) as devices
      FROM thermostat_schedules ts
      LEFT JOIN thermostat_schedule_devices tsd ON ts.id = tsd.schedule_id
      LEFT JOIN devices d ON tsd.device_id = d.id
      ${tenantWhere}
      GROUP BY ts.id
      ORDER BY ts.created_at DESC
    `;

    try {
      const result = await db.query(query, tenantId ? [tenantId] : []);
      return result.rows;
    } catch (error) {
      logger.error('获取计划列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取设备计划（兼容旧接口）
   */
  async getDeviceSchedules(deviceId, tenantId) {
    const tenantWhere = tenantId
      ? 'WHERE ts.tenant_id = $1 AND tsd.device_id = $2'
      : 'WHERE tsd.device_id = $1';
    const query = `
      SELECT 
        ts.*,
        COALESCE(
          JSON_AGG(
            CASE WHEN d.id IS NOT NULL THEN
              JSON_BUILD_OBJECT(
                'device_id', d.id,
                'device_name', d.name,
                'device_code', d.device_id
              )
            END
          ) FILTER (WHERE d.id IS NOT NULL), 
          '[]'::json
        ) as devices
      FROM thermostat_schedules ts
      LEFT JOIN thermostat_schedule_devices tsd ON ts.id = tsd.schedule_id
      LEFT JOIN devices d ON tsd.device_id = d.id
      ${tenantWhere}
      GROUP BY ts.id
      ORDER BY ts.created_at DESC
    `;

    try {
      const result = await db.query(query, tenantId ? [tenantId, deviceId] : [deviceId]);
      return result.rows;
    } catch (error) {
      logger.error('获取设备计划失败:', error);
      throw error;
    }
  }

  /**
   * 创建计划
   */
  async createSchedule(scheduleData, tenantId) {
    return await db.transaction(async (client) => {
      if (!scheduleData.deviceIds?.length) {
        throw new Error('请选择至少一个温控设备');
      }
      const deviceParams = [scheduleData.deviceIds];
      const tenantClause = tenantId ? ' AND tenant_id = $2' : '';
      if (tenantId) deviceParams.push(tenantId);
      const deviceCheck = await client.query(
        `SELECT id, tenant_id FROM devices
         WHERE id = ANY($1)${tenantClause}`,
        deviceParams
      );
      if (deviceCheck.rows.length !== scheduleData.deviceIds.length) {
        throw new Error('部分设备不存在或无权限');
      }
      const tenantIds = [...new Set(deviceCheck.rows.map((device) => String(device.tenant_id)))];
      if (tenantIds.length !== 1) throw new Error('同一策略只能选择同一租户的设备');
      const resolvedTenantId = tenantId || deviceCheck.rows[0].tenant_id;
      const lockAction = scheduleData.lockAction || 'none';
      if (!['lock', 'unlock', 'none'].includes(lockAction)) {
        throw new Error('无效的童锁动作');
      }

      // 创建计划
      const scheduleQuery = `
        INSERT INTO thermostat_schedules (
          name, tenant_id, execute_time, repeat_type, week_days, custom_dates,
          power_action, ac_mode, target_temp, fan_speed, lock_action, enabled, description
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;

      const scheduleResult = await client.query(scheduleQuery, [
        scheduleData.name,
        resolvedTenantId,
        scheduleData.executeTime,
        scheduleData.repeatType,
        scheduleData.weekDays || [],
        scheduleData.customDates || [],
        scheduleData.powerAction,
        scheduleData.acMode,
        scheduleData.targetTemp,
        scheduleData.fanSpeed,
        lockAction,
        scheduleData.enabled !== false,
        scheduleData.description
      ]);
      
      const schedule = scheduleResult.rows[0];
      
      // 关联设备
      if (scheduleData.deviceIds && scheduleData.deviceIds.length > 0) {
        const deviceValues = scheduleData.deviceIds.map((deviceId, index) => 
          `($1, $${index + 2})`
        ).join(', ');
        
        const deviceQuery = `
          INSERT INTO thermostat_schedule_devices (schedule_id, device_id)
          VALUES ${deviceValues}
        `;
        
        await client.query(deviceQuery, [schedule.id, ...scheduleData.deviceIds]);
      }
      
      // 获取完整的计划信息（包含关联设备）
      const query = `
        SELECT 
          ts.*,
          COALESCE(
            JSON_AGG(
              CASE WHEN d.id IS NOT NULL THEN
                JSON_BUILD_OBJECT(
                  'device_id', d.id,
                  'device_name', d.name,
                  'device_code', d.device_id
                )
              END
            ) FILTER (WHERE d.id IS NOT NULL), 
            '[]'::json
          ) as devices
        FROM thermostat_schedules ts
        LEFT JOIN thermostat_schedule_devices tsd ON ts.id = tsd.schedule_id
        LEFT JOIN devices d ON tsd.device_id = d.id
        WHERE ts.id = $1 AND ts.tenant_id = $2
        GROUP BY ts.id
      `;
      
      const result = await client.query(query, [schedule.id, resolvedTenantId]);
      return result.rows[0];
    });
  }

  /**
   * 更新计划
   */
  async updateSchedule(scheduleId, scheduleData, tenantId) {
    return await db.transaction(async (client) => {
      const scheduleParams = [scheduleId];
      const scheduleTenantClause = tenantId ? ' AND tenant_id = $2' : '';
      if (tenantId) scheduleParams.push(tenantId);
      const scheduleCheck = await client.query(
        `SELECT id, tenant_id FROM thermostat_schedules
         WHERE id = $1${scheduleTenantClause}`,
        scheduleParams
      );
      if (scheduleCheck.rows.length === 0) {
        throw new Error('计划不存在或无权限');
      }
      const resolvedTenantId = scheduleCheck.rows[0].tenant_id;
      const lockAction = scheduleData.lockAction || 'none';
      if (!['lock', 'unlock', 'none'].includes(lockAction)) {
        throw new Error('无效的童锁动作');
      }

      if (scheduleData.deviceIds && scheduleData.deviceIds.length > 0) {
        const deviceCheck = await client.query(
          `SELECT id FROM devices 
           WHERE id = ANY($1) AND tenant_id = $2`,
          [scheduleData.deviceIds, resolvedTenantId]
        );
        
        if (deviceCheck.rows.length !== scheduleData.deviceIds.length) {
          throw new Error('部分设备不存在或无权限');
        }
      }

      // 更新计划
      const scheduleQuery = `
        UPDATE thermostat_schedules 
        SET 
          name = $1,
          execute_time = $2,
          repeat_type = $3,
          week_days = $4,
          custom_dates = $5,
          power_action = $6,
          ac_mode = $7,
          target_temp = $8,
          fan_speed = $9,
          lock_action = $10,
          enabled = $11,
          description = $12,
          updated_at = NOW()
        WHERE id = $13 AND tenant_id = $14
        RETURNING *
      `;

      const scheduleResult = await client.query(scheduleQuery, [
        scheduleData.name,
        scheduleData.executeTime,
        scheduleData.repeatType,
        scheduleData.weekDays || [],
        scheduleData.customDates || [],
        scheduleData.powerAction,
        scheduleData.acMode,
        scheduleData.targetTemp,
        scheduleData.fanSpeed,
        lockAction,
        scheduleData.enabled,
        scheduleData.description,
        scheduleId,
        resolvedTenantId
      ]);
      
      if (scheduleResult.rows.length === 0) {
        throw new Error('计划不存在或无权限');
      }
      
      // 更新设备关联
      if (scheduleData.deviceIds !== undefined) {
        // 删除现有关联
        await client.query(
          'DELETE FROM thermostat_schedule_devices WHERE schedule_id = $1',
          [scheduleId]
        );
        
        // 添加新关联
        if (scheduleData.deviceIds.length > 0) {
          const deviceValues = scheduleData.deviceIds.map((deviceId, index) => 
            `($1, $${index + 2})`
          ).join(', ');
          
          const deviceQuery = `
            INSERT INTO thermostat_schedule_devices (schedule_id, device_id)
            VALUES ${deviceValues}
          `;
          
          await client.query(deviceQuery, [scheduleId, ...scheduleData.deviceIds]);
        }
      }
      
      // 返回完整的计划信息
      return await this.getScheduleById(scheduleId, resolvedTenantId);
    });
  }

  /**
   * 删除计划
   */
  async deleteSchedule(scheduleId, tenantId) {
    const tenantClause = tenantId ? ' AND tenant_id = $2' : '';
    const query = `
      DELETE FROM thermostat_schedules 
      WHERE id = $1${tenantClause}
    `;

    try {
      const result = await db.query(query, tenantId ? [scheduleId, tenantId] : [scheduleId]);
      return result.rowCount > 0;
    } catch (error) {
      logger.error('删除计划失败:', error);
      throw error;
    }
  }

  /**
   * 启用/禁用计划
   */
  async toggleSchedule(scheduleId, enabled, tenantId) {
    const tenantClause = tenantId ? ' AND tenant_id = $3' : '';
    const query = `
      UPDATE thermostat_schedules 
      SET enabled = $1, updated_at = NOW()
      WHERE id = $2${tenantClause}
      RETURNING *
    `;

    try {
      const params = tenantId ? [enabled, scheduleId, tenantId] : [enabled, scheduleId];
      const result = await db.query(query, params);
      if (result.rows.length === 0) {
        return null;
      }
      
      // 返回完整的计划信息
      return await this.getScheduleById(scheduleId, tenantId);
    } catch (error) {
      logger.error('切换计划状态失败:', error);
      throw error;
    }
  }

  /**
   * 根据ID获取计划详情
   */
  async getScheduleById(scheduleId, tenantId) {
    const tenantClause = tenantId ? ' AND ts.tenant_id = $2' : '';
    const query = `
      SELECT 
        ts.*,
        COALESCE(
          JSON_AGG(
            CASE WHEN d.id IS NOT NULL THEN
              JSON_BUILD_OBJECT(
                'device_id', d.id,
                'device_name', d.name,
                'device_code', d.device_id
              )
            END
          ) FILTER (WHERE d.id IS NOT NULL), 
          '[]'::json
        ) as devices
      FROM thermostat_schedules ts
      LEFT JOIN thermostat_schedule_devices tsd ON ts.id = tsd.schedule_id
      LEFT JOIN devices d ON tsd.device_id = d.id
      WHERE ts.id = $1${tenantClause}
      GROUP BY ts.id
    `;

    try {
      const result = await db.query(query, tenantId ? [scheduleId, tenantId] : [scheduleId]);
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      logger.error('获取计划详情失败:', error);
      throw error;
    }
  }
}

module.exports = new ScheduleService();
