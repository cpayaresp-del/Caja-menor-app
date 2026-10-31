const fs = require('node:fs');
const path = require('node:path');

const destino = path.resolve(__dirname, '../src/environments/environment.ts');
if (!fs.existsSync(destino)) {
  fs.copyFileSync(path.resolve(__dirname, '../src/environments/environment.example.ts'), destino);
}
