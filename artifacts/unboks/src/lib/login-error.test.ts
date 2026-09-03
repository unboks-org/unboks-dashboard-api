import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/error";
import { getLoginError } from "@/lib/login-error";

describe("login error messages", () => {
  it.each([
    new ApiError(0, "Load failed"),
    new TypeError("Failed to fetch"),
    new ApiError(502, "Bad Gateway"),
  ])(
    "explains unavailable requests without blaming the password: %s",
    (error) => {
      expect(getLoginError(error, false)).toBe(
        "Can't reach the workspace server. Check your connection and try again shortly.",
      );
      expect(getLoginError(error, true)).toContain("No se puede conectar");
    },
  );

  it.each([401, 403])("keeps rejected credentials distinct: %s", (status) => {
    expect(getLoginError(new ApiError(status, "Unauthorized"), false)).toBe(
      "Invalid access key",
    );
    expect(getLoginError(new ApiError(status, "Unauthorized"), true)).toBe(
      "Clave de acceso no válida",
    );
  });

  it("retains explicit workspace identity failures", () => {
    expect(
      getLoginError(new ApiError(409, "Workspace response rejected"), false),
    ).toBe("Workspace response rejected");
  });
});
