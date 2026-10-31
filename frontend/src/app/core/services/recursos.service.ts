import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class RecursosService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  obtener<T>(ruta: string) { return this.http.get<T>(`${this.base}${ruta}`); }
  crear<T>(ruta: string, datos: unknown) { return this.http.post<T>(`${this.base}${ruta}`, datos); }
  actualizar<T>(ruta: string, datos: unknown) { return this.http.patch<T>(`${this.base}${ruta}`, datos); }
  subirSoporte(cajaId: string, archivo: File) {
    return this.http.post<{ soporteUrl: string }>(`${this.base}/cajas/${cajaId}/soportes`, archivo, {
      headers: new HttpHeaders({ 'Content-Type': 'application/octet-stream', 'X-File-Name': archivo.name })
    });
  }
}
