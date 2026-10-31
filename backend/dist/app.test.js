"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'clave-de-pruebas-de-32-caracteres-minimo';
process.env.FRONTEND_URL = 'http://localhost:4200';
process.env.NODE_ENV = 'test';
delete process.env.MIGRATE_TOKEN;
const supertest_1 = __importDefault(require("supertest"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const app_1 = require("./app");
const prisma_1 = require("./comun/prisma");
describe('rutas básicas', () => {
    it('health no requiere consultar la base', async () => {
        await (0, supertest_1.default)(app_1.app).get('/health').expect(200, { ok: true });
    });
    it('auth/me requiere cookie y no acepta Authorization Bearer', async () => {
        await (0, supertest_1.default)(app_1.app).get('/api/v1/auth/me').expect(401);
        await (0, supertest_1.default)(app_1.app).get('/api/v1/auth/me').set('Authorization', 'Bearer token-invalido').expect(401);
    });
    it('oculta las rutas de sistema cuando no existe MIGRATE_TOKEN', async () => {
        await (0, supertest_1.default)(app_1.app).post('/api/v1/sistema/migrar').expect(404);
        await (0, supertest_1.default)(app_1.app).post('/api/v1/sistema/seed').expect(404);
        await (0, supertest_1.default)(app_1.app).get('/api/v1/sistema/migrar').expect(404);
    });
    it('rechaza un origen ajeno en las escrituras', async () => {
        await (0, supertest_1.default)(app_1.app).post('/api/v1/auth/logout').set('Origin', 'https://otro.example').expect(403);
    });
    it('emite una cookie httpOnly sin entregar el JWT en JSON', async () => {
        const hash = await bcrypt_1.default.hash('Clave-segura-123!', 12);
        const registro = {
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
        const consulta = jest.spyOn(prisma_1.prisma.usuario, 'findUnique').mockResolvedValue(registro);
        try {
            const respuesta = await (0, supertest_1.default)(app_1.app).post('/api/v1/auth/login')
                .send({ email: ' ADMIN@EJEMPLO.COM ', clave: 'Clave-segura-123!' })
                .expect(200);
            expect(respuesta.headers['set-cookie'][0]).toContain('HttpOnly');
            expect(respuesta.headers['set-cookie'][0]).toContain('SameSite=Lax');
            expect(respuesta.body.token).toBeUndefined();
            expect(respuesta.body.usuario.email).toBe('admin@ejemplo.com');
        }
        finally {
            consulta.mockRestore();
        }
    });
});
