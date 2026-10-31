"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.puede = puede;
exports.permisosDe = permisosDe;
const permisos = {
    CONSULTA: ['ver'],
    CAJERO: ['ver', 'movimiento.crear', 'periodo.cerrar'],
    ADMIN: ['ver', 'movimiento.crear', 'periodo.cerrar', 'movimiento.anular', 'empleado.editar', 'caja.editar', 'categoria.editar', 'usuario.editar', 'auditoria.ver']
};
function puede(rol, permiso) {
    return permisos[rol]?.includes(permiso) ?? false;
}
function permisosDe(rol) {
    return permisos[rol] ?? [];
}
