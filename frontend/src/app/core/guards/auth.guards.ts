import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { filter, map, take } from 'rxjs';
import { AppState } from '../../store';

export const authGuard: CanActivateFn = () => {
  const store = inject(Store<AppState>);
  const router = inject(Router);
  return store.select((state) => state.auth).pipe(
    filter((estado) => estado.cargado),
    take(1),
    map((estado) => estado.usuario ? true : router.createUrlTree(['/login']))
  );
};

export const publicGuard: CanActivateFn = () => {
  const store = inject(Store<AppState>);
  const router = inject(Router);
  return store.select((state) => state.auth).pipe(
    filter((estado) => estado.cargado),
    take(1),
    map((estado) => estado.usuario ? router.createUrlTree(['/inicio']) : true)
  );
};

export const permisoGuard: CanActivateFn = (route) => {
  const store = inject(Store<AppState>);
  const router = inject(Router);
  const permiso = route.data['permiso'] as string;
  return store.select((state) => state.auth).pipe(
    take(1),
    map((estado) => estado.permisos.includes(permiso) ? true : router.createUrlTree(['/inicio']))
  );
};
