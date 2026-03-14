const { ipcMain } = require('electron');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDb, generateClientCode } = require('./database');
const { log } = require('./logger');
const {
  deriveKEK,
  generateDEK,
  wrapDEK,
  unwrapDEK,
  encryptField,
  decryptField,
  setSessionDEK,
  clearSessionDEK,
} = require('./crypto');
const { startTimer, stopTimer, resetTimer } = require('./sessionManager');

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(db, key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

/** Decrypt a clinic_history row, handling legacy plaintext rows gracefully. */
function decryptHistoryRow(row) {
  if (!row) return row;
  try {
    return {
      ...row,
      notas: row.notas_encrypted ? decryptField(row.notas) : row.notas,
      archivos: row.notas_encrypted && row.archivos ? decryptField(row.archivos) : row.archivos,
    };
  } catch (err) {
    log.error(`Failed to decrypt clinic_history row id=${row.id}:`, err);
    return {
      ...row,
      notas: '[error de cifrado]',
      archivos: row.archivos ? '[error de cifrado]' : null,
    };
  }
}

/** Build invoice HTML for PDF generation */
function buildInvoiceHtml(invoice, items, clinicName, clinicNif, clinicAddr, clinicPhone) {
  const isRect = invoice.numero_factura.startsWith('R');
  const itemsHtml = items.map(it => `
    <tr>
      <td>${it.tratamiento_nombre || ''}</td>
      <td style="text-align:center">${Math.abs(it.cantidad)}</td>
      <td style="text-align:right">${it.precio.toFixed(2)} €</td>
      <td style="text-align:right">${(it.precio * Math.abs(it.cantidad)).toFixed(2)} €</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #222; margin: 40px; }
  h1 { font-size: 22px; color: #0284c7; margin: 0; }
  .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .header-right { text-align: right; }
  .invoice-title { font-size: 20px; font-weight: bold; color: #0284c7; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th { background: #0ea5e9; color: white; padding: 8px; text-align: left; font-size: 12px; }
  td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
  .totals { margin-top: 20px; text-align: right; }
  .totals p { margin: 4px 0; }
  .total-line { font-size: 16px; font-weight: bold; color: #0284c7; }
  .client-box { background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 12px; margin-bottom: 20px; }
  .footer { margin-top: 40px; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px; }
</style></head><body>
  <div class="header">
    <div>
      <h1>🦶 ${clinicName}</h1>
      ${clinicAddr ? `<p>${clinicAddr}</p>` : ''}
      ${clinicNif  ? `<p>NIF: ${clinicNif}</p>` : ''}
      ${clinicPhone? `<p>Tel: ${clinicPhone}</p>` : ''}
    </div>
    <div class="header-right">
      <div class="invoice-title">${isRect ? 'FACTURA RECTIFICATIVA' : 'FACTURA'}</div>
      <p><strong>Nº:</strong> ${invoice.numero_factura}</p>
      <p><strong>Fecha:</strong> ${new Date(invoice.fecha).toLocaleDateString('es-ES')}</p>
      <p><strong>Estado:</strong> ${invoice.estado}</p>
      ${invoice.factura_rectificada_id ? `<p><small>Rectifica nº ${invoice.numero_factura_original || ''}</small></p>` : ''}
    </div>
  </div>
  <div class="client-box">
    <strong>Cliente:</strong> ${invoice.cliente_nombre} ${invoice.cliente_apellidos || ''}<br>
    ${invoice.cliente_dni ? `DNI: ${invoice.cliente_dni}<br>` : ''}
    ${invoice.cliente_direccion ? invoice.cliente_direccion : ''}
  </div>
  <table>
    <thead><tr><th>Descripción</th><th style="text-align:center">Cant.</th><th style="text-align:right">Precio Unit.</th><th style="text-align:right">Importe</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="totals">
    <p>Subtotal: ${invoice.subtotal.toFixed(2)} €</p>
    <p>IVA (21%): ${invoice.iva.toFixed(2)} €</p>
    <p class="total-line">TOTAL: ${invoice.total.toFixed(2)} €</p>
    ${invoice.fecha_pago ? `<p style="color:#15803d">Pagada el ${invoice.fecha_pago}${invoice.metodo_pago ? ' mediante ' + invoice.metodo_pago : ''}</p>` : ''}
  </div>
  ${invoice.observaciones ? `<p style="margin-top:20px"><strong>Observaciones:</strong> ${invoice.observaciones}</p>` : ''}
  <div class="footer">Documento generado por Happy Feet — ${new Date().toLocaleDateString('es-ES')}</div>
</body></html>`;
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

function setupIpcHandlers() {

  // ─── Auth ─────────────────────────────────────────────────────────────────

  ipcMain.handle('auth:login', async (event, username, password) => {
    try {
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

      if (!user) {
        log.warn(`Login failed: user not found - ${username}`);
        return { success: false, error: 'Usuario o contraseña incorrectos' };
      }

      const validPassword = bcrypt.compareSync(password, user.password_hash);
      if (!validPassword) {
        log.warn(`Login failed: invalid password - ${username}`);
        return { success: false, error: 'Usuario o contraseña incorrectos' };
      }

      db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

      const kekSaltHex = getSetting(db, 'kek_salt');

      if (!kekSaltHex) {
        const kekSalt = crypto.randomBytes(32);
        const kek = deriveKEK(password, kekSalt);
        const dek = generateDEK();
        const wrapped = wrapDEK(dek, kek);

        setSetting(db, 'kek_salt', kekSalt.toString('hex'));
        setSetting(db, 'enc_key_iv', wrapped.iv);
        setSetting(db, 'enc_key_tag', wrapped.tag);
        setSetting(db, 'enc_key_ciphertext', wrapped.ciphertext);

        setSessionDEK(dek);
        log.info('Encryption keys generated and stored for first login');
      } else {
        const kekSalt = Buffer.from(kekSaltHex, 'hex');
        const kek = deriveKEK(password, kekSalt);
        const wrapped = {
          iv: getSetting(db, 'enc_key_iv'),
          tag: getSetting(db, 'enc_key_tag'),
          ciphertext: getSetting(db, 'enc_key_ciphertext'),
        };

        let dek;
        try {
          dek = unwrapDEK(wrapped, kek);
        } catch (err) {
          log.error('DEK unwrap failed:', err);
          return { success: false, error: 'Error de autenticación' };
        }

        setSessionDEK(dek);
        log.info(`User logged in: ${username}`);
      }

      startTimer();
      return { success: true, user: { id: user.id, username: user.username } };
    } catch (error) {
      log.error('Login error:', error);
      return { success: false, error: 'Error al iniciar sesión' };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    clearSessionDEK();
    stopTimer();
    log.info('User logged out');
    return { success: true };
  });

  ipcMain.handle('auth:changePassword', async (event, username, oldPassword, newPassword) => {
    try {
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

      if (!user) return { success: false, error: 'Usuario no encontrado' };

      const validPassword = bcrypt.compareSync(oldPassword, user.password_hash);
      if (!validPassword) return { success: false, error: 'Contraseña actual incorrecta' };

      const newHash = bcrypt.hashSync(newPassword, 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

      const newKekSalt = crypto.randomBytes(32);
      const newKek = deriveKEK(newPassword, newKekSalt);
      const oldKekSalt = Buffer.from(getSetting(db, 'kek_salt'), 'hex');
      const oldKek = deriveKEK(oldPassword, oldKekSalt);
      const existingWrapped = {
        iv: getSetting(db, 'enc_key_iv'),
        tag: getSetting(db, 'enc_key_tag'),
        ciphertext: getSetting(db, 'enc_key_ciphertext'),
      };
      const dek = unwrapDEK(existingWrapped, oldKek);
      const newWrapped = wrapDEK(dek, newKek);

      setSetting(db, 'kek_salt', newKekSalt.toString('hex'));
      setSetting(db, 'enc_key_iv', newWrapped.iv);
      setSetting(db, 'enc_key_tag', newWrapped.tag);
      setSetting(db, 'enc_key_ciphertext', newWrapped.ciphertext);

      log.info(`Password changed for user: ${username}, DEK re-wrapped`);
      return { success: true };
    } catch (error) {
      log.error('Change password error:', error);
      return { success: false, error: 'Error al cambiar contraseña' };
    }
  });

  ipcMain.handle('session:resetTimer', () => {
    resetTimer();
    return { success: true };
  });

  // ─── Clients ──────────────────────────────────────────────────────────────

  ipcMain.handle('clients:getAll', async () => {
    try {
      const db = getDb();
      const clients = db.prepare('SELECT * FROM clients WHERE activo = 1 ORDER BY apellidos, nombre').all();
      return { success: true, data: clients };
    } catch (error) {
      log.error('Error getting clients:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clients:getById', async (event, id) => {
    try {
      const db = getDb();
      const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
      return { success: true, data: client };
    } catch (error) {
      log.error('Error getting client:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clients:search', async (event, { q, activo, fechaDesde, fechaHasta, page, pageSize } = {}) => {
    try {
      const db = getDb();
      const PS = pageSize || 20;
      const offset = ((page || 1) - 1) * PS;
      const where = [];
      const params = [];

      // Default: show active only unless caller specifies otherwise
      if (activo === '' || activo === null || activo === undefined) {
        where.push('activo = 1');
      } else {
        where.push('activo = ?');
        params.push(parseInt(activo));
      }

      if (q && q.trim()) {
        where.push('(nombre LIKE ? OR apellidos LIKE ? OR dni LIKE ? OR telefono LIKE ? OR email LIKE ? OR codigo LIKE ?)');
        const like = `%${q.trim()}%`;
        params.push(like, like, like, like, like, like);
      }

      if (fechaDesde) {
        where.push('fecha_alta >= ?');
        params.push(fechaDesde);
      }
      if (fechaHasta) {
        where.push("fecha_alta <= datetime(?, '+1 day')");
        params.push(fechaHasta);
      }

      const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const total = db.prepare(`SELECT COUNT(*) as c FROM clients ${whereSQL}`).get(...params).c;
      const data  = db.prepare(`SELECT * FROM clients ${whereSQL} ORDER BY apellidos, nombre LIMIT ? OFFSET ?`).all(...params, PS, offset);

      return { success: true, data, total, page: page || 1, pageSize: PS, totalPages: Math.ceil(total / PS) };
    } catch (error) {
      log.error('Error searching clients:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clients:create', async (event, clientData) => {
    try {
      const db = getDb();
      const codigo = generateClientCode();
      const result = db.prepare(`
        INSERT INTO clients
          (codigo, nombre, apellidos, dni, telefono, email, direccion,
           fecha_nacimiento, num_seguridad_social, observaciones)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        codigo,
        clientData.nombre,
        clientData.apellidos || null,
        clientData.dni || null,
        clientData.telefono || null,
        clientData.email || null,
        clientData.direccion || null,
        clientData.fecha_nacimiento || null,
        clientData.num_seguridad_social || null,
        clientData.observaciones || null
      );
      const newId = result.lastInsertRowid;
      const usuario = db.prepare('SELECT username FROM users ORDER BY last_login DESC LIMIT 1').get()?.username || 'sistema';
      db.prepare('INSERT INTO audit_log (tabla, registro_id, accion, resumen, usuario) VALUES (?, ?, ?, ?, ?)')
        .run('clients', newId, 'crear', JSON.stringify({ codigo, ...clientData }), usuario);
      log.info(`Client created: ${newId} with code: ${codigo}`);
      return { success: true, id: newId, codigo };
    } catch (error) {
      log.error('Error creating client:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clients:update', async (event, id, clientData) => {
    try {
      const db = getDb();
      db.prepare(`
        UPDATE clients
        SET nombre = ?, apellidos = ?, dni = ?, telefono = ?, email = ?, direccion = ?,
            fecha_nacimiento = ?, num_seguridad_social = ?, observaciones = ?
        WHERE id = ?
      `).run(
        clientData.nombre,
        clientData.apellidos || null,
        clientData.dni || null,
        clientData.telefono || null,
        clientData.email || null,
        clientData.direccion || null,
        clientData.fecha_nacimiento || null,
        clientData.num_seguridad_social || null,
        clientData.observaciones || null,
        id
      );
      const usuario = db.prepare('SELECT username FROM users ORDER BY last_login DESC LIMIT 1').get()?.username || 'sistema';
      db.prepare('INSERT INTO audit_log (tabla, registro_id, accion, resumen, usuario) VALUES (?, ?, ?, ?, ?)')
        .run('clients', id, 'actualizar', JSON.stringify(clientData), usuario);
      log.info(`Client updated: ${id}`);
      return { success: true };
    } catch (error) {
      log.error('Error updating client:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clients:delete', async (event, id) => {
    try {
      const db = getDb();
      db.prepare('UPDATE clients SET activo = 0 WHERE id = ?').run(id);
      const usuario = db.prepare('SELECT username FROM users ORDER BY last_login DESC LIMIT 1').get()?.username || 'sistema';
      db.prepare('INSERT INTO audit_log (tabla, registro_id, accion, resumen, usuario) VALUES (?, ?, ?, ?, ?)')
        .run('clients', id, 'eliminar', null, usuario);
      log.info(`Client deleted (soft): ${id}`);
      return { success: true };
    } catch (error) {
      log.error('Error deleting client:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clients:getAuditLog', async (event, clientId) => {
    try {
      const db = getDb();
      const rows = db.prepare(
        "SELECT * FROM audit_log WHERE tabla = 'clients' AND registro_id = ? ORDER BY fecha DESC"
      ).all(clientId);
      return { success: true, data: rows };
    } catch (error) {
      log.error('Error getting audit log:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clients:exportCsv', async (event, filters) => {
    try {
      const { app } = require('electron');
      const fs = require('fs');
      const path = require('path');
      const db = getDb();

      const { q, activo, fechaDesde, fechaHasta } = filters || {};
      const where = [];
      const params = [];

      if (activo === '' || activo === null || activo === undefined) {
        where.push('activo = 1');
      } else {
        where.push('activo = ?');
        params.push(parseInt(activo));
      }
      if (q && q.trim()) {
        where.push('(nombre LIKE ? OR apellidos LIKE ? OR dni LIKE ? OR telefono LIKE ? OR email LIKE ? OR codigo LIKE ?)');
        const like = `%${q.trim()}%`;
        params.push(like, like, like, like, like, like);
      }
      if (fechaDesde) { where.push('fecha_alta >= ?'); params.push(fechaDesde); }
      if (fechaHasta) { where.push("fecha_alta <= datetime(?, '+1 day')"); params.push(fechaHasta); }

      const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const rows = db.prepare(
        `SELECT codigo, nombre, apellidos, dni, telefono, email, direccion,
                fecha_alta, fecha_nacimiento, num_seguridad_social, observaciones
         FROM clients ${whereSQL} ORDER BY apellidos, nombre`
      ).all(...params);

      const headers = ['codigo','nombre','apellidos','dni','telefono','email','direccion',
                       'fecha_alta','fecha_nacimiento','num_seguridad_social','observaciones'];
      const csvLines = [headers.join(',')];
      for (const row of rows) {
        csvLines.push(headers.map(h => `"${String(row[h] ?? '').replace(/"/g,'""')}"`).join(','));
      }

      const fileName = `clientes_${new Date().toISOString().split('T')[0]}.csv`;
      const filePath = path.join(app.getPath('downloads'), fileName);
      fs.writeFileSync(filePath, '\uFEFF' + csvLines.join('\n'), 'utf8');
      log.info(`Clients CSV exported: ${filePath}`);
      return { success: true, filePath };
    } catch (error) {
      log.error('Error exporting clients CSV:', error);
      return { success: false, error: error.message };
    }
  });

  // ─── Treatments ───────────────────────────────────────────────────────────

  ipcMain.handle('treatments:getAll', async () => {
    try {
      const db = getDb();
      const treatments = db.prepare('SELECT * FROM treatments WHERE activo = 1 ORDER BY nombre').all();
      return { success: true, data: treatments };
    } catch (error) {
      log.error('Error getting treatments:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('treatments:create', async (event, treatmentData) => {
    try {
      const db = getDb();
      const result = db.prepare(`
        INSERT INTO treatments (nombre, descripcion, precio)
        VALUES (?, ?, ?)
      `).run(
        treatmentData.nombre,
        treatmentData.descripcion || null,
        treatmentData.precio
      );
      log.info(`Treatment created: ${result.lastInsertRowid}`);
      return { success: true, id: result.lastInsertRowid };
    } catch (error) {
      log.error('Error creating treatment:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('treatments:update', async (event, id, treatmentData) => {
    try {
      const db = getDb();
      db.prepare(`
        UPDATE treatments SET nombre = ?, descripcion = ?, precio = ?
        WHERE id = ?
      `).run(
        treatmentData.nombre,
        treatmentData.descripcion || null,
        treatmentData.precio,
        id
      );
      log.info(`Treatment updated: ${id}`);
      return { success: true };
    } catch (error) {
      log.error('Error updating treatment:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('treatments:delete', async (event, id) => {
    try {
      const db = getDb();
      db.prepare('UPDATE treatments SET activo = 0 WHERE id = ?').run(id);
      log.info(`Treatment deleted (soft): ${id}`);
      return { success: true };
    } catch (error) {
      log.error('Error deleting treatment:', error);
      return { success: false, error: error.message };
    }
  });

  // ─── Invoices ─────────────────────────────────────────────────────────────

  ipcMain.handle('invoices:getAll', async () => {
    try {
      const db = getDb();
      const invoices = db.prepare(`
        SELECT i.*,
               c.nombre as cliente_nombre, c.apellidos as cliente_apellidos,
               CASE
                 WHEN i.estado = 'Emitida' AND i.fecha_pago IS NULL
                 THEN CAST((julianday('now') - julianday(i.fecha)) AS INTEGER)
                 ELSE NULL
               END as dias_sin_pagar
        FROM invoices i
        JOIN clients c ON i.cliente_id = c.id
        ORDER BY i.fecha DESC
      `).all();
      return { success: true, data: invoices };
    } catch (error) {
      log.error('Error getting invoices:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('invoices:create', async (event, invoiceData) => {
    try {
      const db = getDb();
      const result = db.prepare(`
        INSERT INTO invoices
          (cliente_id, numero_factura, subtotal, iva, total, observaciones,
           estado, fecha_pago, metodo_pago, factura_rectificada_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        invoiceData.cliente_id,
        invoiceData.numero_factura,
        invoiceData.subtotal,
        invoiceData.iva,
        invoiceData.total,
        invoiceData.observaciones || null,
        invoiceData.estado || 'Emitida',
        invoiceData.fecha_pago || null,
        invoiceData.metodo_pago || null,
        invoiceData.factura_rectificada_id || null
      );

      const facturaId = result.lastInsertRowid;

      for (const item of invoiceData.items) {
        db.prepare(`
          INSERT INTO invoice_items (factura_id, tratamiento_id, cantidad, precio, iva)
          VALUES (?, ?, ?, ?, ?)
        `).run(facturaId, item.tratamiento_id, item.cantidad, item.precio, item.iva);
      }

      log.info(`Invoice created: ${facturaId}`);
      return { success: true, id: facturaId };
    } catch (error) {
      log.error('Error creating invoice:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('invoices:getNextNumber', async () => {
    try {
      const db = getDb();
      const lastInvoice = db.prepare('SELECT numero_factura FROM invoices ORDER BY id DESC LIMIT 1').get();

      let nextNumber = 1;
      if (lastInvoice) {
        const num = parseInt(lastInvoice.numero_factura.replace(/\D/g, '')) || 0;
        nextNumber = num + 1;
      }

      const numeroFactura = String(nextNumber).padStart(4, '0');
      return { success: true, numero_factura: numeroFactura };
    } catch (error) {
      log.error('Error getting next invoice number:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('invoices:getById', async (event, id) => {
    try {
      const db = getDb();
      const invoice = db.prepare(`
        SELECT i.*, c.nombre as cliente_nombre, c.apellidos as cliente_apellidos, c.id as cliente_id,
               c.dni as cliente_dni, c.direccion as cliente_direccion
        FROM invoices i
        JOIN clients c ON i.cliente_id = c.id
        WHERE i.id = ?
      `).get(id);

      const items = db.prepare(`
        SELECT ii.*, t.nombre as tratamiento_nombre
        FROM invoice_items ii
        LEFT JOIN treatments t ON ii.tratamiento_id = t.id
        WHERE ii.factura_id = ?
      `).all(id);

      return { success: true, data: { ...invoice, items } };
    } catch (error) {
      log.error('Error getting invoice:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('invoices:update', async (event, id, invoiceData) => {
    try {
      const db = getDb();
      db.prepare(`
        UPDATE invoices
        SET cliente_id = ?, numero_factura = ?, subtotal = ?, iva = ?, total = ?,
            observaciones = ?, estado = ?, fecha_pago = ?, metodo_pago = ?
        WHERE id = ?
      `).run(
        invoiceData.cliente_id,
        invoiceData.numero_factura,
        invoiceData.subtotal,
        invoiceData.iva,
        invoiceData.total,
        invoiceData.observaciones || null,
        invoiceData.estado || 'Emitida',
        invoiceData.fecha_pago || null,
        invoiceData.metodo_pago || null,
        id
      );

      db.prepare('DELETE FROM invoice_items WHERE factura_id = ?').run(id);

      for (const item of invoiceData.items) {
        db.prepare(`
          INSERT INTO invoice_items (factura_id, tratamiento_id, cantidad, precio, iva)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, item.tratamiento_id, item.cantidad, item.precio, item.iva);
      }

      log.info(`Invoice updated: ${id}`);
      return { success: true };
    } catch (error) {
      log.error('Error updating invoice:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('invoices:updateEstado', async (event, id, estado, fechaPago, metodoPago) => {
    try {
      const db = getDb();
      db.prepare(
        'UPDATE invoices SET estado = ?, fecha_pago = ?, metodo_pago = ? WHERE id = ?'
      ).run(estado, fechaPago || null, metodoPago || null, id);
      log.info(`Invoice ${id} estado updated to ${estado}`);
      return { success: true };
    } catch (error) {
      log.error('Error updating invoice estado:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('invoices:createRectificativa', async (event, originalId) => {
    try {
      const db = getDb();
      const orig = db.prepare(`
        SELECT i.*, c.nombre as cliente_nombre, c.apellidos as cliente_apellidos
        FROM invoices i JOIN clients c ON i.cliente_id = c.id WHERE i.id = ?
      `).get(originalId);

      if (!orig) return { success: false, error: 'Factura original no encontrada' };

      const items = db.prepare('SELECT * FROM invoice_items WHERE factura_id = ?').all(originalId);
      const numeroRect = 'R' + orig.numero_factura;

      const result = db.prepare(`
        INSERT INTO invoices
          (cliente_id, numero_factura, subtotal, iva, total, observaciones,
           estado, factura_rectificada_id)
        VALUES (?, ?, ?, ?, ?, ?, 'Emitida', ?)
      `).run(
        orig.cliente_id,
        numeroRect,
        -Math.abs(orig.subtotal),
        -Math.abs(orig.iva),
        -Math.abs(orig.total),
        'Factura rectificativa de ' + orig.numero_factura,
        originalId
      );

      const rectId = result.lastInsertRowid;
      for (const item of items) {
        db.prepare(`
          INSERT INTO invoice_items (factura_id, tratamiento_id, cantidad, precio, iva)
          VALUES (?, ?, ?, ?, ?)
        `).run(rectId, item.tratamiento_id, item.cantidad, item.precio, item.iva);
      }

      db.prepare("UPDATE invoices SET estado = 'Anulada' WHERE id = ?").run(originalId);
      log.info(`Rectificativa ${rectId} created for original invoice ${originalId}`);
      return { success: true, id: rectId, numero_factura: numeroRect };
    } catch (error) {
      log.error('Error creating rectificativa:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('invoices:generatePdf', async (event, invoiceId) => {
    try {
      const { BrowserWindow, app } = require('electron');
      const path = require('path');
      const fs = require('fs');
      const db = getDb();

      const invoice = db.prepare(`
        SELECT i.*, c.nombre as cliente_nombre, c.apellidos as cliente_apellidos,
               c.dni as cliente_dni, c.direccion as cliente_direccion
        FROM invoices i JOIN clients c ON i.cliente_id = c.id WHERE i.id = ?
      `).get(invoiceId);

      if (!invoice) return { success: false, error: 'Factura no encontrada' };

      const items = db.prepare(`
        SELECT ii.*, t.nombre as tratamiento_nombre
        FROM invoice_items ii
        LEFT JOIN treatments t ON ii.tratamiento_id = t.id
        WHERE ii.factura_id = ?
      `).all(invoiceId);

      const clinicName  = getSetting(db, 'clinic_name')    || 'Happy Feet Podología';
      const clinicNif   = getSetting(db, 'clinic_nif')     || '';
      const clinicAddr  = getSetting(db, 'clinic_address') || '';
      const clinicPhone = getSetting(db, 'clinic_phone')   || '';

      const html = buildInvoiceHtml(invoice, items, clinicName, clinicNif, clinicAddr, clinicPhone);

      const pdfWin = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
      await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      const pdfData = await pdfWin.webContents.printToPDF({
        marginsType: 1,
        pageSize: 'A4',
        printBackground: true,
      });
      pdfWin.close();

      const fileName = `factura_${invoice.numero_factura.replace(/[/\\]/g, '-')}.pdf`;
      const filePath = path.join(app.getPath('downloads'), fileName);
      fs.writeFileSync(filePath, pdfData);

      log.info(`PDF generated: ${filePath}`);
      return { success: true, filePath };
    } catch (error) {
      log.error('Error generating PDF:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('invoices:delete', async (event, id) => {
    try {
      const db = getDb();
      // Soft annulment — preserves audit trail
      db.prepare("UPDATE invoices SET estado = 'Anulada' WHERE id = ?").run(id);
      log.info(`Invoice annulled (soft delete): ${id}`);
      return { success: true };
    } catch (error) {
      log.error('Error annulling invoice:', error);
      return { success: false, error: error.message };
    }
  });

  // ─── Clinic History ───────────────────────────────────────────────────────

  ipcMain.handle('clinicHistory:getByClient', async (event, clienteId) => {
    try {
      const db = getDb();
      const history = db.prepare(`
        SELECT ch.*, t.nombre as tratamiento_nombre
        FROM clinic_history ch
        LEFT JOIN treatments t ON ch.tratamiento_id = t.id
        WHERE ch.cliente_id = ?
        ORDER BY ch.fecha DESC
      `).all(clienteId);
      return { success: true, data: history.map(decryptHistoryRow) };
    } catch (error) {
      log.error('Error getting clinic history:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clinicHistory:getById', async (event, id) => {
    try {
      const db = getDb();
      const history = db.prepare(`
        SELECT ch.*, t.nombre as tratamiento_nombre
        FROM clinic_history ch
        LEFT JOIN treatments t ON ch.tratamiento_id = t.id
        WHERE ch.id = ?
      `).get(id);
      return { success: true, data: decryptHistoryRow(history) };
    } catch (error) {
      log.error('Error getting clinic history entry:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clinicHistory:create', async (event, historyData) => {
    try {
      const db = getDb();
      const encNotas = historyData.notas ? encryptField(historyData.notas) : null;
      const encArchivos = historyData.archivos ? encryptField(historyData.archivos) : null;
      const result = db.prepare(`
        INSERT INTO clinic_history (cliente_id, tratamiento_id, notas, archivos, notas_encrypted)
        VALUES (?, ?, ?, ?, 1)
      `).run(
        historyData.cliente_id,
        historyData.tratamiento_id || null,
        encNotas,
        encArchivos
      );
      log.info(`Clinic history entry created: ${result.lastInsertRowid}`);
      return { success: true, id: result.lastInsertRowid };
    } catch (error) {
      log.error('Error creating clinic history:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clinicHistory:update', async (event, id, historyData) => {
    try {
      const db = getDb();
      const encNotas = historyData.notas ? encryptField(historyData.notas) : null;
      const encArchivos = historyData.archivos ? encryptField(historyData.archivos) : null;
      db.prepare(`
        UPDATE clinic_history SET tratamiento_id = ?, notas = ?, archivos = ?, notas_encrypted = 1
        WHERE id = ?
      `).run(
        historyData.tratamiento_id || null,
        encNotas,
        encArchivos,
        id
      );
      log.info(`Clinic history updated: ${id}`);
      return { success: true };
    } catch (error) {
      log.error('Error updating clinic history:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clinicHistory:delete', async (event, id) => {
    try {
      const db = getDb();
      db.prepare('DELETE FROM clinic_history_files WHERE historia_id = ?').run(id);
      db.prepare('DELETE FROM clinic_history WHERE id = ?').run(id);
      log.info(`Clinic history deleted: ${id}`);
      return { success: true };
    } catch (error) {
      log.error('Error deleting clinic history:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clinicHistory:migrateEncryption', async () => {
    try {
      const db = getDb();
      const rows = db.prepare(
        "SELECT id, notas, archivos FROM clinic_history WHERE notas_encrypted = 0 AND (notas IS NOT NULL OR archivos IS NOT NULL)"
      ).all();

      if (rows.length === 0) return { success: true, migrated: 0 };

      const migrate = db.transaction((rows) => {
        for (const row of rows) {
          const encNotas = row.notas ? encryptField(row.notas) : null;
          const encArchivos = row.archivos ? encryptField(row.archivos) : null;
          db.prepare(
            'UPDATE clinic_history SET notas = ?, archivos = ?, notas_encrypted = 1 WHERE id = ?'
          ).run(encNotas, encArchivos, row.id);
        }
      });

      migrate(rows);
      log.info(`Migrated ${rows.length} plaintext clinic_history records to encrypted storage`);
      return { success: true, migrated: rows.length };
    } catch (error) {
      log.error('Error migrating clinic history encryption:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clinicHistory:addFile', async (event, historiaId) => {
    try {
      const { dialog } = require('electron');
      const fs = require('fs');
      const path = require('path');

      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Seleccionar archivos adjuntos',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Imágenes y PDFs', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'pdf'] },
          { name: 'Todos los archivos', extensions: ['*'] }
        ]
      });

      if (canceled || filePaths.length === 0) return { success: true, added: 0 };

      const db = getDb();
      let added = 0;

      for (const filePath of filePaths) {
        const nombre = path.basename(filePath);
        const ext = path.extname(filePath).toLowerCase();
        let mimeType = 'application/octet-stream';
        if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
        else if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.gif') mimeType = 'image/gif';
        else if (ext === '.bmp') mimeType = 'image/bmp';
        else if (ext === '.webp') mimeType = 'image/webp';
        else if (ext === '.pdf') mimeType = 'application/pdf';

        const fileBuffer = fs.readFileSync(filePath);
        const base64Data = fileBuffer.toString('base64');
        const encData = encryptField(base64Data);

        db.prepare('INSERT INTO clinic_history_files (historia_id, nombre, mime_type, datos) VALUES (?, ?, ?, ?)')
          .run(historiaId, nombre, mimeType, encData);
        added++;
      }

      log.info(`Added ${added} file(s) to history entry ${historiaId}`);
      return { success: true, added };
    } catch (error) {
      log.error('Error adding file to clinic history:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clinicHistory:getFilesByClient', async (event, clienteId) => {
    try {
      const db = getDb();
      const files = db.prepare(`
        SELECT f.id, f.historia_id, f.nombre, f.mime_type, f.created_at
        FROM clinic_history_files f
        JOIN clinic_history ch ON f.historia_id = ch.id
        WHERE ch.cliente_id = ?
        ORDER BY f.created_at
      `).all(clienteId);
      return { success: true, data: files };
    } catch (error) {
      log.error('Error getting files for client:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clinicHistory:getFileData', async (event, fileId) => {
    try {
      const db = getDb();
      const file = db.prepare('SELECT * FROM clinic_history_files WHERE id = ?').get(fileId);
      if (!file) return { success: false, error: 'Archivo no encontrado' };

      const base64Data = decryptField(file.datos);
      const dataUrl = `data:${file.mime_type};base64,${base64Data}`;
      return { success: true, dataUrl, nombre: file.nombre, mime_type: file.mime_type };
    } catch (error) {
      log.error('Error getting file data:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clinicHistory:deleteFile', async (event, fileId) => {
    try {
      const db = getDb();
      db.prepare('DELETE FROM clinic_history_files WHERE id = ?').run(fileId);
      log.info(`Clinic history file deleted: ${fileId}`);
      return { success: true };
    } catch (error) {
      log.error('Error deleting clinic history file:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clinicHistory:search', async (event, query) => {
    try {
      const db = getDb();
      if (!query || !query.trim()) return { success: true, data: [] };

      const rows = db.prepare(`
        SELECT ch.*, c.nombre as cliente_nombre, c.apellidos as cliente_apellidos,
               c.codigo as cliente_codigo, c.id as cliente_id_val,
               t.nombre as tratamiento_nombre
        FROM clinic_history ch
        JOIN clients c ON ch.cliente_id = c.id
        LEFT JOIN treatments t ON ch.tratamiento_id = t.id
        ORDER BY ch.fecha DESC
      `).all();

      const q = query.trim().toLowerCase();
      const results = [];
      for (const row of rows) {
        const decrypted = decryptHistoryRow(row);
        if (
          (decrypted.notas && decrypted.notas !== '[error de cifrado]' && decrypted.notas.toLowerCase().includes(q)) ||
          (decrypted.tratamiento_nombre && decrypted.tratamiento_nombre.toLowerCase().includes(q))
        ) {
          results.push(decrypted);
        }
      }

      return { success: true, data: results };
    } catch (error) {
      log.error('Error searching clinic history:', error);
      return { success: false, error: error.message };
    }
  });

  // ─── Accounting ───────────────────────────────────────────────────────────

  ipcMain.handle('accounting:getReport', async (event, startDate, endDate) => {
    try {
      const db = getDb();
      const report = db.prepare(`
        SELECT
          DATE(i.fecha) as fecha,
          COUNT(i.id) as num_facturas,
          SUM(i.subtotal) as subtotal,
          SUM(i.iva) as iva,
          SUM(i.total) as total
        FROM invoices i
        WHERE i.fecha BETWEEN ? AND ? AND i.estado != 'Anulada'
        GROUP BY DATE(i.fecha)
        ORDER BY fecha
      `).all(startDate, endDate);
      return { success: true, data: report };
    } catch (error) {
      log.error('Error getting accounting report:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('accounting:getVatReport', async (event, year, quarter) => {
    try {
      const db = getDb();
      const startMonth = (quarter - 1) * 3 + 1;
      const endMonth = startMonth + 2;

      const startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(endMonth).padStart(2, '0')}-31`;

      const report = db.prepare(`
        SELECT
          SUM(i.iva) as total_iva,
          SUM(i.subtotal) as total_subtotal,
          COUNT(i.id) as num_facturas
        FROM invoices i
        WHERE i.fecha BETWEEN ? AND ? AND i.estado != 'Anulada'
      `).get(startDate, endDate);

      return {
        success: true,
        data: {
          year,
          quarter,
          startDate,
          endDate,
          totalIva: report.total_iva || 0,
          totalSubtotal: report.total_subtotal || 0,
          numFacturas: report.num_facturas || 0,
        }
      };
    } catch (error) {
      log.error('Error getting VAT report:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('accounting:getMonthlyChart', async (event, year) => {
    try {
      const db = getDb();
      const rows = db.prepare(`
        SELECT strftime('%m', fecha) as mes,
               SUM(total) as total,
               COUNT(id) as num_facturas
        FROM invoices
        WHERE strftime('%Y', fecha) = ? AND estado != 'Anulada'
        GROUP BY mes ORDER BY mes
      `).all(String(year));
      return { success: true, data: rows };
    } catch (error) {
      log.error('Error getting monthly chart:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('accounting:getTopTreatments', async (event, startDate, endDate) => {
    try {
      const db = getDb();
      const rows = db.prepare(`
        SELECT t.nombre,
               SUM(ABS(ii.cantidad)) as total_cantidad,
               SUM(ii.precio * ABS(ii.cantidad)) as total_ingresos
        FROM invoice_items ii
        JOIN treatments t ON ii.tratamiento_id = t.id
        JOIN invoices i ON ii.factura_id = i.id
        WHERE i.fecha BETWEEN ? AND ? AND i.estado != 'Anulada'
        GROUP BY t.id ORDER BY total_ingresos DESC LIMIT 10
      `).all(startDate, endDate);
      return { success: true, data: rows };
    } catch (error) {
      log.error('Error getting top treatments:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('accounting:getRevenuePerClient', async (event, startDate, endDate) => {
    try {
      const db = getDb();
      const rows = db.prepare(`
        SELECT c.nombre || ' ' || COALESCE(c.apellidos, '') as cliente,
               COUNT(i.id) as num_facturas,
               SUM(i.total) as total_ingresos
        FROM invoices i JOIN clients c ON i.cliente_id = c.id
        WHERE i.fecha BETWEEN ? AND ? AND i.estado != 'Anulada'
        GROUP BY c.id ORDER BY total_ingresos DESC
      `).all(startDate, endDate);
      return { success: true, data: rows };
    } catch (error) {
      log.error('Error getting revenue per client:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('accounting:exportCsv', async (event, type, startDate, endDate, year, quarter) => {
    try {
      const { app } = require('electron');
      const fs = require('fs');
      const path = require('path');
      const db = getDb();

      let rows, headers, fileName;

      if (type === 'invoices') {
        rows = db.prepare(`
          SELECT i.numero_factura,
                 c.nombre || ' ' || COALESCE(c.apellidos,'') as cliente,
                 i.fecha, i.subtotal, i.iva, i.total, i.estado,
                 COALESCE(i.metodo_pago,'') as metodo_pago,
                 COALESCE(i.fecha_pago,'') as fecha_pago
          FROM invoices i JOIN clients c ON i.cliente_id = c.id
          WHERE i.fecha BETWEEN ? AND ? AND i.estado != 'Anulada'
          ORDER BY i.fecha
        `).all(startDate, endDate);
        headers = ['numero_factura','cliente','fecha','subtotal','iva','total','estado','metodo_pago','fecha_pago'];
        fileName = `facturas_${startDate}_${endDate}.csv`;
      } else {
        const sm = (quarter - 1) * 3 + 1;
        const em = sm + 2;
        const sd = `${year}-${String(sm).padStart(2,'0')}-01`;
        const ed = `${year}-${String(em).padStart(2,'0')}-31`;
        rows = db.prepare(`
          SELECT i.numero_factura, i.fecha, i.subtotal, i.iva, i.total, i.estado
          FROM invoices i
          WHERE i.fecha BETWEEN ? AND ? AND i.estado != 'Anulada'
          ORDER BY i.fecha
        `).all(sd, ed);
        headers = ['numero_factura','fecha','subtotal','iva','total','estado'];
        fileName = `iva_${year}_T${quarter}.csv`;
      }

      const csvLines = [headers.join(',')];
      for (const row of rows) {
        csvLines.push(headers.map(h => `"${String(row[h] ?? '').replace(/"/g,'""')}"`).join(','));
      }

      const filePath = path.join(app.getPath('downloads'), fileName);
      fs.writeFileSync(filePath, '\uFEFF' + csvLines.join('\n'), 'utf8');
      log.info(`CSV exported: ${filePath}`);
      return { success: true, filePath };
    } catch (error) {
      log.error('Error exporting CSV:', error);
      return { success: false, error: error.message };
    }
  });

  // ─── Backup ───────────────────────────────────────────────────────────────

  ipcMain.handle('backup:getSettings', async () => {
    try {
      const db = getDb();
      return {
        success: true,
        settings: {
          enabled:       getSetting(db, 'backup_enabled') === '1',
          folder:        getSetting(db, 'backup_folder') || '',
          intervalHours: parseInt(getSetting(db, 'backup_interval_hours') || '24'),
          retention:     parseInt(getSetting(db, 'backup_retention') || '10'),
          lastBackup:    getSetting(db, 'backup_last_run') || null,
        },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('backup:saveSettings', async (event, settings) => {
    try {
      const db = getDb();
      const { getDbPath } = require('./database');
      const { scheduleBackup, stopBackupSchedule } = require('./backup');

      setSetting(db, 'backup_enabled',        settings.enabled ? '1' : '0');
      setSetting(db, 'backup_folder',         settings.folder || '');
      setSetting(db, 'backup_interval_hours', String(settings.intervalHours || 24));
      setSetting(db, 'backup_retention',      String(settings.retention || 10));

      if (settings.enabled && settings.folder) {
        scheduleBackup(getDbPath(), settings.intervalHours, settings.folder, settings.retention);
      } else {
        stopBackupSchedule();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('backup:runNow', async () => {
    try {
      const db = getDb();
      const { getDbPath } = require('./database');
      const { performBackup, pruneOldBackups } = require('./backup');

      const folder = getSetting(db, 'backup_folder');
      if (!folder) return { success: false, error: 'No hay carpeta de destino configurada' };

      const backupPath = performBackup(getDbPath(), folder);
      const retention = parseInt(getSetting(db, 'backup_retention') || '10');
      pruneOldBackups(folder, retention);

      const now = new Date().toISOString();
      setSetting(db, 'backup_last_run', now);
      return { success: true, backupPath };
    } catch (error) {
      log.error('Manual backup failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('backup:getList', async () => {
    try {
      const db = getDb();
      const { getBackupList } = require('./backup');
      const folder = getSetting(db, 'backup_folder');
      return { success: true, list: getBackupList(folder) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('backup:chooseFolder', async () => {
    try {
      const { dialog } = require('electron');
      const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
      if (result.canceled || !result.filePaths.length) return { success: false };
      return { success: true, folder: result.filePaths[0] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('backup:openFolder', async () => {
    try {
      const db = getDb();
      const { shell } = require('electron');
      const folder = getSetting(db, 'backup_folder');
      if (folder) await shell.openPath(folder);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ─── Dashboard ───────────────────────────────────────────────────────────

  ipcMain.handle('dashboard:getSummary', async () => {
    try {
      const db = getDb();
      const now = new Date();
      const y   = now.getFullYear();
      const m   = String(now.getMonth() + 1).padStart(2, '0');
      const monthStart = `${y}-${m}-01`;
      const monthEnd   = `${y}-${m}-31`;

      const totalPatients = db.prepare(
        'SELECT COUNT(*) as n FROM clients WHERE activo = 1'
      ).get().n;

      const monthRevenue = db.prepare(`
        SELECT COALESCE(SUM(total), 0) as total
        FROM invoices
        WHERE fecha BETWEEN ? AND ? AND estado != 'Anulada'
      `).get(monthStart, monthEnd).total;

      const pendingInvoices = db.prepare(
        "SELECT COUNT(*) as n FROM invoices WHERE estado = 'Emitida'"
      ).get().n;

      const monthVisits = db.prepare(`
        SELECT COUNT(*) as n FROM clinic_history
        WHERE fecha BETWEEN ? AND ?
      `).get(monthStart, monthEnd).n;

      const recentInvoices = db.prepare(`
        SELECT i.id, i.numero_factura, i.total, i.estado,
               c.nombre AS cliente_nombre, c.apellidos AS cliente_apellidos
        FROM invoices i
        JOIN clients c ON i.cliente_id = c.id
        ORDER BY i.fecha DESC, i.id DESC LIMIT 8
      `).all();

      const recentHistory = db.prepare(`
        SELECT h.id, h.fecha, h.cliente_id,
               c.nombre AS cliente_nombre, c.apellidos AS cliente_apellidos,
               t.nombre AS tratamiento_nombre
        FROM clinic_history h
        JOIN clients c ON h.cliente_id = c.id
        LEFT JOIN treatments t ON h.tratamiento_id = t.id
        ORDER BY h.fecha DESC, h.id DESC LIMIT 8
      `).all();

      return {
        success: true,
        totalPatients,
        monthRevenue,
        pendingInvoices,
        monthVisits,
        recentInvoices,
        recentHistory,
      };
    } catch (error) {
      log.error('Dashboard summary error:', error);
      return { success: false, error: error.message };
    }
  });

  // ─── CSV Import ───────────────────────────────────────────────────────────

  ipcMain.handle('clients:importPreview', async () => {
    try {
      const { dialog } = require('electron');
      const { previewCsv } = require('./csvImport');
      const fs = require('fs');

      const result = await dialog.showOpenDialog({
        title: 'Seleccionar archivo CSV',
        filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }],
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };

      const filePath = result.filePaths[0];
      const content  = fs.readFileSync(filePath, 'utf8');
      const preview  = previewCsv(content);

      return { success: true, filePath, ...preview };
    } catch (error) {
      log.error('CSV preview error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clients:executeImport', async (event, { filePath, columnMap, skipDuplicates }) => {
    try {
      const { parseCsv } = require('./csvImport');
      const { generateClientCode } = require('./database');
      const fs = require('fs');
      const db = getDb();

      const content = fs.readFileSync(filePath, 'utf8');
      const parsed  = parseCsv(content);
      if (!parsed.length) return { success: false, error: 'Archivo vacío' };

      const headers  = parsed[0];
      const dataRows = parsed.slice(1);

      // Build reverse map: fieldName → column index
      const fieldIdx = {};
      for (const [csvHeader, fieldName] of Object.entries(columnMap)) {
        if (fieldName) fieldIdx[fieldName] = headers.indexOf(csvHeader);
      }

      const get = (row, field) => {
        const idx = fieldIdx[field];
        return (idx !== undefined && idx >= 0) ? (row[idx] || '').trim() : '';
      };

      const insertStmt = db.prepare(`
        INSERT INTO clients
          (codigo, nombre, apellidos, dni, telefono, email, direccion,
           fecha_nacimiento, num_seguridad_social, observaciones, activo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      let imported = 0;
      let skipped  = 0;
      const errors = [];

      const importAll = db.transaction(() => {
        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          const nombre = get(row, 'nombre');
          if (!nombre) {
            errors.push({ row: i + 2, reason: 'Nombre vacío' });
            continue;
          }

          const dni = get(row, 'dni');
          if (skipDuplicates && dni) {
            const exists = db.prepare('SELECT id FROM clients WHERE dni = ?').get(dni);
            if (exists) { skipped++; continue; }
          }

          const codigo = generateClientCode();
          insertStmt.run(
            codigo,
            nombre,
            get(row, 'apellidos'),
            dni,
            get(row, 'telefono'),
            get(row, 'email'),
            get(row, 'direccion'),
            get(row, 'fecha_nacimiento') || null,
            get(row, 'num_seguridad_social') || null,
            get(row, 'observaciones') || null,
          );
          imported++;
        }
      });

      importAll();

      log.info(`CSV import: ${imported} imported, ${skipped} skipped, ${errors.length} errors`);
      return { success: true, imported, skipped, errors };
    } catch (error) {
      log.error('CSV execute import error:', error);
      return { success: false, error: error.message };
    }
  });

  log.info('IPC handlers registered');
}

module.exports = { setupIpcHandlers };
