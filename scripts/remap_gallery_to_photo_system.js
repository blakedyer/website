#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO_ROOT = path.resolve(__dirname, "..");
const GALLERY_DATA_PATH = path.join(REPO_ROOT, "gallery-data.js");
const DEFAULT_MANIFEST_PATH = path.resolve(
  REPO_ROOT,
  "../field_guide/.cache/photo-pipeline/validation/flatpak-current-uploaded-baseline-private-photo-manifest.json"
);
const SOURCE_ARG = process.argv.find((argument) => argument.startsWith("--source="));
const MANIFEST_ARG = process.argv.find((argument) => argument.startsWith("--manifest="));
const SOURCE_GALLERY_DATA_PATH =
  (SOURCE_ARG && path.resolve(SOURCE_ARG.slice("--source=".length))) ||
  (process.env.SOURCE_GALLERY_DATA_PATH && path.resolve(process.env.SOURCE_GALLERY_DATA_PATH)) ||
  GALLERY_DATA_PATH;
const MANIFEST_PATH =
  (MANIFEST_ARG && path.resolve(MANIFEST_ARG.slice("--manifest=".length))) ||
  (process.env.PHOTO_SYSTEM_PRIVATE_MANIFEST_PATH &&
    path.resolve(process.env.PHOTO_SYSTEM_PRIVATE_MANIFEST_PATH)) ||
  DEFAULT_MANIFEST_PATH;
const PUBLIC_BASE_URL =
  process.env.PHOTO_SYSTEM_PUBLIC_BASE_URL ||
  "https://earth-history-uvic.s3.us-west-004.backblazeb2.com/";
const CSS_FILES = ["site.css", "theme.css"];
const DRY_RUN = process.argv.includes("--dry-run");
const ALLOW_UNMATCHED = process.argv.includes("--allow-unmatched");

const OLD_BACKBLAZE_URL_PATTERN =
  /https:\/\/earth-history-uvic\.s3\.us-west-004\.backblazeb2\.com\/web\/(?!photo-system\/v1\/)(\d{4}\/\d{2}\/\d{2}\/[^"'()\s]+\.(?:jpe?g|JPE?G))/g;

function readGalleryData() {
  const source = fs.readFileSync(SOURCE_GALLERY_DATA_PATH, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: SOURCE_GALLERY_DATA_PATH });
  return context.window.EARTH_HISTORY_GALLERIES;
}

function readManifest() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  if (!manifest || !Array.isArray(manifest.records)) {
    throw new Error(`Manifest does not contain records: ${MANIFEST_PATH}`);
  }
  return manifest;
}

function normalizeCaption(caption) {
  return String(caption || "").trim().replace(/\s+/g, " ");
}

function normalizeTimestamp(timestamp) {
  if (!timestamp) {
    return "";
  }
  return String(timestamp)
    .replace("T", " ")
    .replace(/^(\d{4}):(\d{2}):(\d{2}) /, "$1-$2-$3 ")
    .replace(/Z$/, "")
    .slice(0, 19);
}

function minuteKey(timestamp) {
  return normalizeTimestamp(timestamp).slice(0, 16);
}

function archivePathFromUrl(url) {
  const match = String(url || "").match(
    /earth-history-uvic\.s3\.us-west-004\.backblazeb2\.com\/web\/(?!photo-system\/v1\/)(\d{4}\/\d{2}\/\d{2}\/[^?#"']+)/
  );
  return match ? match[1] : "";
}

function legacyTimeFromArchivePath(archivePath) {
  const match = String(archivePath || "").match(
    /^(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})(\d{2})(\d{2})\d{2}\.(?:jpe?g|JPE?G)$/
  );
  if (!match) {
    return "";
  }
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
}

function legacyArchivePathFromTimestamp(timestamp) {
  const match = normalizeTimestamp(timestamp).match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
  );
  if (!match) {
    return "";
  }
  return `${match[1]}/${match[2]}/${match[3]}/${match[4]}${match[5]}${match[6]}${match[3]}.jpg`;
}

function sourcePathTimestamp(sourcePath) {
  const match = String(sourcePath || "").match(
    /(?:^|\/)(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})_(\d{2})_(\d{2})(?:[_\-.]|$)/
  );
  if (!match) {
    return "";
  }
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
}

