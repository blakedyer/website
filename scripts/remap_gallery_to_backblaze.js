#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const GALLERY_DATA_PATH = path.join(REPO_ROOT, "gallery-data.js");
const SOURCE_ARG = process.argv.find((argument) => argument.startsWith("--source="));
const SOURCE_GALLERY_DATA_PATH =
  (SOURCE_ARG && SOURCE_ARG.slice("--source=".length)) ||
  process.env.SOURCE_GALLERY_DATA_PATH ||
  GALLERY_DATA_PATH;
const PIWIGO_CONFIG_PATH =
  process.env.PIWIGO_CONFIG_PATH ||
  "/limestone/Data/piwigo_Photo_server/local/config/database.inc.php";
const BACKBLAZE_BASE_URL =
  process.env.BACKBLAZE_BASE_URL ||
  "https://earth-history-uvic.s3.us-west-004.backblazeb2.com/web";
const DRY_RUN = process.argv.includes("--dry-run");
const ALLOW_UNMATCHED = process.argv.includes("--allow-unmatched");

function readGalleryData() {
  const source = fs.readFileSync(SOURCE_GALLERY_DATA_PATH, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: SOURCE_GALLERY_DATA_PATH });
  return context.window.EARTH_HISTORY_GALLERIES;
}

function readPiwigoConfig() {
  const source = fs.readFileSync(PIWIGO_CONFIG_PATH, "utf8");
  const config = {};
  const configPattern = /\$conf\['([^']+)'\]\s*=\s*'([^']*)';/g;
  for (const match of source.matchAll(configPattern)) {
    config[match[1]] = match[2];
  }
  const prefixMatch = source.match(/\$prefixeTable\s*=\s*'([^']+)';/);
  config.table_prefix = prefixMatch ? prefixMatch[1] : "pwigo_";
  return config;
}

function sqlEscape(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\0/g, "\\0")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\x1a/g, "\\Z")
    .replace(/'/g, "\\'");
}

function parseMysqlRows(output) {
  if (!output.trim()) {
    return [];
  }
  const lines = output.trimEnd().split("\n");
  const headers = lines.shift().split("\t");
  return lines.map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(
      headers.map((header, index) => [
        header,
        values[index] === "\\N" || values[index] === "NULL"
          ? null
          : values[index] || ""
      ])
    );
  });
}

