const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function normalizeMenuItem(raw) {
  // OutSystems commonly returns PascalCase keys like Id/Name/price.
  const id = raw?.Id ?? raw?.id ?? raw?.menu_item_id;
  const name = raw?.Name ?? raw?.name;
  const price = raw?.price ?? raw?.Price ?? raw?.UnitPrice;
  const description = raw?.description ?? raw?.Description ?? "";
  const imageUrl = raw?.ImgUrl ?? raw?.imgUrl ?? raw?.imageUrl ?? raw?.ImageUrl ?? null;
  const calories = raw?.Calories ?? raw?.calories ?? null;
  const typeId = raw?.TypeId ?? raw?.typeId ?? null;

  const category =
    raw?.category ??
    raw?.Category ??
    (typeId === 1 ? "Combo" : typeId === 2 ? "À la carte" : "Menu");

  return {
    id,
    name,
    price: typeof price === "string" ? Number(price) : price,
    description: description || (calories ? `${calories} kcal` : ""),
    category,
    imageUrl,
    raw,
  };
}

export async function getMenu() {
  const res = await fetch(`${BASE_URL}/api/v1/menu`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || "Failed to load menu");
  }

  const data = await res.json();
  const list = Array.isArray(data) ? data : data?.menu ?? data?.Menu ?? data?.items ?? [];
  return list.map(normalizeMenuItem).filter((i) => i.id != null && i.name);
}

