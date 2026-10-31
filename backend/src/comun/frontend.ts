import express from 'express';
import path from 'node:path';

export function servirFrontend(ruta: string) {
  const router = express.Router();
  if (!ruta) return router;
  const directorio = path.resolve(ruta);
  router.use(express.static(directorio, {
    setHeaders(res, archivo) {
      if (archivo.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      else if (/\.[a-f0-9]{8,}\./i.test(path.basename(archivo))) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }));
  router.use((req, res, next) => {
    if (req.method !== 'GET') { next(); return; }
    res.sendFile(path.join(directorio, 'index.html'), (error) => { if (error) next(error); });
  });
  return router;
}
