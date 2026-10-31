import { ErrorDeValidacion } from './errores';
import { validarClave } from './clave';

describe('validarClave', () => {
  it('acepta los requisitos juntos con letras acentuadas y ñ', () => {
    expect(() => validarClave('Árbolñandú2026#')).not.toThrow();
  });

  it('indica todos los requisitos faltantes', () => {
    expect(() => validarClave('123456789012')).toThrow('una minúscula, una mayúscula, un carácter especial');
    expect(() => validarClave('')).toThrow('al menos 12 caracteres');
    expect(() => validarClave('           ')).toThrow('no ser solo espacios');
  });

  it('valida los límites de longitud', () => {
    expect(() => validarClave('Aa1!1234567')).toThrow('al menos 12 caracteres');
    expect(() => validarClave('Aa1!12345678')).not.toThrow();
    expect(() => validarClave(`Aa1!${'a'.repeat(196)}`)).not.toThrow();
    expect(() => validarClave(`Aa1!${'a'.repeat(197)}`)).toThrow('máximo 200 caracteres');
  });

  it('lanza un error de dominio', () => {
    expect(() => validarClave('sin requisitos')).toThrow(ErrorDeValidacion);
  });
});
