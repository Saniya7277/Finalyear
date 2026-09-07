/**
 * HTML feature extractor.
 * Extracts the 40 features expected by the trained HTML LightGBM model.
 *
 * All extraction happens on-device.
 * IMPORTANT: Never transmit file content or features to any server.
 */

export interface HTMLFeatures {
  file_size: number;
  line_count: number;
  entropy: number;
  script_entropy: number;
  tag_count: number;
  unique_tag_count: number;
  script_count: number;
  form_count: number;
  iframe_count: number;
  hidden_iframe_count: number;
  external_links_count: number;
  mailto_link_count: number;
  base64_string_count: number;
  html_comment_count: number;
  max_tag_nesting_depth: number;
  eval_in_script_blocks: number;
  function_count: number;
  total_script_characters: number;
  suspicious_word_count: number;
  keywords_to_words_ratio: number;
  whitespace_ratio: number;
  escaped_char_count: number;
  hex_encoding_rate: number;
  noscript_count: number;
  embedded_js_count: number;
  external_js_count: number;
  internal_link_count: number;
  external_link_count: number;
  img_count: number;
  html_whitespace_ratio: number;
  redirect_mechanism_count: number;
  event_attachment_count: number;
  object_tag_count: number;
  url_digit_count: number;
  url_punct_char_count: number;
  url_avg_length: number;
  url_avg_subdomain_count: number;
  hostname_digit_ratio_avg: number;
  min_link_length: number;
  max_link_length: number;
}

function countOccurrences(text: string, pattern: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(pattern, pos)) !== -1) {
    count++;
    pos += pattern.length;
  }
  return count;
}

