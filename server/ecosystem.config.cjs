/**
 * PM2 Ecosystem Config
 *
 * Usage:
 *   cd server && npm run build
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save          # persist across reboots
 *   pm2 startup       # install systemd service
 *
 * Processes:
 *   aku-api           — Hono HTTP API server
 *   aku-notif-worker  — Background notification scheduler (daily 19:00 UTC + weekly Sunday 18:00 UTC)
 */

module.exports = {
  apps: [
    // ── API Server ──────────────────────────────────────────────────────────
    {
      name:         'aku-api',
      script:       'dist/index.js',
      instances:    1,
      exec_mode:    'fork',
      node_args:    '--experimental-vm-modules',
      env_file:     '.env',
      env_production: {
        NODE_ENV: 'production',
      },
      autorestart:  true,
      watch:        false,
      max_memory_restart: '300M',
      kill_timeout: 10000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file:     'logs/out.log',
      error_file:   'logs/error.log',
      merge_logs:   true,
    },

    // ── Notification Worker ─────────────────────────────────────────────────
    // IMPORTANT: Always exactly 1 instance — multiple workers = duplicate pushes.
    {
      name:         'aku-notif-worker',
      script:       'dist/workers/notification-worker.js',
      instances:    1,
      exec_mode:    'fork',
      node_args:    '--experimental-vm-modules',
      env_file:     '.env',
      env_production: {
        NODE_ENV: 'production',
      },
      autorestart:  true,
      watch:        false,
      max_memory_restart: '200M',
      kill_timeout: 20000,   // 20 s grace period to finish current batch
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file:     'logs/notif-worker-out.log',
      error_file:   'logs/notif-worker-err.log',
      merge_logs:   true,
    },
  ],
};
