import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { createHash, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { z } from 'zod';
import { config, origenesPermitidos } from './config';
import { autenticar, crearToken, nombreCookie, opcionesCookie } from './comun/auth';
import { servirFrontend } from './comun/frontend';
import { logger } from './comun/logger';
import { validarOrigen } from './comun/origen-permitido';
import { prisma } from './comun/prisma';
import { validarClave } from './dominio/clave';
import { ErrorDeValidacion } from './dominio/errores';
import { permisosDe } from './dominio/permisos';
import { rutasApi } from './modulos/api';

const intentosMigracion = new Map<string, number[]>();
const categoriasBase = ['Transporte', 'Papelería', 'Aseo y cafetería', 'Mensajería', 'Mantenimiento', 'Otros'];
const esquemaLogin = z.object({
  email: z.string().trim().min(5).max(254).regex(/^[^@\s]+@[^@.]+(\.[^@.]+)+$/),
  clave: z.string().min(1).max(200)
}).strict();
const esquemaCambioClave = z.object({ claveActual: z.string().min(1), claveNueva: z.string().min(1).max(200) }).strict();
const esquemaSistemaBody = z.object({}).strict();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"], objectSrc: ["'none'"] } } }));
app.use(cors({ origin: origenesPermitidos, credentials: true }));
app.use(validarOrigen);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/health/listo', async (_req, res, next) => {
  let temporizador: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => { temporizador = setTimeout(() => reject(new Error('Tiempo de espera de base de datos agotado')), 2900); })
    ]);
    res.json({ ok: true });
  } catch (error) { next(error); }
  finally { if (temporizador) clearTimeout(temporizador); }
});

