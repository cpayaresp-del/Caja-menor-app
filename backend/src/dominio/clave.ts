import { ErrorDeValidacion } from './errores';

// Si cambia la regla, se cambia en los dos lados.
export function validarClave(clave: string): void {
  const faltan: string[] = [];
  if (clave.length < 12) faltan.push('al menos 12 caracteres');
  if (clave.length > 200) faltan.push('máximo 200 caracteres');
  if (!/\p{Ll}/u.test(clave)) faltan.push('una minúscula');
  if (!/\p{Lu}/u.test(clave)) faltan.push('una mayúscula');
  if (!/[^\p{L}\p{N}\s]/u.test(clave)) faltan.push('un carácter especial (como # ! - .)');
  if (/^\s*$/u.test(clave)) faltan.push('no ser solo espacios');
  if (faltan.length) throw new ErrorDeValidacion(`La contraseña necesita ${faltan.join(', ')}`);
}
