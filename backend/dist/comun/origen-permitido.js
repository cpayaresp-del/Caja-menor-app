"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validarOrigen = validarOrigen;
const config_1 = require("../config");
const metodosEscritura = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function validarOrigen(req, res, next) {
    const origen = req.get('Origin');
    if (metodosEscritura.has(req.method) && origen && !config_1.origenesPermitidos.includes(origen)) {
        res.status(403).json({ mensaje: 'Origen no permitido' });
        return;
    }
    next();
}
