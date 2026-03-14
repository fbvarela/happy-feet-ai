# Happy Feet — Mejoras Propuestas

Análisis de la aplicación actual y propuestas de mejora organizadas por área.

---

## 1. Funcionalidad

### 1.1 Seguridad y Encriptación (Prioritario)

- **Cifrado AES-256-GCM para notas clínicas** — Los datos clínicos son sensibles (LOPD/GDPR). Las notas en `clinic_history` se guardan en texto plano; deben cifrarse antes de persistir en SQLite.
- **Cifrado de archivos adjuntos** — El campo `archivos` en `clinic_history` almacena rutas o blobs sin cifrar.
- **Cifrado de la base de datos en reposo** — Evaluar SQLCipher (extensión de SQLite con cifrado transparente) como alternativa al cifrado campo a campo.
- **Cambio de credenciales por defecto** — Al primer arranque, forzar al usuario a cambiar la contraseña `admin123` antes de continuar.
- **Sesión con timeout** — Cerrar sesión automáticamente tras un periodo de inactividad configurable (p. ej. 15 min).
- **Búsqueda avanzada** — Filtros combinables por nombre, DNI, teléfono, fecha de alta y estado activo/inactivo.
- **Paginación real** — La tabla de clientes carga todos los registros en memoria; implementar paginación en la base de datos (`LIMIT / OFFSET`) para escalar.
- **Historial de cambios** — Registrar quién y cuándo modificó un registro (tabla `audit_log`).
- **Exportar listado** — Exportar clientes a CSV o PDF para copias de seguridad o envío a gestoría.
- **Campos adicionales** — Fecha de nacimiento, número de seguridad social, y campo libre de observaciones generales.

### 1.3 Historia Clínica

- **Adjuntos múltiples** — El esquema actual permite un único campo `archivos`; cambiar a tabla `clinic_history_files` (1→N).
- **Visor de archivos integrado** — Abrir imágenes y PDFs adjuntos dentro de la app sin depender del sistema operativo.
- **Plantillas de notas** — Textos predefinidos para tratamientos frecuentes (p. ej. "Tratamiento de uña incarnada estándar") para agilizar el registro.
- **Búsqueda dentro del historial** — Buscar por texto libre en el campo `notas` entre todos los pacientes.
- **Línea de tiempo visual** — Mostrar las visitas como timeline en lugar de lista plana.

### 1.4 Facturación y Contabilidad

- **Edición de facturas** — Actualmente, las facturas solo se pueden eliminar; permitir modificar líneas mientras no estén "cerradas".
- **Estados de factura** — Borrador, Emitida, Pagada, Anulada. Registrar fecha de pago.
- **Métodos de pago** — Campo para indicar efectivo, tarjeta, transferencia, etc.
- **Rectificativas / abonos** — Generar una factura rectificativa vinculada a la original.
- **PDF de factura** — Generar y guardar/imprimir la factura en PDF con el logo de la clínica (usar `electron-print` o `puppeteer`).
- **Recordatorios de cobro** — Alertas visuales para facturas sin marcar como pagadas pasados N días.
- **Informes ampliados** — Gráfico de ingresos mensuales, ranking de tratamientos más demandados, ingresos por cliente.
- **Exportar informes** — Descargar los informes de contabilidad e IVA como CSV/Excel para el asesor fiscal.

### 1.5 Tratamientos

- **Categorías de tratamientos** — Agrupar servicios (p. ej. "Uñas", "Biomecánica", "Ortopedia") para mejorar la selección en facturas e historial.
- **Historial de precios** — Registrar cambios de precio con fecha de efectividad para que facturas antiguas reflejen el precio correcto.
- **Duración estimada** — Campo de duración por tratamiento, útil para una futura agenda.

### 1.6 Funcionalidades Nuevas

- **Agenda / Citas** — Módulo de calendario para programar citas, con vistas diaria, semanal y mensual. Notificaciones de escritorio con `Notification` API de Electron.
- **Copia de seguridad automática** — Programar backups de la base de datos SQLite a una carpeta local o en red, con retención configurable.
- **Importación de datos** — Importar clientes desde CSV para migraciones desde otros sistemas.
- **Multi-usuario** — Soporte para usuarios con distintos roles (admin, recepción, podólogo) con permisos granulares.
- **Dashboard de inicio** — Pantalla de resumen al iniciar sesión: citas del día, últimas facturas, estadísticas del mes.

---

## 2. Estilo y UX

### 2.1 Layout y Navegación

