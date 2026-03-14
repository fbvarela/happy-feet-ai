const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const { log } = require('./logger');

let db = null;

function getDbPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'happy-feet.db');
}

function initDatabase() {
  const dbPath = getDbPath();
  log.info(`Initializing database at: ${dbPath}`);
  
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  
  runMigrations();
  
  log.info('Database initialized successfully');
  return db;
}

function runMigrations() {
  log.info('Running database migrations...');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );
    
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      apellidos TEXT,
      dni TEXT,
      telefono TEXT,
      email TEXT,
      direccion TEXT,
      fecha_alta DATETIME DEFAULT CURRENT_TIMESTAMP,
      activo INTEGER DEFAULT 1
    );
    
    CREATE TABLE IF NOT EXISTS treatments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      precio REAL NOT NULL,
      activo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      numero_factura TEXT NOT NULL UNIQUE,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      subtotal REAL NOT NULL,
      iva REAL NOT NULL,
      total REAL NOT NULL,
      observaciones TEXT,
      FOREIGN KEY (cliente_id) REFERENCES clients(id)
    );
    
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      factura_id INTEGER NOT NULL,
      tratamiento_id INTEGER NOT NULL,
      cantidad INTEGER DEFAULT 1,
      precio REAL NOT NULL,
      iva REAL NOT NULL,
      FOREIGN KEY (factura_id) REFERENCES invoices(id),
      FOREIGN KEY (tratamiento_id) REFERENCES treatments(id)
    );
    
    CREATE TABLE IF NOT EXISTS clinic_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      tratamiento_id INTEGER,
      notas TEXT,
      archivos TEXT,
      FOREIGN KEY (cliente_id) REFERENCES clients(id),
      FOREIGN KEY (tratamiento_id) REFERENCES treatments(id)
    );
  `);
  
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    log.info('Creating default admin user...');
    const bcrypt = require('bcryptjs');
    const passwordHash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('admin', passwordHash);
    log.info('Default admin user created');
  }
  
  try {
    db.prepare('SELECT codigo FROM clients LIMIT 1').get();
  } catch (e) {
    log.info('Adding codigo column to clients table...');
    db.prepare('ALTER TABLE clients ADD COLUMN codigo TEXT').run();
  }
  
  const clientCount = db.prepare('SELECT COUNT(*) as count FROM clients').get();
  if (clientCount.count > 0) {
    const clientsWithoutCode = db.prepare("SELECT id FROM clients WHERE codigo IS NULL OR codigo = ''").all();
    if (clientsWithoutCode.length > 0) {
      log.info(`Migrating ${clientsWithoutCode.length} clients with codes...`);
      const lastCode = db.prepare("SELECT codigo FROM clients WHERE codigo IS NOT NULL AND codigo != '' ORDER BY id DESC LIMIT 1").get();
      let counter = lastCode ? parseInt(lastCode.codigo.replace(/\D/g, '')) || 0 : 0;
      
      for (const client of clientsWithoutCode) {
        counter++;
        const codigo = String(counter).padStart(5, '0');
        db.prepare('UPDATE clients SET codigo = ? WHERE id = ?').run(codigo, client.id);
      }
      log.info('Client codes migration completed');
    }
  }
  
  // Migration: add notas_encrypted sentinel column to clinic_history
  try {
    db.prepare('SELECT notas_encrypted FROM clinic_history LIMIT 1').get();
  } catch (e) {
    log.info('Adding notas_encrypted column to clinic_history table...');
    db.prepare('ALTER TABLE clinic_history ADD COLUMN notas_encrypted INTEGER DEFAULT 0').run();
  }

  // Migration: invoice estado, fecha_pago, metodo_pago, factura_rectificada_id
  try {
    db.prepare('SELECT estado FROM invoices LIMIT 1').get();
  } catch (e) {
    log.info('Adding estado/fecha_pago/metodo_pago/factura_rectificada_id to invoices...');
    db.prepare("ALTER TABLE invoices ADD COLUMN estado TEXT NOT NULL DEFAULT 'Emitida'").run();
    db.prepare('ALTER TABLE invoices ADD COLUMN fecha_pago TEXT').run();
    db.prepare('ALTER TABLE invoices ADD COLUMN metodo_pago TEXT').run();
    db.prepare('ALTER TABLE invoices ADD COLUMN factura_rectificada_id INTEGER').run();
  }

  // Migration: client extra fields (fecha_nacimiento, num_seguridad_social, observaciones)
  try {
    db.prepare('SELECT fecha_nacimiento FROM clients LIMIT 1').get();
  } catch (e) {
    log.info('Adding fecha_nacimiento/num_seguridad_social/observaciones to clients...');
    db.prepare('ALTER TABLE clients ADD COLUMN fecha_nacimiento TEXT').run();
    db.prepare('ALTER TABLE clients ADD COLUMN num_seguridad_social TEXT').run();
    db.prepare('ALTER TABLE clients ADD COLUMN observaciones TEXT').run();
  }

  // Migration: audit_log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tabla TEXT NOT NULL,
      registro_id INTEGER NOT NULL,
      accion TEXT NOT NULL,
      resumen TEXT,
      usuario TEXT,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log ON audit_log(tabla, registro_id);
  `);

  // Migration: clinic_history_files table
  db.exec(`
    CREATE TABLE IF NOT EXISTS clinic_history_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      historia_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      datos TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (historia_id) REFERENCES clinic_history(id)
    );
    CREATE INDEX IF NOT EXISTS idx_clinic_files ON clinic_history_files(historia_id);
  `);

  log.info('Migrations completed');
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    log.info('Database closed');
  }
}

function generateClientCode() {
  const lastClient = db.prepare("SELECT codigo FROM clients ORDER BY id DESC LIMIT 1").get();
  let counter = lastClient && lastClient.codigo ? parseInt(lastClient.codigo.replace(/\D/g, '')) || 0 : 0;
  counter++;
  return String(counter).padStart(5, '0');
}

module.exports = { initDatabase, getDb, closeDatabase, getDbPath, generateClientCode };
