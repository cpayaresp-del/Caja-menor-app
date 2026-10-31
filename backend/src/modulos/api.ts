import { Router, Request, Response, raw } from 'express';
import { z } from 'zod';
import { Prisma, TipoMovimiento } from '@prisma/client';
import { HeadObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import { prisma } from '../comun/prisma';
import { ErrorDeValidacion, NoEncontrado, Prohibido, Conflicto } from '../dominio/errores';
import { calcularSaldo } from '../dominio/saldo';
import { puede } from '../dominio/permisos';

const rutas = Router();
const uuid = z.string().uuid();
const nombrePersona = z.string().trim().min(1).max(100).regex(/^\p{L}[\p{L}\p{M} '’.-]*$/u);
const paginacion = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional()
}).strict();
const consultaEmpleados = paginacion.extend({
  estado: z.enum(['ACTIVO', 'INACTIVO']).optional()
}).strict();
const esquemaEmpleado = z.object({
  tipoDocumento: z.enum(['CC', 'CE', 'PA', 'TI', 'PPT']),
  numeroDocumento: z.string().trim().min(1).max(40),
  nombres: z.string().trim().min(1).max(100).regex(/^\p{L}[\p{L}\p{M} '’.-]*$/u),
  apellidos: z.string().trim().min(1).max(100).regex(/^\p{L}[\p{L}\p{M} '’.-]*$/u),
  cargo: z.string().trim().min(1).max(100),
  area: z.string().trim().min(1).max(100),
  telefono: z.string().trim().min(1).max(30),
  email: z.string().trim().min(5).max(254).regex(/^[^@\s]+@[^@.]+(\.[^@.]+)+$/).optional().nullable(),
  fechaIngreso: z.coerce.date(),
  fechaRetiro: z.coerce.date().optional().nullable(),
  observaciones: z.string().max(2000).optional().nullable()
}).strict();
const esquemaCaja = z.object({
  nombre: z.string().trim().min(1).max(100),
  responsableId: uuid,
  montoFondo: z.number().int().positive().max(2_147_483_647),
  topePorGasto: z.number().int().positive().max(2_147_483_647)
}).strict();
const esquemaMovimiento = z.object({
  tipo: z.enum(['GASTO', 'ANTICIPO', 'LEGALIZACION']),
  valor: z.number().int().positive().max(2_147_483_647),
  fecha: z.coerce.date().optional(),
  concepto: z.string().trim().min(1).max(500),
  categoriaId: uuid.optional(),
  empleadoId: uuid.optional(),
  beneficiario: z.string().trim().min(1).max(200),
  nitBeneficiario: z.string().trim().max(40).optional().nullable(),
  numeroSoporte: z.string().trim().max(100).optional().nullable(),
  soporteUrl: z.string().max(500).optional().nullable()
}).strict();
const esquemaMotivo = z.object({ motivo: z.string().trim().min(3).max(500) }).strict();
const esquemaArqueo = z.object({ saldoContado: z.number().int().min(0).max(2_147_483_647), motivo: z.string().trim().max(500).optional() }).strict();
const esquemaReembolso = z.object({ valor: z.number().int().positive().max(2_147_483_647) }).strict();
const s3 = config.S3_BUCKET && config.S3_REGION
  ? new S3Client({
      region: config.S3_REGION,
      ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT, forcePathStyle: true } : {}),
      ...(config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY ? { credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY } } : {})
    })
  : null;
const extensiones = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const carpetaLocal = path.resolve(process.cwd(), 'uploads');

function extensionValida(nombre: string, archivo: Buffer): string {
  const extension = path.extname(nombre).toLowerCase();
  const firmaValida = extension === '.jpg' || extension === '.jpeg'
    ? archivo.length >= 3 && archivo[0] === 0xff && archivo[1] === 0xd8 && archivo[2] === 0xff
    : extension === '.png'
      ? archivo.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : extension === '.webp'
        ? archivo.length >= 12 && archivo.toString('ascii', 0, 4) === 'RIFF' && archivo.toString('ascii', 8, 12) === 'WEBP'
        : extension === '.pdf'
          ? archivo.toString('ascii', 0, 5) === '%PDF-'
          : false;
  if (!extensiones.has(extension) || !firmaValida) throw new ErrorDeValidacion('El archivo debe ser JPG, PNG, WebP o PDF y coincidir con su extensión');
  return extension;
}

function mimePorExtension(extension: string): string {
  return extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg'
    : extension === '.png' ? 'image/png'
      : extension === '.webp' ? 'image/webp' : 'application/pdf';
}

async function validarSoporte(cajaId: string, soporteUrl: string | null | undefined): Promise<void> {
  if (!soporteUrl) return;
  const prefijo = `/api/v1/cajas/${cajaId}/soportes/`;
  const archivo = soporteUrl.startsWith(prefijo) ? soporteUrl.slice(prefijo.length) : '';
  if (!/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$/i.test(archivo)) throw new ErrorDeValidacion('El soporte no pertenece a esta caja o no es válido');
  if (s3 && config.S3_BUCKET) {
    await s3.send(new HeadObjectCommand({ Bucket: config.S3_BUCKET, Key: `caja-menor-app/cajas/${cajaId}/${archivo}` }));
  } else {
    await fs.access(path.join(carpetaLocal, 'cajas', cajaId, archivo));
  }
}

function validar<T>(esquema: z.ZodType<T>, datos: unknown): T {
  const resultado = esquema.safeParse(datos);
  if (!resultado.success) throw new ErrorDeValidacion(resultado.error.issues.map((error) => `${error.path.join('.')}: ${error.message}`).join('; '));
  return resultado.data;
}

function usuario(req: Request) {
  if (!req.usuario) throw new Prohibido('Sesión no válida');
  return req.usuario;
}

function exigir(req: Request, permiso: Parameters<typeof puede>[1]): void {
  if (!puede(usuario(req).rol, permiso)) throw new Prohibido('No tiene permiso para esta acción');
}

async function cajaPermitida(req: Request, cajaId: string) {
  const caja = await prisma.caja.findUnique({ where: { id: cajaId }, include: { responsable: { select: { id: true, nombres: true, apellidos: true } } } });
  if (!caja || (usuario(req).rol === 'CAJERO' && caja.responsableId !== usuario(req).empleadoId)) throw new NoEncontrado('Caja no encontrada');
  return caja;
}

async function periodoAbierto(tx: Prisma.TransactionClient, cajaId: string) {
  const periodo = await tx.periodo.findFirst({ where: { cajaId, estado: 'ABIERTO' } });
  if (!periodo) throw new Conflicto('La caja no tiene un período abierto');
  return periodo;
}

async function saldoPeriodo(tx: Prisma.TransactionClient, cajaId: string, periodoId: string) {
  const caja = await tx.caja.findUnique({ where: { id: cajaId } });
  if (!caja) throw new NoEncontrado('Caja no encontrada');
  const movimientos = await tx.movimiento.findMany({ where: { cajaId, periodoId } });
  return calcularSaldo(caja.montoFondo, movimientos);
}

async function auditar(tx: Prisma.TransactionClient, req: Request, accion: string, entidad: string, entidadId: string, despues?: Prisma.InputJsonValue) {
  await tx.auditoria.create({
    data: { usuarioId: usuario(req).id, accion, entidad, entidadId, ip: req.ip, ...(despues ? { despues } : {}) }
  });
}

rutas.get('/empleados', async (req, res) => {
  exigir(req, 'ver');
  const consulta = validar(consultaEmpleados, req.query);
  const where: Prisma.EmpleadoWhereInput = {
    ...(consulta.estado ? { estado: consulta.estado } : {}),
    ...(consulta.q ? {
      OR: [
        { nombres: { contains: consulta.q, mode: 'insensitive' } },
        { apellidos: { contains: consulta.q, mode: 'insensitive' } },
        { numeroDocumento: { contains: consulta.q, mode: 'insensitive' } }
      ]
    } : {})
  };
  const [datos, total] = await prisma.$transaction([
    prisma.empleado.findMany({ where, skip: (consulta.pagina - 1) * consulta.porPagina, take: consulta.porPagina, orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }] }),
    prisma.empleado.count({ where })
  ]);
  res.json({ datos: usuario(req).rol === 'CONSULTA' ? datos.map(({ telefono: _telefono, email: _email, ...empleado }) => empleado) : datos, total, pagina: consulta.pagina, porPagina: consulta.porPagina });
});

