process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'clave-de-pruebas-de-32-caracteres-minimo';
process.env.FRONTEND_URL = 'http://localhost:4200';
process.env.NODE_ENV = 'test';
process.env.MIGRATE_TOKEN = 'token-de-pruebas';

import request from 'supertest';
import { app } from './app';

describe('protección de operaciones de sistema', () => {
  it('solo permite POST y limita los intentos fallidos compartidos', async () => {
    for (let intento = 0; intento < 5; intento++) {
      await request(app).post('/api/v1/sistema/migrar').set('X-Migrate-Token', 'incorrecto').expect(401);
    }
    await request(app).post('/api/v1/sistema/seed').set('X-Migrate-Token', 'incorrecto').expect(429);
    await request(app).get('/api/v1/sistema/migrar').expect(404);
  });
});
