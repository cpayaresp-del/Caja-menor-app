process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'clave-de-pruebas-de-32-caracteres-minimo';
process.env.FRONTEND_URL = 'http://localhost:4200';
process.env.NODE_ENV = 'test';
delete process.env.MIGRATE_TOKEN;

import request from 'supertest';
import bcrypt from 'bcrypt';
import { Usuario } from '@prisma/client';
import { app } from './app';
import { prisma } from './comun/prisma';

describe('rutas básicas', () => {
  it('health no requiere consultar la base', async () => {
    await request(app).get('/health').expect(200, { ok: true });
  });

  it('auth/me requiere cookie y no acepta Authorization Bearer', async () => {
    await request(app).get('/api/v1/auth/me').expect(401);
    await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer token-invalido').expect(401);
  });

  it('oculta las rutas de sistema cuando no existe MIGRATE_TOKEN', async () => {
    await request(app).post('/api/v1/sistema/migrar').expect(404);
    await request(app).post('/api/v1/sistema/seed').expect(404);
    await request(app).get('/api/v1/sistema/migrar').expect(404);
  });

  it('rechaza un origen ajeno en las escrituras', async () => {
    await request(app).post('/api/v1/auth/logout').set('Origin', 'https://otro.example').expect(403);
  });

  it('emite una cookie httpOnly sin entregar el JWT en JSON', async () => {
    const hash = await bcrypt.hash('Clave-segura-123!', 12);
    const registro: Usuario = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'admin@ejemplo.com',
      nombre: 'Administradora',
      passwordHash: hash,
      rol: 'ADMIN',
      activo: true,
      claveCambiadaEn: null,
      empleadoId: null,
      creadoEn: new Date(),
      actualizadoEn: new Date()
    };
    const consulta = jest.spyOn(prisma.usuario, 'findUnique').mockResolvedValue(registro);
    try {
      const respuesta = await request(app).post('/api/v1/auth/login')
        .send({ email: ' ADMIN@EJEMPLO.COM ', clave: 'Clave-segura-123!' })
        .expect(200);
      expect(respuesta.headers['set-cookie'][0]).toContain('HttpOnly');
      expect(respuesta.headers['set-cookie'][0]).toContain('SameSite=Lax');
      expect(respuesta.body.token).toBeUndefined();
      expect(respuesta.body.usuario.email).toBe('admin@ejemplo.com');
    } finally { consulta.mockRestore(); }
  });
});
