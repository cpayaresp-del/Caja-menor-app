import { inject, Injectable } from '@angular/core';
import { RecursosService } from './recursos.service';

@Injectable({ providedIn: 'root' })
export class CajasService {
  private readonly recursos = inject(RecursosService);
  obtener<T>(url: string) { return this.recursos.obtener<T>(url); }
  crear<T>(datos: unknown) { return this.recursos.crear<T>('/cajas', datos); }
  actualizar<T>(id: string, datos: unknown) { return this.recursos.actualizar<T>(`/cajas/${id}`, datos); }
  saldo<T>(id: string) { return this.recursos.obtener<T>(`/cajas/${id}/saldo`); }
  subirSoporte(id: string, archivo: File) { return this.recursos.subirSoporte(id, archivo); }
}
