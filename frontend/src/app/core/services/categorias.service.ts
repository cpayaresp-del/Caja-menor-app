import { inject, Injectable } from '@angular/core';
import { RecursosService } from './recursos.service';

@Injectable({ providedIn: 'root' })
export class CategoriasService {
  private readonly recursos = inject(RecursosService);
  obtener<T>(url: string) { return this.recursos.obtener<T>(url); }
  crear<T>(datos: unknown) { return this.recursos.crear<T>('/categorias', datos); }
  actualizar<T>(id: string, datos: unknown) { return this.recursos.actualizar<T>(`/categorias/${id}`, datos); }
}
