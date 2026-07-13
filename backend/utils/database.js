const { Pool } = require('pg');
const logger = require('./logger');

// 数据库连接池配置
const poolConfig = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'iot_device_management',
  password: process.env.DB_PASSWORD || '123456',
  port: process.env.DB_PORT || 5432,
  // 连接池配置
  max: parseInt(process.env.DB_POOL_MAX) || 20, // 最大连接数
  min: parseInt(process.env.DB_POOL_MIN) || 5,  // 最小连接数
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000, // 空闲超时
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000, // 连接超时
  // SSL配置（生产环境建议启用）
  ssl: false
};

// 创建连接池
const pool = new Pool(poolConfig);

// 连接池事件监听
pool.on('connect', (client) => {
  logger.dbQuery('New client connected', 0, {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  });
});

pool.on('acquire', (client) => {
  logger.dbQuery('Client acquired from pool', 0, {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  });
});

pool.on('error', (err, client) => {
  logger.error('Unexpected error on idle client', {
    error: err.message,
    stack: err.stack
  });
});

pool.on('remove', (client) => {
  logger.dbQuery('Client removed from pool', 0, {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  });
});

// 数据库操作类
class Database {
  constructor() {
    this.pool = pool;
  }

  // 执行查询
  async query(text, params = []) {
    const start = Date.now();
    let client;

    try {
      client = await this.pool.connect();
      const result = await client.query(text, params);
      const duration = Date.now() - start;

      logger.dbQuery(text.substring(0, 100), duration, {
        rowCount: result.rowCount,
        paramCount: params.length
      });

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Database query error', {
        query: text.substring(0, 100),
        params: params.length,
        duration,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  // 执行事务
  async transaction(callback) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      logger.dbQuery('Transaction BEGIN', 0);

      const result = await callback(client);

      await client.query('COMMIT');
      logger.dbQuery('Transaction COMMIT', 0);

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.dbQuery('Transaction ROLLBACK', 0, {
        error: error.message
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // 批量插入
  async batchInsert(tableName, columns, rows) {
    if (!rows || rows.length === 0) {
      return { rowCount: 0 };
    }

    const start = Date.now();
    const columnNames = columns.join(', ');
    const placeholders = rows.map((_, rowIndex) => {
      const rowPlaceholders = columns.map((_, colIndex) =>
        `$${rowIndex * columns.length + colIndex + 1}`
      ).join(', ');
      return `(${rowPlaceholders})`;
    }).join(', ');

    const query = `INSERT INTO ${tableName} (${columnNames}) VALUES ${placeholders}`;
    const values = rows.flat();

    try {
      const result = await this.query(query, values);
      const duration = Date.now() - start;

      logger.dbQuery(`Batch insert into ${tableName}`, duration, {
        rowCount: result.rowCount,
        batchSize: rows.length
      });

      return result;
    } catch (error) {
      logger.error('Batch insert error', {
        tableName,
        rowCount: rows.length,
        error: error.message
      });
      throw error;
    }
  }

  // 分页查询
  async paginate(baseQuery, params = [], page = 1, limit = 10, countQuery = null) {
    const offset = (page - 1) * limit;

    // 构建分页查询
    const paginatedQuery = `${baseQuery} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const paginatedParams = [...params, limit, offset];

    // 构建计数查询
    const finalCountQuery = countQuery || `SELECT COUNT(*) FROM (${baseQuery}) as count_query`;

    try {
      // 并行执行数据查询和计数查询
      const [dataResult, countResult] = await Promise.all([
        this.query(paginatedQuery, paginatedParams),
        this.query(finalCountQuery, params)
      ]);

      const total = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(total / limit);

      return {
        data: dataResult.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      logger.error('Pagination query error', {
        baseQuery: baseQuery.substring(0, 100),
        page,
        limit,
        error: error.message
      });
      throw error;
    }
  }

  // 检查连接
  async checkConnection() {
    try {
      const result = await this.query('SELECT NOW() as current_time');
      return {
        connected: true,
        timestamp: result.rows[0].current_time,
        poolStats: {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount
        }
      };
    } catch (error) {
      logger.error('Database connection check failed', {
        error: error.message
      });
      return {
        connected: false,
        error: error.message
      };
    }
  }

  // 获取表信息
  async getTableInfo(tableName) {
    try {
      const query = `
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns 
        WHERE table_name = $1 
        ORDER BY ordinal_position
      `;

      const result = await this.query(query, [tableName]);
      return result.rows;
    } catch (error) {
      logger.error('Get table info error', {
        tableName,
        error: error.message
      });
      throw error;
    }
  }

  // 获取数据库统计信息
  async getDatabaseStats() {
    try {
      const queries = {
        // 数据库大小
        dbSize: "SELECT pg_size_pretty(pg_database_size(current_database())) as size",
        // 表统计
        tableStats: `
          SELECT 
            schemaname,
            tablename,
            n_tup_ins as inserts,
            n_tup_upd as updates,
            n_tup_del as deletes,
            n_live_tup as live_tuples,
            n_dead_tup as dead_tuples
          FROM pg_stat_user_tables
          ORDER BY n_live_tup DESC
        `,
        // 连接统计
        connectionStats: `
          SELECT 
            state,
            COUNT(*) as count
          FROM pg_stat_activity 
          WHERE datname = current_database()
          GROUP BY state
        `,
        // 慢查询
        slowQueries: `
          SELECT 
            query,
            calls,
            total_time,
            mean_time,
            rows
          FROM pg_stat_statements 
          WHERE mean_time > 100
          ORDER BY mean_time DESC 
          LIMIT 10
        `
      };

      const results = {};

      for (const [key, query] of Object.entries(queries)) {
        try {
          const result = await this.query(query);
          results[key] = result.rows;
        } catch (error) {
          // 某些查询可能因为扩展未安装而失败（如pg_stat_statements）
          results[key] = [];
          logger.warn(`Database stats query failed: ${key}`, {
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('Get database stats error', {
        error: error.message
      });
      throw error;
    }
  }

  // 执行数据库维护
  async maintenance() {
    try {
      const maintenanceTasks = [
        'VACUUM ANALYZE;',
        'REINDEX DATABASE CONCURRENTLY;'
      ];

      const results = [];

      for (const task of maintenanceTasks) {
        try {
          const start = Date.now();
          await this.query(task);
          const duration = Date.now() - start;

          results.push({
            task,
            success: true,
            duration
          });

          logger.info(`Database maintenance task completed: ${task}`, {
            duration
          });
        } catch (error) {
          results.push({
            task,
            success: false,
            error: error.message
          });

          logger.error(`Database maintenance task failed: ${task}`, {
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('Database maintenance error', {
        error: error.message
      });
      throw error;
    }
  }

  // 关闭连接池
  async close() {
    try {
      await this.pool.end();
      logger.info('Database connection pool closed');
    } catch (error) {
      logger.error('Error closing database connection pool', {
        error: error.message
      });
      throw error;
    }
  }

  // 获取连接池状态
  getPoolStatus() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      config: {
        max: poolConfig.max,
        min: poolConfig.min,
        idleTimeoutMillis: poolConfig.idleTimeoutMillis,
        connectionTimeoutMillis: poolConfig.connectionTimeoutMillis
      }
    };
  }
}

// 创建数据库实例
const db = new Database();

// 导出数据库实例
module.exports = db;

// 导出原始连接池（如果需要直接访问）
module.exports.pool = pool;

// 导出数据库类（如果需要创建新实例）
module.exports.Database = Database;

// 导出testConnection函数（兼容性）
module.exports.testConnection = async () => {
  return await db.checkConnection();
};

// 处理进程退出时的清理
// 注意：信号处理器已移至app.js主文件中统一管理
// 这里移除SIGINT/SIGTERM处理器，避免冲突
/*
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, closing database connections...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, closing database connections...');
  await db.close();
  process.exit(0);
});
*/

// 未捕获异常处理 - 移除process.exit调用，避免立即退出
process.on('uncaughtException', async (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  // 不再调用process.exit，让主进程处理
});

process.on('unhandledRejection', async (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason: reason.toString(),
    promise: promise.toString()
  });
  // 不再调用process.exit，让主进程处理
});

// 初始化时测试连接
(async () => {
  try {
    const connectionTest = await db.checkConnection();
    if (connectionTest.connected) {
      logger.info('Database connected successfully', {
        timestamp: connectionTest.timestamp,
        poolStats: connectionTest.poolStats
      });
    } else {
      logger.error('Database connection failed', {
        error: connectionTest.error
      });
    }
  } catch (error) {
    logger.error('Database initialization error', {
      error: error.message,
      stack: error.stack
    });
  }
})();