module.exports = {
  apps: [
    {
      name: 'whatsapp-bot',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
