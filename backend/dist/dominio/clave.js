"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validarClave = validarClave;
const errores_1 = require("./errores");
// Si cambia la regla, se cambia en los dos lados.
function validarClave(clave) {
    const faltan = [];
    if (clave.length < 12)
        faltan.push('al menos 12 caracteres');
    if (clave.length > 200)
        faltan.push('máximo 200 caracteres');
    if (!/\p{Ll}/u.test(clave))
        faltan.push('una minúscula');
    if (!/\p{Lu}/u.test(clave))
        faltan.push('una mayúscula');
    if (!/[^\p{L}\p{N}\s]/u.test(clave))
        faltan.push('un carácter especial (como # ! - .)');
    if (/^\s*$/u.test(clave))
        faltan.push('no ser solo espacios');
    if (faltan.length)
        throw new errores_1.ErrorDeValidacion(`La contraseña necesita ${faltan.join(', ')}`);
}
