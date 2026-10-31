import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RecursosService } from './recursos.service';
import { EmpleadoResponsable, PaginaRespuesta } from '../../shared/models/api.models';

@Injectable({ providedIn: 'root' })
export class EmpleadosService {
  private readonly recursos = inject(RecursosService);
  obtener<T>(url: string) { return this.recursos.obtener<T>(url); }
  async obtenerActivos(): Promise<EmpleadoResponsable[]> {
    const empleados: EmpleadoResponsable[] = [];
    let pagina = 1;
    let total = 0;
    do {
      const resultado = await firstValueFrom(
        this.obtener<PaginaRespuesta<EmpleadoResponsable>>(`/empleados?estado=ACTIVO&pagina=${pagina}&porPagina=100`)
      );
      empleados.push(...resultado.datos);
      total = resultado.total;
      pagina += 1;
      if (resultado.datos.length === 0 && empleados.length < total) {
        throw new Error('No fue posible completar la lista de empleados activos.');
      }
    } while (empleados.length < total);
    return empleados;
  }
  crear<T>(datos: unknown) { return this.recursos.crear<T>('/empleados', datos); }
  actualizar<T>(id: string, datos: unknown) { return this.recursos.actualizar<T>(`/empleados/${id}`, datos); }
  cambiarEstado<T>(id: string, estado: 'ACTIVO' | 'INACTIVO') { return this.recursos.actualizar<T>(`/empleados/${id}/estado`, { estado }); }
}
