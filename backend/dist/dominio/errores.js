"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Conflicto = exports.Prohibido = exports.NoEncontrado = exports.ErrorDeValidacion = void 0;
class ErrorDeValidacion extends Error {
}
exports.ErrorDeValidacion = ErrorDeValidacion;
class NoEncontrado extends Error {
}
exports.NoEncontrado = NoEncontrado;
class Prohibido extends Error {
}
exports.Prohibido = Prohibido;
class Conflicto extends Error {
}
exports.Conflicto = Conflicto;
