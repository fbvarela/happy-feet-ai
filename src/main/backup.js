const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

let backupTimer = null;

function formatTimestamp() {
  const now = new Date();
  return now.toISOString().replace('T', '_').replace(/:/g, '-').slice(0, 19);
}

function performBackup(dbPath, backupFolder) {
  if (!backupFolder) throw new Error('No hay carpeta de copia de seguridad configurada');
  fs.mkdirSync(backupFolder, { recursive: true });

  const backupName = `happy-feet-backup-${formatTimestamp()}.db`;
  const backupPath = path.join(backupFolder, backupName);
  fs.copyFileSync(dbPath, backupPath);
  log.info(`Backup created: ${backupPath}`);
  return backupPath;
}

function pruneOldBackups(backupFolder, retentionCount) {
  if (!backupFolder || !fs.existsSync(backupFolder)) return;

  const files = fs.readdirSync(backupFolder)
    .filter(f => f.startsWith('happy-feet-backup-') && f.endsWith('.db'))
    .map(f => {
      const p = path.join(backupFolder, f);
      return { name: f, path: p, mtime: fs.statSync(p).mtime };
    })
    .sort((a, b) => b.mtime - a.mtime); // newest first

  for (const file of files.slice(retentionCount)) {
    fs.unlinkSync(file.path);
    log.info(`Backup pruned: ${file.path}`);
  }
}

function getBackupList(backupFolder) {
  if (!backupFolder || !fs.existsSync(backupFolder)) return [];

  return fs.readdirSync(backupFolder)
    .filter(f => f.startsWith('happy-feet-backup-') && f.endsWith('.db'))
    .map(f => {
      const p = path.join(backupFolder, f);
      const stat = fs.statSync(p);
      return { name: f, path: p, size: stat.size, date: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function scheduleBackup(dbPath, intervalHours, backupFolder, retentionCount) {
  stopBackupSchedule();
  if (!intervalHours || intervalHours <= 0 || !backupFolder) return;

  const ms = intervalHours * 60 * 60 * 1000;
  backupTimer = setInterval(() => {
    try {
      performBackup(dbPath, backupFolder);
      pruneOldBackups(backupFolder, retentionCount);
    } catch (err) {
      log.error('Scheduled backup failed:', err);
    }
  }, ms);

  log.info(`Backup scheduled every ${intervalHours}h → ${backupFolder} (keep ${retentionCount})`);
}

function stopBackupSchedule() {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
}

module.exports = { performBackup, pruneOldBackups, getBackupList, scheduleBackup, stopBackupSchedule };
