import { inject, Injectable } from '@angular/core';
import { RecursosService } from './recursos.service';

@Injectable({ providedIn: 'root' })
export class AuditoriaService {
  private readonly recursos = inject(RecursosService);
  obtener<T>(url: string) { return this.recursos.obtener<T>(url); }
}
