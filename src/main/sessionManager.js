const { clearSessionDEK } = require('./crypto');
const { log } = require('./logger');

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

let inactivityTimer = null;
let mainWindowRef = null;

function startTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    log.info('Session timed out due to inactivity');
    clearSessionDEK();
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('auth:forceLogout');
    }
    inactivityTimer = null;
  }, TIMEOUT_MS);
}

function resetTimer() {
  if (inactivityTimer !== null) {
    startTimer();
  }
}

function stopTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = null;
}

function setMainWindow(win) {
  mainWindowRef = win;
}

module.exports = { startTimer, resetTimer, stopTimer, setMainWindow };
