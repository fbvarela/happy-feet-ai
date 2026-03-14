/**
 * Minimal CSV parser and column auto-mapper for patient import.
 * No external dependencies — handles comma/semicolon delimiters,
 * quoted fields, escaped quotes, and UTF-8 BOM.
 */

// ── Parser ────────────────────────────────────────────────────────────────────

function parseCsv(text) {
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  // Auto-detect delimiter: semicolon wins if it appears more than comma in line 1
  const firstLine = text.split('\n')[0] || '';
  const delimiter = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field.trim());
        field = '';
      } else if (ch === '\n') {
        row.push(field.trim());
        field = '';
        // Skip completely empty rows
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
      } else if (ch === '\r') {
        // ignore CR in CRLF
      } else {
        field += ch;
      }
    }
  }
  // Last field / row
  row.push(field.trim());
  if (row.some(c => c !== '')) rows.push(row);

  return rows;
}

// ── Column auto-mapper ────────────────────────────────────────────────────────

const FIELD_ALIASES = {
  nombre:              ['nombre', 'name', 'first_name', 'firstname', 'primer nombre', 'primer_nombre'],
  apellidos:           ['apellidos', 'apellido', 'surname', 'last_name', 'lastname', 'segundo nombre'],
  dni:                 ['dni', 'nif', 'cif', 'documento', 'id', 'identificacion'],
  telefono:            ['telefono', 'teléfono', 'phone', 'tel', 'móvil', 'movil', 'celular', 'telephone'],
  email:               ['email', 'correo', 'e-mail', 'mail', 'correo electronico'],
  direccion:           ['direccion', 'dirección', 'address', 'domicilio', 'calle'],
  fecha_nacimiento:    ['fecha_nacimiento', 'fecha nacimiento', 'birthdate', 'birth_date', 'nacimiento', 'fnac'],
  num_seguridad_social:['num_seguridad_social', 'seguridad social', 'nss', 'social_security', 'numero seguridad'],
  observaciones:       ['observaciones', 'notas', 'notes', 'observations', 'comentarios'],
};

function normalise(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9 _]/g, '')
    .trim();
}

function autoMapColumns(headers) {
  const map = {}; // csvHeader → fieldName | ''
  for (const h of headers) {
    const norm = normalise(h);
    let matched = '';
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.some(a => norm === normalise(a))) {
        matched = field;
        break;
      }
    }
    map[h] = matched;
  }
  return map;
}

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Parse a CSV buffer/string and return { headers, rows, preview, totalRows, columnMap }.
 */
function previewCsv(fileContent) {
  const parsed = parseCsv(fileContent);
  if (!parsed.length) throw new Error('El archivo CSV está vacío');

  const headers = parsed[0];
  const dataRows = parsed.slice(1);
  const columnMap = autoMapColumns(headers);

  return {
    headers,
    preview:   dataRows.slice(0, 8).map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] || ''; });
      return obj;
    }),
    totalRows: dataRows.length,
    allRows:   dataRows,
    columnMap,
  };
}

module.exports = { previewCsv, parseCsv, FIELD_ALIASES };
