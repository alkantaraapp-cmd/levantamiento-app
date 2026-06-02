/**
 * ============================================================
 * GOOGLE APPS SCRIPT — Sistema de Levantamiento v3
 * Vinculado al Sheet — sin SPREADSHEET_ID
 * ============================================================
 * INSTRUCCIONES:
 * 1. Abre tu Google Sheet
 * 2. Extensiones → Apps Script
 * 3. Borra todo y pega este código
 * 4. Guarda (Ctrl+S)
 * 5. Ejecuta primero: testConexion
 * 6. Si sale OK → Implementar → Nueva implementación
 *    - Tipo: Aplicación web
 *    - Ejecutar como: Yo
 *    - Acceso: Cualquier usuario
 * 7. Copia la URL → pégala en app.js CFG.SCRIPT_URL
 * ============================================================
 */

var CARPETA_FOTOS = 'Fotos_Levantamiento';

// ============================================================
// TEST — ejecuta esto primero para verificar acceso
// ============================================================
function testConexion() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('OK - Sheet: ' + ss.getName());
}

// TEST FOTO — ejecuta esto para probar que la URL se guarda bien
function testFoto() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var ws  = ss.getSheetByName('Datos') || ss.getSheets()[0];
  // URL real del formato que llega desde Drive
  var url = 'https://drive.google.com/file/d/1Phn-JwK6yrPot6x4iH0GLCcmAa2xvfDR/view?usp=drivesdk';
  var row = ws.getLastRow() + 1;
  ws.getRange(row, 1).setValue('TEST FOTO');
  // Forzar formato texto en la celda antes de escribir
  var celda = ws.getRange(row, 2);
  celda.setNumberFormat('@STRING@');
  celda.setValue(url);
  Logger.log('OK - URL guardada en fila ' + row + ' col 2');
}

