export type Rol = 'ADMIN' | 'CAJERO' | 'CONSULTA';
export type Permiso =
  | 'ver'
  | 'movimiento.crear'
  | 'periodo.cerrar'
  | 'movimiento.anular'
  | 'empleado.editar'
  | 'caja.editar'
  | 'categoria.editar'
  | 'usuario.editar'
  | 'auditoria.ver';

const permisos: Record<Rol, readonly Permiso[]> = {
  CONSULTA: ['ver'],
  CAJERO: ['ver', 'movimiento.crear', 'periodo.cerrar'],
  ADMIN: ['ver', 'movimiento.crear', 'periodo.cerrar', 'movimiento.anular', 'empleado.editar', 'caja.editar', 'categoria.editar', 'usuario.editar', 'auditoria.ver']
};

export function puede(rol: Rol, permiso: Permiso): boolean {
  return permisos[rol]?.includes(permiso) ?? false;
}

export function permisosDe(rol: Rol): readonly Permiso[] {
  return permisos[rol] ?? [];
}
