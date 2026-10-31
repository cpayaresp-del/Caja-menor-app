import { TipoMovimiento } from '@prisma/client';

const signo: Record<TipoMovimiento, number> = {
  GASTO: -1,
  ANTICIPO: -1,
  LEGALIZACION: 0,
  REEMBOLSO: 1,
  AJUSTE_ARQUEO: 1,
  ANULACION: 0
};

export function calcularSaldo(montoFondo: number, movimientos: Array<{ tipo: TipoMovimiento; valor: number; signoAjuste?: number | null; anulaA?: string | null; id?: string }>): number {
  const anulados = new Set(movimientos.flatMap((movimiento) => movimiento.tipo === 'ANULACION' && movimiento.anulaA ? [movimiento.anulaA] : []));
  return movimientos.reduce((saldo, movimiento) => {
    if (movimiento.tipo === 'ANULACION' || (movimiento.id && anulados.has(movimiento.id))) return saldo;
    const movimientoSigno = movimiento.tipo === 'AJUSTE_ARQUEO' ? (movimiento.signoAjuste ?? 1) : signo[movimiento.tipo];
    return saldo + movimiento.valor * movimientoSigno;
  }, montoFondo);
}
