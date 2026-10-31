import { calcularSaldo } from './saldo';

describe('calcularSaldo', () => {
  it('calcula gastos, anticipos, reintegros y ajustes', () => {
    expect(calcularSaldo(100_000, [
      { tipo: 'GASTO', valor: 12_000 },
      { tipo: 'ANTICIPO', valor: 8_000 },
      { tipo: 'REEMBOLSO', valor: 10_000 },
      { tipo: 'AJUSTE_ARQUEO', valor: 2_000, signoAjuste: -1 }
    ])).toBe(88_000);
  });

  it('revierte el efecto de un movimiento anulado sin editarlo', () => {
    expect(calcularSaldo(100_000, [
      { id: 'gasto-1', tipo: 'GASTO', valor: 10_000 },
      { id: 'anulacion-1', tipo: 'ANULACION', valor: 10_000, anulaA: 'gasto-1' }
    ])).toBe(100_000);
  });
});
