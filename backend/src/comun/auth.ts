import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config, esProduccion } from '../config';
import { prisma } from './prisma';

export const nombreCookie = `${esProduccion ? '__Host-' : ''}caja-menor-app-session`;
export const opcionesCookie = {
  httpOnly: true,
  secure: esProduccion,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 24 * 60 * 60 * 1000
};

declare global {
  namespace Express {
    interface Request {
      usuario?: { id: string; email: string; nombre: string; rol: 'ADMIN' | 'CAJERO' | 'CONSULTA'; empleadoId: string | null };
    }
  }
}

export function crearToken(usuarioId: string): string {
  return jwt.sign({}, config.JWT_SECRET, { subject: usuarioId, expiresIn: '24h' });
}

export async function autenticar(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[nombreCookie];
  if (!token) {
    res.status(401).json({ mensaje: 'Sesión no válida' });
    return;
  }
  try {
    const carga = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    const usuario = await prisma.usuario.findUnique({ where: { id: carga.sub } });
    if (!usuario || !usuario.activo || (usuario.claveCambiadaEn && carga.iat && usuario.claveCambiadaEn.getTime() >= carga.iat * 1000)) {
      res.status(401).json({ mensaje: 'Sesión no válida' });
      return;
    }
    req.usuario = { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol, empleadoId: usuario.empleadoId };
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ mensaje: 'Sesión no válida' });
      return;
    }
    next(error);
  }
}