function sourcePathForRecord(record) {
  return (
    record.source?.path ||
    record.upload?.full_source_path ||
    String(record.darktable?.xmp_path || "").replace(/\.xmp$/, "")
  );
}

function publicUrlFor(relativePath) {
  if (!relativePath) {
    return "";
  }
  return `${PUBLIC_BASE_URL.replace(/\/+$/, "")}/${String(relativePath).replace(/^\/+/, "")}`;
}

function pushIndex(index, key, record) {
  if (!key) {
    return;
  }
  if (!index.has(key)) {
    index.set(key, []);
  }
  index.get(key).push(record);
}

function normalizedTagSet(tags) {
  return new Set(
    (Array.isArray(tags) ? tags : [])
      .map((tag) => String(tag).toLowerCase().split("|").pop().trim())
      .filter(Boolean)
  );
}

function decorateRecord(record) {
  const sourcePath = sourcePathForRecord(record);
  const sourceTimestamp = sourcePathTimestamp(sourcePath);
  const metadataTimestamp = normalizeTimestamp(record.metadata?.capture_time);
  const bestTimestamp = metadataTimestamp || sourceTimestamp;
  return {
    record,
    sourcePath,
    sourceTimestamp,
    metadataTimestamp,
    bestTimestamp,
    minute: minuteKey(bestTimestamp),
    legacyArchivePath: legacyArchivePathFromTimestamp(bestTimestamp),
    caption: normalizeCaption(record.metadata?.caption || record.metadata?.title),
    tags: normalizedTagSet(record.metadata?.tags),
    width: Number(record.export?.width || 0),
    height: Number(record.export?.height || 0),
    fullUrl: publicUrlFor(record.export?.full_rel),
    thumbUrl: publicUrlFor(record.export?.thumb_rel)
  };
}

function buildManifestIndexes(records) {
  const indexes = {
    byLegacyArchivePath: new Map(),
    byFullRel: new Map(),
    byFullUrl: new Map(),
    byTimestamp: new Map(),
    byMinute: new Map()
  };

  const decoratedRecords = [];
  for (const record of records) {
    if (!record.export?.full_rel || !record.export?.thumb_rel) {
      continue;
    }
    const decorated = decorateRecord(record);
    decoratedRecords.push(decorated);
    pushIndex(indexes.byLegacyArchivePath, decorated.legacyArchivePath, decorated);
    pushIndex(indexes.byFullRel, record.export.full_rel, decorated);
    pushIndex(indexes.byFullUrl, decorated.fullUrl, decorated);
    pushIndex(indexes.byTimestamp, decorated.metadataTimestamp, decorated);
    pushIndex(indexes.byTimestamp, decorated.sourceTimestamp, decorated);
    pushIndex(indexes.byMinute, decorated.minute, decorated);
  }

  indexes.decoratedRecords = decoratedRecords;
  return indexes;
}

function collectPhotos(galleryData) {
  const photos = [];
  for (const [gallerySlug, gallery] of Object.entries(galleryData.galleries || {})) {
    for (const photo of gallery.photos || []) {
      photos.push({ gallerySlug, photo });
    }
  }
  return photos;
}

function legacyArchivePathForPhoto(photo) {
  if (photo.archive_path && !String(photo.archive_path).startsWith("web/photo-system/v1/")) {
    return photo.archive_path;
  }
  return archivePathFromUrl(photo.src) || archivePathFromUrl(photo.display);
}

function scoreCandidate(photo, decorated, legacyArchivePath, legacyTime) {
  let score = 0;
  const photoTimestamp = normalizeTimestamp(photo.captured_at);
  const photoMinute = minuteKey(photo.captured_at);
  const caption = normalizeCaption(photo.caption);
  const photoTags = normalizedTagSet(photo.tags);

  if (legacyArchivePath && decorated.legacyArchivePath === legacyArchivePath) {
    score += 1000;
  }
  if (legacyTime && decorated.bestTimestamp === legacyTime) {
    score += 300;
  }
  if (photoTimestamp && decorated.bestTimestamp === photoTimestamp) {
    score += 250;
  }
  if (photoMinute && decorated.minute === photoMinute) {
    score += 50;
  }
  if (caption && decorated.caption && caption === decorated.caption) {
    score += 100;
  }
  if (photo.width && decorated.width && Number(photo.width) === decorated.width) {
    score += 10;
  }
  if (photo.height && decorated.height && Number(photo.height) === decorated.height) {
    score += 10;
  }
  for (const tag of photoTags) {
    if (decorated.tags.has(tag)) {
      score += 2;
    }
  }
  if (photo.author && /stacey/i.test(photo.author) && /\/stacey\//i.test(decorated.sourcePath)) {
    score += 5;
  }

  return score;
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  const unique = [];
  for (const candidate of candidates) {
    const key = candidate.record.photo_uid || candidate.record.export?.full_rel;
    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push(candidate);
    }
  }
  return unique;
}