function calculateEntropy(text: string): number {
  if (!text || text.length === 0) return 0;
  const freq: Record<string, number> = {};
  for (const ch of text) {
    freq[ch] = (freq[ch] || 0) + 1;
  }
  const len = text.length;
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const SUSPICIOUS_WORDS = [
  'eval', 'exec', 'system', 'shell', 'cmd', 'exploit', 'payload',
  'malware', 'virus', 'trojan', 'backdoor', 'rootkit', 'keylog',
  'phish', 'credential', 'steal', 'inject', 'bypass', 'obfuscat',
  'unescape', 'decodeuri', 'fromcharcode', 'atob',
];

const EVENT_ATTRS = [
  'onclick', 'onload', 'onerror', 'onmouseover', 'onsubmit',
  'onfocus', 'onblur', 'onchange', 'onkeydown', 'onkeyup',
];

const REDIRECT_PATTERNS = [
  'window.location', 'document.location', 'location.href',
  'location.replace', 'location.assign', 'meta http-equiv="refresh"',
  'meta http-equiv=\'refresh\'',
];

export function extractHTMLFeatures(
  fileBytes: Uint8Array,
  fileSize: number
): HTMLFeatures {
  // Decode to string
  let text = '';
  const CHUNK = 65536;
  for (let i = 0; i < fileBytes.length; i += CHUNK) {
    const slice = fileBytes.subarray(i, i + CHUNK);
    text += String.fromCharCode(...slice);
  }
  const lower = text.toLowerCase();

  const lines = text.split('\n');
  const line_count = lines.length;
  const entropy = calculateEntropy(text);

  // Extract script content
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;
  const scriptBlocks: string[] = [];
  while ((scriptMatch = scriptRegex.exec(text)) !== null) {
    scriptBlocks.push(scriptMatch[1]);
  }
  const scriptText = scriptBlocks.join(' ');
  const script_entropy = calculateEntropy(scriptText);
  const total_script_characters = scriptText.length;

  // Tag counting
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?\/?>|<\/([a-zA-Z][a-zA-Z0-9]*)>/g;
  const tagNames: string[] = [];
  let tagM;
  while ((tagM = tagRegex.exec(text)) !== null) {
    const name = (tagM[1] || tagM[2] || '').toLowerCase();
    if (name) tagNames.push(name);
  }
  const tag_count = tagNames.length;
  const unique_tag_count = new Set(tagNames).size;

  // Specific tag counts
  const script_count = countOccurrences(lower, '<script');
  const form_count = countOccurrences(lower, '<form');
  const iframe_count = countOccurrences(lower, '<iframe');
  const noscript_count = countOccurrences(lower, '<noscript');
  const img_count = countOccurrences(lower, '<img');
  const object_tag_count = countOccurrences(lower, '<object');

  // Hidden iframes: visibility:hidden or display:none or width=0 or height=0
  const hiddenIframeRegex = /<iframe[^>]*(visibility\s*:\s*hidden|display\s*:\s*none|width\s*=\s*["']?0["']?|height\s*=\s*["']?0["']?)[^>]*>/gi;
  let hidden_iframe_count = 0;
  let hiMatch;
  while ((hiMatch = hiddenIframeRegex.exec(text)) !== null) hidden_iframe_count++;

  // Links analysis
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  const links: string[] = [];
  let hMatch;
  while ((hMatch = hrefRegex.exec(text)) !== null) {
    links.push(hMatch[1]);
  }
  const external_links_count = links.filter(
    (l) => l.startsWith('http://') || l.startsWith('https://')
  ).length;
  const mailto_link_count = links.filter((l) => l.startsWith('mailto:')).length;
  const internal_link_count = links.filter(
    (l) => l.startsWith('#') || l.startsWith('/') || (!l.startsWith('http') && !l.startsWith('mailto'))
  ).length;
  const external_link_count = external_links_count;

  // URL stats
  const urlLengths = links.map((l) => l.length);
  const url_avg_length = urlLengths.length > 0
    ? urlLengths.reduce((a, b) => a + b, 0) / urlLengths.length
    : 0;
  const min_link_length = urlLengths.length > 0 ? Math.min(...urlLengths) : 0;
  const max_link_length = urlLengths.length > 0 ? Math.max(...urlLengths) : 0;

  let url_digit_count = 0;
  let url_punct_char_count = 0;
  let subdomainSum = 0;
  let digitRatioSum = 0;
  for (const link of links) {
    url_digit_count += (link.match(/\d/g) || []).length;
    url_punct_char_count += (link.match(/[!@#$%^&*(),.?":{}|<>]/g) || []).length;
    const hostMatch = link.match(/https?:\/\/([^/]+)/);
    if (hostMatch) {
      const host = hostMatch[1];
      subdomainSum += (host.split('.').length - 1);
      const digitRatio = (host.match(/\d/g) || []).length / host.length;
      digitRatioSum += digitRatio;
    }
  }
  const url_avg_subdomain_count = links.length > 0 ? subdomainSum / links.length : 0;
  const hostname_digit_ratio_avg = links.length > 0 ? digitRatioSum / links.length : 0;

  // JS script source detection
  const externalJsRegex = /<script[^>]+src\s*=\s*["']?https?:/gi;
  const embeddedJsRegex = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi;
  let external_js_count = 0;
  let ejM;
  while ((ejM = externalJsRegex.exec(text)) !== null) external_js_count++;
  let embedded_js_count = 0;
  let embM;
  while ((embM = embeddedJsRegex.exec(text)) !== null) {
    if (embM[1].trim().length > 0) embedded_js_count++;
  }

  // base64 count
  const base64Regex = /[A-Za-z0-9+/]{40,}={0,2}/g;
  const base64_string_count = (text.match(base64Regex) || []).length;

  // HTML comment count
  const html_comment_count = countOccurrences(text, '<!--');

  // Max nesting depth: track open tags
  let maxDepth = 0;
  let depth = 0;
  const nestRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  let nestM;
  while ((nestM = nestRegex.exec(text)) !== null) {
    if (nestM[0].startsWith('</')) {
      depth = Math.max(0, depth - 1);
    } else if (!nestM[0].endsWith('/>')) {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    }
  }
  const max_tag_nesting_depth = maxDepth;

  // eval/function counts
  const eval_in_script_blocks = countOccurrences(scriptText, 'eval(');
  const function_count = countOccurrences(scriptText, 'function ');

  // suspicious words
  const words = lower.split(/\s+/);
  let suspicious_word_count = 0;
  for (const word of SUSPICIOUS_WORDS) {
    suspicious_word_count += countOccurrences(lower, word);
  }
  const keywords_to_words_ratio = words.length > 0 ? suspicious_word_count / words.length : 0;

  // Whitespace ratio
  const whitespaceCount = (text.match(/\s/g) || []).length;
  const whitespace_ratio = text.length > 0 ? whitespaceCount / text.length : 0;
  const html_whitespace_ratio = whitespace_ratio;

  // Escaped characters: &amp; &lt; &#xxx;
  const escaped_char_count = (text.match(/&[a-zA-Z]+;|&#\d+;|&#x[0-9a-fA-F]+;/g) || []).length;

  // Hex encoding rate: \xNN patterns
  const hexMatches = (text.match(/\\x[0-9a-fA-F]{2}/g) || []);
  const hex_encoding_rate = text.length > 0 ? hexMatches.length / text.length : 0;

  // Redirect mechanisms
  let redirect_mechanism_count = 0;
  for (const pat of REDIRECT_PATTERNS) {
    redirect_mechanism_count += countOccurrences(lower, pat.toLowerCase());
  }

  // Event attachments
  let event_attachment_count = 0;
  for (const evt of EVENT_ATTRS) {
    event_attachment_count += countOccurrences(lower, evt);
  }

  return {
    file_size: fileSize,
    line_count,
    entropy,
    script_entropy,
    tag_count,
    unique_tag_count,
    script_count,
    form_count,
    iframe_count,
    hidden_iframe_count,
    external_links_count,
    mailto_link_count,
    base64_string_count,
    html_comment_count,
    max_tag_nesting_depth,
    eval_in_script_blocks,
    function_count,
    total_script_characters,
    suspicious_word_count,
    keywords_to_words_ratio,
    whitespace_ratio,
    escaped_char_count,
    hex_encoding_rate,
    noscript_count,
    embedded_js_count,
    external_js_count,
    internal_link_count,
    external_link_count,
    img_count,
    html_whitespace_ratio,
    redirect_mechanism_count,
    event_attachment_count,
    object_tag_count,
    url_digit_count,
    url_punct_char_count,
    url_avg_length,
    url_avg_subdomain_count,
    hostname_digit_ratio_avg,
    min_link_length,
    max_link_length,
  };
}
