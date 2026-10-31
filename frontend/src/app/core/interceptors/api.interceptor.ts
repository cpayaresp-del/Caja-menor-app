import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const esApi = req.url.startsWith(environment.apiUrl);
  const router = inject(Router);
  const solicitud = esApi ? req.clone({ withCredentials: true }) : req;
  return next(solicitud).pipe(catchError((error: HttpErrorResponse) => {
    if (esApi && error.status === 401 && !req.url.endsWith('/auth/login') && !req.url.endsWith('/auth/me')) {
      void router.navigate(['/login'], { queryParams: { sesionVencida: '1' } });
    }
    return throwError(() => error);
  }));
};
