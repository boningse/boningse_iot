import { env } from "../config/env";
import type { ApiEnvelope } from "../models/api";
import type { WorkOrderAction } from "../models/work-order";
import { ApiError } from "./request";
import { session } from "./session";

export interface LocalPhoto {
  path: string;
  size: number;
  name: string;
}

interface SubmitWithPhotosOptions {
  alarmId: string;
  action: WorkOrderAction;
  note?: string;
  assignedTo?: string;
  photos: LocalPhoto[];
  capturedAt?: string;
  locationText?: string;
}

const utf8 = (value: string): Uint8Array => {
  const encoded = unescape(encodeURIComponent(value));
  const bytes = new Uint8Array(encoded.length);
  for (let index = 0; index < encoded.length; index += 1) {
    bytes[index] = encoded.charCodeAt(index);
  }
  return bytes;
};

const combine = (chunks: Uint8Array[]): ArrayBuffer => {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return output.buffer;
};

const mimeType = (path: string): string => {
  const extension = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif"
  };
  return map[extension || ""] || "image/jpeg";
};

const readFile = (path: string): Uint8Array => {
  const content = wx.getFileSystemManager().readFileSync(path);
  if (typeof content === "string") return utf8(content);
  return new Uint8Array(content);
};

export const compressPhoto = (path: string): Promise<string> => new Promise((resolve) => {
  wx.compressImage({
    src: path,
    quality: 72,
    compressedWidth: 1920,
    success: (result) => resolve(result.tempFilePath),
    fail: () => resolve(path)
  });
});

export const submitActionWithPhotos = async (
  options: SubmitWithPhotosOptions
): Promise<Record<string, unknown>> => {
  const boundary = `----BoningMiniProgram${Date.now()}${Math.random().toString(16).slice(2)}`;
  const chunks: Uint8Array[] = [];
  const addField = (name: string, value: string | number | undefined) => {
    if (value === undefined || value === "") return;
    chunks.push(utf8(
      `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="${name}"\r\n\r\n`
      + `${value}\r\n`
    ));
  };

  addField("action", options.action);
  addField("note", options.note);
  addField("assignedTo", options.assignedTo);
  addField("clientType", "mini_program");
  addField("capturedAt", options.capturedAt);
  addField("locationText", options.locationText);

  options.photos.forEach((photo, index) => {
    chunks.push(utf8(
      `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="photos"; filename="${photo.name || `photo-${index + 1}.jpg`}"\r\n`
      + `Content-Type: ${mimeType(photo.path)}\r\n\r\n`
    ));
    chunks.push(readFile(photo.path));
    chunks.push(utf8("\r\n"));
  });
  chunks.push(utf8(`--${boundary}--\r\n`));

  return new Promise((resolve, reject) => {
    wx.request<ApiEnvelope<Record<string, unknown>>>({
      url: `${env.apiBaseUrl}/alarms/${options.alarmId}/actions-with-photos`,
      method: "POST",
      data: combine(chunks),
      timeout: 60000,
      header: {
        Authorization: `Bearer ${session.getAccessToken()}`,
        "X-Client-Type": "mini_program",
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      success: (response) => {
        if (
          response.statusCode < 200
          || response.statusCode >= 300
          || !response.data?.success
        ) {
          reject(new ApiError(response.data?.message || "工单提交失败", response.statusCode));
          return;
        }
        resolve(response.data.data || {});
      },
      fail: (error) => reject(new ApiError(error.errMsg || "照片上传失败"))
    });
  });
};