- **Sidebar colapsable** — Permitir ocultar la barra lateral a iconos (64px) para ganar espacio en pantallas pequeñas o portátiles.
- **Breadcrumbs** — Indicador de ruta dentro de módulos anidados (p. ej. Contabilidad > Facturas > Factura #0042).
- **Tabs con contador de registros** — Mostrar el número de elementos activos en cada pestaña del sidebar (p. ej. "Clientes (47)").
- **Accesos directos de teclado** — Atajos para las acciones más comunes: `Ctrl+N` para nuevo registro, `Ctrl+F` para buscar, `Esc` para cerrar modal.

### 2.2 Tablas y Listas

- **Ordenación por columna** — Click en cabecera para ordenar ascendente/descendente.
- **Columnas redimensionables** — Arrastrar el borde de las columnas para ajustar su anchura.
- **Filas con densidad configurable** — Modo compacto (más filas visibles) y modo cómodo (más espacio entre filas).
- **Selección múltiple** — Checkbox por fila para operaciones en lote (p. ej. exportar seleccionados).
- **Estado vacío más descriptivo** — Cuando no hay resultados de búsqueda, mostrar la consulta realizada y sugerencia de acción.

### 2.3 Formularios y Modales

- **Validación en tiempo real** — Marcar campos inválidos mientras el usuario escribe, no solo al enviar.
- **Autocompletado de cliente en facturas** — Campo de búsqueda que filtra mientras se escribe en lugar de un `<select>` con todos los clientes.
- **Confirmación de cierre con cambios pendientes** — Si el usuario intenta cerrar un modal con el formulario modificado, mostrar aviso.
- **Tamaño de modal adaptable** — El modal de factura con líneas de detalle necesita más espacio; ajustar `max-width` según el módulo.
- **Labels flotantes (floating labels)** — Reemplazar labels estáticos por el patrón `label` superpuesto al `input` para una apariencia más moderna.

### 2.4 Feedback Visual y Micro-interacciones

- **Toast notifications** — Reemplazar `alert()` nativo del sistema por notificaciones toast no bloqueantes en la esquina inferior-derecha con auto-cierre.
- **Loading states** — Spinner o skeleton screen al cargar datos desde la base de datos para operaciones que puedan tardar.
- **Confirmación de eliminación mejorada** — Modal de confirmación con el nombre del elemento a eliminar en lugar de `confirm()` del sistema.
- **Indicador de estado de guardado** — "Guardado" o marca de verificación temporal tras una operación exitosa.
- **Animación de entrada en tablas** — Fade-in escalonado de filas al cargar la tabla (actualmente ya hay animaciones globales; aplicarlas también a nivel de fila).

### 2.5 Tipografía y Color

- **Jerarquía tipográfica más clara** — El tamaño de fuente de las celdas de tabla (14px) y los labels de formulario (13px) están muy próximos; aumentar contraste de tamaño.
- **Modo oscuro** — Implementar un toggle de tema oscuro/claro con `prefers-color-scheme` como valor por defecto y posibilidad de forzarlo.
- **Paleta de color coherente** — El `--color-accent` (cyan) aparece solo en elementos terciarios; unificar criterio o eliminar para reducir el número de colores de acción.
- **Focus visible** — Mejorar el estilo del estado `:focus` en inputs y botones para accesibilidad con teclado (actualmente puede no ser suficientemente visible).

### 2.6 Accesibilidad

- **ARIA labels** — Añadir atributos `aria-label`, `aria-describedby` y roles semánticos a modales, tablas y botones de icono.
- **Contraste de color** — Verificar que todos los textos sobre fondos de color superen el ratio WCAG AA (4.5:1 para texto normal).
- **Navegación por teclado** — Asegurar que todos los flujos principales (crear cliente, emitir factura, añadir nota) sean completables sin ratón.

### 2.7 Branding y Pulido Visual

- **Logo/icono de app** — Sustituir el emoji 🦶 por un icono SVG personalizado tanto en la interfaz como en el `dock`/barra de tareas del sistema operativo.
- **Pantalla de carga (splash screen)** — Mostrar un splash screen mientras Electron inicializa la ventana y carga la base de datos.
- **Favicon / icono de ventana** — Configurar el icono de la ventana (`win.setIcon()`) con el logo de la clínica.
- **Nombre de ventana dinámico** — Mostrar el nombre de la clínica en la barra de título (configurable desde ajustes).

---

## 3. Rendimiento y Calidad de Código

- **Debounce en búsquedas** — Las búsquedas en tabla se ejecutan en cada pulsación de tecla; añadir `debounce` de ~250ms para reducir consultas a la base de datos.
- **Caché inteligente** — Invalidar la caché de clientes/tratamientos solo cuando se produce una mutación, no en cada vista.
- **renderer.js modular** — El fichero de 57KB es un monolito; dividirlo en módulos ES por sección (clientes.js, facturas.js, etc.) para mantenibilidad.
- **Migraciones de base de datos versionadas** — Implementar un sistema de migraciones numeradas en lugar de `CREATE TABLE IF NOT EXISTS` para gestionar cambios de esquema de forma segura.
- **Tests unitarios** — Añadir tests para los handlers IPC y la lógica de base de datos con Jest + mejor-sqlite3 en modo memoria.

---

## Priorización Sugerida


| Prioridad | Mejora                                                  |
| --------- | ------------------------------------------------------- |
| Alta      | Cifrado AES-256-GCM para datos clínicos                |
| Alta      | Forzar cambio de contraseña en primer arranque         |
| Alta      | Toast notifications (eliminar`alert`/`confirm` nativos) |
| Alta      | PDF de facturas                                         |
| Media     | Agenda / Citas                                          |
| Media     | Copia de seguridad automática                          |
| Media     | Modo oscuro                                             |
| Media     | Ordenación y paginación en tablas                     |
| Baja      | Multi-usuario con roles                                 |
| Baja      | Módulo de importación CSV                             |
| Baja      | Accesibilidad WCAG AA                                   |
