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
exports.rutasApi = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const node_crypto_1 = require("node:crypto");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const config_1 = require("../config");
const prisma_1 = require("../comun/prisma");
const errores_1 = require("../dominio/errores");
const saldo_1 = require("../dominio/saldo");
const permisos_1 = require("../dominio/permisos");
const rutas = (0, express_1.Router)();
exports.rutasApi = rutas;
const uuid = zod_1.z.string().uuid();
const nombrePersona = zod_1.z.string().trim().min(1).max(100).regex(/^\p{L}[\p{L}\p{M} '’.-]*$/u);
const paginacion = zod_1.z.object({
    pagina: zod_1.z.coerce.number().int().min(1).default(1),
    porPagina: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    q: zod_1.z.string().trim().max(100).optional()
}).strict();
const consultaEmpleados = paginacion.extend({
    estado: zod_1.z.enum(['ACTIVO', 'INACTIVO']).optional()
}).strict();
const esquemaEmpleado = zod_1.z.object({
    tipoDocumento: zod_1.z.enum(['CC', 'CE', 'PA', 'TI', 'PPT']),
    numeroDocumento: zod_1.z.string().trim().min(1).max(40),
    nombres: zod_1.z.string().trim().min(1).max(100).regex(/^\p{L}[\p{L}\p{M} '’.-]*$/u),
    apellidos: zod_1.z.string().trim().min(1).max(100).regex(/^\p{L}[\p{L}\p{M} '’.-]*$/u),
    cargo: zod_1.z.string().trim().min(1).max(100),
    area: zod_1.z.string().trim().min(1).max(100),
    telefono: zod_1.z.string().trim().min(1).max(30),
    email: zod_1.z.string().trim().min(5).max(254).regex(/^[^@\s]+@[^@.]+(\.[^@.]+)+$/).optional().nullable(),
    fechaIngreso: zod_1.z.coerce.date(),
    fechaRetiro: zod_1.z.coerce.date().optional().nullable(),
    observaciones: zod_1.z.string().max(2000).optional().nullable()
}).strict();
const esquemaCaja = zod_1.z.object({
    nombre: zod_1.z.string().trim().min(1).max(100),
    responsableId: uuid,
    montoFondo: zod_1.z.number().int().positive().max(2_147_483_647),
    topePorGasto: zod_1.z.number().int().positive().max(2_147_483_647)
}).strict();
const esquemaMovimiento = zod_1.z.object({
    tipo: zod_1.z.enum(['GASTO', 'ANTICIPO', 'LEGALIZACION']),
    valor: zod_1.z.number().int().positive().max(2_147_483_647),
    fecha: zod_1.z.coerce.date().optional(),
    concepto: zod_1.z.string().trim().min(1).max(500),
    categoriaId: uuid.optional(),
    empleadoId: uuid.optional(),
    beneficiario: zod_1.z.string().trim().min(1).max(200),
    nitBeneficiario: zod_1.z.string().trim().max(40).optional().nullable(),
    numeroSoporte: zod_1.z.string().trim().max(100).optional().nullable(),
    soporteUrl: zod_1.z.string().max(500).optional().nullable()
}).strict();
const esquemaMotivo = zod_1.z.object({ motivo: zod_1.z.string().trim().min(3).max(500) }).strict();
const esquemaArqueo = zod_1.z.object({ saldoContado: zod_1.z.number().int().min(0).max(2_147_483_647), motivo: zod_1.z.string().trim().max(500).optional() }).strict();
const esquemaReembolso = zod_1.z.object({ valor: zod_1.z.number().int().positive().max(2_147_483_647) }).strict();
const s3 = config_1.config.S3_BUCKET && config_1.config.S3_REGION
    ? new client_s3_1.S3Client({
        region: config_1.config.S3_REGION,
        ...(config_1.config.S3_ENDPOINT ? { endpoint: config_1.config.S3_ENDPOINT, forcePathStyle: true } : {}),
        ...(config_1.config.S3_ACCESS_KEY_ID && config_1.config.S3_SECRET_ACCESS_KEY ? { credentials: { accessKeyId: config_1.config.S3_ACCESS_KEY_ID, secretAccessKey: config_1.config.S3_SECRET_ACCESS_KEY } } : {})
    })
    : null;
const extensiones = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const carpetaLocal = node_path_1.default.resolve(process.cwd(), 'uploads');
function extensionValida(nombre, archivo) {
    const extension = node_path_1.default.extname(nombre).toLowerCase();
    const firmaValida = extension === '.jpg' || extension === '.jpeg'
        ? archivo.length >= 3 && archivo[0] === 0xff && archivo[1] === 0xd8 && archivo[2] === 0xff
        : extension === '.png'
            ? archivo.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
            : extension === '.webp'
                ? archivo.length >= 12 && archivo.toString('ascii', 0, 4) === 'RIFF' && archivo.toString('ascii', 8, 12) === 'WEBP'
                : extension === '.pdf'
                    ? archivo.toString('ascii', 0, 5) === '%PDF-'
                    : false;
    if (!extensiones.has(extension) || !firmaValida)
        throw new errores_1.ErrorDeValidacion('El archivo debe ser JPG, PNG, WebP o PDF y coincidir con su extensión');
    return extension;
}
function mimePorExtension(extension) {
    return extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg'
        : extension === '.png' ? 'image/png'
            : extension === '.webp' ? 'image/webp' : 'application/pdf';
}
async function validarSoporte(cajaId, soporteUrl) {
    if (!soporteUrl)
        return;
    const prefijo = `/api/v1/cajas/${cajaId}/soportes/`;
    const archivo = soporteUrl.startsWith(prefijo) ? soporteUrl.slice(prefijo.length) : '';
    if (!/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$/i.test(archivo))
        throw new errores_1.ErrorDeValidacion('El soporte no pertenece a esta caja o no es válido');
    if (s3 && config_1.config.S3_BUCKET) {
        await s3.send(new client_s3_1.HeadObjectCommand({ Bucket: config_1.config.S3_BUCKET, Key: `caja-menor-app/cajas/${cajaId}/${archivo}` }));
    }
    else {
        await promises_1.default.access(node_path_1.default.join(carpetaLocal, 'cajas', cajaId, archivo));
    }
}
function validar(esquema, datos) {
    const resultado = esquema.safeParse(datos);
    if (!resultado.success)
        throw new errores_1.ErrorDeValidacion(resultado.error.issues.map((error) => `${error.path.join('.')}: ${error.message}`).join('; '));
    return resultado.data;
}
function usuario(req) {
    if (!req.usuario)
        throw new errores_1.Prohibido('Sesión no válida');
    return req.usuario;
}
function exigir(req, permiso) {
    if (!(0, permisos_1.puede)(usuario(req).rol, permiso))
        throw new errores_1.Prohibido('No tiene permiso para esta acción');
}
async function cajaPermitida(req, cajaId) {
    const caja = await prisma_1.prisma.caja.findUnique({ where: { id: cajaId }, include: { responsable: { select: { id: true, nombres: true, apellidos: true } } } });
    if (!caja || (usuario(req).rol === 'CAJERO' && caja.responsableId !== usuario(req).empleadoId))
        throw new errores_1.NoEncontrado('Caja no encontrada');
    return caja;
}
async function periodoAbierto(tx, cajaId) {
    const periodo = await tx.periodo.findFirst({ where: { cajaId, estado: 'ABIERTO' } });
    if (!periodo)
        throw new errores_1.Conflicto('La caja no tiene un período abierto');
    return periodo;
}
async function saldoPeriodo(tx, cajaId, periodoId) {
    const caja = await tx.caja.findUnique({ where: { id: cajaId } });
    if (!caja)
        throw new errores_1.NoEncontrado('Caja no encontrada');
    const movimientos = await tx.movimiento.findMany({ where: { cajaId, periodoId } });
    return (0, saldo_1.calcularSaldo)(caja.montoFondo, movimientos);
}
async function auditar(tx, req, accion, entidad, entidadId, despues) {
    await tx.auditoria.create({
        data: { usuarioId: usuario(req).id, accion, entidad, entidadId, ip: req.ip, ...(despues ? { despues } : {}) }
    });
}
rutas.get('/empleados', async (req, res) => {
    exigir(req, 'ver');
    const consulta = validar(consultaEmpleados, req.query);
    const where = {
        ...(consulta.estado ? { estado: consulta.estado } : {}),
        ...(consulta.q ? {
            OR: [
                { nombres: { contains: consulta.q, mode: 'insensitive' } },
                { apellidos: { contains: consulta.q, mode: 'insensitive' } },
                { numeroDocumento: { contains: consulta.q, mode: 'insensitive' } }
            ]
        } : {})
    };
    const [datos, total] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.empleado.findMany({ where, skip: (consulta.pagina - 1) * consulta.porPagina, take: consulta.porPagina, orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }] }),
        prisma_1.prisma.empleado.count({ where })
    ]);
    res.json({ datos: usuario(req).rol === 'CONSULTA' ? datos.map(({ telefono: _telefono, email: _email, ...empleado }) => empleado) : datos, total, pagina: consulta.pagina, porPagina: consulta.porPagina });
});
rutas.post('/empleados', async (req, res) => {
    exigir(req, 'empleado.editar');
    const entrada = validar(esquemaEmpleado, req.body);
    const empleado = await prisma_1.prisma.$transaction(async (tx) => {
        const creado = await tx.empleado.create({ data: { ...entrada, email: entrada.email?.trim().toLowerCase() } });
        await auditar(tx, req, 'empleado.crear', 'Empleado', creado.id);
        return creado;
    });
    res.status(201).json(empleado);
});
rutas.get('/empleados/:id', async (req, res) => {
    exigir(req, 'ver');
    const id = validar(uuid, req.params.id);
    const empleado = await prisma_1.prisma.empleado.findUnique({ where: { id } });
    if (!empleado)
        throw new errores_1.NoEncontrado('Empleado no encontrado');
    if (usuario(req).rol === 'CONSULTA') {
        const { telefono: _telefono, email: _email, ...visible } = empleado;
        res.json(visible);
    }
    else
        res.json(empleado);
});
rutas.patch('/empleados/:id', async (req, res) => {
    exigir(req, 'empleado.editar');
    const id = validar(uuid, req.params.id);
    const entrada = validar(esquemaEmpleado.partial().strict(), req.body);
    const previo = await prisma_1.prisma.empleado.findUnique({ where: { id } });
    if (!previo)
        throw new errores_1.NoEncontrado('Empleado no encontrado');
    const actualizado = await prisma_1.prisma.$transaction(async (tx) => {
        const empleado = await tx.empleado.update({ where: { id }, data: { ...entrada, email: entrada.email?.trim().toLowerCase() } });
        await auditar(tx, req, 'empleado.editar', 'Empleado', id);
        return empleado;
    });
    res.json(actualizado);
});
rutas.patch('/empleados/:id/estado', async (req, res) => {
    exigir(req, 'empleado.editar');
    const id = validar(uuid, req.params.id);
    const entrada = validar(zod_1.z.object({ estado: zod_1.z.enum(['ACTIVO', 'INACTIVO']) }).strict(), req.body);
    const actualizado = await prisma_1.prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT "id" FROM "Empleado" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const empleado = await tx.empleado.findUnique({ where: { id } });
        if (!empleado)
            throw new errores_1.NoEncontrado('Empleado no encontrado');
        if (entrada.estado === 'INACTIVO' && await tx.caja.count({ where: { responsableId: id, estado: 'ABIERTA' } })) {
            throw new errores_1.Conflicto('Reasigne el responsable de las cajas abiertas antes de inactivar al empleado');
        }
        const resultado = await tx.empleado.update({ where: { id }, data: { estado: entrada.estado, fechaRetiro: entrada.estado === 'INACTIVO' ? new Date() : null } });
        await auditar(tx, req, 'empleado.estado', 'Empleado', id, { estado: entrada.estado });
        return resultado;
    });
    res.json(actualizado);
});
rutas.get('/cajas', async (req, res) => {
    exigir(req, 'ver');
    const consulta = validar(paginacion, req.query);
    const where = {
        ...(usuario(req).rol === 'CAJERO' ? { responsableId: usuario(req).empleadoId ?? '__sin_empleado__' } : {}),
        ...(consulta.q ? { nombre: { contains: consulta.q, mode: 'insensitive' } } : {})
    };
    const [datos, total] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.caja.findMany({ where, include: { responsable: { select: { id: true, nombres: true, apellidos: true } } }, skip: (consulta.pagina - 1) * consulta.porPagina, take: consulta.porPagina, orderBy: { nombre: 'asc' } }),
        prisma_1.prisma.caja.count({ where })
    ]);
    res.json({ datos, total, pagina: consulta.pagina, porPagina: consulta.porPagina });
});
rutas.post('/cajas', async (req, res) => {
    exigir(req, 'caja.editar');
    const entrada = validar(esquemaCaja, req.body);
    if (entrada.topePorGasto > entrada.montoFondo)
        throw new errores_1.ErrorDeValidacion('El tope por gasto no puede superar el monto del fondo');
    const caja = await prisma_1.prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT "id" FROM "Empleado" WHERE "id" = ${entrada.responsableId}::uuid FOR UPDATE`;
        const responsable = await tx.empleado.findUnique({ where: { id: entrada.responsableId } });
        if (!responsable || responsable.estado !== 'ACTIVO')
            throw new errores_1.ErrorDeValidacion('El responsable debe ser un empleado activo');
        const creada = await tx.caja.create({ data: entrada });
        await tx.periodo.create({ data: { cajaId: creada.id } });
        await auditar(tx, req, 'caja.crear', 'Caja', creada.id);
        return creada;
    });
    res.status(201).json(caja);
});
rutas.get('/cajas/:id', async (req, res) => {
    exigir(req, 'ver');
    const caja = await cajaPermitida(req, validar(uuid, req.params.id));
    res.json(caja);
});
rutas.patch('/cajas/:id', async (req, res) => {
    exigir(req, 'caja.editar');
    const id = validar(uuid, req.params.id);
    const entrada = validar(esquemaCaja.partial().strict().extend({ estado: zod_1.z.enum(['ABIERTA', 'CERRADA']).optional() }), req.body);
    const caja = await prisma_1.prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT "id" FROM "Caja" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const previo = await tx.caja.findUnique({ where: { id } });
        if (!previo)
            throw new errores_1.NoEncontrado('Caja no encontrada');
        if ((entrada.topePorGasto ?? previo.topePorGasto) > (entrada.montoFondo ?? previo.montoFondo))
            throw new errores_1.ErrorDeValidacion('El tope por gasto no puede superar el monto del fondo');
        if (entrada.responsableId) {
            await tx.$queryRaw `SELECT "id" FROM "Empleado" WHERE "id" = ${entrada.responsableId}::uuid FOR UPDATE`;
            const empleado = await tx.empleado.findUnique({ where: { id: entrada.responsableId } });
            if (!empleado || empleado.estado !== 'ACTIVO')
                throw new errores_1.ErrorDeValidacion('El responsable debe ser un empleado activo');
        }
        if (entrada.estado === 'CERRADA' && previo.estado !== 'CERRADA' && await tx.periodo.findFirst({ where: { cajaId: id, estado: 'ABIERTO' } })) {
            throw new errores_1.Conflicto('Cierre el período abierto antes de cerrar la caja');
        }
        if (entrada.estado === 'ABIERTA' && previo.estado !== 'ABIERTA') {
            if (await tx.periodo.findFirst({ where: { cajaId: id, estado: 'ABIERTO' } }))
                throw new errores_1.Conflicto('La caja ya tiene un período abierto');
            await tx.periodo.create({ data: { cajaId: id } });
        }
        const actualizada = await tx.caja.update({ where: { id }, data: entrada });
        await auditar(tx, req, 'caja.editar', 'Caja', id);
        return actualizada;
    });
    res.json(caja);
});
rutas.get('/cajas/:id/saldo', async (req, res) => {
    exigir(req, 'ver');
    const caja = await cajaPermitida(req, validar(uuid, req.params.id));
    const periodo = await prisma_1.prisma.periodo.findFirst({ where: { cajaId: caja.id, estado: 'ABIERTO' } });
    if (!periodo)
        throw new errores_1.Conflicto('La caja no tiene un período abierto');
    const movimientos = await prisma_1.prisma.movimiento.findMany({ where: { cajaId: caja.id, periodoId: periodo.id } });
    res.json({ cajaId: caja.id, periodoId: periodo.id, saldo: (0, saldo_1.calcularSaldo)(caja.montoFondo, movimientos) });
});
rutas.get('/categorias', async (req, res) => {
    exigir(req, 'ver');
    res.json(await prisma_1.prisma.categoriaGasto.findMany({ orderBy: { nombre: 'asc' } }));
});
rutas.post('/cajas/:id/soportes', (0, express_1.raw)({ type: 'application/octet-stream', limit: '5mb' }), async (req, res) => {
    exigir(req, 'movimiento.crear');
    const cajaId = validar(uuid, req.params.id);
    await cajaPermitida(req, cajaId);
    if (!Buffer.isBuffer(req.body))
        throw new errores_1.ErrorDeValidacion('Envíe el archivo como application/octet-stream');
    const nombre = req.get('X-File-Name') ?? '';
    if (nombre.length > 200)
        throw new errores_1.ErrorDeValidacion('El nombre del archivo es demasiado largo');
    const extension = extensionValida(nombre, req.body);
    const archivo = `${(0, node_crypto_1.randomUUID)()}${extension}`;
    const tipo = mimePorExtension(extension);
    if (s3 && config_1.config.S3_BUCKET) {
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: config_1.config.S3_BUCKET,
            Key: `caja-menor-app/cajas/${cajaId}/${archivo}`,
            Body: req.body,
            ContentType: tipo,
        }));
    }
    else {
        const directorio = node_path_1.default.join(carpetaLocal, 'cajas', cajaId);
        await promises_1.default.mkdir(directorio, { recursive: true });
        await promises_1.default.writeFile(node_path_1.default.join(directorio, archivo), req.body, { flag: 'wx' });
    }
    res.status(201).json({ soporteUrl: `/api/v1/cajas/${cajaId}/soportes/${archivo}` });
});
rutas.get('/cajas/:id/soportes/:archivo', async (req, res) => {
    exigir(req, 'ver');
    const cajaId = validar(uuid, req.params.id);
    await cajaPermitida(req, cajaId);
    const archivo = validar(zod_1.z.string().regex(/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$/i), req.params.archivo);
    if (s3 && config_1.config.S3_BUCKET) {
        const url = await (0, s3_request_presigner_1.getSignedUrl)(s3, new client_s3_1.GetObjectCommand({ Bucket: config_1.config.S3_BUCKET, Key: `caja-menor-app/cajas/${cajaId}/${archivo}` }), { expiresIn: 300 });
        res.redirect(302, url);
        return;
    }
    const ruta = node_path_1.default.join(carpetaLocal, 'cajas', cajaId, archivo);
    await promises_1.default.access(ruta);
    res.type(mimePorExtension(node_path_1.default.extname(archivo))).sendFile(ruta);
});
rutas.post('/categorias', async (req, res) => {
    exigir(req, 'categoria.editar');
    const entrada = validar(zod_1.z.object({ nombre: zod_1.z.string().trim().min(1).max(100), activa: zod_1.z.boolean().optional() }).strict(), req.body);
    const categoria = await prisma_1.prisma.$transaction(async (tx) => {
        const creada = await tx.categoriaGasto.create({ data: entrada });
        await auditar(tx, req, 'categoria.crear', 'CategoriaGasto', creada.id);
        return creada;
    });
    res.status(201).json(categoria);
});
rutas.patch('/categorias/:id', async (req, res) => {
    exigir(req, 'categoria.editar');
    const id = validar(uuid, req.params.id);
    const entrada = validar(zod_1.z.object({ nombre: zod_1.z.string().trim().min(1).max(100).optional(), activa: zod_1.z.boolean().optional() }).strict(), req.body);
    if (!(await prisma_1.prisma.categoriaGasto.findUnique({ where: { id } })))
        throw new errores_1.NoEncontrado('Categoría no encontrada');
    const categoria = await prisma_1.prisma.$transaction(async (tx) => {
        const actualizada = await tx.categoriaGasto.update({ where: { id }, data: entrada });
        await auditar(tx, req, 'categoria.editar', 'CategoriaGasto', id);
        return actualizada;
    });
    res.json(categoria);
});
rutas.get('/cajas/:id/movimientos', async (req, res) => {
    exigir(req, 'ver');
    const caja = await cajaPermitida(req, validar(uuid, req.params.id));
    const consulta = validar(paginacion, req.query);
    const [datos, total] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.movimiento.findMany({ where: { cajaId: caja.id }, include: { categoria: true, empleado: { select: { id: true, nombres: true, apellidos: true } } }, orderBy: { fecha: 'desc' }, skip: (consulta.pagina - 1) * consulta.porPagina, take: consulta.porPagina }),
        prisma_1.prisma.movimiento.count({ where: { cajaId: caja.id } })
    ]);
    res.json({ datos, total, pagina: consulta.pagina, porPagina: consulta.porPagina });
});
rutas.post('/cajas/:id/movimientos', async (req, res) => {
    exigir(req, 'movimiento.crear');
    const entrada = validar(esquemaMovimiento, req.body);
    const cajaId = validar(uuid, req.params.id);
    const creado = await prisma_1.prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT "id" FROM "Caja" WHERE "id" = ${cajaId}::uuid FOR UPDATE`;
        const caja = await tx.caja.findUnique({ where: { id: cajaId } });
        if (!caja || (usuario(req).rol === 'CAJERO' && caja.responsableId !== usuario(req).empleadoId))
            throw new errores_1.NoEncontrado('Caja no encontrada');
        if (caja.estado !== 'ABIERTA')
            throw new errores_1.Conflicto('La caja está cerrada');
        const periodo = await periodoAbierto(tx, cajaId);
        if (entrada.tipo === 'GASTO' && !entrada.categoriaId)
            throw new errores_1.ErrorDeValidacion('Seleccione la categoría del gasto');
        if ((entrada.tipo === 'ANTICIPO' || entrada.tipo === 'LEGALIZACION') && !entrada.empleadoId)
            throw new errores_1.ErrorDeValidacion('Seleccione un empleado activo');
        if (entrada.empleadoId) {
            const empleado = await tx.empleado.findUnique({ where: { id: entrada.empleadoId } });
            if (!empleado || empleado.estado !== 'ACTIVO')
                throw new errores_1.ErrorDeValidacion('El empleado debe estar activo');
        }
        if (entrada.categoriaId && !(await tx.categoriaGasto.findFirst({ where: { id: entrada.categoriaId, activa: true } })))
            throw new errores_1.ErrorDeValidacion('La categoría no existe o está inactiva');
        await validarSoporte(cajaId, entrada.soporteUrl);
        if (entrada.tipo === 'GASTO' && entrada.valor > caja.topePorGasto)
            throw new errores_1.ErrorDeValidacion('El gasto supera el tope permitido por movimiento');
        const saldo = await saldoPeriodo(tx, cajaId, periodo.id);
        if (entrada.tipo !== 'LEGALIZACION' && entrada.valor > saldo)
            throw new errores_1.ErrorDeValidacion('El movimiento dejaría el saldo de la caja en negativo');
        const movimiento = await tx.movimiento.create({
            data: { ...entrada, cajaId, periodoId: periodo.id, registradoPorId: usuario(req).id, ...(entrada.fecha ? {} : { fecha: new Date() }) }
        });
        await auditar(tx, req, 'movimiento.crear', 'Movimiento', movimiento.id, { tipo: entrada.tipo, valor: entrada.valor, cajaId });
        return movimiento;
    });
    res.status(201).json(creado);
});
rutas.post('/movimientos/:id/anular', async (req, res) => {
    exigir(req, 'movimiento.anular');
    const id = validar(uuid, req.params.id);
    const { motivo } = validar(esquemaMotivo, req.body);
    const anulacion = await prisma_1.prisma.$transaction(async (tx) => {
        const original = await tx.movimiento.findUnique({ where: { id }, include: { periodo: true } });
        if (!original)
            throw new errores_1.NoEncontrado('Movimiento no encontrado');
        await tx.$queryRaw `SELECT "id" FROM "Caja" WHERE "id" = ${original.cajaId}::uuid FOR UPDATE`;
        if (original.periodo.estado !== 'ABIERTO')
            throw new errores_1.Conflicto('No se puede anular un movimiento de un período cerrado');
        if (await tx.movimiento.findUnique({ where: { anulaA: id } }))
            throw new errores_1.Conflicto('El movimiento ya fue anulado');
        const creada = await tx.movimiento.create({
            data: { cajaId: original.cajaId, periodoId: original.periodoId, tipo: 'ANULACION', valor: original.valor, concepto: motivo, beneficiario: original.beneficiario, registradoPorId: usuario(req).id, anulaA: original.id, motivoAnulacion: motivo }
        });
        await auditar(tx, req, 'movimiento.anular', 'Movimiento', original.id, { motivo });
        return creada;
    });
    res.status(201).json(anulacion);
});
rutas.post('/cajas/:id/arqueo', async (req, res) => {
    exigir(req, 'periodo.cerrar');
    const cajaId = validar(uuid, req.params.id);
    const entrada = validar(esquemaArqueo, req.body);
    const resultado = await prisma_1.prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT "id" FROM "Caja" WHERE "id" = ${cajaId}::uuid FOR UPDATE`;
        const caja = await tx.caja.findUnique({ where: { id: cajaId } });
        if (!caja || (usuario(req).rol === 'CAJERO' && caja.responsableId !== usuario(req).empleadoId))
            throw new errores_1.NoEncontrado('Caja no encontrada');
        const periodo = await periodoAbierto(tx, cajaId);
        const saldo = await saldoPeriodo(tx, cajaId, periodo.id);
        const diferencia = entrada.saldoContado - saldo;
        if (diferencia !== 0) {
            if (!entrada.motivo?.trim())
                throw new errores_1.ErrorDeValidacion('Indique el motivo de la diferencia del arqueo');
            await tx.movimiento.create({
                data: { cajaId, periodoId: periodo.id, tipo: 'AJUSTE_ARQUEO', valor: Math.abs(diferencia), signoAjuste: Math.sign(diferencia), concepto: entrada.motivo, beneficiario: 'Arqueo', registradoPorId: usuario(req).id }
            });
        }
        await tx.periodo.update({ where: { id: periodo.id }, data: { saldoSistema: saldo, saldoContado: entrada.saldoContado, diferencia } });
        await auditar(tx, req, 'caja.arqueo', 'Periodo', periodo.id, { saldoSistema: saldo, saldoContado: entrada.saldoContado, diferencia });
        return { periodoId: periodo.id, saldoSistema: saldo, saldoContado: entrada.saldoContado, diferencia };
    });
    res.json(resultado);
});
rutas.post('/cajas/:id/cerrar-periodo', async (req, res) => {
    exigir(req, 'periodo.cerrar');
    const cajaId = validar(uuid, req.params.id);
    const confirmacion = validar(zod_1.z.object({ confirmarAnticiposPendientes: zod_1.z.boolean().optional() }).strict(), req.body ?? {});
    const resultado = await prisma_1.prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT "id" FROM "Caja" WHERE "id" = ${cajaId}::uuid FOR UPDATE`;
        const caja = await tx.caja.findUnique({ where: { id: cajaId } });
        if (!caja || (usuario(req).rol === 'CAJERO' && caja.responsableId !== usuario(req).empleadoId))
            throw new errores_1.NoEncontrado('Caja no encontrada');
        const periodo = await periodoAbierto(tx, cajaId);
        if (periodo.saldoContado === null)
            throw new errores_1.Conflicto('Realice el arqueo antes de cerrar el período');
        const movimientos = await tx.movimiento.findMany({ where: { cajaId, periodoId: periodo.id } });
        const anticipos = movimientos.filter((movimiento) => movimiento.tipo === 'ANTICIPO');
        const legalizaciones = movimientos.filter((movimiento) => movimiento.tipo === 'LEGALIZACION');
        const pendientes = Math.max(0, anticipos.reduce((sum, item) => sum + item.valor, 0) - legalizaciones.reduce((sum, item) => sum + item.valor, 0));
        if (pendientes > 0 && !confirmacion.confirmarAnticiposPendientes)
            throw new errores_1.Conflicto('Hay anticipos pendientes; confirme explícitamente para continuar');
        await tx.periodo.update({ where: { id: periodo.id }, data: { estado: 'CERRADO', cerradoEn: new Date(), cerradoPorId: usuario(req).id } });
        await auditar(tx, req, 'periodo.cerrar', 'Periodo', periodo.id, { saldoContado: periodo.saldoContado, anticiposPendientes: pendientes });
        return { periodoId: periodo.id, saldoContado: periodo.saldoContado, anticiposPendientes: pendientes, reembolsoSugerido: Math.max(0, caja.montoFondo - periodo.saldoContado) };
    });
    res.json(resultado);
});
rutas.post('/cajas/:id/reembolso', async (req, res) => {
    exigir(req, 'periodo.cerrar');
    const cajaId = validar(uuid, req.params.id);
    const { valor } = validar(esquemaReembolso, req.body);
    const resultado = await prisma_1.prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT "id" FROM "Caja" WHERE "id" = ${cajaId}::uuid FOR UPDATE`;
        const caja = await tx.caja.findUnique({ where: { id: cajaId } });
        if (!caja || (usuario(req).rol === 'CAJERO' && caja.responsableId !== usuario(req).empleadoId))
            throw new errores_1.NoEncontrado('Caja no encontrada');
        const periodo = await tx.periodo.findFirst({ where: { cajaId, estado: 'CERRADO' }, orderBy: { cerradoEn: 'desc' } });
        if (!periodo || (await tx.periodo.findFirst({ where: { cajaId, estado: 'ABIERTO' } })))
            throw new errores_1.Conflicto('Cierre de período no listo para reembolso');
        const movimiento = await tx.movimiento.create({ data: { cajaId, periodoId: periodo.id, tipo: 'REEMBOLSO', valor, concepto: 'Reembolso del fondo de caja menor', beneficiario: 'Empresa', registradoPorId: usuario(req).id } });
        const siguiente = await tx.periodo.create({ data: { cajaId } });
        await auditar(tx, req, 'caja.reembolso', 'Movimiento', movimiento.id, { valor });
        return { movimiento, periodoSiguienteId: siguiente.id };
    });
    res.status(201).json(resultado);
});
rutas.get('/cajas/:id/periodos', async (req, res) => {
    exigir(req, 'ver');
    const caja = await cajaPermitida(req, validar(uuid, req.params.id));
    res.json(await prisma_1.prisma.periodo.findMany({ where: { cajaId: caja.id }, orderBy: { abiertoEn: 'desc' } }));
});
rutas.get('/periodos/:id/resumen', async (req, res) => {
    exigir(req, 'ver');
    const id = validar(uuid, req.params.id);
    const periodo = await prisma_1.prisma.periodo.findUnique({ where: { id }, include: { caja: true, movimientos: true } });
    if (!periodo || (usuario(req).rol === 'CAJERO' && periodo.caja.responsableId !== usuario(req).empleadoId))
        throw new errores_1.NoEncontrado('Período no encontrado');
    res.json({ periodo: { id: periodo.id, cajaId: periodo.cajaId, abiertoEn: periodo.abiertoEn, cerradoEn: periodo.cerradoEn, estado: periodo.estado }, saldo: (0, saldo_1.calcularSaldo)(periodo.caja.montoFondo, periodo.movimientos), movimientos: periodo.movimientos });
});
rutas.get('/reportes/gastos', async (req, res) => {
    exigir(req, 'ver');
    const filtro = validar(zod_1.z.object({
        desde: zod_1.z.coerce.date(),
        hasta: zod_1.z.coerce.date(),
        cajaId: uuid.optional(),
        categoriaId: uuid.optional(),
        empleadoId: uuid.optional(),
        formato: zod_1.z.enum(['csv']).optional()
    }).strict(), req.query);
    if (filtro.desde > filtro.hasta)
        throw new errores_1.ErrorDeValidacion('La fecha inicial debe ser anterior a la fecha final');
    const where = {
        tipo: 'GASTO',
        fecha: { gte: filtro.desde, lte: filtro.hasta },
        ...(filtro.cajaId ? { cajaId: filtro.cajaId } : {}),
        ...(filtro.categoriaId ? { categoriaId: filtro.categoriaId } : {}),
        ...(filtro.empleadoId ? { empleadoId: filtro.empleadoId } : {}),
        ...(usuario(req).rol === 'CAJERO' ? { caja: { responsableId: usuario(req).empleadoId ?? '__sin_empleado__' } } : {})
    };
    const datos = await prisma_1.prisma.movimiento.findMany({ where, include: { caja: true, categoria: true, empleado: { select: { id: true, nombres: true, apellidos: true } } }, orderBy: { fecha: 'desc' }, take: 10000 });
    if (filtro.formato === 'csv') {
        const escapar = (valor) => {
            const texto = String(valor ?? '');
            const seguro = /^[=+\-@]/u.test(texto) ? `'${texto}` : texto;
            return `"${seguro.replaceAll('"', '""')}"`;
        };
        const filas = [['Fecha', 'Caja', 'Categoría', 'Empleado', 'Beneficiario', 'Concepto', 'Valor'], ...datos.map((item) => [item.fecha.toLocaleString('es-CO', { timeZone: 'America/Bogota' }), item.caja.nombre, item.categoria?.nombre, item.empleado ? `${item.empleado.nombres} ${item.empleado.apellidos}` : '', item.beneficiario, item.concepto, item.valor])];
        res.type('text/csv; charset=utf-8').attachment('gastos.csv').send(`\uFEFF${filas.map((fila) => fila.map(escapar).join(',')).join('\r\n')}`);
        return;
    }
    res.json({ datos, total: datos.length });
});
rutas.get('/usuarios', async (req, res) => {
    exigir(req, 'usuario.editar');
    const consulta = validar(paginacion, req.query);
    const where = consulta.q ? {
        OR: [{ email: { contains: consulta.q, mode: 'insensitive' } }, { nombre: { contains: consulta.q, mode: 'insensitive' } }]
    } : {};
    const [datos, total] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.usuario.findMany({ where, select: { id: true, email: true, nombre: true, rol: true, activo: true, empleadoId: true, creadoEn: true }, orderBy: { nombre: 'asc' }, skip: (consulta.pagina - 1) * consulta.porPagina, take: consulta.porPagina }),
        prisma_1.prisma.usuario.count({ where })
    ]);
    res.json({ datos, total, pagina: consulta.pagina, porPagina: consulta.porPagina });
});
rutas.post('/usuarios', async (req, res) => {
    exigir(req, 'usuario.editar');
    const entrada = validar(zod_1.z.object({ email: zod_1.z.string().trim().min(5).max(254).regex(/^[^@\s]+@[^@.]+(\.[^@.]+)+$/).transform((email) => email.toLowerCase()), nombre: nombrePersona, clave: zod_1.z.string().min(1).max(200), rol: zod_1.z.enum(['ADMIN', 'CAJERO', 'CONSULTA']), empleadoId: uuid.optional().nullable() }).strict(), req.body);
    const { validarClave } = await Promise.resolve().then(() => __importStar(require('../dominio/clave')));
    validarClave(entrada.clave);
    if (entrada.rol === 'CAJERO' && !entrada.empleadoId)
        throw new errores_1.ErrorDeValidacion('Vincule el usuario CAJERO con un empleado activo');
    const bcrypt = await Promise.resolve().then(() => __importStar(require('bcrypt')));
    const creado = await prisma_1.prisma.$transaction(async (tx) => {
        if (entrada.empleadoId) {
            const empleado = await tx.empleado.findUnique({ where: { id: entrada.empleadoId } });
            if (!empleado || empleado.estado !== 'ACTIVO')
                throw new errores_1.ErrorDeValidacion('El usuario debe vincularse a un empleado activo');
        }
        const registro = await tx.usuario.create({ data: { email: entrada.email, nombre: entrada.nombre, passwordHash: await bcrypt.hash(entrada.clave, 12), rol: entrada.rol, empleadoId: entrada.empleadoId } });
        await auditar(tx, req, 'usuario.crear', 'Usuario', registro.id, { email: registro.email, rol: registro.rol });
        return registro;
    });
    res.status(201).json({ id: creado.id, email: creado.email, nombre: creado.nombre, rol: creado.rol, activo: creado.activo });
});
rutas.patch('/usuarios/:id', async (req, res) => {
    exigir(req, 'usuario.editar');
    const id = validar(uuid, req.params.id);
    const entrada = validar(zod_1.z.object({ nombre: nombrePersona.optional(), rol: zod_1.z.enum(['ADMIN', 'CAJERO', 'CONSULTA']).optional(), activo: zod_1.z.boolean().optional(), empleadoId: uuid.optional().nullable() }).strict(), req.body);
    const actualizado = await prisma_1.prisma.$transaction(async (tx) => {
        if (entrada.activo === false || entrada.rol)
            await tx.$queryRaw `SELECT "id" FROM "Usuario" WHERE "rol" = 'ADMIN' AND "activo" = true FOR UPDATE`;
        const actual = await tx.usuario.findUnique({ where: { id } });
        if (!actual)
            throw new errores_1.NoEncontrado('Usuario no encontrado');
        if (id === usuario(req).id && (entrada.rol || entrada.activo === false))
            throw new errores_1.ErrorDeValidacion('No puede cambiar su propio rol ni desactivarse');
        const pierdeAdmin = actual.rol === 'ADMIN' && actual.activo && (entrada.activo === false || (entrada.rol !== undefined && entrada.rol !== 'ADMIN'));
        if (pierdeAdmin && await tx.usuario.count({ where: { rol: 'ADMIN', activo: true } }) <= 1)
            throw new errores_1.Conflicto('No se puede desactivar al último ADMIN activo');
        if (entrada.empleadoId) {
            const empleado = await tx.empleado.findUnique({ where: { id: entrada.empleadoId } });
            if (!empleado || empleado.estado !== 'ACTIVO')
                throw new errores_1.ErrorDeValidacion('El usuario debe vincularse a un empleado activo');
        }
        if ((entrada.rol ?? actual.rol) === 'CAJERO' && !('empleadoId' in entrada ? entrada.empleadoId : actual.empleadoId)) {
            throw new errores_1.ErrorDeValidacion('Vincule el usuario CAJERO con un empleado activo');
        }
        const registro = await tx.usuario.update({ where: { id }, data: entrada });
        await auditar(tx, req, 'usuario.editar', 'Usuario', id, { rol: registro.rol, activo: registro.activo });
        return registro;
    });
    res.json({ id: actualizado.id, email: actualizado.email, nombre: actualizado.nombre, rol: actualizado.rol, activo: actualizado.activo, empleadoId: actualizado.empleadoId });
});
rutas.post('/usuarios/:id/restablecer-clave', async (req, res) => {
    exigir(req, 'usuario.editar');
    const id = validar(uuid, req.params.id);
    const entrada = validar(zod_1.z.object({ claveNueva: zod_1.z.string().min(1).max(200) }).strict(), req.body);
    const { validarClave } = await Promise.resolve().then(() => __importStar(require('../dominio/clave')));
    validarClave(entrada.claveNueva);
    const bcrypt = await Promise.resolve().then(() => __importStar(require('bcrypt')));
    const usuarioObjetivo = await prisma_1.prisma.usuario.findUnique({ where: { id } });
    if (!usuarioObjetivo)
        throw new errores_1.NoEncontrado('Usuario no encontrado');
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.usuario.update({ where: { id }, data: { passwordHash: await bcrypt.hash(entrada.claveNueva, 12), claveCambiadaEn: new Date() } });
        await auditar(tx, req, 'usuario.restablecer_clave', 'Usuario', id);
    });
    res.sendStatus(204);
});
rutas.get('/auditoria', async (req, res) => {
    exigir(req, 'auditoria.ver');
    const consulta = validar(paginacion, req.query);
    const [datos, total] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.auditoria.findMany({ include: { usuario: { select: { id: true, nombre: true, email: true } } }, orderBy: { fecha: 'desc' }, skip: (consulta.pagina - 1) * consulta.porPagina, take: consulta.porPagina }),
        prisma_1.prisma.auditoria.count()
    ]);
    res.json({ datos, total, pagina: consulta.pagina, porPagina: consulta.porPagina });
});
