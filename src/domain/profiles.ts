export type LocalProfile = { id: string; name: string };

export function selectExistingProfile(profiles: LocalProfile[], id: string): LocalProfile | null {
  return profiles.find((profile) => profile.id === id) ?? null;
}

export function renameProfile(profiles: LocalProfile[], id: string, name: string): LocalProfile[] {
  const next = name.trim();
  if (!next) return profiles;
  return profiles.map((profile) => (profile.id === id ? { ...profile, name: next } : profile));
}
