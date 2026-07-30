import Fuse from './fuse.js';

function values(record, field, fallback) {
    const raw = record[field];
    return Array.isArray(raw) && raw.length ? raw : fallback;
}

function item(id, level, record, parent) {
    const identifiers = values(
        record,
        'search_identifiers',
        [record.katottg_id ?? id].filter(Boolean),
    );
    return {
        id,
        level,
        oblastId: record.parent_oblast_id ?? record.oblast_id,
        nameUk: record.uk,
        nameEn: record.en,
        shortUk: record.short_uk ?? record.uk,
        shortEn: record.short_en ?? record.en,
        searchUk: values(record, 'search_uk', [record.uk]),
        searchEn: values(record, 'search_en', [record.en]),
        aliases: values(record, 'aliases', []),
        transliterations: values(
            record,
            'transliterations',
            [record.transliteration ?? record.en],
        ),
        identifiers,
        katottg: record.katottg_id ?? identifiers[0] ?? id,
        parentUk: record.parent_uk ?? parent?.uk ?? '',
        parentEn: record.parent_en ?? parent?.en ?? '',
        labelUk: record.label_uk ?? `${record.uk} · ${id}`,
        labelEn: record.label_en ?? `${record.en} · ${id}`,
    };
}

export function createSearchItems(lookup) {
    const items = [];
    items.push(item('UA', 'national', lookup.national.UA));
    for (const [id, record] of Object.entries(lookup.oblasts)) {
        items.push(item(id, 'oblast', record));
    }
    for (const [id, record] of Object.entries(lookup.hromadas)) {
        items.push(item(id, 'hromada', record, lookup.oblasts[record.oblast_id]));
    }
    return items;
}

export function createGeographyFuse(items) {
    return new Fuse(items, {
        threshold: 0.32,
        ignoreLocation: true,
        includeScore: true,
        minMatchCharLength: 2,
        keys: [
            {name: 'identifiers', weight: 1},
            {name: 'nameUk', weight: 0.98},
            {name: 'nameEn', weight: 0.98},
            {name: 'shortUk', weight: 0.96},
            {name: 'shortEn', weight: 0.96},
            {name: 'searchUk', weight: 0.95},
            {name: 'searchEn', weight: 0.95},
            {name: 'aliases', weight: 0.84},
            {name: 'transliterations', weight: 0.8},
            {name: 'parentUk', weight: 0.2},
            {name: 'parentEn', weight: 0.2},
        ],
    });
}

export function normaliseSearchText(value) {
    return value
        .trim()
        .toLocaleLowerCase()
        .replace(/[’ʼ`‘]/g, "'")
        .replace(/\s+/g, ' ');
}

export function exactSearchValues(item) {
    return [
        item.id,
        item.katottg,
        item.nameUk,
        item.nameEn,
        item.shortUk,
        item.shortEn,
        ...item.identifiers,
        ...item.searchUk,
        ...item.searchEn,
        ...item.aliases,
        ...item.transliterations,
    ];
}

export function searchGeography(fuse, items, query, limit = 12) {
    const trimmed = query.trim();
    if (!trimmed) {
        return items.filter(candidate => candidate.level !== 'hromada').slice(0, 27);
    }
    const normalised = normaliseSearchText(trimmed);
    const levelOrder = {national: 0, oblast: 1, hromada: 2};
    return fuse
        .search(trimmed, {limit: Math.max(50, limit * 5)})
        .map(result => ({
            item: result.item,
            score: result.score ?? 1,
            exact: exactSearchValues(result.item).some(
                value => normaliseSearchText(value) === normalised,
            ),
        }))
        .sort((a, b) =>
            Number(b.exact) - Number(a.exact)
            || a.score - b.score
            || levelOrder[a.item.level] - levelOrder[b.item.level]
            || a.item.parentUk.localeCompare(b.item.parentUk, 'uk')
            || a.item.id.localeCompare(b.item.id),
        )
        .slice(0, limit)
        .map(result => result.item);
}

export function itemName(item, lang) {
    return lang === 'uk' ? item.nameUk : item.nameEn;
}

export function itemParent(item, lang) {
    return lang === 'uk' ? item.parentUk : item.parentEn;
}

export function itemLabel(item, lang) {
    return lang === 'uk' ? item.labelUk : item.labelEn;
}