app.post('/api/v1/sistema/:accion', async (req, res) => {
  const accion = req.params.accion;
  if (!['migrar', 'seed'].includes(accion)) { res.sendStatus(404); return; }
  const migrateToken = config.MIGRATE_TOKEN;
  if (!migrateToken) { res.sendStatus(404); return; }
  const ip = req.ip ?? 'desconocida';
  const ahora = Date.now();
  const intentos = (intentosMigracion.get(ip) ?? []).filter((tiempo) => ahora - tiempo < 60_000);
  if (intentos.length >= 5) { res.status(429).json({ mensaje: 'Demasiados intentos. Espere un minuto.' }); return; }
  const consulta = z.object({ token: z.string().optional() }).strict().safeParse(req.query);
  const cuerpo = esquemaSistemaBody.safeParse(req.body ?? {});
  if (!consulta.success || !cuerpo.success) { res.status(400).json({ mensaje: 'La solicitud contiene campos inválidos' }); return; }
  const token = req.get('X-Migrate-Token') ?? consulta.data.token ?? '';
  const esperado = createHash('sha256').update(migrateToken).digest();
  const recibido = createHash('sha256').update(token).digest();
  if (!timingSafeEqual(esperado, recibido)) {
    intentos.push(ahora);
    intentosMigracion.set(ip, intentos);
    logger.warn({ prefijo: `sistema.${accion}`, ip, motivo: 'Token de administración rechazado' }, 'Operación de sistema rechazada');
    res.status(401).json({ mensaje: 'Token no válido' });
    return;
  }
  try {
    const salida = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(73829104)`;
      if (accion === 'migrar') {
        const salida = await new Promise<string>((resolve, reject) => {
          const comando = process.platform === 'win32' ? 'npx.cmd' : 'npx';
          const proceso = spawn(comando, ['prisma', 'db', 'push', '--schema', 'prisma/schema', '--skip-generate'], { cwd: path.resolve(__dirname, '..'), env: process.env, shell: process.platform === 'win32' });
          let texto = '';
          proceso.stdout.on('data', (dato: Buffer) => { texto += dato.toString(); });
          proceso.stderr.on('data', (dato: Buffer) => { texto += dato.toString(); });
          proceso.on('error', reject);
          proceso.on('close', (codigo) => codigo === 0 ? resolve(texto.slice(-4000)) : reject(new Error(texto.slice(-4000))));
        });
        await tx.auditoria.create({ data: { accion: 'sistema.migrar', entidad: 'Sistema', entidadId: 'esquema', ip } });
        return { ok: true as const, salida };
      }

      const lista = await tx.categoriaGasto.findMany({ select: { nombre: true } });
      const existentes = new Set(lista.map((categoria) => categoria.nombre));
      for (const nombre of categoriasBase) await tx.categoriaGasto.upsert({ where: { nombre }, create: { nombre }, update: {} });
      const categoriasNuevas = categoriasBase.filter((nombre) => !existentes.has(nombre)).length;
      const administradores = await tx.usuario.count({ where: { rol: 'ADMIN' } });
      let adminCreado = false;
      let aviso: string | undefined;
      if (administradores > 0) aviso = 'Ya existe un administrador; no se creó otro.';
      else if (config.SEED_ADMIN_EMAIL && config.SEED_ADMIN_PASSWORD) {
        const bcrypt = await import('bcrypt');
        let hash: string;
        if (/^\$2[aby]\$(1\d|2\d|3[01])\$/.test(config.SEED_ADMIN_PASSWORD)) hash = config.SEED_ADMIN_PASSWORD;
        else {
          validarClave(config.SEED_ADMIN_PASSWORD);
          hash = await bcrypt.hash(config.SEED_ADMIN_PASSWORD, 12);
        }
        await tx.usuario.create({ data: { email: config.SEED_ADMIN_EMAIL.trim().toLowerCase(), nombre: 'Administrador', passwordHash: hash, rol: 'ADMIN' } });
        adminCreado = true;
      } else aviso = 'Configure SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD para crear el primer ADMIN.';
      await tx.auditoria.create({ data: { accion: 'sistema.seed', entidad: 'Sistema', entidadId: 'datos-base', ip, despues: { categoriasNuevas, adminCreado } } });
      return { categoriasNuevas, adminCreado, aviso };
    }, { timeout: 120_000 });
    if ('ok' in salida) {
      logger.info({ prefijo: 'sistema.migrar', ip, resultado: 'correcto' }, 'Esquema actualizado');
      res.json(salida);
    } else {
      logger.info({ prefijo: 'sistema.seed', ip, categoriasNuevas: salida.categoriasNuevas, adminCreado: salida.adminCreado }, 'Datos base procesados');
      res.json({ categoriasNuevas: salida.categoriasNuevas, adminCreado: salida.adminCreado, ...(salida.aviso ? { aviso: salida.aviso } : {}) });
    }
  } catch (error) {
    if (accion === 'seed' && error instanceof Error && (error.message.includes('does not exist') || ('code' in error && error.code === 'P2021'))) {
      res.status(500).json({ mensaje: 'Falta migrar: llame primero a /sistema/migrar' });
      return;
    }
    logger.error({ prefijo: `sistema.${accion}`, ip, motivo: error instanceof Error ? error.message : 'Error desconocido' }, 'Falló operación de sistema');
    res.status(500).json({ mensaje: error instanceof Error ? error.message : 'Error interno' });
  }
});

app.post('/api/v1/auth/login', async (req, res, next) => {
  const ip = req.ip ?? 'desconocida';
  const ahora = Date.now();
  const key = `login:${ip}`;
  const intentos = (intentosMigracion.get(key) ?? []).filter((tiempo) => ahora - tiempo < 60_000);
  if (intentos.length >= 5) { res.status(429).json({ mensaje: 'Demasiados intentos. Espere un minuto.' }); return; }
  const validacion = esquemaLogin.safeParse(req.body);
  if (!validacion.success) { res.status(400).json({ mensaje: 'Correo y contraseña son obligatorios o tienen formato inválido' }); return; }
  try {
    const bcrypt = await import('bcrypt');
    const email = validacion.data.email.toLowerCase();
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    const hashFalso = '$2b$12$NcVYWNg./tdnEpODeArgEe5I764dhrRykhdSslTsaLod6jE0Fii7C';
    const coincide = await bcrypt.compare(validacion.data.clave, usuario?.passwordHash ?? hashFalso);
    if (!usuario || !usuario.activo || !coincide) {
      intentos.push(ahora);
      intentosMigracion.set(key, intentos);
      logger.warn({ prefijo: 'auth.login', ip, motivo: usuario?.activo ? 'La contraseña no coincide' : 'Usuario inexistente o inactivo' }, 'Login rechazado');
      res.status(401).json({ mensaje: 'Correo o contraseña incorrectos' });
      return;
    }
    res.cookie(nombreCookie, crearToken(usuario.id), opcionesCookie);
    res.json({ usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol } });
  } catch (error) { next(error); }
});
app.post('/api/v1/auth/logout', (_req, res) => {
  res.clearCookie(nombreCookie, { httpOnly: true, secure: opcionesCookie.secure, sameSite: 'lax', path: '/' });
  res.sendStatus(204);
});
app.get('/api/v1/auth/me', autenticar, (req, res) => {
  res.json({ usuario: req.usuario, permisos: permisosDe(req.usuario!.rol) });
});
app.patch('/api/v1/auth/clave', autenticar, async (req, res, next) => {
  try {
    const entrada = esquemaCambioClave.safeParse(req.body);
    if (!entrada.success) throw new ErrorDeValidacion('Indique la contraseña actual y la nueva');
    validarClave(entrada.data.claveNueva);
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: req.usuario!.id } });
    const bcrypt = await import('bcrypt');
    if (!(await bcrypt.compare(entrada.data.claveActual, usuario.passwordHash))) throw new ErrorDeValidacion('La contraseña actual no coincide');
    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id: usuario.id }, data: { passwordHash: await bcrypt.hash(entrada.data.claveNueva, 12), claveCambiadaEn: new Date() } });
      await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: 'usuario.cambiar_clave', entidad: 'Usuario', entidadId: usuario.id, ip: req.ip } });
    });
    res.clearCookie(nombreCookie, { httpOnly: true, secure: opcionesCookie.secure, sameSite: 'lax', path: '/' });
    res.sendStatus(204);
  } catch (error) { next(error); }
});

app.all('/api/v1/sistema/:accion', (_req, res) => res.sendStatus(404));
app.use('/api/v1', autenticar, rutasApi);
app.use('/api/v1', (_req, res) => res.status(404).json({ mensaje: 'Ruta no encontrada' }));
app.use(servirFrontend(config.FRONTEND_DIR));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ErrorDeValidacion) { res.status(400).json({ mensaje: error.message }); return; }
  if (error instanceof SyntaxError && 'body' in error) { res.status(400).json({ mensaje: 'El cuerpo JSON no es válido' }); return; }
  if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') { res.status(413).json({ mensaje: 'El archivo supera el límite de 5 MB' }); return; }
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') { res.status(404).json({ mensaje: 'Soporte no encontrado' }); return; }
  if (error instanceof Error && error.name === 'NoEncontrado') { res.status(404).json({ mensaje: error.message }); return; }
  if (error instanceof Error && error.name === 'Prohibido') { res.status(403).json({ mensaje: error.message }); return; }
  if (error instanceof Error && error.name === 'Conflicto') { res.status(409).json({ mensaje: error.message }); return; }
  if (error instanceof Error && 'code' in error && error.code === 'P2002') { res.status(409).json({ mensaje: 'El registro ya existe' }); return; }
  if (error instanceof Error && 'code' in error && error.code === 'P2025') { res.status(404).json({ mensaje: 'Registro no encontrado' }); return; }
  if (error instanceof Error && 'code' in error && error.code === 'P2003') { res.status(409).json({ mensaje: 'El registro está relacionado con otros datos' }); return; }
  logger.error({ prefijo: 'http.error', motivo: error instanceof Error ? error.message : 'Error desconocido' }, 'Error interno');
  res.status(500).json({ mensaje: 'Error interno' });
});

export { app };
