#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply");
const CANDIDATE_PATTERN = /\.(jpe?g)$/i;
const RUNTIME_PATTERN = /\.(html?|shtml|css|js)$/i;

function git(args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64
  });
}

function gitLines(args) {
  const output = git(args).trim();
  return output ? output.split("\n") : [];
}

function isGalleryCandidate(file) {
  if (!CANDIDATE_PATTERN.test(file)) {
    return false;
  }
  if (!file.startsWith("Gallery/") && !file.startsWith("albums/")) {
    return false;
  }
  if (file.includes("/thumb/")) {
    return false;
  }
  if (file.startsWith("Gallery/thumb_")) {
    return false;
  }
  return true;
}

function isRuntimeReferenceFile(file) {
  return RUNTIME_PATTERN.test(file);
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function main() {
  const tracked = gitLines(["ls-files"]);
  const candidates = tracked.filter(isGalleryCandidate);
  const referenceFiles = tracked.filter(isRuntimeReferenceFile);
  const references = new Set();

  for (const file of referenceFiles) {
    const source = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
    for (const candidate of candidates) {
      if (source.includes(candidate)) {
        references.add(candidate);
      }
    }
  }

  const removable = candidates.filter((file) => !references.has(file));
  const kept = candidates.filter((file) => references.has(file));

  if (APPLY) {
    for (const fileChunk of chunk(removable, 200)) {
      git(["rm", "--", ...fileChunk]);
    }
  }

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        candidates: candidates.length,
        removable: removable.length,
        kept: kept.length,
        keptFiles: kept
      },
      null,
      2
    )
  );
}

main();
