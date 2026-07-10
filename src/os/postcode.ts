/** Free, no-key UK postcode -> lat/lng lookup, used only to centre the map for address search. */
export async function lookupPostcode(postcode: string): Promise<{ lng: number; lat: number } | null> {
  const clean = postcode.trim().replace(/\s+/g, "");
  if (!clean) return null;
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.result) return null;
  return { lng: data.result.longitude, lat: data.result.latitude };
}
