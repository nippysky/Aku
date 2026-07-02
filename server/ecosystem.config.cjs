// pm2 process config — used in production on the Droplet
// Start: pm2 start ecosystem.config.cjs
// Logs:  pm2 logs aku-api
// Restart: pm2 restart aku-api

module.exports = {
  apps: [
    {
      name:         'aku-api',
      script:       'dist/index.js',
      instances:    1,
      exec_mode:    'fork',
      node_args:    '--experimental-vm-modules',
      env_file:     '.env',
      env: {
        NODE_ENV: 'production',
      },
      // Restart if it crashes
      autorestart:  true,
      watch:        false,
      max_memory_restart: '300M',
      // Log rotation
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file:     'logs/out.log',
      error_file:   'logs/error.log',
      merge_logs:   true,
    },
  ],
};