// ============================================================
// Función auxiliar — convierte cualquier valor a texto seguro
// ============================================================
function str(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

// ============================================================
// Limpia coordenadas para que funcionen en Google Maps
// Formato correcto: 18.486100 (numero puro, punto decimal)
// ============================================================
function coord(val) {
  if (val === null || val === undefined) return '';
  var s = String(val).trim();
  if (s === '') return '';
  // Eliminar cualquier caracter que no sea numero, punto o signo negativo
  s = s.replace(/[^0-9.\-]/g, '');
  // Convertir a numero y volver a string para limpiar ceros extra
  var n = parseFloat(s);
  if (isNaN(n)) return '';
  // Retornar como numero (no texto) para que Sheets lo reconozca como coordenada
  return n;
}

// Genera enlace directo a Google Maps con las coordenadas
function linkMaps(lat, lng) {
  var la = coord(lat);
  var lo = coord(lng);
  if (la === '' || lo === '') return '';
  return 'https://www.google.com/maps?q=' + la + ',' + lo;
}

// ============================================================
// Recibe POST desde la app
// ============================================================
function doPost(e) {
  try {
    var raw = e.postData.contents;
    var data = JSON.parse(raw);
    var sheetName = str(data.sheet) || 'General';

    // Subir foto a Drive si hay
    var fotoUrl = '';
    if (data.photo_data && str(data.photo_data).indexOf('data:image') === 0) {
      fotoUrl = subirFoto(data.photo_data, sheetName, data.localId);
    }

    guardarFila(sheetName, data, fotoUrl);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    Logger.log('ERROR doPost: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// Guarda una fila en la hoja correcta
// ============================================================
function guardarFila(sheetName, data, fotoUrl) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var ws   = ss.getSheetByName(sheetName);
  var fila = [];
  var cols = [];

  // ---- Definir columnas y valores según el formulario ----
  if (sheetName === 'Contribuyentes') {
    cols = [
      'Fecha','Usuario','Nombres','Apellidos','Cedula',
      'Telefono 1','Telefono 2','Tipo Cliente','Categoria','Tarifa',
      'Georeferencia','Sector','Calle','Casa Numero','Referencia',
      'Latitud','Longitud','Google Maps','Publicidad','Tipo Letrero','Cantidad','Medida',
      'Foto','Poligono','Fecha Levantamiento','Levantado Por'
    ];
    fila = [
      formatFecha(data.fecha),
      str(data.userName),
      str(data.nombres),
      str(data.apellidos),
      str(data.cedula),
      str(data.tel1),
      str(data.tel2),
      str(data.tipo_cliente),
      str(data.categoria),
      str(data.tarifa),
      str(data.georef),
      str(data.sector),
      str(data.calle),
      str(data.casa_num),
      str(data.referencia),
      coord(data.lat),
      coord(data.lng),
      linkMaps(data.lat, data.lng),
      str(data.publicidad),
      str(data.tipo_letrero),
      str(data.cantidad),
      str(data.medida),
      fotoUrl,
      str(data.poligono),
      str(data.fecha),
      str(data.levantado_por)
    ];

  } else if (sheetName === 'Datos') {
    cols = [
      'Fecha','Usuario','Nombre','RMC','Tipo Cliente',
      'Latitud','Longitud','Google Maps','Tipo Letrero','Caracteristica',
      'Cantidad','Medida','Foto','Poligono',
      'Observacion','Fecha Levantamiento','Levantado Por'
    ];
    fila = [
      formatFecha(data.fecha),
      str(data.userName),
      str(data.nombre),
      str(data.rmc),
      str(data.tipo_cliente),
      coord(data.lat),
      coord(data.lng),
      linkMaps(data.lat, data.lng),
      str(data.tipo_letrero),
      str(data.caracteristica),
      str(data.cantidad),
      str(data.medida),
      fotoUrl,
      str(data.poligono),
      str(data.observacion),
      str(data.fecha),
      str(data.levantado_por)
    ];

  } else if (sheetName === 'Construccion') {
    cols = [
      'Fecha','Usuario','Latitud','Longitud','Google Maps',
      'Foto','Poligono','Observacion','Fecha Levantamiento','Levantado Por'
    ];
    fila = [
      formatFecha(data.fecha),
      str(data.userName),
      coord(data.lat),
      coord(data.lng),
      linkMaps(data.lat, data.lng),
      fotoUrl,
      str(data.poligono),
      str(data.observacion),
      str(data.fecha),
      str(data.levantado_por)
    ];

  } else {
    // Formulario personalizado — columnas dinámicas
    var excluir = ['formId','formName','sheet','status','localId','photo_data','userId'];
    var keys = [];
    for (var k in data) {
      if (data.hasOwnProperty(k) && excluir.indexOf(k) === -1) {
        keys.push(k);
      }
    }
    cols = keys.concat(['Foto']);
    fila = keys.map(function(k) { return str(data[k]); }).concat([fotoUrl]);
  }

  // Crear hoja con encabezados si no existe
  if (!ws) {
    ws = ss.insertSheet(sheetName);
    ws.appendRow(cols);
    var r = ws.getRange(1, 1, 1, cols.length);
    r.setBackground('#1a3c5e')
     .setFontColor('#ffffff')
     .setFontWeight('bold')
     .setFontSize(11);
    ws.setFrozenRows(1);
  }

  // Agregar fila de datos
  ws.appendRow(fila);

  // Guardar URL de foto como texto puro y Maps como enlace
  var lastRow = ws.getLastRow();

  // Columna Foto — texto plano forzado
  var fotoIdx = cols.indexOf('Foto');
  if (fotoUrl && fotoIdx >= 0) {
    var fotoCelda = ws.getRange(lastRow, fotoIdx + 1);
    fotoCelda.setNumberFormat('@STRING@');
    fotoCelda.setValue(str(fotoUrl));
  }

  // Columna Google Maps — enlace directo clickeable
  var mapsIdx = cols.indexOf('Google Maps');
  if (mapsIdx >= 0) {
    var mapsUrl = linkMaps(data.lat, data.lng);
    if (mapsUrl) {
      var mapsCelda = ws.getRange(lastRow, mapsIdx + 1);
      mapsCelda.setNumberFormat('@STRING@');
      mapsCelda.setValue(mapsUrl);
    }
  }
}

// ============================================================
// Sube foto a Google Drive y retorna el enlace
// ============================================================
function subirFoto(photoData, sheetName, localId) {
  try {
    var raiz      = obtenerCarpeta(CARPETA_FOTOS, null);
    var subcarpeta = obtenerCarpeta(sheetName || 'General', raiz);
    var base64    = photoData.split(',')[1];
    var mime      = photoData.split(';')[0].split(':')[1] || 'image/jpeg';
    var ext       = mime.indexOf('png') >= 0 ? 'png' : 'jpg';
    var nombre    = 'foto_' + (localId || Date.now()) + '.' + ext;
    var blob      = Utilities.newBlob(Utilities.base64Decode(base64), mime, nombre);
    var archivo   = subcarpeta.createFile(blob);
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    // URL minima — solo el ID, sin parametros extra que puedan causar problemas
    var id = archivo.getId();
    return 'https://drive.google.com/file/d/' + id + '/view';
  } catch(err) {
    Logger.log('Error foto: ' + err.toString());
    return '';
  }
}

// ============================================================
// Helpers
// ============================================================
function obtenerCarpeta(nombre, parent) {
  var lista = parent ? parent.getFoldersByName(nombre) : DriveApp.getFoldersByName(nombre);
  if (lista.hasNext()) return lista.next();
  return parent ? parent.createFolder(nombre) : DriveApp.createFolder(nombre);
}

function formatFecha(iso) {
  if (!iso) return '';
  try {
    return Utilities.formatDate(new Date(iso), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  } catch(e) { return str(iso); }
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', version: 3 }))
    .setMimeType(ContentService.MimeType.JSON);
}
