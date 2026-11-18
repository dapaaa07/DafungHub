// PM2 configuration tuned for low-RAM shared hosting (1.5 GB LVE limit)
module.exports = {
  apps: [
    {
      name: 'dafung-hub',
      script: 'server.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      node_args: '--max-old-space-size=384',
      max_memory_restart: '450M',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        HOSTNAME: '127.0.0.1',
        PORT: process.env.PORT || 3000,
        UV_THREADPOOL_SIZE: '2',
      },
    },
  ],
};
