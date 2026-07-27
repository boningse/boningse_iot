module.exports = {
  apps: [
    {
      name: 'iot-backend',
      script: '/opt/iot/backend/app.js',
      cwd: '/opt/iot/backend',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max_old_space_size=2048',
      env: {
        NODE_ENV: 'production',
        PORT: 3003
      },
      log_file: '/opt/iot/logs/backend.log',
      out_file: '/opt/iot/logs/backend-out.log',
      error_file: '/opt/iot/logs/backend-err.log',
      pid_file: '/opt/iot/logs/backend.pid',
      merge_logs: true,
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
