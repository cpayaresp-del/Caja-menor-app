import { Routes } from '@angular/router';
import { authGuard, permisoGuard, publicGuard } from './core/guards/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [publicGuard],
    loadComponent: () => import('./features/login/login.component').then((modulo) => modulo.LoginComponent)
  },
  {
    path: 'mi-perfil',
    canActivate: [authGuard],
    loadComponent: () => import('./features/mi-perfil/mi-perfil.component').then((modulo) => modulo.MiPerfilComponent)
  },
  {
    path: 'inicio',
    canActivate: [authGuard],
    data: { titulo: 'Inicio', endpoint: '/cajas', columnas: ['nombre', 'responsable', 'montoFondo', 'topePorGasto', 'estado'] },
    loadComponent: () => import('./features/feature-page.component').then((modulo) => modulo.FeaturePageComponent)
  },
  {
    path: 'empleados',
    canActivate: [authGuard, permisoGuard],
    data: { titulo: 'Empleados', endpoint: '/empleados', permiso: 'ver', columnas: ['tipoDocumento', 'numeroDocumento', 'nombres', 'apellidos', 'cargo', 'area', 'estado'] },
    loadComponent: () => import('./features/feature-page.component').then((modulo) => modulo.FeaturePageComponent)
  },
  {
    path: 'cajas',
    canActivate: [authGuard, permisoGuard],
    data: { titulo: 'Cajas menores', endpoint: '/cajas', permiso: 'ver', columnas: ['nombre', 'responsable', 'montoFondo', 'topePorGasto', 'estado'] },
    loadComponent: () => import('./features/feature-page.component').then((modulo) => modulo.FeaturePageComponent)
  },
  {
    path: 'cajas/:id',
    canActivate: [authGuard, permisoGuard],
    data: { titulo: 'Detalle de caja', endpoint: '/cajas/:id/movimientos', permiso: 'ver', columnas: ['fecha', 'tipo', 'concepto', 'beneficiario', 'valor', 'soporteUrl'] },
    loadComponent: () => import('./features/feature-page.component').then((modulo) => modulo.FeaturePageComponent)
  },
  {
    path: 'reportes',
    canActivate: [authGuard, permisoGuard],
    data: { titulo: 'Reportes de gastos', endpoint: '/reportes/gastos', permiso: 'ver', columnas: ['fecha', 'caja', 'categoria', 'empleado', 'beneficiario', 'concepto', 'valor'] },
    loadComponent: () => import('./features/feature-page.component').then((modulo) => modulo.FeaturePageComponent)
  },
  {
    path: 'categorias',
    canActivate: [authGuard, permisoGuard],
    data: { titulo: 'Categorías de gasto', endpoint: '/categorias', permiso: 'categoria.editar', columnas: ['nombre', 'activa'] },
    loadComponent: () => import('./features/feature-page.component').then((modulo) => modulo.FeaturePageComponent)
  },
  {
    path: 'usuarios',
    canActivate: [authGuard, permisoGuard],
    data: { titulo: 'Usuarios del sistema', endpoint: '/usuarios', permiso: 'usuario.editar', columnas: ['nombre', 'email', 'rol', 'activo'] },
    loadComponent: () => import('./features/feature-page.component').then((modulo) => modulo.FeaturePageComponent)
  },
  {
    path: 'auditoria',
    canActivate: [authGuard, permisoGuard],
    data: { titulo: 'Auditoría', endpoint: '/auditoria', permiso: 'auditoria.ver', columnas: ['fecha', 'usuario', 'accion', 'entidad', 'entidadId', 'ip'] },
    loadComponent: () => import('./features/feature-page.component').then((modulo) => modulo.FeaturePageComponent)
  },
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },
  { path: '**', redirectTo: 'inicio' }
];
