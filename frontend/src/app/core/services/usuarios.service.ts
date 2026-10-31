import { inject, Injectable } from '@angular/core';
import { RecursosService } from './recursos.service';

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly recursos = inject(RecursosService);
  obtener<T>(url: string) { return this.recursos.obtener<T>(url); }
  crear<T>(datos: unknown) { return this.recursos.crear<T>('/usuarios', datos); }
  actualizar<T>(id: string, datos: unknown) { return this.recursos.actualizar<T>(`/usuarios/${id}`, datos); }
  restablecerClave<T>(id: string, claveNueva: string) { return this.recursos.crear<T>(`/usuarios/${id}/restablecer-clave`, { claveNueva }); }
}
