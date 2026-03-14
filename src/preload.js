const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  auth: {
    login: (username, password) => ipcRenderer.invoke('auth:login', username, password),
    logout: () => ipcRenderer.invoke('auth:logout'),
    changePassword: (username, oldPassword, newPassword) =>
      ipcRenderer.invoke('auth:changePassword', username, oldPassword, newPassword),
    onForceLogout: (callback) => ipcRenderer.on('auth:forceLogout', callback)
  },

  session: {
    resetTimer: () => ipcRenderer.invoke('session:resetTimer')
  },
  
  clients: {
    getAll: () => ipcRenderer.invoke('clients:getAll'),
    getById: (id) => ipcRenderer.invoke('clients:getById', id),
    search: (filters) => ipcRenderer.invoke('clients:search', filters),
    create: (data) => ipcRenderer.invoke('clients:create', data),
    update: (id, data) => ipcRenderer.invoke('clients:update', id, data),
    delete: (id) => ipcRenderer.invoke('clients:delete', id),
    getAuditLog: (id) => ipcRenderer.invoke('clients:getAuditLog', id),
    exportCsv: (filters) => ipcRenderer.invoke('clients:exportCsv', filters),
  },
  
  treatments: {
    getAll: () => ipcRenderer.invoke('treatments:getAll'),
    create: (data) => ipcRenderer.invoke('treatments:create', data),
    update: (id, data) => ipcRenderer.invoke('treatments:update', id, data),
    delete: (id) => ipcRenderer.invoke('treatments:delete', id)
  },
  
  invoices: {
    getAll: () => ipcRenderer.invoke('invoices:getAll'),
    getById: (id) => ipcRenderer.invoke('invoices:getById', id),
    create: (data) => ipcRenderer.invoke('invoices:create', data),
    update: (id, data) => ipcRenderer.invoke('invoices:update', id, data),
    delete: (id) => ipcRenderer.invoke('invoices:delete', id),
    getNextNumber: () => ipcRenderer.invoke('invoices:getNextNumber'),
    updateEstado: (id, estado, fechaPago, metodoPago) =>
      ipcRenderer.invoke('invoices:updateEstado', id, estado, fechaPago, metodoPago),
    createRectificativa: (originalId) =>
      ipcRenderer.invoke('invoices:createRectificativa', originalId),
    generatePdf: (id) => ipcRenderer.invoke('invoices:generatePdf', id),
  },
  
  clinicHistory: {
    getByClient: (clienteId) => ipcRenderer.invoke('clinicHistory:getByClient', clienteId),
    getById: (id) => ipcRenderer.invoke('clinicHistory:getById', id),
    create: (data) => ipcRenderer.invoke('clinicHistory:create', data),
    update: (id, data) => ipcRenderer.invoke('clinicHistory:update', id, data),
    delete: (id) => ipcRenderer.invoke('clinicHistory:delete', id),
    migrateEncryption: () => ipcRenderer.invoke('clinicHistory:migrateEncryption'),
    getFilesByClient: (clienteId) => ipcRenderer.invoke('clinicHistory:getFilesByClient', clienteId),
    getFileData: (fileId) => ipcRenderer.invoke('clinicHistory:getFileData', fileId),
    addFile: (historiaId) => ipcRenderer.invoke('clinicHistory:addFile', historiaId),
    deleteFile: (fileId) => ipcRenderer.invoke('clinicHistory:deleteFile', fileId),
    search: (query) => ipcRenderer.invoke('clinicHistory:search', query),
  },
  
  accounting: {
    getReport: (startDate, endDate) => ipcRenderer.invoke('accounting:getReport', startDate, endDate),
    getVatReport: (year, quarter) => ipcRenderer.invoke('accounting:getVatReport', year, quarter),
    getMonthlyChart: (year) => ipcRenderer.invoke('accounting:getMonthlyChart', year),
    getTopTreatments: (startDate, endDate) =>
      ipcRenderer.invoke('accounting:getTopTreatments', startDate, endDate),
    getRevenuePerClient: (startDate, endDate) =>
      ipcRenderer.invoke('accounting:getRevenuePerClient', startDate, endDate),
    exportCsv: (type, startDate, endDate, year, quarter) =>
      ipcRenderer.invoke('accounting:exportCsv', type, startDate, endDate, year, quarter),
  }
});
