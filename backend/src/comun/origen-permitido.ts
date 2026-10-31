import { NextFunction, Request, Response } from 'express';
import { origenesPermitidos } from '../config';

const metodosEscritura = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function validarOrigen(req: Request, res: Response, next: NextFunction): void {
  const origen = req.get('Origin');
  if (metodosEscritura.has(req.method) && origen && !origenesPermitidos.includes(origen)) {
    res.status(403).json({ mensaje: 'Origen no permitido' });
    return;
  }
  next();
}
