/**
 * ============================================================
 * GOOGLE APPS SCRIPT — Sistema de Levantamiento
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

// Nombre de la carpeta en Google Drive donde se guardan las fotos
const DRIVE_FOLDER_NAME = 'Fotos_Levantamiento';

// ============================================================
// Recibe datos POST desde la app
// ============================================================
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // 1. Subir foto a Drive y obtener enlace público
    let fotoUrl = '';
    if (data.photo_data && data.photo_data.startsWith('data:image')) {
      fotoUrl = subirFotoADrive(data.photo_data, data.sheet, data.localId);
    }

    // 2. Guardar datos en la hoja correcta
    const sheetName = data.sheet || 'General';
    guardarEnSheet(sheetName, data, fotoUrl);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, fotoUrl: fotoUrl }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    Logger.log('Error: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// Sube la foto a Google Drive y retorna el enlace
// ============================================================
function subirFotoADrive(photoData, sheetName, localId) {
  try {
    // Obtener o crear carpeta principal
    const carpetaPrincipal = obtenerOCrearCarpeta(DRIVE_FOLDER_NAME);

    // Subcarpeta por tipo de formulario
    const subcarpeta = obtenerOCrearCarpetaDentro(sheetName || 'General', carpetaPrincipal);

    // Decodificar base64
    const base64 = photoData.split(',')[1];
    const mimeType = photoData.split(';')[0].split(':')[1] || 'image/jpeg';
    const extension = mimeType.includes('png') ? 'png' : 'jpg';
    const nombreArchivo = `foto_${sheetName}_${localId || Date.now()}.${extension}`;

    // Crear archivo en Drive
    const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, nombreArchivo);
    const archivo = subcarpeta.createFile(blob);

    // Hacer el archivo accesible con enlace
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Retornar enlace directo de visualización
    return 'https://drive.google.com/file/d/' + archivo.getId() + '/view';

  } catch(err) {
    Logger.log('Error subiendo foto: ' + err.toString());
    return 'Error al subir foto';
  }
}

// ============================================================
// Guarda los datos en la hoja de Google Sheets
// ============================================================
function guardarEnSheet(sheetName, data, fotoUrl) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let ws = ss.getSheetByName(sheetName);

  // Definir columnas según el tipo de formulario
  const schemas = {
    'Contribuyentes': [
      'Fecha Registro','Usuario','Nombres','Apellidos','Cedula',
      'Telefono 1','Telefono 2','Tipo de Cliente','Categoria','Tarifa Mensual',
      'Georeferencia','Sector','Calle','Casa Numero','Referencia',
      'Latitud','Longitud','Publicidad','Tipo Letrero','Cantidad','Medida (ft²)',
      'Foto','Poligono','Fecha Levantamiento','Levantado Por'
    ],
    'Datos': [
      'Fecha Registro','Usuario','Nombre','RMC','Tipo de Cliente',
      'Latitud','Longitud','Tipo Letrero','Caracteristica','Cantidad','Medida (ft²)',
      'Foto','Poligono','Observacion','Fecha Levantamiento','Levantado Por'
    ],
    'Construccion': [
      'Fecha Registro','Usuario',
      'Latitud','Longitud',
      'Foto','Poligono','Observacion','Fecha Levantamiento','Levantado Por'
    ]
  };

  const schema = schemas[sheetName];

  // Crear hoja si no existe
  if (!ws) {
    ws = ss.insertSheet(sheetName);
    const headers = schema || ['Fecha','Usuario','Datos','Foto'];
    ws.appendRow(headers);
    // Estilo del encabezado
    const headerRange = ws.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#1a3c5e').setFontColor('#ffffff').setFontWeight('bold').setFontSize(11);
    ws.setFrozenRows(1);
    ws.setColumnWidth(headers.indexOf('Foto') + 1, 300); // Columna foto más ancha
  }

  // Construir fila según el formulario
  let fila;

  if (sheetName === 'Contribuyentes') {
    fila = [
      formatearFecha(data.fecha),
      data.userName || '',
      data.nombres || '',
      data.apellidos || '',
      data.cedula || '',
      data.tel1 || '',
      data.tel2 || '',
      data.tipo_cliente || '',
      data.categoria || '',
      data.tarifa || '',
      data.georef || '',
      data.sector || '',
      data.calle || '',
      data.casa_num || '',
      data.referencia || '',
      data.lat || '',
      data.lng || '',
      data.publicidad || '',
      data.tipo_letrero || '',
      data.cantidad || '',
      data.medida || '',
      fotoUrl,
      data.poligono || '',
      data.fecha_lev || data.f1_fecha || '',
      data.levantado_por || ''
    ];
  } else if (sheetName === 'Datos') {
    fila = [
      formatearFecha(data.fecha),
      data.userName || '',
      data.nombre || '',
      data.rmc || '',
      data.tipo_cliente || '',
      data.lat || '',
      data.lng || '',
      data.tipo_letrero || '',
      data.caracteristica || '',
      data.cantidad || '',
      data.medida || '',
      fotoUrl,
      data.poligono || '',
      data.observacion || '',
      data.fecha || '',
      data.levantado_por || ''
    ];
  } else if (sheetName === 'Construccion') {
    fila = [
      formatearFecha(data.fecha),
      data.userName || '',
      data.lat || '',
      data.lng || '',
      fotoUrl,
      data.poligono || '',
      data.observacion || '',
      data.fecha || '',
      data.levantado_por || ''
    ];
  } else {
    // Formulario personalizado — columnas dinámicas
    const keys = Object.keys(data).filter(k =>
      !['formId','formName','sheet','status','localId','photo_data','userId'].includes(k)
    );
    if (ws.getLastRow() === 0) {
      ws.appendRow([...keys, 'Foto']);
      ws.getRange(1, 1, 1, keys.length + 1).setBackground('#1a3c5e').setFontColor('#ffffff').setFontWeight('bold');
      ws.setFrozenRows(1);
    }
    fila = [...keys.map(k => data[k] || ''), fotoUrl];
  }

  ws.appendRow(fila);

  // Si hay enlace de foto, hacerlo clickeable con fórmula HYPERLINK
  if (fotoUrl && fotoUrl.startsWith('https://')) {
    const lastRow = ws.getLastRow();
    const fotoCol = (sheetName === 'Contribuyentes') ? 22
                  : (sheetName === 'Datos') ? 12
                  : (sheetName === 'Construccion') ? 5
                  : fila.length;
    if (fotoCol > 0) {
      ws.getRange(lastRow, fotoCol).setFormula(`=HYPERLINK("${fotoUrl}","Ver foto")`);
    }
  }
}

// ============================================================
// Helpers
// ============================================================
function obtenerOCrearCarpeta(nombre) {
  const folders = DriveApp.getFoldersByName(nombre);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(nombre);
}

function obtenerOCrearCarpetaDentro(nombre, parent) {
  const folders = parent.getFoldersByName(nombre);
  return folders.hasNext() ? folders.next() : parent.createFolder(nombre);
}

function formatearFecha(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  } catch(e) { return isoString; }
}

// Test de conectividad
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', app: 'Sistema de Levantamiento v2' }))
    .setMimeType(ContentService.MimeType.JSON);
}
