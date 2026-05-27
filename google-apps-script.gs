/**
 * ============================================================
 * GOOGLE APPS SCRIPT — Backend Sistema de Levantamiento
 * ============================================================
 * INSTRUCCIONES:
 * 1. Ve a https://script.google.com → Nuevo proyecto
 * 2. Pega este código completo
 * 3. Reemplaza SPREADSHEET_ID con el ID de tu Google Sheet
 * 4. Implementar → Nueva implementación → Aplicación web
 *    - Ejecutar como: Yo
 *    - Acceso: Cualquier usuario
 * 5. Copia la URL y pégala en app.js → CFG.SCRIPT_URL
 * ============================================================
 */

const SPREADSHEET_ID = 'TU_SPREADSHEET_ID_AQUI';

// Columnas para cada formulario
const SCHEMAS = {
  Contribuyentes: [
    'Fecha','Usuario','Nombres','Apellidos','Cedula','Telefono1','Telefono2',
    'TipoCliente','Categoria','TarifaMensual',
    'Georeferencia','Sector','Calle','CasaNumero','Referencia','Latitud','Longitud',
    'Publicidad','TipoLetrero','Cantidad','Medida',
    'Foto','Poligono','FechaLevantamiento','LevantadoPor'
  ],
  Datos: [
    'Fecha','Usuario','Nombre','RMC','TipoCliente','Latitud','Longitud',
    'TipoLetrero','Caracteristica','Cantidad','Medida',
    'Foto','Poligono','Observacion','FechaLevantamiento','LevantadoPor'
  ],
  Construccion: [
    'Fecha','Usuario','Latitud','Longitud',
    'Foto','Poligono','Observacion','FechaLevantamiento','LevantadoPor'
  ],
};

// Mapeo de campos del JSON a columnas
const FIELD_MAP = {
  Contribuyentes: {
    Fecha: d => d.fecha || '',
    Usuario: d => d.userName || '',
    Nombres: d => d.nombres || '',
    Apellidos: d => d.apellidos || '',
    Cedula: d => d.cedula || '',
    Telefono1: d => d.tel1 || '',
    Telefono2: d => d.tel2 || '',
    TipoCliente: d => d.tipo_cliente || '',
    Categoria: d => d.categoria || '',
    TarifaMensual: d => d.tarifa || '',
    Georeferencia: d => d.georef || '',
    Sector: d => d.sector || '',
    Calle: d => d.calle || '',
    CasaNumero: d => d.casa_num || '',
    Referencia: d => d.referencia || '',
    Latitud: d => d.lat || '',
    Longitud: d => d.lng || '',
    Publicidad: d => d.publicidad || '',
    TipoLetrero: d => d.tipo_letrero || '',
    Cantidad: d => d.cantidad || '',
    Medida: d => d.medida || '',
    Foto: d => d.photo_data ? 'Sí (adjunto)' : 'No',
    Poligono: d => d.poligono || '',
    FechaLevantamiento: d => d.fecha_lev || '',
    LevantadoPor: d => d.levantado_por || '',
  },
  Datos: {
    Fecha: d => d.fecha || '',
    Usuario: d => d.userName || '',
    Nombre: d => d.nombre || '',
    RMC: d => d.rmc || '',
    TipoCliente: d => d.tipo_cliente || '',
    Latitud: d => d.lat || '',
    Longitud: d => d.lng || '',
    TipoLetrero: d => d.tipo_letrero || '',
    Caracteristica: d => d.caracteristica || '',
    Cantidad: d => d.cantidad || '',
    Medida: d => d.medida || '',
    Foto: d => d.photo_data ? 'Sí (adjunto)' : 'No',
    Poligono: d => d.poligono || '',
    Observacion: d => d.observacion || '',
    FechaLevantamiento: d => d.fecha || '',
    LevantadoPor: d => d.levantado_por || '',
  },
  Construccion: {
    Fecha: d => d.fecha || '',
    Usuario: d => d.userName || '',
    Latitud: d => d.lat || '',
    Longitud: d => d.lng || '',
    Foto: d => d.photo_data ? 'Sí (adjunto)' : 'No',
    Poligono: d => d.poligono || '',
    Observacion: d => d.observacion || '',
    FechaLevantamiento: d => d.fecha || '',
    LevantadoPor: d => d.levantado_por || '',
  },
};

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheetName = data.sheet || 'General';
    const schema = SCHEMAS[sheetName];
    const fieldMap = FIELD_MAP[sheetName];

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let ws = ss.getSheetByName(sheetName);

    if (!ws) {
      ws = ss.insertSheet(sheetName);
      if (schema) {
        ws.appendRow(schema);
        const headerRange = ws.getRange(1, 1, 1, schema.length);
        headerRange.setBackground('#1a3c5e').setFontColor('#ffffff').setFontWeight('bold');
        ws.setFrozenRows(1);
      }
    }

    let row;
    if (schema && fieldMap) {
      row = schema.map(col => fieldMap[col] ? fieldMap[col](data) : '');
    } else {
      // Formulario personalizado: columnas dinámicas
      const keys = Object.keys(data).filter(k => !['formId','formName','sheet','status','localId','photo_data'].includes(k));
      if (ws.getLastRow() === 0) {
        ws.appendRow(keys);
        ws.getRange(1, 1, 1, keys.length).setBackground('#1a3c5e').setFontColor('#ffffff').setFontWeight('bold');
      }
      row = keys.map(k => data[k] || '');
    }

    ws.appendRow(row);

    // Guardar foto en Drive si existe
    if (data.photo_data && data.photo_data.startsWith('data:image')) {
      try {
        const base64 = data.photo_data.split(',')[1];
        const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', `foto_${Date.now()}.jpg`);
        const folder = getOrCreateFolder(sheetName);
        const file = folder.createFile(blob);
        // Actualizar la última fila con la URL de la foto
        const lastRow = ws.getLastRow();
        const fotoCol = schema ? schema.indexOf('Foto') + 1 : 0;
        if (fotoCol > 0) ws.getRange(lastRow, fotoCol).setValue(file.getUrl());
      } catch(photoErr) {
        Logger.log('Error guardando foto: ' + photoErr);
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    Logger.log('Error: ' + err);
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', app: 'Sistema de Levantamiento' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateFolder(name) {
  const folderName = 'Fotos_Levantamiento_' + name;
  const folders = DriveApp.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
}