function chooseManifestRecordForPhoto(photo, indexes) {
  const remappedArchivePath = String(photo.archive_path || "");
  const alreadyRemapped =
    (remappedArchivePath.startsWith("web/photo-system/v1/") &&
      indexes.byFullRel.get(remappedArchivePath)?.[0]) ||
    indexes.byFullUrl.get(photo.src)?.[0] ||
    indexes.byFullUrl.get(photo.display)?.[0];
  if (alreadyRemapped) {
    return alreadyRemapped;
  }

  const legacyArchivePath = legacyArchivePathForPhoto(photo);
  const legacyTime = legacyTimeFromArchivePath(legacyArchivePath);
  const photoTimestamp = normalizeTimestamp(photo.captured_at);
  const candidates = uniqueCandidates([
    ...(indexes.byLegacyArchivePath.get(legacyArchivePath) || []),
    ...(indexes.byTimestamp.get(legacyTime) || []),
    ...(indexes.byTimestamp.get(photoTimestamp) || []),
    ...(indexes.byMinute.get(minuteKey(legacyTime)) || []),
    ...(indexes.byMinute.get(minuteKey(photoTimestamp)) || [])
  ]);

  if (!candidates.length) {
    return null;
  }

  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(photo, candidate, legacyArchivePath, legacyTime)
    }))
    .sort((a, b) => b.score - a.score)[0].candidate;
}

function syntheticPhotoForArchivePath(archivePath) {
  return {
    archive_path: archivePath,
    captured_at: legacyTimeFromArchivePath(archivePath)
  };
}

function chooseManifestRecordForArchivePath(archivePath, indexes) {
  const direct = indexes.byLegacyArchivePath.get(archivePath) || [];
  if (direct.length === 1) {
    return direct[0];
  }
  return chooseManifestRecordForPhoto(syntheticPhotoForArchivePath(archivePath), indexes);
}

function remapGalleryData(galleryData, indexes) {
  const oldPhotoSources = new WeakMap();
  const legacyUrlToFullUrl = new Map();
  const legacyArchiveToFullUrl = new Map();
  const unmatched = [];
  let matched = 0;

  for (const { gallerySlug, photo } of collectPhotos(galleryData)) {
    oldPhotoSources.set(photo, {
      src: photo.src,
      display: photo.display,
      thumb: photo.thumb,
      archivePath: legacyArchivePathForPhoto(photo)
    });

    const decorated = chooseManifestRecordForPhoto(photo, indexes);
    if (!decorated) {
      unmatched.push({
        gallerySlug,
        id: photo.id,
        caption: photo.caption,
        archive_path: legacyArchivePathForPhoto(photo),
        captured_at: photo.captured_at
      });
      continue;
    }

    const legacyArchivePath = legacyArchivePathForPhoto(photo);
    if (photo.src) {
      legacyUrlToFullUrl.set(photo.src, decorated.fullUrl);
    }
    if (photo.display) {
      legacyUrlToFullUrl.set(photo.display, decorated.fullUrl);
    }
    if (legacyArchivePath) {
      legacyArchiveToFullUrl.set(legacyArchivePath, decorated.fullUrl);
    }

    photo.src = decorated.fullUrl;
    photo.display = decorated.fullUrl;
    photo.thumb = decorated.thumbUrl;
    photo.width = decorated.width || photo.width;
    photo.height = decorated.height || photo.height;
    photo.archive_path = decorated.record.export.full_rel;
    matched += 1;
  }

  updateGalleryCovers(galleryData, oldPhotoSources);

  return {
    matched,
    unmatched,
    legacyUrlToFullUrl,
    legacyArchiveToFullUrl
  };
}

