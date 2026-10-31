import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SesionRespuesta } from '../../shared/models/api.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  iniciar(email: string, clave: string) {
    return this.http.post(`${this.base}/auth/login`, { email, clave });
  }

  sesion() {
    return this.http.get<SesionRespuesta>(`${this.base}/auth/me`);
  }

  cerrar() {
    return this.http.post<void>(`${this.base}/auth/logout`, {});
  }

  cambiarClave(claveActual: string, claveNueva: string) {
    return this.http.patch<void>(`${this.base}/auth/clave`, { claveActual, claveNueva });
  }
}
