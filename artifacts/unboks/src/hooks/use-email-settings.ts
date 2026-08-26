import { useState } from "react";
import { tenantStorageKey } from "@/lib/tenant";

export type EmailClient = "gmail" | "mailto";
const storageKey = () => tenantStorageKey("email-client");

export function useEmailSettings() {
  const [emailClient, setEmailClientState] = useState<EmailClient>(() => {
    return (localStorage.getItem(storageKey()) as EmailClient) ?? "gmail";
  });

  const setEmailClient = (value: EmailClient) => {
    localStorage.setItem(storageKey(), value);
    setEmailClientState(value);
  };

  return { emailClient, setEmailClient };
}
