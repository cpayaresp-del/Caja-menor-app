import { inject, Injectable } from '@angular/core';
import { RecursosService } from './recursos.service';

@Injectable({ providedIn: 'root' })
export class MovimientosService {
  private readonly recursos = inject(RecursosService);
  obtener<T>(url: string) { return this.recursos.obtener<T>(url); }
  anular<T>(id: string, motivo: string) { return this.recursos.crear<T>(`/movimientos/${id}/anular`, { motivo }); }
}