rutas.post('/empleados', async (req, res) => {
  exigir(req, 'empleado.editar');
  const entrada = validar(esquemaEmpleado, req.body);
  const empleado = await prisma.$transaction(async (tx) => {
    const creado = await tx.empleado.create({ data: { ...entrada, email: entrada.email?.trim().toLowerCase() } });
    await auditar(tx, req, 'empleado.crear', 'Empleado', creado.id);
    return creado;
  });
  res.status(201).json(empleado);
});

rutas.get('/empleados/:id', async (req, res) => {
  exigir(req, 'ver');
  const id = validar(uuid, req.params.id);
  const empleado = await prisma.empleado.findUnique({ where: { id } });
  if (!empleado) throw new NoEncontrado('Empleado no encontrado');
  if (usuario(req).rol === 'CONSULTA') {
    const { telefono: _telefono, email: _email, ...visible } = empleado;
    res.json(visible);
  } else res.json(empleado);
});

rutas.patch('/empleados/:id', async (req, res) => {
  exigir(req, 'empleado.editar');
  const id = validar(uuid, req.params.id);
  const entrada = validar(esquemaEmpleado.partial().strict(), req.body);
  const previo = await prisma.empleado.findUnique({ where: { id } });
  if (!previo) throw new NoEncontrado('Empleado no encontrado');
  const actualizado = await prisma.$transaction(async (tx) => {
    const empleado = await tx.empleado.update({ where: { id }, data: { ...entrada, email: entrada.email?.trim().toLowerCase() } });
    await auditar(tx, req, 'empleado.editar', 'Empleado', id);
    return empleado;
  });
  res.json(actualizado);
});