function mysqlQuery(config, sql) {
  const host = config.db_host === "localhost" ? "127.0.0.1" : config.db_host;
  const args = [
    `-h${host}`,
    `-u${config.db_user}`,
    config.db_base,
    "--batch",
    "--raw",
    "-e",
    sql
  ];
  const output = execFileSync("mysql", args, {
    cwd: REPO_ROOT,
    env: { ...process.env, MYSQL_PWD: config.db_password },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64
  });
  return parseMysqlRows(output);
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function piwigoPathToBackblazeUrl(piwigoPath) {
  const archivePath = String(piwigoPath || "")
    .replace(/^\.\//, "")
    .replace(/^galleries\/Database\//, "");
  return `${BACKBLAZE_BASE_URL}/${archivePath}`;
}

function normalizeCaption(caption) {
  return String(caption || "").trim().replace(/\s+/g, " ");
}

function meaningfulPiwigoComment(comment) {
  const normalized = normalizeCaption(comment);
  if (!normalized || normalized === "OLYMPUS DIGITAL CAMERA") {
    return "";
  }
  return normalized;
}

function normalizeTimestamp(timestamp) {
  if (!timestamp) {
    return "";
  }
  return String(timestamp).replace("T", " ").replace(/Z$/, "");
}

function timestampKey(timestamp) {
  return normalizeTimestamp(timestamp).slice(0, 19);
}

function minuteKey(timestamp) {
  return normalizeTimestamp(timestamp).slice(0, 16);
}

function localPathExists(localPath) {
  return Boolean(localPath) && fs.existsSync(path.join(REPO_ROOT, localPath));
}

function sortCandidatesForPhoto(photo, candidates) {
  const caption = normalizeCaption(photo.caption);
  const exactTime = timestampKey(photo.captured_at);
  const minute = minuteKey(photo.captured_at);
  return [...candidates].sort((a, b) => {
    const score = (candidate) => {
      let value = 0;
      if (caption && normalizeCaption(candidate.comment) === caption) {
        value += 100;
      }
      if (exactTime && candidate.date_creation === exactTime) {
        value += 50;
      }
      if (minute && minuteKey(candidate.date_creation) === minute) {
        value += 10;
      }
      if (photo.author && candidate.author === photo.author) {
        value += 3;
      }
      return value;
    };
    return score(b) - score(a);
  });
}

function choosePiwigoRow(photo, indexes) {
  if (photo.id && indexes.byId.has(String(photo.id))) {
    return indexes.byId.get(String(photo.id));
  }

  const caption = normalizeCaption(photo.caption);
  if (caption && indexes.byCaption.has(caption)) {
    const candidates = indexes.byCaption.get(caption);
    return sortCandidatesForPhoto(photo, candidates)[0];
  }

  const exactTime = timestampKey(photo.captured_at);
  if (exactTime && indexes.byTimestamp.has(exactTime)) {
    const candidates = indexes.byTimestamp.get(exactTime);
    return sortCandidatesForPhoto(photo, candidates)[0];
  }

  const minute = minuteKey(photo.captured_at);
  if (minute && indexes.byMinute.has(minute)) {
    const candidates = indexes.byMinute.get(minute);
    return sortCandidatesForPhoto(photo, candidates)[0];
  }

  return null;
}

function pushIndex(index, key, row) {
  if (!key) {
    return;
  }
  if (!index.has(key)) {
    index.set(key, []);
  }
  index.get(key).push(row);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function collectPhotos(galleryData) {
  const photos = [];
  for (const gallery of Object.values(galleryData.galleries || {})) {
    for (const photo of gallery.photos || []) {
      photos.push(photo);
    }
  }
  return photos;
}

function buildMetadataIndexes(config, photos) {
  const prefix = config.table_prefix;
  const rowsById = new Map();
  const rowsByCaption = new Map();
  const rowsByTimestamp = new Map();
  const rowsByMinute = new Map();

  const ids = uniqueValues(photos.map((photo) => photo.id));
  for (const idChunk of chunk(ids, 500)) {
    const rows = mysqlQuery(
      config,
      `SELECT i.id, i.file, i.path, i.name, i.comment, i.author, DATE_FORMAT(i.date_creation, '%Y-%m-%d %H:%i:%s') AS date_creation, i.width, i.height, GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR '||') AS tags FROM ${prefix}images i LEFT JOIN ${prefix}image_tag it ON it.image_id = i.id LEFT JOIN ${prefix}tags t ON t.id = it.tag_id WHERE i.id IN (${idChunk.join(",")}) GROUP BY i.id`
    );
    for (const row of rows) {
      rowsById.set(String(row.id), row);
      pushIndex(rowsByCaption, normalizeCaption(row.comment), row);
      pushIndex(rowsByTimestamp, row.date_creation, row);
      pushIndex(rowsByMinute, minuteKey(row.date_creation), row);
    }
  }

  const captions = uniqueValues(
    photos
      .map((photo) => normalizeCaption(photo.caption))
      .filter((caption) => caption.length > 0)
  );
  for (const captionChunk of chunk(captions, 100)) {
    const values = captionChunk
      .map((caption) => `'${sqlEscape(caption)}'`)
      .join(",");
    const rows = mysqlQuery(
      config,
      `SELECT i.id, i.file, i.path, i.name, i.comment, i.author, DATE_FORMAT(i.date_creation, '%Y-%m-%d %H:%i:%s') AS date_creation, i.width, i.height, GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR '||') AS tags FROM ${prefix}images i LEFT JOIN ${prefix}image_tag it ON it.image_id = i.id LEFT JOIN ${prefix}tags t ON t.id = it.tag_id WHERE i.comment IN (${values}) GROUP BY i.id`
    );
    for (const row of rows) {
      rowsById.set(String(row.id), row);
      pushIndex(rowsByCaption, normalizeCaption(row.comment), row);
      pushIndex(rowsByTimestamp, row.date_creation, row);
      pushIndex(rowsByMinute, minuteKey(row.date_creation), row);
    }
  }

  const timestamps = uniqueValues(photos.map((photo) => timestampKey(photo.captured_at)));
  for (const timeChunk of chunk(timestamps, 100)) {
    const values = timeChunk.map((time) => `'${sqlEscape(time)}'`).join(",");
    const rows = mysqlQuery(
      config,
      `SELECT i.id, i.file, i.path, i.name, i.comment, i.author, DATE_FORMAT(i.date_creation, '%Y-%m-%d %H:%i:%s') AS date_creation, i.width, i.height, GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR '||') AS tags FROM ${prefix}images i LEFT JOIN ${prefix}image_tag it ON it.image_id = i.id LEFT JOIN ${prefix}tags t ON t.id = it.tag_id WHERE i.date_creation IN (${values}) GROUP BY i.id`
    );
    for (const row of rows) {
      rowsById.set(String(row.id), row);
      pushIndex(rowsByCaption, normalizeCaption(row.comment), row);
      pushIndex(rowsByTimestamp, row.date_creation, row);
      pushIndex(rowsByMinute, minuteKey(row.date_creation), row);
    }
  }

  const minutes = uniqueValues(photos.map((photo) => minuteKey(photo.captured_at)));
  for (const minuteChunk of chunk(minutes, 50)) {
    const clauses = minuteChunk
      .map((minute) => `i.date_creation >= '${sqlEscape(minute)}:00' AND i.date_creation <= '${sqlEscape(minute)}:59'`)
      .map((clause) => `(${clause})`)
      .join(" OR ");
    const rows = mysqlQuery(
      config,
      `SELECT i.id, i.file, i.path, i.name, i.comment, i.author, DATE_FORMAT(i.date_creation, '%Y-%m-%d %H:%i:%s') AS date_creation, i.width, i.height, GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR '||') AS tags FROM ${prefix}images i LEFT JOIN ${prefix}image_tag it ON it.image_id = i.id LEFT JOIN ${prefix}tags t ON t.id = it.tag_id WHERE ${clauses} GROUP BY i.id`
    );
    for (const row of rows) {
      rowsById.set(String(row.id), row);
      pushIndex(rowsByCaption, normalizeCaption(row.comment), row);
      pushIndex(rowsByTimestamp, row.date_creation, row);
      pushIndex(rowsByMinute, minuteKey(row.date_creation), row);
    }
  }

  return {
    byId: rowsById,
    byCaption: rowsByCaption,
    byTimestamp: rowsByTimestamp,
    byMinute: rowsByMinute
  };
}

function applyMetadata(photo, piwigoRow, index) {
  const remoteUrl = piwigoPathToBackblazeUrl(piwigoRow.path);
  const tags = piwigoRow.tags ? piwigoRow.tags.split("||").filter(Boolean) : [];

  photo.id = Number(piwigoRow.id);
  photo.src = remoteUrl;
  photo.display = remoteUrl;
  photo.width = Number(piwigoRow.width) || photo.width;
  photo.height = Number(piwigoRow.height) || photo.height;
  photo.caption = photo.caption || meaningfulPiwigoComment(piwigoRow.comment);
  photo.author = photo.author || piwigoRow.author || "";
  photo.alt = photo.caption || photo.alt || `Field photograph ${index + 1}`;
  photo.file = piwigoRow.file || photo.file;
  photo.captured_at = piwigoRow.date_creation
    ? piwigoRow.date_creation.replace(" ", "T")
    : photo.captured_at;
  photo.tags = tags;
  photo.archive_path = String(piwigoRow.path || "")
    .replace(/^\.\//, "")
    .replace(/^galleries\/Database\//, "");
}

function remapGalleryData(galleryData, indexes) {
  const unmatched = [];
  let matched = 0;

  for (const gallery of Object.values(galleryData.galleries || {})) {
    gallery.photos.forEach((photo, index) => {
      const row = choosePiwigoRow(photo, indexes);
      if (!row) {
        unmatched.push({
          gallery: gallery.slug,
          file: photo.file,
          captured_at: photo.captured_at,
          caption: photo.caption || ""
        });
        return;
      }
      applyMetadata(photo, row, index);
      matched += 1;
    });

    const cover = gallery.photos.find((photo) => localPathExists(photo.thumb)) || gallery.photos[0];
    if (cover) {
      gallery.heroImage = localPathExists(cover.thumb) ? cover.thumb : cover.display || cover.src;
    }
  }

  for (const album of galleryData.albums || []) {
    const gallery = galleryData.galleries && galleryData.galleries[album.slug];
    if (!gallery || !gallery.photos || gallery.photos.length === 0) {
      continue;
    }
    const cover = gallery.photos.find((photo) => localPathExists(photo.thumb)) || gallery.photos[0];
    album.image = localPathExists(cover.thumb) ? cover.thumb : cover.display || cover.src;
  }

  return { matched, unmatched };
}

function stringifyGalleryData(galleryData) {
  const json = JSON.stringify(galleryData, null, 2).replace(
    /[\u007f-\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
  return [
    `window.EARTH_HISTORY_GALLERIES = ${json};`,
    "window.EARTH_HISTORY = window.EARTH_HISTORY || {};",
    "window.EARTH_HISTORY.albums = window.EARTH_HISTORY_GALLERIES.albums;",
    ""
  ].join("\n");
}

function main() {
  const galleryData = readGalleryData();
  const photos = collectPhotos(galleryData);
  const config = readPiwigoConfig();
  const indexes = buildMetadataIndexes(config, photos);
  const result = remapGalleryData(galleryData, indexes);

  if (result.unmatched.length > 0) {
    console.error("Unmatched gallery photos:");
    for (const photo of result.unmatched) {
      console.error(JSON.stringify(photo));
    }
    if (!ALLOW_UNMATCHED) {
      process.exitCode = 1;
      return;
    }
  }

  if (!DRY_RUN) {
    fs.writeFileSync(GALLERY_DATA_PATH, stringifyGalleryData(galleryData));
  }

  console.log(
    JSON.stringify(
      {
        matched: result.matched,
        unmatched: result.unmatched.length,
        dryRun: DRY_RUN,
        backblazeBaseUrl: BACKBLAZE_BASE_URL
      },
      null,
      2
    )
  );
}

main();