function updateGalleryCovers(galleryData, oldPhotoSources) {
  const galleryLeadBySlug = new Map();

  for (const [gallerySlug, gallery] of Object.entries(galleryData.galleries || {})) {
    const currentHeroImage = gallery.heroImage;
    const photos = gallery.photos || [];
    const coverPhoto =
      photos.find((photo) => {
        const oldSources = oldPhotoSources.get(photo) || {};
        return [oldSources.thumb, oldSources.src, oldSources.display].includes(currentHeroImage);
      }) || photos[0];

    if (coverPhoto?.thumb) {
      gallery.heroImage = coverPhoto.thumb;
      galleryLeadBySlug.set(gallerySlug, coverPhoto);
    }
  }

  for (const album of galleryData.albums || []) {
    const gallery = galleryData.galleries?.[album.slug];
    const currentAlbumImage = album.image;
    const coverPhoto =
      (gallery?.photos || []).find((photo) => {
        const oldSources = oldPhotoSources.get(photo) || {};
        return [oldSources.thumb, oldSources.src, oldSources.display].includes(currentAlbumImage);
      }) ||
      galleryLeadBySlug.get(album.slug) ||
      gallery?.photos?.[0];

    if (coverPhoto?.thumb) {
      album.image = coverPhoto.thumb;
    }
  }
}

function remapCssFiles(indexes, legacyUrlToFullUrl, legacyArchiveToFullUrl) {
  const summaries = [];
  const unmatched = [];

  for (const relativePath of CSS_FILES) {
    const filePath = path.join(REPO_ROOT, relativePath);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const source = fs.readFileSync(filePath, "utf8");
    let replacements = 0;
    const nextSource = source.replace(OLD_BACKBLAZE_URL_PATTERN, (url, archivePath) => {
      const galleryMappedUrl =
        legacyUrlToFullUrl.get(url) || legacyArchiveToFullUrl.get(archivePath);
      const decorated = galleryMappedUrl ? null : chooseManifestRecordForArchivePath(archivePath, indexes);
      const replacement = galleryMappedUrl || decorated?.fullUrl;
      if (!replacement) {
        unmatched.push({ file: relativePath, url, archivePath });
        return url;
      }
      replacements += 1;
      return replacement;
    });

    if (!DRY_RUN && nextSource !== source) {
      fs.writeFileSync(filePath, nextSource);
    }

    summaries.push({ file: relativePath, replacements });
  }

  return { summaries, unmatched };
}

function escapeNonAscii(json) {
  return json.replace(/[^\x20-\x7E\n\r\t]/g, (char) => {
    const codePoint = char.codePointAt(0);
    if (codePoint <= 0xffff) {
      return `\\u${codePoint.toString(16).padStart(4, "0")}`;
    }
    return char;
  });
}

function stringifyGalleryData(galleryData) {
  const json = escapeNonAscii(JSON.stringify(galleryData, null, 2));
  return `window.EARTH_HISTORY_GALLERIES = ${json};\nwindow.EARTH_HISTORY = window.EARTH_HISTORY || {};\nwindow.EARTH_HISTORY.albums = window.EARTH_HISTORY_GALLERIES.albums;\n`;
}

function main() {
  const galleryData = readGalleryData();
  const manifest = readManifest();
  const indexes = buildManifestIndexes(manifest.records);
  const gallerySummary = remapGalleryData(galleryData, indexes);
  const cssSummary = remapCssFiles(
    indexes,
    gallerySummary.legacyUrlToFullUrl,
    gallerySummary.legacyArchiveToFullUrl
  );
  const unmatched = [...gallerySummary.unmatched, ...cssSummary.unmatched];

  if (unmatched.length && !ALLOW_UNMATCHED) {
    console.error(JSON.stringify(unmatched.slice(0, 20), null, 2));
    throw new Error(`Unmatched photo-system records: ${unmatched.length}`);
  }

  if (!DRY_RUN) {
    fs.writeFileSync(GALLERY_DATA_PATH, stringifyGalleryData(galleryData));
  }

  console.log(
    JSON.stringify(
      {
        dry_run: DRY_RUN,
        manifest: MANIFEST_PATH,
        manifest_records: manifest.records.length,
        indexed_records: indexes.decoratedRecords.length,
        gallery_photos_matched: gallerySummary.matched,
        gallery_photos_unmatched: gallerySummary.unmatched.length,
        css: cssSummary.summaries,
        css_unmatched: cssSummary.unmatched.length
      },
      null,
      2
    )
  );
}

main();
