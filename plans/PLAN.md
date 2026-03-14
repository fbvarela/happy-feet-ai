# Plan: Happy Feet - Podiatry Office Management App

## Overview
Desktop app for managing a podiatry office in Galapagar, Madrid, Spain. Built with Electron, local SQLite storage, encrypted data.

---

## Módulos Principales

### 1. Servicios de Oficina (Office Services)
- CRUD de tratamientos
- Precio por tratamiento (IVA incluido)
- Catálogo de servicios

### 2. Gestión de Clientes (Client Management)
- Datos personales del cliente
- Tratamientos realizados y costos
- Historial de tratamientos por cliente
- Generación de facturas

### 3. Historia Clínica (Clinic History)
- Registro de tratamientos por paciente
- Notas clínicas
- **Cifrado de datos con algoritmo estándar** (AES-256)
- Documentos e imágenes asociados (cifrados localmente)

### 4. Contabilidad y Fiscalidad (Accounting & Tax)
- Contabilidad por cliente y tratamiento
- Facturación estándar:
  - Número de factura
  - Conceptos
  - Impuestos (IVA)
  - Subtotales y total
- Informe trimestral de IVA
- Informes: diarios, semanales, mensuales
- Gráficos de ingresos

---

## Requisitos Técnicos

### Seguridad (RGPD/LGPD)
- Sin conexión a internet (datos locales exclusivamente)
- Cifrado de todos los datos (incluyendo imágenes/documentos)
- Un único usuario admin
- Sin servidor externo

### Tecnología
- Electron (app autocontenida)
- SQLite3 (almacenamiento local)
- Cifrado: AES-256-GCM para datos sensibles
- Solo español (sin multilenguaje)

### Almacenamiento
- SQLite3 para datos estructurados
- Archivos locales cifrados para imágenes/documentos

### UI/UX
- Enfoque funcional sobre diseño
- Orientado a profesional sanitario

---

## Fases de Desarrollo

### Fase 1: Estructura Base
- [ ] Configuración Electron
- [ ] Sistema de navegación entre módulos
- [ ] Base de datos SQLite3 local
- [ ] Sistema de autenticación (admin local)

### Fase 2: Servicios de Oficina
- [ ] CRUD tratamientos
- [ ] Gestión de precios

### Fase 3: Gestión de Clientes
- [ ] CRUD clientes
- [ ] Registro de tratamientos por cliente
- [ ] Historial de facturación

### Fase 4: Historia Clínica
- [ ] Registro de clínica por paciente
- [ ] Sistema de notas
- [ ] Cifrado de datos clínicos
- [ ] Almacenamiento de imágenes/documentos cifrados

### Fase 5: Contabilidad y Facturación
- [ ] Generación de facturas (formato estándar)
- [ ] Cálculo de IVA
- [ ] Informes trimestrales de IVA
- [ ] Informes diarios/semanales
- [ ] Gráficos de ingresos

### Fase 6: Seguridad y Cifrado
- [ ] Implementar cifrado AES-256-GCM
- [ ] Cifrar base de datos
- [ ] Cifrar archivos adjuntos

---

## Estructura de Datos (Boceto)

```
clients
- id, nombre, apellidos, dni, teléfono, email, dirección, fecha_alta

treatments
- id, nombre, descripción, precio, activo

invoices
- id, cliente_id, número_factura, fecha, subtotal, iva, total

invoice_items
- id, factura_id, tratamiento_id, cantidad, precio, iva

clinic_history
- id, cliente_id, fecha, tratamiento_id, notas (cifrado), archivos (cifrados)
```
