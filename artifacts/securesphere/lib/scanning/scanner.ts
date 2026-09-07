/**
 * Main on-device file scanner.
 * Orchestrates: file type detection → feature extraction → LightGBM inference.
 *
 * The plaintext file bytes are NEVER transmitted anywhere.
 * Only scan results (metadata) are returned to the caller.
 */

import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { lgbmPredict, buildFeatureVector, LGBMModel } from "./lgbmInference";
import { extractPDFFeatures } from "./extractors/pdfExtractor";
import { extractHTMLFeatures } from "./extractors/htmlExtractor";
import { extractWordFeatures } from "./extractors/wordExtractor";
import { extractExcelFeatures } from "./extractors/excelExtractor";

export type SupportedFileType =
  "pdf" | "word" | "excel" | "html" | "unsupported";

export interface ScanResult {
  fileType: SupportedFileType;
  verdict: "SAFE" | "MALICIOUS" | "UNSUPPORTED" | "ERROR";
  confidence: number;
  error?: string;
}

// Model cache — loaded once per session
const modelCache: Partial<Record<SupportedFileType, LGBMModel>> = {};

async function loadModel(
  fileType: Exclude<SupportedFileType, "unsupported">,
): Promise<LGBMModel> {
  if (modelCache[fileType]) return modelCache[fileType]!;

  // Models are bundled in assets/models/
  // In Expo managed workflow, use require() for JSON assets
  let model: LGBMModel;
  switch (fileType) {
    case "pdf":
      model = require("../../assets/models/pdf.json") as LGBMModel;
      break;
    case "word":
      model = require("../../assets/models/word.json") as LGBMModel;
      break;
    case "excel":
      model = require("../../assets/models/excel.json") as LGBMModel;
      break;
    case "html":
      model = require("../../assets/models/html.json") as LGBMModel;
      break;
    default:
      throw new Error(`No model for file type: ${fileType}`);
  }

  modelCache[fileType] = model;
  return model;
}

/**
 * Detect file type from name and MIME type.
 */
export function detectFileType(
  fileName: string,
  mimeType?: string,
): SupportedFileType {
  const name = fileName.toLowerCase();
  const mime = (mimeType || "").toLowerCase();

  if (name.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (
    name.endsWith(".docx") ||
    name.endsWith(".doc") ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword"
  )
    return "word";
  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xlsm") ||
    name.endsWith(".xls") ||
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel"
  )
    return "excel";
  if (name.endsWith(".html") || name.endsWith(".htm") || mime === "text/html")
    return "html";

  return "unsupported";
}

/**
 * Read a local file URI as a Uint8Array.
 * Uses expo-file-system readAsStringAsync with base64 encoding.
 */
export async function readFileBytes(uri: string): Promise<Uint8Array> {
  // On web, DocumentPicker gives us a browser-readable URI/blob URL.
  // Use fetch() instead of expo-file-system because
  // readAsStringAsync() is not available on Expo Web.
  if (Platform.OS === "web") {
    const response = await fetch(uri);

    if (!response.ok) {
      throw new Error(`Unable to read selected file: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  // On Android/iOS, use Expo FileSystem.
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);

  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  return bytes;
}

/**
 * Scan a file for malware using on-device LightGBM inference.
 * @param fileUri - Local file:// URI from DocumentPicker
 * @param fileName - Original filename (for type detection)
 * @param fileSize - File size in bytes
 * @param mimeType - MIME type string (optional)
 * @returns ScanResult — verdict and confidence. File bytes are never transmitted.
 */
export async function scanFile(
  fileUri: string,
  fileName: string,
  fileSize: number,
  mimeType?: string,
): Promise<ScanResult> {
  const fileType = detectFileType(fileName, mimeType);

  if (fileType === "unsupported") {
    return {
      fileType: "unsupported",
      verdict: "UNSUPPORTED",
      confidence: 0,
    };
  }

  try {
    // Read file bytes (plaintext stays on device)
    const fileBytes = await readFileBytes(fileUri);

    // Load the corresponding model
    const model = await loadModel(fileType);

    // Extract features
    let featuresMap: Record<string, number>;
    switch (fileType) {
      case "pdf":
        featuresMap = extractPDFFeatures(
          fileBytes,
          fileSize,
        ) as unknown as Record<string, number>;
        break;
      case "word":
        featuresMap = extractWordFeatures(
          fileBytes,
          fileSize,
        ) as unknown as Record<string, number>;
        break;
      case "excel":
        featuresMap = extractExcelFeatures(
          fileBytes,
          fileSize,
        ) as unknown as Record<string, number>;
        break;
      case "html":
        featuresMap = extractHTMLFeatures(
          fileBytes,
          fileSize,
        ) as unknown as Record<string, number>;
        break;
      default:
        throw new Error("Unreachable");
    }

    // Build feature vector in exact model order
    const featureVector = buildFeatureVector(model, featuresMap);

    // Run on-device inference
    const maliciousProbability = lgbmPredict(model, featureVector);
    const confidence = maliciousProbability;
    const verdict: "SAFE" | "MALICIOUS" =
      maliciousProbability >= 0.5 ? "MALICIOUS" : "SAFE";

    // Explicitly clear file bytes from memory (help GC)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fileBytes as any).fill(0);

    return { fileType, verdict, confidence };
  } catch (error) {
    return {
      fileType,
      verdict: "ERROR",
      confidence: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
