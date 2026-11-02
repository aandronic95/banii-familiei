// În zilele unei călătorii (cu eticheta automată), cheltuielile din bot/Apple Pay primesc eticheta ei
// deno-lint-ignore no-explicit-any
export async function tripTag(db: any, familyId: string, date: string): Promise<string | null> {
  const { data } = await db.from("trips").select("tag").eq("family_id", familyId).eq("auto_tag", true)
    .lte("start_date", date).gte("end_date", date).limit(1);
  return data?.[0]?.tag ?? null;
}
export const withTag = (tags: string[] | null | undefined, tag: string | null) =>
  tag && !(tags ?? []).includes(tag) ? [...(tags ?? []), tag].slice(0, 8) : (tags ?? []);
