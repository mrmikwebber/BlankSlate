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

export const isAdminUser = (input: AdminUserInput, lists: AdminLists): boolean => {
  const email = input.email?.toLowerCase();
  const id = input.id?.toLowerCase();
  const emails = lists.emails ?? [];
  const ids = lists.ids ?? [];

  if (email && emails.includes(email)) return true;
  if (id && ids.includes(id)) return true;
  return false;
};
