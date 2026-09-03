import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeInstructionOptimizer } from "./KnowledgeInstructionOptimizer";
import { improveInfoUpdateInstruction } from "@/lib/api";
import { toast } from "sonner";

vi.mock("@/lib/api", () => ({
  improveInfoUpdateInstruction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function Harness({ initialText = "si pide cita pregunta horario" }) {
  const [text, setText] = useState(initialText);
  return (
    <>
      <label htmlFor="instruction">Instruction</label>
      <textarea
        id="instruction"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <KnowledgeInstructionOptimizer
        text={text}
        type="hours"
        startDate="2026-09-03"
        endDate="2026-12-31"
        onApply={setText}
      />
    </>
  );
}

describe("KnowledgeInstructionOptimizer", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "consulta-despertares");
    vi.mocked(improveInfoUpdateInstruction).mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it("replaces only the local draft, shows scores, and restores the original", async () => {
    vi.mocked(improveInfoUpdateInstruction).mockResolvedValue({
      originalScore: 3,
      improvedScore: 10,
      improvedText: "Cuando la persona quiera una cita, pregunta el horario una sola vez.",
    });
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Mejorar instrucción con IA" }));

    const field = screen.getByLabelText("Instruction") as HTMLTextAreaElement;
    await waitFor(() => {
      expect(field.value).toBe(
        "Cuando la persona quiera una cita, pregunta el horario una sola vez.",
      );
    });
    expect(improveInfoUpdateInstruction).toHaveBeenCalledWith({
      text: "si pide cita pregunta horario",
      type: "hours",
      startDate: "2026-09-03",
      endDate: "2026-12-31",
    });
    expect(screen.getByText("3/10")).toBeTruthy();
    expect(screen.getByText("10/10")).toBeTruthy();
    expect(screen.getByText(/Todavía no se ha guardado nada/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Restaurar original" }));
    expect(field.value).toBe("si pide cita pregunta horario");
    expect(screen.queryByText("10/10")).toBeNull();
  });

  it("keeps the operator draft unchanged when improvement fails", async () => {
    vi.mocked(improveInfoUpdateInstruction).mockRejectedValue(
      new Error("No se ha podido generar una instrucción segura."),
    );
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Mejorar instrucción con IA" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "No se ha podido generar una instrucción segura.",
      );
    });
    expect((screen.getByLabelText("Instruction") as HTMLTextAreaElement).value)
      .toBe("si pide cita pregunta horario");
    expect(screen.queryByText("10/10")).toBeNull();
  });

  it("disables improvement for an empty draft", () => {
    render(<Harness initialText="" />);
    expect((screen.getByRole(
      "button",
      { name: "Mejorar instrucción con IA" },
    ) as HTMLButtonElement).disabled).toBe(true);
  });
});
