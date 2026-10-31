const fs = require('node:fs');
const path = require('node:path');

const archivo = process.argv[2] || path.resolve(__dirname, '../.env');
if (!fs.existsSync(archivo)) {
  console.error(`No se encontró el archivo de ambiente: ${archivo}`);
  process.exit(1);
}

const valores = {};
for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/u)) {
  const coincidencia = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/u);
  if (coincidencia) valores[coincidencia[1]] = coincidencia[2].replace(/^(['"])(.*)\1$/u, '$2');
}
const requeridas = ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL', 'MIGRATE_TOKEN', 'S3_BUCKET', 'S3_REGION', 'NODE_ENV'];
const faltantes = requeridas.filter((clave) => !valores[clave]);
if (faltantes.length) {
  console.error(`Faltan variables obligatorias: ${faltantes.join(', ')}`);
  process.exit(1);
}
if (valores.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET debe tener al menos 32 caracteres');
  process.exit(1);
}
if (valores.NODE_ENV !== 'production') {
  console.error('NODE_ENV debe ser production en el despliegue');
  process.exit(1);
}
try {
  const baseDatos = new URL(valores.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(baseDatos.protocol)) throw new Error('Protocolo inválido');
} catch {
  console.error('DATABASE_URL debe ser una URL válida de PostgreSQL');
  process.exit(1);
}
if (valores.FRONTEND_URL.split(',').some((origen) => {
  try {
    const url = new URL(origen.trim());
    return url.protocol !== 'https:' || url.origin !== origen.trim();
  } catch { return true; }
})) {
  console.error('FRONTEND_URL debe contener únicamente orígenes HTTPS válidos');
  process.exit(1);
}
console.log('Configuración de despliegue válida.');