rutas.patch('/empleados/:id/estado', async (req, res) => {
  exigir(req, 'empleado.editar');
  const id = validar(uuid, req.params.id);
  const entrada = validar(z.object({ estado: z.enum(['ACTIVO', 'INACTIVO']) }).strict(), req.body);
  const actualizado = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Empleado" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const empleado = await tx.empleado.findUnique({ where: { id } });
    if (!empleado) throw new NoEncontrado('Empleado no encontrado');
    if (entrada.estado === 'INACTIVO' && await tx.caja.count({ where: { responsableId: id, estado: 'ABIERTA' } })) {
      throw new Conflicto('Reasigne el responsable de las cajas abiertas antes de inactivar al empleado');
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
  const where: Prisma.CajaWhereInput = {
    ...(usuario(req).rol === 'CAJERO' ? { responsableId: usuario(req).empleadoId ?? '__sin_empleado__' } : {}),
    ...(consulta.q ? { nombre: { contains: consulta.q, mode: 'insensitive' } } : {})
  };
  const [datos, total] = await prisma.$transaction([
    prisma.caja.findMany({ where, include: { responsable: { select: { id: true, nombres: true, apellidos: true } } }, skip: (consulta.pagina - 1) * consulta.porPagina, take: consulta.porPagina, orderBy: { nombre: 'asc' } }),
    prisma.caja.count({ where })
  ]);
  res.json({ datos, total, pagina: consulta.pagina, porPagina: consulta.porPagina });
});

rutas.post('/cajas', async (req, res) => {
  exigir(req, 'caja.editar');
  const entrada = validar(esquemaCaja, req.body);
  if (entrada.topePorGasto > entrada.montoFondo) throw new ErrorDeValidacion('El tope por gasto no puede superar el monto del fondo');
  const caja = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Empleado" WHERE "id" = ${entrada.responsableId}::uuid FOR UPDATE`;
    const responsable = await tx.empleado.findUnique({ where: { id: entrada.responsableId } });
    if (!responsable || responsable.estado !== 'ACTIVO') throw new ErrorDeValidacion('El responsable debe ser un empleado activo');
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
  const entrada = validar(esquemaCaja.partial().strict().extend({ estado: z.enum(['ABIERTA', 'CERRADA']).optional() }), req.body);
  const caja = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Caja" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const previo = await tx.caja.findUnique({ where: { id } });
    if (!previo) throw new NoEncontrado('Caja no encontrada');
    if ((entrada.topePorGasto ?? previo.topePorGasto) > (entrada.montoFondo ?? previo.montoFondo)) throw new ErrorDeValidacion('El tope por gasto no puede superar el monto del fondo');
    if (entrada.responsableId) {
      await tx.$queryRaw`SELECT "id" FROM "Empleado" WHERE "id" = ${entrada.responsableId}::uuid FOR UPDATE`;
      const empleado = await tx.empleado.findUnique({ where: { id: entrada.responsableId } });
      if (!empleado || empleado.estado !== 'ACTIVO') throw new ErrorDeValidacion('El responsable debe ser un empleado activo');
    }
    if (entrada.estado === 'CERRADA' && previo.estado !== 'CERRADA' && await tx.periodo.findFirst({ where: { cajaId: id, estado: 'ABIERTO' } })) {
      throw new Conflicto('Cierre el período abierto antes de cerrar la caja');
    }
    if (entrada.estado === 'ABIERTA' && previo.estado !== 'ABIERTA') {
      if (await tx.periodo.findFirst({ where: { cajaId: id, estado: 'ABIERTO' } })) throw new Conflicto('La caja ya tiene un período abierto');
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
  const periodo = await prisma.periodo.findFirst({ where: { cajaId: caja.id, estado: 'ABIERTO' } });
  if (!periodo) throw new Conflicto('La caja no tiene un período abierto');
  const movimientos = await prisma.movimiento.findMany({ where: { cajaId: caja.id, periodoId: periodo.id } });
  res.json({ cajaId: caja.id, periodoId: periodo.id, saldo: calcularSaldo(caja.montoFondo, movimientos) });
});

rutas.get('/categorias', async (req, res) => {
  exigir(req, 'ver');
  res.json(await prisma.categoriaGasto.findMany({ orderBy: { nombre: 'asc' } }));
});

rutas.post('/cajas/:id/soportes', raw({ type: 'application/octet-stream', limit: '5mb' }), async (req, res) => {
  exigir(req, 'movimiento.crear');
  const cajaId = validar(uuid, req.params.id);
  await cajaPermitida(req, cajaId);
  if (!Buffer.isBuffer(req.body)) throw new ErrorDeValidacion('Envíe el archivo como application/octet-stream');
  const nombre = req.get('X-File-Name') ?? '';
  if (nombre.length > 200) throw new ErrorDeValidacion('El nombre del archivo es demasiado largo');
  const extension = extensionValida(nombre, req.body);
  const archivo = `${randomUUID()}${extension}`;
  const tipo = mimePorExtension(extension);
  if (s3 && config.S3_BUCKET) {
    await s3.send(new PutObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: `caja-menor-app/cajas/${cajaId}/${archivo}`,
      Body: req.body,
      ContentType: tipo,
    }));
  } else {
    const directorio = path.join(carpetaLocal, 'cajas', cajaId);
    await fs.mkdir(directorio, { recursive: true });
    await fs.writeFile(path.join(directorio, archivo), req.body, { flag: 'wx' });
  }
  res.status(201).json({ soporteUrl: `/api/v1/cajas/${cajaId}/soportes/${archivo}` });
});

