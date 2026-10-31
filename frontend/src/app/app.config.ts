import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideStore, Store } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { catchError, firstValueFrom, map, of, tap, throwError } from 'rxjs';

import { routes } from './app.routes';
import { apiInterceptor } from './core/interceptors/api.interceptor';
import { AuthService } from './core/services/auth.service';
import { AuthEffects } from './store/auth/auth.effects';
import { sesionCargada } from './store/auth/auth.store';
import { ResourceEffects } from './store/resource/resource.effects';
import { MoneyEffects } from './store/money/money.effects';
import { reducers, AppState } from './store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([apiInterceptor])),
    provideStore(reducers),
    provideEffects(AuthEffects, ResourceEffects, MoneyEffects),
    provideAppInitializer(() => {
      const auth = inject(AuthService);
      const store = inject(Store<AppState>);
      return firstValueFrom(auth.sesion().pipe(
        tap((sesion) => store.dispatch(sesionCargada({ sesion }))),
        catchError((error: { status?: number }) => {
          if (error.status === 401) {
            store.dispatch(sesionCargada({ sesion: null }));
            return of(null);
          }
          return throwError(() => error);
        }),
        map(() => undefined)
      ));
    })
  ]
};
