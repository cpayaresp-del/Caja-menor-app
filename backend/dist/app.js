"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const node_crypto_1 = require("node:crypto");
const node_child_process_1 = require("node:child_process");
const node_path_1 = __importDefault(require("node:path"));
const zod_1 = require("zod");
const config_1 = require("./config");
const auth_1 = require("./comun/auth");
const frontend_1 = require("./comun/frontend");
const logger_1 = require("./comun/logger");
const origen_permitido_1 = require("./comun/origen-permitido");
const prisma_1 = require("./comun/prisma");
const clave_1 = require("./dominio/clave");
const errores_1 = require("./dominio/errores");
const permisos_1 = require("./dominio/permisos");
const api_1 = require("./modulos/api");
const intentosMigracion = new Map();
const categoriasBase = ['Transporte', 'Papelería', 'Aseo y cafetería', 'Mensajería', 'Mantenimiento', 'Otros'];
const esquemaLogin = zod_1.z.object({
    email: zod_1.z.string().trim().min(5).max(254).regex(/^[^@\s]+@[^@.]+(\.[^@.]+)+$/),
    clave: zod_1.z.string().min(1).max(200)
}).strict();
const esquemaCambioClave = zod_1.z.object({ claveActual: zod_1.z.string().min(1), claveNueva: zod_1.z.string().min(1).max(200) }).strict();
const esquemaSistemaBody = zod_1.z.object({}).strict();
const app = (0, express_1.default)();
exports.app = app;
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((0, helmet_1.default)({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"], objectSrc: ["'none'"] } } }));
app.use((0, cors_1.default)({ origin: config_1.origenesPermitidos, credentials: true }));
app.use(origen_permitido_1.validarOrigen);
app.use(express_1.default.json({ limit: '100kb' }));
app.use((0, cookie_parser_1.default)());
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/health/listo', async (_req, res, next) => {
    let temporizador;
    try {
        await Promise.race([
            prisma_1.prisma.$queryRaw `SELECT 1`,
            new Promise((_, reject) => { temporizador = setTimeout(() => reject(new Error('Tiempo de espera de base de datos agotado')), 2900); })
        ]);
        res.json({ ok: true });
    }
    catch (error) {
        next(error);
    }
    finally {
        if (temporizador)
            clearTimeout(temporizador);
    }
});
app.post('/api/v1/sistema/:accion', async (req, res) => {
    const accion = req.params.accion;
    if (!['migrar', 'seed'].includes(accion)) {
        res.sendStatus(404);
        return;
    }
    const migrateToken = config_1.config.MIGRATE_TOKEN;
    if (!migrateToken) {
        res.sendStatus(404);
        return;
    }
    const ip = req.ip ?? 'desconocida';
    const ahora = Date.now();
    const intentos = (intentosMigracion.get(ip) ?? []).filter((tiempo) => ahora - tiempo < 60_000);
    if (intentos.length >= 5) {
        res.status(429).json({ mensaje: 'Demasiados intentos. Espere un minuto.' });
        return;
    }
    const consulta = zod_1.z.object({ token: zod_1.z.string().optional() }).strict().safeParse(req.query);
    const cuerpo = esquemaSistemaBody.safeParse(req.body ?? {});
    if (!consulta.success || !cuerpo.success) {
        res.status(400).json({ mensaje: 'La solicitud contiene campos inválidos' });
        return;
    }
    const token = req.get('X-Migrate-Token') ?? consulta.data.token ?? '';
    const esperado = (0, node_crypto_1.createHash)('sha256').update(migrateToken).digest();
    const recibido = (0, node_crypto_1.createHash)('sha256').update(token).digest();
    if (!(0, node_crypto_1.timingSafeEqual)(esperado, recibido)) {
        intentos.push(ahora);
        intentosMigracion.set(ip, intentos);
        logger_1.logger.warn({ prefijo: `sistema.${accion}`, ip, motivo: 'Token de administración rechazado' }, 'Operación de sistema rechazada');
        res.status(401).json({ mensaje: 'Token no válido' });
        return;
    }
    try {
        const salida = await prisma_1.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(73829104)`;
            if (accion === 'migrar') {
                const salida = await new Promise((resolve, reject) => {
                    const comando = process.platform === 'win32' ? 'npx.cmd' : 'npx';
                    const proceso = (0, node_child_process_1.spawn)(comando, ['prisma', 'db', 'push', '--schema', 'prisma/schema', '--skip-generate'], { cwd: node_path_1.default.resolve(__dirname, '..'), env: process.env, shell: process.platform === 'win32' });
                    let texto = '';
                    proceso.stdout.on('data', (dato) => { texto += dato.toString(); });
                    proceso.stderr.on('data', (dato) => { texto += dato.toString(); });
                    proceso.on('error', reject);
                    proceso.on('close', (codigo) => codigo === 0 ? resolve(texto.slice(-4000)) : reject(new Error(texto.slice(-4000))));
                });
                await tx.auditoria.create({ data: { accion: 'sistema.migrar', entidad: 'Sistema', entidadId: 'esquema', ip } });
                return { ok: true, salida };
            }
            const lista = await tx.categoriaGasto.findMany({ select: { nombre: true } });
            const existentes = new Set(lista.map((categoria) => categoria.nombre));
            for (const nombre of categoriasBase)
                await tx.categoriaGasto.upsert({ where: { nombre }, create: { nombre }, update: {} });
            const categoriasNuevas = categoriasBase.filter((nombre) => !existentes.has(nombre)).length;
            const administradores = await tx.usuario.count({ where: { rol: 'ADMIN' } });
            let adminCreado = false;
            let aviso;
            if (administradores > 0)
                aviso = 'Ya existe un administrador; no se creó otro.';
            else if (config_1.config.SEED_ADMIN_EMAIL && config_1.config.SEED_ADMIN_PASSWORD) {
                const bcrypt = await Promise.resolve().then(() => __importStar(require('bcrypt')));
                let hash;
                if (/^\$2[aby]\$(1\d|2\d|3[01])\$/.test(config_1.config.SEED_ADMIN_PASSWORD))
                    hash = config_1.config.SEED_ADMIN_PASSWORD;
                else {
                    (0, clave_1.validarClave)(config_1.config.SEED_ADMIN_PASSWORD);
                    hash = await bcrypt.hash(config_1.config.SEED_ADMIN_PASSWORD, 12);
                }
                await tx.usuario.create({ data: { email: config_1.config.SEED_ADMIN_EMAIL.trim().toLowerCase(), nombre: 'Administrador', passwordHash: hash, rol: 'ADMIN' } });
                adminCreado = true;
            }
            else
                aviso = 'Configure SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD para crear el primer ADMIN.';
            await tx.auditoria.create({ data: { accion: 'sistema.seed', entidad: 'Sistema', entidadId: 'datos-base', ip, despues: { categoriasNuevas, adminCreado } } });
            return { categoriasNuevas, adminCreado, aviso };
        }, { timeout: 120_000 });
        if ('ok' in salida) {
            logger_1.logger.info({ prefijo: 'sistema.migrar', ip, resultado: 'correcto' }, 'Esquema actualizado');
            res.json(salida);
        }
        else {
            logger_1.logger.info({ prefijo: 'sistema.seed', ip, categoriasNuevas: salida.categoriasNuevas, adminCreado: salida.adminCreado }, 'Datos base procesados');
            res.json({ categoriasNuevas: salida.categoriasNuevas, adminCreado: salida.adminCreado, ...(salida.aviso ? { aviso: salida.aviso } : {}) });
        }
    }
    catch (error) {
        if (accion === 'seed' && error instanceof Error && (error.message.includes('does not exist') || ('code' in error && error.code === 'P2021'))) {
            res.status(500).json({ mensaje: 'Falta migrar: llame primero a /sistema/migrar' });
            return;
        }
        logger_1.logger.error({ prefijo: `sistema.${accion}`, ip, motivo: error instanceof Error ? error.message : 'Error desconocido' }, 'Falló operación de sistema');
        res.status(500).json({ mensaje: error instanceof Error ? error.message : 'Error interno' });
    }
});
app.post('/api/v1/auth/login', async (req, res, next) => {
    const ip = req.ip ?? 'desconocida';
    const ahora = Date.now();
    const key = `login:${ip}`;
    const intentos = (intentosMigracion.get(key) ?? []).filter((tiempo) => ahora - tiempo < 60_000);
    if (intentos.length >= 5) {
        res.status(429).json({ mensaje: 'Demasiados intentos. Espere un minuto.' });
        return;
    }
    const validacion = esquemaLogin.safeParse(req.body);
    if (!validacion.success) {
        res.status(400).json({ mensaje: 'Correo y contraseña son obligatorios o tienen formato inválido' });
        return;
    }
    try {
        const bcrypt = await Promise.resolve().then(() => __importStar(require('bcrypt')));
        const email = validacion.data.email.toLowerCase();
        const usuario = await prisma_1.prisma.usuario.findUnique({ where: { email } });
        const hashFalso = '$2b$12$NcVYWNg./tdnEpODeArgEe5I764dhrRykhdSslTsaLod6jE0Fii7C';
        const coincide = await bcrypt.compare(validacion.data.clave, usuario?.passwordHash ?? hashFalso);
        if (!usuario || !usuario.activo || !coincide) {
            intentos.push(ahora);
            intentosMigracion.set(key, intentos);
            logger_1.logger.warn({ prefijo: 'auth.login', ip, motivo: usuario?.activo ? 'La contraseña no coincide' : 'Usuario inexistente o inactivo' }, 'Login rechazado');
            res.status(401).json({ mensaje: 'Correo o contraseña incorrectos' });
            return;
        }
        res.cookie(auth_1.nombreCookie, (0, auth_1.crearToken)(usuario.id), auth_1.opcionesCookie);
        res.json({ usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol } });
    }
    catch (error) {
        next(error);
    }
});
app.post('/api/v1/auth/logout', (_req, res) => {
    res.clearCookie(auth_1.nombreCookie, { httpOnly: true, secure: auth_1.opcionesCookie.secure, sameSite: 'lax', path: '/' });
    res.sendStatus(204);
});
app.get('/api/v1/auth/me', auth_1.autenticar, (req, res) => {
    res.json({ usuario: req.usuario, permisos: (0, permisos_1.permisosDe)(req.usuario.rol) });
});
app.patch('/api/v1/auth/clave', auth_1.autenticar, async (req, res, next) => {
    try {
        const entrada = esquemaCambioClave.safeParse(req.body);
        if (!entrada.success)
            throw new errores_1.ErrorDeValidacion('Indique la contraseña actual y la nueva');
        (0, clave_1.validarClave)(entrada.data.claveNueva);
        const usuario = await prisma_1.prisma.usuario.findUniqueOrThrow({ where: { id: req.usuario.id } });
        const bcrypt = await Promise.resolve().then(() => __importStar(require('bcrypt')));
        if (!(await bcrypt.compare(entrada.data.claveActual, usuario.passwordHash)))
            throw new errores_1.ErrorDeValidacion('La contraseña actual no coincide');
        await prisma_1.prisma.$transaction(async (tx) => {
            await tx.usuario.update({ where: { id: usuario.id }, data: { passwordHash: await bcrypt.hash(entrada.data.claveNueva, 12), claveCambiadaEn: new Date() } });
            await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: 'usuario.cambiar_clave', entidad: 'Usuario', entidadId: usuario.id, ip: req.ip } });
        });
        res.clearCookie(auth_1.nombreCookie, { httpOnly: true, secure: auth_1.opcionesCookie.secure, sameSite: 'lax', path: '/' });
        res.sendStatus(204);
    }
    catch (error) {
        next(error);
    }
});
app.all('/api/v1/sistema/:accion', (_req, res) => res.sendStatus(404));
app.use('/api/v1', auth_1.autenticar, api_1.rutasApi);
app.use('/api/v1', (_req, res) => res.status(404).json({ mensaje: 'Ruta no encontrada' }));
app.use((0, frontend_1.servirFrontend)(config_1.config.FRONTEND_DIR));
app.use((error, _req, res, _next) => {
    if (error instanceof errores_1.ErrorDeValidacion) {
        res.status(400).json({ mensaje: error.message });
        return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
        res.status(400).json({ mensaje: 'El cuerpo JSON no es válido' });
        return;
    }
    if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
        res.status(413).json({ mensaje: 'El archivo supera el límite de 5 MB' });
        return;
    }
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        res.status(404).json({ mensaje: 'Soporte no encontrado' });
        return;
    }
    if (error instanceof Error && error.name === 'NoEncontrado') {
        res.status(404).json({ mensaje: error.message });
        return;
    }
    if (error instanceof Error && error.name === 'Prohibido') {
        res.status(403).json({ mensaje: error.message });
        return;
    }
    if (error instanceof Error && error.name === 'Conflicto') {
        res.status(409).json({ mensaje: error.message });
        return;
    }
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        res.status(409).json({ mensaje: 'El registro ya existe' });
        return;
    }
    if (error instanceof Error && 'code' in error && error.code === 'P2025') {
        res.status(404).json({ mensaje: 'Registro no encontrado' });
        return;
    }
    if (error instanceof Error && 'code' in error && error.code === 'P2003') {
        res.status(409).json({ mensaje: 'El registro está relacionado con otros datos' });
        return;
    }
    logger_1.logger.error({ prefijo: 'http.error', motivo: error instanceof Error ? error.message : 'Error desconocido' }, 'Error interno');
    res.status(500).json({ mensaje: 'Error interno' });
});
