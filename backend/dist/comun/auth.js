"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.opcionesCookie = exports.nombreCookie = void 0;
exports.crearToken = crearToken;
exports.autenticar = autenticar;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const prisma_1 = require("./prisma");
exports.nombreCookie = `${config_1.esProduccion ? '__Host-' : ''}caja-menor-app-session`;
exports.opcionesCookie = {
    httpOnly: true,
    secure: config_1.esProduccion,
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000
};
function crearToken(usuarioId) {
    return jsonwebtoken_1.default.sign({}, config_1.config.JWT_SECRET, { subject: usuarioId, expiresIn: '24h' });
}
async function autenticar(req, res, next) {
    const token = req.cookies?.[exports.nombreCookie];
    if (!token) {
        res.status(401).json({ mensaje: 'Sesión no válida' });
        return;
    }
    try {
        const carga = jsonwebtoken_1.default.verify(token, config_1.config.JWT_SECRET);
        const usuario = await prisma_1.prisma.usuario.findUnique({ where: { id: carga.sub } });
        if (!usuario || !usuario.activo || (usuario.claveCambiadaEn && carga.iat && usuario.claveCambiadaEn.getTime() >= carga.iat * 1000)) {
            res.status(401).json({ mensaje: 'Sesión no válida' });
            return;
        }
        req.usuario = { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol, empleadoId: usuario.empleadoId };
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError || error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            res.status(401).json({ mensaje: 'Sesión no válida' });
            return;
        }
        next(error);
    }
}