rutas.get('/cajas/:id/soportes/:archivo', async (req, res) => {
  exigir(req, 'ver');
  const cajaId = validar(uuid, req.params.id);
  await cajaPermitida(req, cajaId);
  const archivo = validar(z.string().regex(/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$/i), req.params.archivo);
  if (s3 && config.S3_BUCKET) {
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: `caja-menor-app/cajas/${cajaId}/${archivo}` }), { expiresIn: 300 });
    res.redirect(302, url);
    return;
  }
  const ruta = path.join(carpetaLocal, 'cajas', cajaId, archivo);
  await fs.access(ruta);
  res.type(mimePorExtension(path.extname(archivo))).sendFile(ruta);
});
rutas.post('/categorias', async (req, res) => {
  exigir(req, 'categoria.editar');
  const entrada = validar(z.object({ nombre: z.string().trim().min(1).max(100), activa: z.boolean().optional() }).strict(), req.body);
  const categoria = await prisma.$transaction(async (tx) => {
    const creada = await tx.categoriaGasto.create({ data: entrada });
    await auditar(tx, req, 'categoria.crear', 'CategoriaGasto', creada.id);
    return creada;
  });
  res.status(201).json(categoria);
});
rutas.patch('/categorias/:id', async (req, res) => {
  exigir(req, 'categoria.editar');
  const id = validar(uuid, req.params.id);
  const entrada = validar(z.object({ nombre: z.string().trim().min(1).max(100).optional(), activa: z.boolean().optional() }).strict(), req.body);
  if (!(await prisma.categoriaGasto.findUnique({ where: { id } }))) throw new NoEncontrado('Categoría no encontrada');
  const categoria = await prisma.$transaction(async (tx) => {
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
  const [datos, total] = await prisma.$transaction([
    prisma.movimiento.findMany({ where: { cajaId: caja.id }, include: { categoria: true, empleado: { select: { id: true, nombres: true, apellidos: true } } }, orderBy: { fecha: 'desc' }, skip: (consulta.pagina - 1) * consulta.porPagina, take: consulta.porPagina }),
    prisma.movimiento.count({ where: { cajaId: caja.id } })
  ]);
  res.json({ datos, total, pagina: consulta.pagina, porPagina: consulta.porPagina });
});

rutas.post('/cajas/:id/movimientos', async (req, res) => {
  exigir(req, 'movimiento.crear');
  const entrada = validar(esquemaMovimiento, req.body);
  const cajaId = validar(uuid, req.params.id);
  const creado = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Caja" WHERE "id" = ${cajaId}::uuid FOR UPDATE`;
    const caja = await tx.caja.findUnique({ where: { id: cajaId } });
    if (!caja || (usuario(req).rol === 'CAJERO' && caja.responsableId !== usuario(req).empleadoId)) throw new NoEncontrado('Caja no encontrada');
    if (caja.estado !== 'ABIERTA') throw new Conflicto('La caja está cerrada');
    const periodo = await periodoAbierto(tx, cajaId);
    if (entrada.tipo === 'GASTO' && !entrada.categoriaId) throw new ErrorDeValidacion('Seleccione la categoría del gasto');
    if ((entrada.tipo === 'ANTICIPO' || entrada.tipo === 'LEGALIZACION') && !entrada.empleadoId) throw new ErrorDeValidacion('Seleccione un empleado activo');
    if (entrada.empleadoId) {
      const empleado = await tx.empleado.findUnique({ where: { id: entrada.empleadoId } });
      if (!empleado || empleado.estado !== 'ACTIVO') throw new ErrorDeValidacion('El empleado debe estar activo');
    }
    if (entrada.categoriaId && !(await tx.categoriaGasto.findFirst({ where: { id: entrada.categoriaId, activa: true } }))) throw new ErrorDeValidacion('La categoría no existe o está inactiva');
    await validarSoporte(cajaId, entrada.soporteUrl);
    if (entrada.tipo === 'GASTO' && entrada.valor > caja.topePorGasto) throw new ErrorDeValidacion('El gasto supera el tope permitido por movimiento');
    const saldo = await saldoPeriodo(tx, cajaId, periodo.id);
    if (entrada.tipo !== 'LEGALIZACION' && entrada.valor > saldo) throw new ErrorDeValidacion('El movimiento dejaría el saldo de la caja en negativo');
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
  const anulacion = await prisma.$transaction(async (tx) => {
    const original = await tx.movimiento.findUnique({ where: { id }, include: { periodo: true } });
    if (!original) throw new NoEncontrado('Movimiento no encontrado');
    await tx.$queryRaw`SELECT "id" FROM "Caja" WHERE "id" = ${original.cajaId}::uuid FOR UPDATE`;
    if (original.periodo.estado !== 'ABIERTO') throw new Conflicto('No se puede anular un movimiento de un período cerrado');
    if (await tx.movimiento.findUnique({ where: { anulaA: id } })) throw new Conflicto('El movimiento ya fue anulado');
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
  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Caja" WHERE "id" = ${cajaId}::uuid FOR UPDATE`;
    const caja = await tx.caja.findUnique({ where: { id: cajaId } });
    if (!caja || (usuario(req).rol === 'CAJERO' && caja.responsableId !== usuario(req).empleadoId)) throw new NoEncontrado('Caja no encontrada');
    const periodo = await periodoAbierto(tx, cajaId);
    const saldo = await saldoPeriodo(tx, cajaId, periodo.id);
    const diferencia = entrada.saldoContado - saldo;
    if (diferencia !== 0) {
      if (!entrada.motivo?.trim()) throw new ErrorDeValidacion('Indique el motivo de la diferencia del arqueo');
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
  const confirmacion = validar(z.object({ confirmarAnticiposPendientes: z.boolean().optional() }).strict(), req.body ?? {});
  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Caja" WHERE "id" = ${cajaId}::uuid FOR UPDATE`;
    const caja = await tx.caja.findUnique({ where: { id: cajaId } });
    if (!caja || (usuario(req).rol === 'CAJERO' && caja.responsableId !== usuario(req).empleadoId)) throw new NoEncontrado('Caja no encontrada');
    const periodo = await periodoAbierto(tx, cajaId);
    if (periodo.saldoContado === null) throw new Conflicto('Realice el arqueo antes de cerrar el período');
    const movimientos = await tx.movimiento.findMany({ where: { cajaId, periodoId: periodo.id } });
    const anticipos = movimientos.filter((movimiento) => movimiento.tipo === 'ANTICIPO');
    const legalizaciones = movimientos.filter((movimiento) => movimiento.tipo === 'LEGALIZACION');
    const pendientes = Math.max(0, anticipos.reduce((sum, item) => sum + item.valor, 0) - legalizaciones.reduce((sum, item) => sum + item.valor, 0));
    if (pendientes > 0 && !confirmacion.confirmarAnticiposPendientes) throw new Conflicto('Hay anticipos pendientes; confirme explícitamente para continuar');
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
  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Caja" WHERE "id" = ${cajaId}::uuid FOR UPDATE`;
    const caja = await tx.caja.findUnique({ where: { id: cajaId } });
    if (!caja || (usuario(req).rol === 'CAJERO' && caja.responsableId !== usuario(req).empleadoId)) throw new NoEncontrado('Caja no encontrada');
    const periodo = await tx.periodo.findFirst({ where: { cajaId, estado: 'CERRADO' }, orderBy: { cerradoEn: 'desc' } });
    if (!periodo || (await tx.periodo.findFirst({ where: { cajaId, estado: 'ABIERTO' } }))) throw new Conflicto('Cierre de período no listo para reembolso');
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
  res.json(await prisma.periodo.findMany({ where: { cajaId: caja.id }, orderBy: { abiertoEn: 'desc' } }));
});
rutas.get('/periodos/:id/resumen', async (req, res) => {
  exigir(req, 'ver');
  const id = validar(uuid, req.params.id);
  const periodo = await prisma.periodo.findUnique({ where: { id }, include: { caja: true, movimientos: true } });
  if (!periodo || (usuario(req).rol === 'CAJERO' && periodo.caja.responsableId !== usuario(req).empleadoId)) throw new NoEncontrado('Período no encontrado');
  res.json({ periodo: { id: periodo.id, cajaId: periodo.cajaId, abiertoEn: periodo.abiertoEn, cerradoEn: periodo.cerradoEn, estado: periodo.estado }, saldo: calcularSaldo(periodo.caja.montoFondo, periodo.movimientos), movimientos: periodo.movimientos });
});

rutas.get('/reportes/gastos', async (req, res) => {
  exigir(req, 'ver');
  const filtro = validar(z.object({
    desde: z.coerce.date(),
    hasta: z.coerce.date(),
    cajaId: uuid.optional(),
    categoriaId: uuid.optional(),
    empleadoId: uuid.optional(),
    formato: z.enum(['csv']).optional()
  }).strict(), req.query);
  if (filtro.desde > filtro.hasta) throw new ErrorDeValidacion('La fecha inicial debe ser anterior a la fecha final');
  const where: Prisma.MovimientoWhereInput = {
    tipo: 'GASTO',
    fecha: { gte: filtro.desde, lte: filtro.hasta },
    ...(filtro.cajaId ? { cajaId: filtro.cajaId } : {}),
    ...(filtro.categoriaId ? { categoriaId: filtro.categoriaId } : {}),
    ...(filtro.empleadoId ? { empleadoId: filtro.empleadoId } : {}),
    ...(usuario(req).rol === 'CAJERO' ? { caja: { responsableId: usuario(req).empleadoId ?? '__sin_empleado__' } } : {})
  };
  const datos = await prisma.movimiento.findMany({ where, include: { caja: true, categoria: true, empleado: { select: { id: true, nombres: true, apellidos: true } } }, orderBy: { fecha: 'desc' }, take: 10000 });
  if (filtro.formato === 'csv') {
    const escapar = (valor: unknown) => {
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
  const where: Prisma.UsuarioWhereInput = consulta.q ? {
    OR: [{ email: { contains: consulta.q, mode: 'insensitive' } }, { nombre: { contains: consulta.q, mode: 'insensitive' } }]
  } : {};
  const [datos, total] = await prisma.$transaction([
    prisma.usuario.findMany({ where, select: { id: true, email: true, nombre: true, rol: true, activo: true, empleadoId: true, creadoEn: true }, orderBy: { nombre: 'asc' }, skip: (consulta.pagina - 1) * consulta.porPagina, take: consulta.porPagina }),
    prisma.usuario.count({ where })
  ]);
  res.json({ datos, total, pagina: consulta.pagina, porPagina: consulta.porPagina });
});
rutas.post('/usuarios', async (req, res) => {
  exigir(req, 'usuario.editar');
  const entrada = validar(z.object({ email: z.string().trim().min(5).max(254).regex(/^[^@\s]+@[^@.]+(\.[^@.]+)+$/).transform((email) => email.toLowerCase()), nombre: nombrePersona, clave: z.string().min(1).max(200), rol: z.enum(['ADMIN', 'CAJERO', 'CONSULTA']), empleadoId: uuid.optional().nullable() }).strict(), req.body);
  const { validarClave } = await import('../dominio/clave');
  validarClave(entrada.clave);
  if (entrada.rol === 'CAJERO' && !entrada.empleadoId) throw new ErrorDeValidacion('Vincule el usuario CAJERO con un empleado activo');
  const bcrypt = await import('bcrypt');
  const creado = await prisma.$transaction(async (tx) => {
    if (entrada.empleadoId) {
      const empleado = await tx.empleado.findUnique({ where: { id: entrada.empleadoId } });
      if (!empleado || empleado.estado !== 'ACTIVO') throw new ErrorDeValidacion('El usuario debe vincularse a un empleado activo');
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
  const entrada = validar(z.object({ nombre: nombrePersona.optional(), rol: z.enum(['ADMIN', 'CAJERO', 'CONSULTA']).optional(), activo: z.boolean().optional(), empleadoId: uuid.optional().nullable() }).strict(), req.body);
  const actualizado = await prisma.$transaction(async (tx) => {
    if (entrada.activo === false || entrada.rol) await tx.$queryRaw`SELECT "id" FROM "Usuario" WHERE "rol" = 'ADMIN' AND "activo" = true FOR UPDATE`;
    const actual = await tx.usuario.findUnique({ where: { id } });
    if (!actual) throw new NoEncontrado('Usuario no encontrado');
    if (id === usuario(req).id && (entrada.rol || entrada.activo === false)) throw new ErrorDeValidacion('No puede cambiar su propio rol ni desactivarse');
    const pierdeAdmin = actual.rol === 'ADMIN' && actual.activo && (entrada.activo === false || (entrada.rol !== undefined && entrada.rol !== 'ADMIN'));
    if (pierdeAdmin && await tx.usuario.count({ where: { rol: 'ADMIN', activo: true } }) <= 1) throw new Conflicto('No se puede desactivar al último ADMIN activo');
    if (entrada.empleadoId) {
      const empleado = await tx.empleado.findUnique({ where: { id: entrada.empleadoId } });
      if (!empleado || empleado.estado !== 'ACTIVO') throw new ErrorDeValidacion('El usuario debe vincularse a un empleado activo');
    }
    if ((entrada.rol ?? actual.rol) === 'CAJERO' && !('empleadoId' in entrada ? entrada.empleadoId : actual.empleadoId)) {
      throw new ErrorDeValidacion('Vincule el usuario CAJERO con un empleado activo');
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
  const entrada = validar(z.object({ claveNueva: z.string().min(1).max(200) }).strict(), req.body);
  const { validarClave } = await import('../dominio/clave');
  validarClave(entrada.claveNueva);
  const bcrypt = await import('bcrypt');
  const usuarioObjetivo = await prisma.usuario.findUnique({ where: { id } });
  if (!usuarioObjetivo) throw new NoEncontrado('Usuario no encontrado');
  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id }, data: { passwordHash: await bcrypt.hash(entrada.claveNueva, 12), claveCambiadaEn: new Date() } });
    await auditar(tx, req, 'usuario.restablecer_clave', 'Usuario', id);
  });
  res.sendStatus(204);
});
rutas.get('/auditoria', async (req, res) => {
  exigir(req, 'auditoria.ver');
  const consulta = validar(paginacion, req.query);
  const [datos, total] = await prisma.$transaction([
    prisma.auditoria.findMany({ include: { usuario: { select: { id: true, nombre: true, email: true } } }, orderBy: { fecha: 'desc' }, skip: (consulta.pagina - 1) * consulta.porPagina, take: consulta.porPagina }),
    prisma.auditoria.count()
  ]);
  res.json({ datos, total, pagina: consulta.pagina, porPagina: consulta.porPagina });
});

export { rutas as rutasApi };
