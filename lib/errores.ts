// Regla de negocio de la app (no de la BD) con mensaje para el usuario.
// `campo`: el campo del formulario donde mostrarlo, si aplica.
export class ErrorNegocio extends Error {
  constructor(
    message: string,
    readonly campo?: string,
  ) {
    super(message);
    this.name = "ErrorNegocio";
  }
}
