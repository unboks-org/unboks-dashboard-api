import { useState } from "react";

export type EmailClient = "gmail" | "mailto";
const STORAGE_KEY = "unboks_email_client";

export function useEmailSettings() {
  const [emailClient, setEmailClientState] = useState<EmailClient>(() => {
    return (localStorage.getItem(STORAGE_KEY) as EmailClient) ?? "gmail";
  });

  const setEmailClient = (value: EmailClient) => {
    localStorage.setItem(STORAGE_KEY, value);
    setEmailClientState(value);
  };

  return { emailClient, setEmailClient };
}
