import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteKnowledgeFile,
  fetchKnowledgeFiles,
  uploadKnowledgeFile,
  type KnowledgeFile,
  type KnowledgeFileStatus,
} from "@/lib/api";
import { getClientSlug } from "@/lib/tenant";

export type { KnowledgeFile, KnowledgeFileStatus };

// Match what the backend can extract into Agent context today. Do not
// accept screenshots/images here until OCR exists, because Calvin expects
// uploaded files to become usable source-of-truth material.
export const KNOWLEDGE_FILE_ACCEPT = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".txt",
  ".csv",
  ".xlsx",
];

export const MAX_KNOWLEDGE_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export function isAllowedKnowledgeFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function knowledgeFilesQueryKey(slug: string): readonly [string, string, string] {
  return ["knowledge", "files", slug] as const;
}

/**
 * Backend-backed knowledge files.
 *
 * Uploads go to `/knowledge/files`; the backend stores the original file,
 * extracts readable text, and Marina includes ready rows in her prompt.
 * No localStorage shadow state, no fake queue, no "ready" claim from the
 * browser.
 */
export function useKnowledgeFiles() {
  const qc = useQueryClient();
  const slug = getClientSlug();
  const queryKey = useMemo(() => knowledgeFilesQueryKey(slug), [slug]);

  const query = useQuery({
    queryKey,
    queryFn: fetchKnowledgeFiles,
    staleTime: 15_000,
    retry: 1,
  });

  const uploadMutation = useMutation({
    mutationFn: async (picked: File[]) => {
      const uploaded: KnowledgeFile[] = [];
      for (const f of picked) {
        if (!isAllowedKnowledgeFile(f)) continue;
        if (f.size > MAX_KNOWLEDGE_FILE_BYTES) continue;
        uploaded.push(await uploadKnowledgeFile(f));
      }
      return uploaded;
    },
    onSuccess: (uploaded) => {
      if (uploaded.length === 0) return;
      qc.setQueryData<KnowledgeFile[]>(queryKey, (current = []) => {
        const uploadedIds = new Set(uploaded.map((f) => f.id));
        return [
          ...uploaded,
          ...current.filter((f) => !uploadedIds.has(f.id)),
        ];
      });
      void qc.invalidateQueries({ queryKey });
    },
  });

  const removeMutation = useMutation({
    mutationFn: deleteKnowledgeFile,
    onSuccess: (_unused, fileId) => {
      qc.setQueryData<KnowledgeFile[]>(queryKey, (current = []) =>
        current.filter((f) => f.id !== fileId),
      );
      void qc.invalidateQueries({ queryKey });
    },
  });

  const add = useCallback(
    (picked: File[]) => uploadMutation.mutateAsync(picked),
    [uploadMutation],
  );

  const remove = useCallback(
    (id: string) => removeMutation.mutateAsync(id),
    [removeMutation],
  );

  return {
    files: query.data ?? [],
    add,
    remove,
    isLoading: query.isLoading,
    loadError: query.error instanceof Error ? query.error : null,
    isUploading: uploadMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}
