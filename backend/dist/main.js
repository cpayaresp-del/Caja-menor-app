"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const config_1 = require("./config");
const logger_1 = require("./comun/logger");
const prisma_1 = require("./comun/prisma");
const servidor = app_1.app.listen(config_1.config.PORT, () => logger_1.logger.info({ prefijo: 'app.inicio', puerto: config_1.config.PORT }, 'Aplicación lista'));
async function cerrar() {
    servidor.close();
    await prisma_1.prisma.$disconnect();
}
process.on('SIGTERM', () => { void cerrar(); });
process.on('SIGINT', () => { void cerrar(); });
