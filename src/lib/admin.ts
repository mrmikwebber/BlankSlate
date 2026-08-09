export type AdminLists = {
  emails?: string[];
  ids?: string[];
};

export type AdminUserInput = {
  email?: string | null;
  id?: string | null;
};

export const normalizeAdminList = (raw?: string | null): string[] => {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
};

// Generic "is this user in an emails/ids allowlist" check. Despite the name
// history (originally written for the Admin Tools gate), it's used for any
// account-gated feature that reuses the same emails/ids env-var pattern
// without being an "admin" feature itself — e.g. the AI spending assistant.
export const isAllowlistedUser = (input: AdminUserInput, lists: AdminLists): boolean => {
  const email = input.email?.toLowerCase();
  const id = input.id?.toLowerCase();
  const emails = lists.emails ?? [];
  const ids = lists.ids ?? [];

  if (email && emails.includes(email)) return true;
  if (id && ids.includes(id)) return true;
  return false;
};

export const isAdminUser = isAllowlistedUser;
