import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { RecursosService } from './recursos.service';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private readonly recursos = inject(RecursosService);
  obtener<T>(url: string) { return this.recursos.obtener<T>(url); }
  urlGastos(desde: string, hasta: string, formato?: 'csv'): string {
    const consulta = `desde=${encodeURIComponent(`${desde}T00:00:00-05:00`)}&hasta=${encodeURIComponent(`${hasta}T23:59:59-05:00`)}`;
    return `${environment.apiUrl}/reportes/gastos?${consulta}${formato ? `&formato=${formato}` : ''}`;
  }
}
