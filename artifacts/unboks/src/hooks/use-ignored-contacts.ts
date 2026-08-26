import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addIgnoredContact,
  deleteIgnoredContact,
  fetchIgnoredContacts,
  importIgnoredContacts,
  updateIgnoredContact,
  validateIgnoredContactsImport,
  type IgnoredContactPayload,
  type IgnoredContactImportPreviewContact,
} from "@/lib/api";
import { tenantKey } from "@/lib/query-keys";

const queryKey = () => tenantKey("ignored-contacts");

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKey() });
  qc.invalidateQueries({ queryKey: tenantKey("conversations") });
  qc.invalidateQueries({ queryKey: tenantKey("escalations") });
}

export function useIgnoredContacts() {
  return useQuery({
    queryKey: queryKey(),
    queryFn: fetchIgnoredContacts,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useAddIgnoredContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: IgnoredContactPayload) => addIgnoredContact(payload),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateIgnoredContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: IgnoredContactPayload }) =>
      updateIgnoredContact(id, payload),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteIgnoredContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteIgnoredContact(id),
    onSuccess: () => invalidate(qc),
  });
}

export function useValidateIgnoredContactsImport() {
  return useMutation({
    mutationFn: (file: File) => validateIgnoredContactsImport(file),
  });
}

export function useImportIgnoredContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contacts: IgnoredContactImportPreviewContact[]) => importIgnoredContacts(contacts),
    onSuccess: () => invalidate(qc),
  });
}
