import 'dotenv/config';
import { z } from 'zod';

const esquema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  FRONTEND_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  MIGRATE_TOKEN: z.string().optional(),
  SEED_ADMIN_EMAIL: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_DIR: z.string().optional().default(''),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional()
});

const resultado = esquema.safeParse(process.env);
if (!resultado.success) {
  const faltantes = resultado.error.issues.map((error) => error.path.join('.')).join(', ');
  throw new Error(`Configuración inválida o ausente: ${faltantes}`);
}

export const config = resultado.data;
export const origenesPermitidos = config.FRONTEND_URL.split(',').map((url) => url.trim()).filter(Boolean);
export const esProduccion = config.NODE_ENV === 'production';
for (const origen of origenesPermitidos) {
  try {
    const url = new URL(origen);
    if (url.origin !== origen) throw new Error('FRONTEND_URL debe ser origen sin ruta ni barra final');
    if (config.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('FRONTEND_URL debe usar HTTPS en despliegue');
  } catch (error) {
    throw new Error(`FRONTEND_URL contiene un origen inválido: ${origen}`, { cause: error });
  }
}
if (esProduccion && (!config.S3_BUCKET || !config.S3_REGION)) throw new Error('Configuración inválida o ausente: S3_BUCKET, S3_REGION');
