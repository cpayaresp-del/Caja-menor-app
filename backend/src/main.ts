import { app } from './app';
import { config } from './config';
import { logger } from './comun/logger';
import { prisma } from './comun/prisma';

const servidor = app.listen(config.PORT, () => logger.info({ prefijo: 'app.inicio', puerto: config.PORT }, 'Aplicación lista'));

async function cerrar(): Promise<void> {
  servidor.close();
  await prisma.$disconnect();
}

process.on('SIGTERM', () => { void cerrar(); });
process.on('SIGINT', () => { void cerrar(); });
