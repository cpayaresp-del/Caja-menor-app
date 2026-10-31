"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const errores_1 = require("./errores");
const clave_1 = require("./clave");
describe('validarClave', () => {
    it('acepta los requisitos juntos con letras acentuadas y ñ', () => {
        expect(() => (0, clave_1.validarClave)('Árbolñandú2026#')).not.toThrow();
    });
    it('indica todos los requisitos faltantes', () => {
        expect(() => (0, clave_1.validarClave)('123456789012')).toThrow('una minúscula, una mayúscula, un carácter especial');
        expect(() => (0, clave_1.validarClave)('')).toThrow('al menos 12 caracteres');
        expect(() => (0, clave_1.validarClave)('           ')).toThrow('no ser solo espacios');
    });
    it('valida los límites de longitud', () => {
        expect(() => (0, clave_1.validarClave)('Aa1!1234567')).toThrow('al menos 12 caracteres');
        expect(() => (0, clave_1.validarClave)('Aa1!12345678')).not.toThrow();
        expect(() => (0, clave_1.validarClave)(`Aa1!${'a'.repeat(196)}`)).not.toThrow();
        expect(() => (0, clave_1.validarClave)(`Aa1!${'a'.repeat(197)}`)).toThrow('máximo 200 caracteres');
    });
    it('lanza un error de dominio', () => {
        expect(() => (0, clave_1.validarClave)('sin requisitos')).toThrow(errores_1.ErrorDeValidacion);
    });
});
