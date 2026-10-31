"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.esProduccion = exports.origenesPermitidos = exports.config = void 0;
require("dotenv/config");
const zod_1 = require("zod");
const esquema = zod_1.z.object({
    DATABASE_URL: zod_1.z.string().url(),
    JWT_SECRET: zod_1.z.string().min(32),
    FRONTEND_URL: zod_1.z.string().min(1),
    PORT: zod_1.z.coerce.number().int().positive().default(3000),
    MIGRATE_TOKEN: zod_1.z.string().optional(),
    SEED_ADMIN_EMAIL: zod_1.z.string().optional(),
    SEED_ADMIN_PASSWORD: zod_1.z.string().optional(),
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    FRONTEND_DIR: zod_1.z.string().optional().default(''),
    S3_BUCKET: zod_1.z.string().optional(),
    S3_REGION: zod_1.z.string().optional(),
    S3_ENDPOINT: zod_1.z.string().optional(),
    S3_ACCESS_KEY_ID: zod_1.z.string().optional(),
    S3_SECRET_ACCESS_KEY: zod_1.z.string().optional()
});
const resultado = esquema.safeParse(process.env);
if (!resultado.success) {
    const faltantes = resultado.error.issues.map((error) => error.path.join('.')).join(', ');
    throw new Error(`Configuración inválida o ausente: ${faltantes}`);
}
exports.config = resultado.data;
exports.origenesPermitidos = exports.config.FRONTEND_URL.split(',').map((url) => url.trim()).filter(Boolean);
exports.esProduccion = exports.config.NODE_ENV === 'production';
for (const origen of exports.origenesPermitidos) {
    try {
        const url = new URL(origen);
        if (url.origin !== origen)
            throw new Error('FRONTEND_URL debe ser origen sin ruta ni barra final');
        if (exports.config.NODE_ENV === 'production' && url.protocol !== 'https:')
            throw new Error('FRONTEND_URL debe usar HTTPS en despliegue');
    }
    catch (error) {
        throw new Error(`FRONTEND_URL contiene un origen inválido: ${origen}`, { cause: error });
    }
}
if (exports.esProduccion && (!exports.config.S3_BUCKET || !exports.config.S3_REGION))
    throw new Error('Configuración inválida o ausente: S3_BUCKET, S3_REGION');
