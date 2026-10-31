import "./chunk-ZOA6E7SV.js";

// src/app/shared/utils/clave.ts
function requisitosDeClave(clave) {
  return [
    { texto: "Entre 12 y 200 caracteres", cumple: clave.length >= 12 && clave.length <= 200 },
    { texto: "Al menos una min\xFAscula", cumple: new RegExp("\\p{Ll}", "u").test(clave) },
    { texto: "Al menos una may\xFAscula", cumple: new RegExp("\\p{Lu}", "u").test(clave) },
    { texto: "Al menos un car\xE1cter especial (como # ! - .)", cumple: /[^\p{L}\p{N}\s]/u.test(clave) },
    { texto: "No puede ser solo espacios", cumple: !/^\s*$/u.test(clave) }
  ];
}
function claveCumple(clave) {
  return requisitosDeClave(clave).every((requisito) => requisito.cumple);
}

// src/app/shared/utils/clave.spec.ts
describe("reglas de contrase\xF1a de interfaz", () => {
  it("presenta en verde cada requisito cumplido", () => {
    expect(requisitosDeClave("\xC1rbol\xF1and\xFA2026#").every((requisito) => requisito.cumple)).toBeTrue();
    expect(claveCumple("\xC1rbol\xF1and\xFA2026#")).toBeTrue();
  });
  it("no acepta contrase\xF1as cortas, sin may\xFAscula o con espacios \xFAnicamente", () => {
    expect(claveCumple("Aa1!1234567")).toBeFalse();
    expect(claveCumple("abcdefghijkl!")).toBeFalse();
    expect(claveCumple("           ")).toBeFalse();
  });
});
//# sourceMappingURL=spec-app-shared-utils-clave.spec.js.map
