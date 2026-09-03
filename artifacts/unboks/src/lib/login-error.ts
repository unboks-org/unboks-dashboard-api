import { ApiError } from "@/lib/error";

export function getLoginError(err: unknown, spanish: boolean): string {
  const unavailable = spanish
    ? "No se puede conectar con el servidor del espacio de trabajo. Comprueba tu conexión e inténtalo de nuevo en unos momentos."
    : "Can't reach the workspace server. Check your connection and try again shortly.";

  if (err instanceof TypeError) return unavailable;
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return spanish ? "Clave de acceso no válida" : "Invalid access key";
    }
    // apiLogin wraps browser fetch failures (including Safari's "Load failed")
    // as status 0. They are connectivity failures, not rejected credentials.
    if (err.status === 0 || err.status >= 500) return unavailable;
    return (
      err.message ||
      (spanish ? "Clave de acceso no válida" : "Invalid access key")
    );
  }
  return unavailable;
}
