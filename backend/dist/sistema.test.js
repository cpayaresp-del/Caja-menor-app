"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'clave-de-pruebas-de-32-caracteres-minimo';
process.env.FRONTEND_URL = 'http://localhost:4200';
process.env.NODE_ENV = 'test';
process.env.MIGRATE_TOKEN = 'token-de-pruebas';
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("./app");
describe('protección de operaciones de sistema', () => {
    it('solo permite POST y limita los intentos fallidos compartidos', async () => {
        for (let intento = 0; intento < 5; intento++) {
            await (0, supertest_1.default)(app_1.app).post('/api/v1/sistema/migrar').set('X-Migrate-Token', 'incorrecto').expect(401);
        }
        await (0, supertest_1.default)(app_1.app).post('/api/v1/sistema/seed').set('X-Migrate-Token', 'incorrecto').expect(429);
        await (0, supertest_1.default)(app_1.app).get('/api/v1/sistema/migrar').expect(404);
    });
});
