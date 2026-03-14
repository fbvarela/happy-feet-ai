const log = require('electron-log');
const path = require('path');
const { app } = require('electron');

log.transports.file.resolvePathFn = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'logs', 'happy-feet.log');
};

log.transports.file.level = 'info';
log.transports.console.level = 'debug';

log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

function setupGlobalErrorHandlers() {
  process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
}

module.exports = { log, setupGlobalErrorHandlers };
