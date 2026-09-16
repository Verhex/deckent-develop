#!/usr/bin/env node
/**
 * Generate inventory of analysis markdown files matching today's date
 * Usage: node scripts/generate-analysis-inventory.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const TODAY = '2026-07-18';
const SUBDIRS = ['.analysis/a6-sinav-u1', '.analysis/u4-olcum'];
const OUTPUT_FILE = path.join(projectRoot, '.analysis/ozet-notu/inventory-subdirs-2026-07-18.json');

// Extract first H1 or H2 heading from markdown content
function extractHeading(content) {
  const lines = content.split('\n');
  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) return h1Match[1].trim();
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) return h2Match[1].trim();
  }
  return null;
}

// Check if file matches today's date
function matchesDateFilter(filename, mtime) {
  // Check if filename contains TODAY's date
  if (filename.includes(TODAY)) return 'filename';

  // Check if mtime matches TODAY
  const mtimeStr = new Date(mtime).toISOString().split('T')[0];
  if (mtimeStr === TODAY) return 'mtime';

  return null;
}

// Recursively scan directory for markdown/json files
async function scanDirectory(dirPath, baseDir = '') {
  const results = [];
  let latestDate = '1970-01-01';

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.join(baseDir, entry.name);

      if (entry.isDirectory()) {
        // Recurse into subdirectories
        const subResults = await scanDirectory(fullPath, relativePath);
        results.push(...subResults.files);
        if (subResults.latestDate > latestDate) {
          latestDate = subResults.latestDate;
        }
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.json'))) {
        // Get file stats
        const stats = await fs.promises.stat(fullPath);
        const mtimeDate = new Date(stats.mtime).toISOString().split('T')[0];

        // Update latest date
        if (mtimeDate > latestDate) {
          latestDate = mtimeDate;
        }

        // Check if matches date filter
        const dateSource = matchesDateFilter(entry.name, stats.mtime);
        if (dateSource) {
          // Extract heading from markdown files
          let title = null;
          if (entry.name.endsWith('.md')) {
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            title = extractHeading(content);
          }
          title = title || entry.name;

          results.push({
            path: relativePath,
            title,
            dateSource,
            mtimeIso: stats.mtime.toISOString(),
          });
        }
      }
    }
  } catch (err) {
    console.error(`Error scanning ${dirPath}:`, err.message);
  }

  return { files: results, latestDate };
}

// Main execution
async function main() {
  try {
    // Create output directory if it doesn't exist
    const outDir = path.dirname(OUTPUT_FILE);
    await fs.promises.mkdir(outDir, { recursive: true });

    // Scan all subdirectories
    const allResults = [];
    const scannedDirs = [];
    let globalLatestDate = '1970-01-01';

    for (const subdir of SUBDIRS) {
      const fullPath = path.join(projectRoot, subdir);
      scannedDirs.push(subdir);

      try {
        const result = await scanDirectory(fullPath, subdir);
        allResults.push(...result.files);
        if (result.latestDate > globalLatestDate) {
          globalLatestDate = result.latestDate;
        }
      } catch (err) {
        console.error(`Failed to scan ${subdir}:`, err.message);
      }
    }

    // Build output JSON
    const output = {
      results: allResults,
      metadata: {
        scannedDirs,
        latestFileDate: globalLatestDate,
        scanDate: TODAY,
      },
    };

    // Write JSON
    await fs.promises.writeFile(
      OUTPUT_FILE,
      JSON.stringify(output, null, 2),
      'utf-8'
    );

    console.log(`✓ Inventory written to ${OUTPUT_FILE}`);
    console.log(`  Files found: ${allResults.length}`);
    console.log(`  Directories scanned: ${scannedDirs.join(', ')}`);
    console.log(`  Latest file date: ${globalLatestDate}`);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
