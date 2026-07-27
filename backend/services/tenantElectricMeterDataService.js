/**
 * 按租户分表的电表数据服务
 * 提供电表数据的增删改查功能
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');
require('dotenv').config();

class TenantElectricMeterDataService {
  constructor() {
    // 获取数据库连接池配置
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'iot_device_management',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '123456',
      max: 20,
      min: 0,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 30000
    });
  }

  /**
   * 获取租户的电表数据表名
   * @param {string} tenantCode - 租户代码
   * @returns {string} 表名
   */
  getTableName(tenantCode) {
    return `electric_meter_data_${tenantCode}`;
  }

  /**
   * 检查租户表是否存在
   * @param {string} tenantCode - 租户代码
   * @returns {Promise<boolean>}
   */
  async checkTableExists(tenantCode) {
    try {
      const tableName = this.getTableName(tenantCode);
      const query = `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = $1 AND table_schema = 'public'
        )
      `;
      const result = await this.pool.query(query, [tableName]);
      return result.rows[0].exists;
    } catch (error) {
      logger.error('检查租户表是否存在失败:', error);
      return false;
    }
  }

  /**
   * 为租户创建电表数据表
   * @param {string} tenantCode - 租户代码
   * @returns {Promise<boolean>}
   */
  async createTableForTenant(tenantCode) {
    try {
      const query = 'SELECT create_electric_meter_data_table($1)';
      await this.pool.query(query, [tenantCode]);
      logger.info(`成功为租户 ${tenantCode} 创建电表数据表`);
      return true;
    } catch (error) {
      logger.error(`为租户 ${tenantCode} 创建电表数据表失败:`, error);
      return false;
    }
  }

  /**
   * 插入电表数据
   * @param {string} tenantCode - 租户代码
   * @param {Object} meterData - 电表数据
   * @returns {Promise<string|null>} 插入的记录ID
   */
  async insertMeterData(tenantCode, meterData) {
    try {
      const {
        electricMeterId,
        deviceId,
        meterNumber,
        meterAddress,
        data,
        collectionTimestamp = new Date()
      } = meterData;

      // 检查表是否存在，不存在则创建
      const tableExists = await this.checkTableExists(tenantCode);
      if (!tableExists) {
        await this.createTableForTenant(tenantCode);
      }

      const query = `
        SELECT insert_electric_meter_data($1, $2, $3, $4, $5, $6, $7)
      `;
      
      const result = await this.pool.query(query, [
        tenantCode,
        electricMeterId,
        deviceId,
        meterNumber,
        meterAddress,
        JSON.stringify(data),
        collectionTimestamp
      ]);

      const insertedId = result.rows[0].insert_electric_meter_data;
      logger.debug(`成功插入电表数据到租户 ${tenantCode} 的表中，ID: ${insertedId}`);
      return insertedId;
    } catch (error) {
      logger.error(`插入电表数据到租户 ${tenantCode} 的表中失败:`, error);
      return null;
    }
  }

  /**
   * 批量插入电表数据
   * @param {string} tenantCode - 租户代码
   * @param {Array} meterDataList - 电表数据列表
   * @returns {Promise<Array>} 插入的记录ID列表
   */
  async batchInsertMeterData(tenantCode, meterDataList) {
    const client = await this.pool.connect();
    const insertedIds = [];
    
    try {
      await client.query('BEGIN');
      
      // 检查表是否存在，不存在则创建
      const tableExists = await this.checkTableExists(tenantCode);
      if (!tableExists) {
        await this.createTableForTenant(tenantCode);
      }

      for (const meterData of meterDataList) {
        const {
          electricMeterId,
          deviceId,
          meterNumber,
          meterAddress,
          data,
          collectionTimestamp = new Date()
        } = meterData;

        const query = `
          SELECT insert_electric_meter_data($1, $2, $3, $4, $5, $6, $7)
        `;
        
        const result = await client.query(query, [
          tenantCode,
          electricMeterId,
          deviceId,
          meterNumber,
          meterAddress,
          JSON.stringify(data),
          collectionTimestamp
        ]);

        insertedIds.push(result.rows[0].insert_electric_meter_data);
      }

      await client.query('COMMIT');
      logger.info(`成功批量插入 ${meterDataList.length} 条电表数据到租户 ${tenantCode} 的表中`);
      return insertedIds;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`批量插入电表数据到租户 ${tenantCode} 的表中失败:`, error);
      return [];
    } finally {
      client.release();
    }
  }

  /**
   * 查询电表数据
   * @param {string} tenantCode - 租户代码
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 查询结果
   */
  async queryMeterData(tenantCode, options = {}) {
    try {
      const {
        electricMeterId,
        deviceId,
        meterNumber,
        startTime,
        endTime,
        limit = 100,
        offset = 0,
        orderBy = 'collection_timestamp',
        orderDirection = 'DESC'
      } = options;

      // 检查表是否存在
      const tableExists = await this.checkTableExists(tenantCode);
      if (!tableExists) {
        logger.warn(`租户 ${tenantCode} 的电表数据表不存在`);
        return [];
      }

      const tableName = this.getTableName(tenantCode);
      let query = `SELECT * FROM ${tableName} WHERE 1=1`;
      const params = [];
      let paramIndex = 1;

      // 添加查询条件
      if (electricMeterId) {
        query += ` AND electric_meter_id = $${paramIndex++}`;
        params.push(electricMeterId);
      }

      if (deviceId) {
        query += ` AND device_id = $${paramIndex++}`;
        params.push(deviceId);
      }

      if (meterNumber) {
        query += ` AND meter_number = $${paramIndex++}`;
        params.push(meterNumber);
      }

      if (startTime) {
        query += ` AND collection_timestamp >= $${paramIndex++}`;
        params.push(startTime);
      }

      if (endTime) {
        query += ` AND collection_timestamp <= $${paramIndex++}`;
        params.push(endTime);
      }

      // 添加排序
      query += ` ORDER BY ${orderBy} ${orderDirection}`;

      // 添加分页
      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error(`查询租户 ${tenantCode} 的电表数据失败:`, error);
      return [];
    }
  }

  /**
   * 获取电表数据统计信息
   * @param {string} tenantCode - 租户代码
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 统计信息
   */
  async getMeterDataStats(tenantCode, options = {}) {
    try {
      const {
        electricMeterId,
        startTime,
        endTime
      } = options;

      // 检查表是否存在
      const tableExists = await this.checkTableExists(tenantCode);
      if (!tableExists) {
        return { count: 0, latestTimestamp: null, earliestTimestamp: null };
      }

      const tableName = this.getTableName(tenantCode);
      let query = `
        SELECT 
          COUNT(*) as count,
          MAX(collection_timestamp) as latest_timestamp,
          MIN(collection_timestamp) as earliest_timestamp
        FROM ${tableName} 
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (electricMeterId) {
        query += ` AND electric_meter_id = $${paramIndex++}`;
        params.push(electricMeterId);
      }

      if (startTime) {
        query += ` AND collection_timestamp >= $${paramIndex++}`;
        params.push(startTime);
      }

      if (endTime) {
        query += ` AND collection_timestamp <= $${paramIndex++}`;
        params.push(endTime);
      }

      const result = await this.pool.query(query, params);
      const row = result.rows[0];
      
      return {
        count: parseInt(row.count),
        latestTimestamp: row.latest_timestamp,
        earliestTimestamp: row.earliest_timestamp
      };
    } catch (error) {
      logger.error(`获取租户 ${tenantCode} 的电表数据统计失败:`, error);
      return { count: 0, latestTimestamp: null, earliestTimestamp: null };
    }
  }

  /**
   * 删除电表数据
   * @param {string} tenantCode - 租户代码
   * @param {Object} options - 删除选项
   * @returns {Promise<number>} 删除的记录数
   */
  async deleteMeterData(tenantCode, options = {}) {
    try {
      const {
        electricMeterId,
        deviceId,
        beforeTime
      } = options;

      // 检查表是否存在
      const tableExists = await this.checkTableExists(tenantCode);
      if (!tableExists) {
        return 0;
      }

      const tableName = this.getTableName(tenantCode);
      let query = `DELETE FROM ${tableName} WHERE 1=1`;
      const params = [];
      let paramIndex = 1;

      if (electricMeterId) {
        query += ` AND electric_meter_id = $${paramIndex++}`;
        params.push(electricMeterId);
      }

      if (deviceId) {
        query += ` AND device_id = $${paramIndex++}`;
        params.push(deviceId);
      }

      if (beforeTime) {
        query += ` AND collection_timestamp < $${paramIndex++}`;
        params.push(beforeTime);
      }

      const result = await this.pool.query(query, params);
      const deletedCount = result.rowCount;
      
      logger.info(`成功删除租户 ${tenantCode} 的 ${deletedCount} 条电表数据`);
      return deletedCount;
    } catch (error) {
      logger.error(`删除租户 ${tenantCode} 的电表数据失败:`, error);
      return 0;
    }
  }

  /**
   * 关闭数据库连接池
   */
  async close() {
    try {
      await this.pool.end();
      logger.info('电表数据服务数据库连接池已关闭');
    } catch (error) {
      logger.error('关闭电表数据服务数据库连接池失败:', error);
    }
  }
}

module.exports = new TenantElectricMeterDataService();