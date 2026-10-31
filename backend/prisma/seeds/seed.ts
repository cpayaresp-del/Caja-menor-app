import bcrypt from 'bcrypt';
import { config } from '../../src/config';
import { validarClave } from '../../src/dominio/clave';
import { prisma } from '../../src/comun/prisma';

const nombres = ['Transporte', 'Papelería', 'Aseo y cafetería', 'Mensajería', 'Mantenimiento', 'Otros'];

async function seed(): Promise<void> {
  for (const nombre of nombres) await prisma.categoriaGasto.upsert({ where: { nombre }, create: { nombre }, update: {} });
  const yaExiste = await prisma.usuario.findFirst({ where: { rol: 'ADMIN' } });
  if (!yaExiste && config.SEED_ADMIN_EMAIL && config.SEED_ADMIN_PASSWORD) {
    const hash = /^\$2[aby]\$\d\d\$/.test(config.SEED_ADMIN_PASSWORD)
      ? config.SEED_ADMIN_PASSWORD
      : await (async () => {
          validarClave(config.SEED_ADMIN_PASSWORD!);
          return bcrypt.hash(config.SEED_ADMIN_PASSWORD!, 12);
        })();
    await prisma.usuario.create({
      data: { email: config.SEED_ADMIN_EMAIL.trim().toLowerCase(), nombre: 'Administrador', passwordHash: hash, rol: 'ADMIN' }
    });
  }
}

seed().catch((error: unknown) => {
  console.error('Falló la carga de datos base:', error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
