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
      WHERE ts.tenant_id = $1
      GROUP BY ts.id
      ORDER BY ts.created_at DESC
    `;

    try {
      const result = await db.query(query, [tenantId]);
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
      WHERE ts.tenant_id = $1 AND tsd.device_id = $2
      GROUP BY ts.id
      ORDER BY ts.created_at DESC
    `;

    try {
      const result = await db.query(query, [tenantId, deviceId]);
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
      
      // 验证设备是否属于该租户
      if (scheduleData.deviceIds && scheduleData.deviceIds.length > 0) {
        const deviceCheck = await client.query(
          `SELECT id FROM devices 
           WHERE id = ANY($1) AND tenant_id = $2`,
          [scheduleData.deviceIds, tenantId]
        );
        
        if (deviceCheck.rows.length !== scheduleData.deviceIds.length) {
          throw new Error('部分设备不存在或无权限');
        }
      }

      // 创建计划
      const scheduleQuery = `
        INSERT INTO thermostat_schedules (
          name, tenant_id, execute_time, repeat_type, week_days, custom_dates,
          power_action, ac_mode, target_temp, fan_speed, enabled, description
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;

      const scheduleResult = await client.query(scheduleQuery, [
        scheduleData.name,
        tenantId,
        scheduleData.executeTime,
        scheduleData.repeatType,
        scheduleData.weekDays || [],
        scheduleData.customDates || [],
        scheduleData.powerAction,
        scheduleData.acMode,
        scheduleData.targetTemp,
        scheduleData.fanSpeed,
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
      
      const result = await client.query(query, [schedule.id, tenantId]);
      return result.rows[0];
    });
  }

  /**
   * 更新计划
   */
  async updateSchedule(scheduleId, scheduleData, tenantId) {
    return await db.transaction(async (client) => {
      
      // 验证计划是否属于该租户
      const scheduleCheck = await client.query(
        'SELECT id FROM thermostat_schedules WHERE id = $1 AND tenant_id = $2',
        [scheduleId, tenantId]
      );
      
      if (scheduleCheck.rows.length === 0) {
        throw new Error('计划不存在或无权限');
      }
      
      // 验证设备是否属于该租户
      if (scheduleData.deviceIds && scheduleData.deviceIds.length > 0) {
        const deviceCheck = await client.query(
          `SELECT id FROM devices 
           WHERE id = ANY($1) AND tenant_id = $2`,
          [scheduleData.deviceIds, tenantId]
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
          enabled = $10,
          description = $11,
          updated_at = NOW()
        WHERE id = $12 AND tenant_id = $13
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
        scheduleData.enabled,
        scheduleData.description,
        scheduleId,
        tenantId
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
      return await this.getScheduleById(scheduleId, tenantId);
    });
  }

  /**
   * 删除计划
   */
  async deleteSchedule(scheduleId, tenantId) {
    const query = `
      DELETE FROM thermostat_schedules 
      WHERE id = $1 AND tenant_id = $2
    `;

    try {
      const result = await db.query(query, [scheduleId, tenantId]);
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
    const query = `
      UPDATE thermostat_schedules 
      SET enabled = $1, updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3
      RETURNING *
    `;

    try {
      const result = await db.query(query, [enabled, scheduleId, tenantId]);
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

    try {
      const result = await db.query(query, [scheduleId, tenantId]);
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