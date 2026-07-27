
// 优化后的数据库连接池配置 - 提高并发处理能力
module.exports = {
  development: {
    pool: {
      max: 20, // 增加最大连接数以支持更高并发
      min: 2,  // 保留少量空闲连接，避免连接长期堆积
      acquire: 60000, // 增加获取连接超时时间
      idle: 30000,    // 增加空闲超时时间
      evict: 10000,   // 增加连接回收间隔
      handleDisconnects: true,
      // 新增配置项
      maxUses: 7500,  // 连接最大使用次数
      validate: true  // 启用连接验证
    },
    // 启用连接池监控
    logging: (sql, timing) => {
      if (timing > 1000) {
        console.warn(`慢查询检测: ${timing}ms - ${sql}`);
      }
    },
    benchmark: true,
    // 新增查询优化配置
    dialectOptions: {
      statement_timeout: 30000, // 查询超时时间
      idle_in_transaction_session_timeout: 30000
    }
  },
  
  production: {
    pool: {
      max: 30, // 生产环境默认连接上限，必要时通过环境变量提高
      min: 2,  // 避免每个进程常驻大量空闲连接
      acquire: 60000,
      idle: 30000,
      evict: 10000,
      handleDisconnects: true,
      maxUses: 7500,
      validate: true
    },
    logging: false,
    benchmark: false,
    dialectOptions: {
      statement_timeout: 30000,
      idle_in_transaction_session_timeout: 30000
    }
  }
};
