import { useState } from "react";

const STORAGE_KEY = "unboks_bookings_label";

export function useBookingsLabel() {
  const [label, setLabelState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) ?? "Bookings";
  });

  const setLabel = (value: string) => {
    localStorage.setItem(STORAGE_KEY, value);
    setLabelState(value);
  };

  return { label, setLabel };
}
