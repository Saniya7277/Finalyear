/**
 * PDF feature extractor.
 * Extracts the 24 features expected by the trained PDF LightGBM model.
 * Reference implementation: ml/pdf-malware/pdf_features.py
 *
 * All extraction happens on-device from the raw file bytes.
 * IMPORTANT: Never transmit these bytes or this result to any server.
 */

export interface PDFFeatures {
  file_size: number;
  metadata_size: number;
  page_count: number;
  title_chars: number;
  encrypted: number;
  embedded_file_count: number;
  image_count: number;
  object_count: number;
  endstream_count: number;
  stream_count: number;
  xref_count: number;
  trailer_count: number;
  startxref_count: number;
  objstm_count: number;
  js_count: number;
  javascript_count: number;
  aa_count: number;
  openaction_count: number;
  acroform_count: number;
  jbig2decode_count: number;
  richmedia_count: number;
  launch_count: number;
  xfa_count: number;
  colors_count: number;
}

/**
 * Count occurrences of a substring in a string.
 */
function countOccurrences(text: string, pattern: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(pattern, pos)) !== -1) {
    count++;
    pos += pattern.length;
  }
  return count;
}

/**
 * Extract PDF features from raw file bytes.
 * @param fileBytes - Uint8Array of the raw PDF file
 * @param fileSize - Original file size in bytes
 */
export function extractPDFFeatures(
  fileBytes: Uint8Array,
  fileSize: number
): PDFFeatures {
  // Decode bytes as latin-1 equivalent (use 0-255 char codes directly)
  // JavaScript strings are UTF-16; we decode byte-by-byte for ASCII/latin compatibility
  let rawText = '';
  // Process in chunks to avoid stack overflow on large files
  const CHUNK = 65536;
  for (let i = 0; i < fileBytes.length; i += CHUNK) {
    const chunk = fileBytes.subarray(i, i + CHUNK);
    rawText += String.fromCharCode(...chunk);
  }
  const rawTextLower = rawText.toLowerCase();

  // === Basic metadata ===
  // Detect encryption: /Encrypt keyword in PDF dictionary
  const encrypted = rawText.includes('/Encrypt') ? 1 : 0;

  // Page count: count /Type /Page entries (each page dictionary)
  // More accurate: count '/Page ' or '/Page\n' patterns
  const pageCount = countOccurrences(rawText, '/Type /Page');

  // Title: extract from /Title metadata
  let titleChars = 0;
  const titleMatch = rawText.match(/\/Title\s*\(([^)]*?)\)/);
  if (titleMatch) {
    titleChars = titleMatch[1].length;
  }

  // Approximate metadata size: length of Info dictionary
  let metadataSize = 0;
  const infoMatch = rawText.match(/\/Info\s+\d+\s+\d+\s+R/);
  if (infoMatch) {
    // Estimate metadata size as the Info block around the match
    metadataSize = Math.min(512, infoMatch[0].length * 4);
  }

  // === Raw keyword counts (matching Python implementation) ===
  const object_count = countOccurrences(rawText, ' obj');
  const endstream_count = countOccurrences(rawText, 'endstream');
  const stream_count = countOccurrences(rawText, 'stream');
  const xref_count = countOccurrences(rawText, 'xref');
  const trailer_count = countOccurrences(rawText, 'trailer');
  const startxref_count = countOccurrences(rawText, 'startxref');
  const js_count = countOccurrences(rawText, '/JS');
  const javascript_count = countOccurrences(rawTextLower, '/javascript');
  const aa_count = countOccurrences(rawText, '/AA');
  const openaction_count = countOccurrences(rawText, '/OpenAction');
  const acroform_count = countOccurrences(rawText, '/AcroForm');
  const jbig2decode_count = countOccurrences(rawText, '/JBIG2Decode');
  const richmedia_count = countOccurrences(rawText, '/RichMedia');
  const launch_count = countOccurrences(rawText, '/Launch');
  const xfa_count = countOccurrences(rawText, '/XFA');
  const objstm_count = countOccurrences(rawText, '/ObjStm');
  const embedded_file_count = countOccurrences(rawText, '/EmbeddedFile');
  const colors_count = countOccurrences(rawText, '/ColorSpace');

  // Image count: /XObject entries of /Subtype /Image
  const image_count = countOccurrences(rawText, '/Subtype /Image');

  return {
    file_size: fileSize,
    metadata_size: metadataSize,
    page_count: pageCount,
    title_chars: titleChars,
    encrypted,
    embedded_file_count,
    image_count,
    object_count,
    endstream_count,
    stream_count,
    xref_count,
    trailer_count,
    startxref_count,
    objstm_count,
    js_count,
    javascript_count,
    aa_count,
    openaction_count,
    acroform_count,
    jbig2decode_count,
    richmedia_count,
    launch_count,
    xfa_count,
    colors_count,
  };
}
