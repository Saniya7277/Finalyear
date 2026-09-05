/**
 * Stage 1 of the file scan: deterministic checks with no dependencies and no
 * network. These catch the unambiguous cases - executables, macro-laden Office
 * documents, disguised double extensions, active scripts - so the AI stage can
 * concentrate on judgement calls like spam, phishing and social engineering.
 *
 * Kept dependency-free on purpose: it is the part that must still work when the
 * model is unreachable.
 */

/** Extensions that are never acceptable in a document vault. */
const BLOCKED_EXTENSIONS = new Set([
  "exe", "dll", "bat", "cmd", "com", "scr", "pif", "msi", "msp", "cpl",
  "vbs", "vbe", "js", "jse", "wsf", "wsh", "ps1", "psm1", "hta", "reg",
  "lnk", "sh", "bash", "jar", "apk", "app", "deb", "rpm", "dmg",
  "docm", "xlsm", "pptm", "dotm", "xltm", "potm",
]);

/** Containers that can hide anything - allowed, but scored as elevated risk. */
const SUSPICIOUS_EXTENSIONS = new Set([
  "zip", "rar", "7z", "tar", "gz", "bz2", "cab", "ace", "iso", "img",
]);

/** Content patterns that indicate active code or a classic scam script. */
const CONTENT_PATTERNS: Array<{ pattern: RegExp; label: string; score: number }> = [
  { pattern: /<script[\s>]/i, label: "embedded-script", score: 60 },
  { pattern: /powershell\s+-(enc|e|encodedcommand)\b/i, label: "encoded-powershell", score: 90 },
  { pattern: /\beval\s*\(\s*(atob|base64_decode|unescape)\s*\(/i, label: "obfuscated-eval", score: 85 },
  { pattern: /\bcmd\.exe\b|\bwscript\.shell\b/i, label: "shell-invocation", score: 70 },
  { pattern: /\b(seed|recovery|mnemonic)\s+phrase\b/i, label: "wallet-phishing", score: 65 },
  { pattern: /\bverify\s+your\s+(account|identity|wallet)\b/i, label: "credential-phishing", score: 45 },
  { pattern: /\b(western\s+union|money\s*gram|inheritance\s+fund)\b/i, label: "advance-fee-scam", score: 55 },
  { pattern: /\bclick\s+here\s+to\s+claim\b/i, label: "spam-bait", score: 35 },
];

export function getExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

/** "invoice.pdf.exe" - a document extension used to disguise the real one. */
export function hasDisguisedExtension(fileName: string): boolean {
  const parts = fileName.toLowerCase().split(".");
  if (parts.length < 3) {
    return false;
  }

  const realExtension = parts[parts.length - 1];
  const middle = parts[parts.length - 2];

  const documentLike = new Set([
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "jpg",
    "jpeg", "png", "csv",
  ]);

  // Only suspicious when a document-looking extension is followed by something
  // that is not itself a document extension ("report.final.pdf" is fine).
  return documentLike.has(middle) && !documentLike.has(realExtension);
}

/** Executable magic bytes, regardless of what the file is called. */
export function detectExecutableHeader(buffer: Buffer): string | null {
  if (buffer.length < 4) {
    return null;
  }
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return "windows-pe-header"; // "MZ"
  }
  if (buffer[0] === 0x7f && buffer.subarray(1, 4).toString("latin1") === "ELF") {
    return "linux-elf-header";
  }
  if (buffer.subarray(0, 2).toString("latin1") === "#!") {
    return "script-shebang";
  }
  // Mach-O (macOS), both endiannesses plus the fat-binary header.
  const magic = buffer.readUInt32BE(0);
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(magic)) {
    return "macho-header";
  }
  return null;
}

export function isTextLike(mimeType: string, fileName: string): boolean {
  if (mimeType.startsWith("text/")) {
    return true;
  }

  const textMimes = [
    "application/json",
    "application/xml",
    "application/javascript",
    "application/x-sh",
    "application/csv",
  ];
  if (textMimes.includes(mimeType)) {
    return true;
  }

  const ext = getExtension(fileName);
  return ["txt", "md", "csv", "json", "xml", "html", "htm", "log", "yml", "yaml"].includes(ext);
}

/** Pull readable ASCII runs out of a binary file so the model has something to judge. */
export function extractPrintableStrings(buffer: Buffer, maxChars: number): string {
  const runs: string[] = [];
  let current = "";
  let total = 0;

  for (let i = 0; i < buffer.length && total < maxChars; i += 1) {
    const byte = buffer[i];
    const printable =
      (byte >= 0x20 && byte <= 0x7e) || byte === 0x0a || byte === 0x09;

    if (printable) {
      current += String.fromCharCode(byte);
      continue;
    }

    if (current.length >= 6) {
      runs.push(current);
      total += current.length;
    }
    current = "";
  }

  if (current.length >= 6) {
    runs.push(current);
  }

  return runs.join("\n").slice(0, maxChars);
}

export interface HeuristicResult {
  riskScore: number;
  labels: string[];
  reasons: string[];
  /** True when the file is rejected outright and the AI stage can be skipped. */
  hardBlock: boolean;
}

export function runHeuristics(input: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): HeuristicResult {
  const { fileName, mimeType, buffer } = input;
  const labels: string[] = [];
  const reasons: string[] = [];
  let riskScore = 0;
  let hardBlock = false;

  const ext = getExtension(fileName);

  if (BLOCKED_EXTENSIONS.has(ext)) {
    riskScore = 100;
    hardBlock = true;
    labels.push("blocked-file-type");
    reasons.push(
      `".${ext}" files can execute code and are not allowed in the vault.`,
    );
  }

  if (hasDisguisedExtension(fileName)) {
    riskScore = Math.max(riskScore, 95);
    hardBlock = true;
    labels.push("disguised-extension");
    reasons.push(
      "The file name hides its real extension behind a document extension.",
    );
  }

  const executableHeader = detectExecutableHeader(buffer);
  if (executableHeader) {
    riskScore = 100;
    hardBlock = true;
    labels.push(executableHeader);
    reasons.push("The file contents are an executable program, not a document.");
  }

  if (SUSPICIOUS_EXTENSIONS.has(ext)) {
    riskScore = Math.max(riskScore, 55);
    labels.push("archive-container");
    reasons.push("Archives can conceal their contents from inspection.");
  }

  if (isTextLike(mimeType, fileName)) {
    const text = buffer.toString("utf8", 0, Math.min(buffer.length, 200_000));
    let matchedContent = false;

    for (const { pattern, label, score } of CONTENT_PATTERNS) {
      if (pattern.test(text)) {
        riskScore = Math.max(riskScore, score);
        labels.push(label);
        matchedContent = true;
      }
    }

    if (matchedContent) {
      reasons.push(
        "The file content matches known spam or malicious-script patterns.",
      );
    }
  }

  return { riskScore, labels, reasons, hardBlock };
}
