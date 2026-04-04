import { normalizeTag } from "@xharbor/contracts";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function itemLastSeenAt(item) {
  const datedMatches = toArray(item.matches)
    .map((match) => match.createdAt)
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left));
  return datedMatches[0] || null;
}

function resolveAlias(tag, aliases = {}) {
  const normalized = normalizeTag(tag);
  return normalizeTag(aliases[normalized] || normalized);
}

export function buildTagIndex(sourcePayloads, aliases = {}) {
  const items = sourcePayloads
    .flatMap((payload) => toArray(payload.items))
    .map((item) => ({
      ...item,
      rawTags: [...new Set(toArray(item.tags).map((tag) => normalizeTag(tag)).filter(Boolean))],
      tags: [...new Set(toArray(item.tags).map((tag) => resolveAlias(tag, aliases)).filter(Boolean))],
      lastSeenAt: itemLastSeenAt(item)
    }))
    .filter((item) => item.tags.length);

  const tagMap = new Map();

  for (const item of items) {
    for (const tag of item.tags) {
      if (!tagMap.has(tag)) {
        tagMap.set(tag, {
          tag,
          displayTag: `#${tag}`,
          itemCount: 0,
          sourceCounts: {},
          kinds: new Set(),
          aliases: new Set(),
          lastSeenAt: null
        });
      }

      const entry = tagMap.get(tag);
      entry.itemCount += 1;
      entry.sourceCounts[item.source] = (entry.sourceCounts[item.source] || 0) + 1;
      entry.kinds.add(item.kind);
      for (const rawTag of item.rawTags || []) {
        if (resolveAlias(rawTag, aliases) === tag && rawTag !== tag) {
          entry.aliases.add(rawTag);
        }
      }
      if (!entry.lastSeenAt || (item.lastSeenAt && item.lastSeenAt > entry.lastSeenAt)) {
        entry.lastSeenAt = item.lastSeenAt;
      }
    }
  }

  const tags = [...tagMap.values()]
    .map((entry) => ({
      tag: entry.tag,
      displayTag: entry.displayTag,
      itemCount: entry.itemCount,
      sourceCounts: entry.sourceCounts,
      kinds: [...entry.kinds].sort(),
      aliases: [...entry.aliases].sort(),
      lastSeenAt: entry.lastSeenAt
    }))
    .sort((left, right) => (
      right.itemCount - left.itemCount
      || String(right.lastSeenAt || "").localeCompare(String(left.lastSeenAt || ""))
      || left.tag.localeCompare(right.tag)
    ));

  const normalizedItems = items.sort((left, right) => (
    String(right.lastSeenAt || "").localeCompare(String(left.lastSeenAt || ""))
    || left.source.localeCompare(right.source)
    || left.title.localeCompare(right.title)
  ));

  return { tags, items: normalizedItems };
}

export function queryTagIndex(index, query = "", aliases = {}) {
  const normalizedQuery = resolveAlias(query, aliases);
  if (!normalizedQuery) {
    return {
      query: "",
      tags: index.tags.slice(0, 24),
      items: index.items.slice(0, 30)
    };
  }

  const tags = index.tags.filter((tag) => tag.tag.includes(normalizedQuery));
  const items = index.items.filter((item) => item.tags.some((tag) => tag.includes(normalizedQuery)));

  return {
    query: normalizedQuery,
    tags,
    items
  };
}

export function groupItemsBySource(items) {
  const sourceOrder = ["xbacklog", "xtalk", "xdoc"];
  const grouped = new Map();

  for (const item of items) {
    if (!grouped.has(item.source)) {
      grouped.set(item.source, []);
    }
    grouped.get(item.source).push(item);
  }

  return [...grouped.entries()]
    .sort((left, right) => sourceOrder.indexOf(left[0]) - sourceOrder.indexOf(right[0]))
    .map(([source, sourceItems]) => ({ source, items: sourceItems }));
}
