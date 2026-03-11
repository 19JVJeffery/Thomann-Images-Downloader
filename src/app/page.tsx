"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import JSZip from "jszip";

export interface ProductImage {
  url: string;
  thumbnail: string;
  filename: string;
}

interface ImageState extends ProductImage {
  selected: boolean;
  loading: boolean;
  error: boolean;
}

// ── helpers ──────────────────────────────────────────────────────────────────

// Matches any thomann.* hostname (e.g. thomann.de, thomann.co.uk, www.thomann.fr)
const THOMANN_DOMAIN_PATTERN = /^(?:[a-z0-9-]+\.)?thomann\.[a-z]{2,}(?:\.[a-z]{2,})?$/i;

function toOriginalUrl(url: string): string {
  return url
    .replace(/\/thumb\/[^/]+\//, "/thumb/orig/")
    .replace(/\.webp(\?.*)?$/, ".jpg")
    .split("?")[0];
}

function extractFilename(url: string): string {
  const parts = url.split("/");
  const last = parts[parts.length - 1];
  return last.replace(/\?.*$/, "") || "image.jpg";
}

function isThomannCdnUrl(url: string): boolean {
  return (
    url.includes("thumbs.static-thomann.de") ||
    url.includes("images.static-thomann.de")
  );
}

function normalizeUrl(url: string, base: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) {
    const baseUrl = new URL(base);
    return baseUrl.origin + url;
  }
  return url;
}

async function scrapeImages(productUrl: string): Promise<ProductImage[]> {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(productUrl)}`;
  const response = await fetch(proxyUrl, {
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page: HTTP ${response.status}`);
  }

  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const seen = new Set<string>();
  const images: ProductImage[] = [];

  function addImage(rawUrl: string) {
    const normalized = normalizeUrl(rawUrl, productUrl);
    if (!normalized || !isThomannCdnUrl(normalized)) return;
    const orig = toOriginalUrl(normalized);
    if (seen.has(orig)) return;
    seen.add(orig);
    const thumb = orig
      .replace("/thumb/orig/", "/thumb/pad630x630/")
      .replace(/\.jpg(\?.*)?$/, ".webp");
    images.push({ url: orig, thumbnail: thumb, filename: extractFilename(orig) });
  }

  // 1. img tags
  doc.querySelectorAll("img[data-zoom-image], img[data-src], img[src]").forEach((el) => {
    const src =
      el.getAttribute("data-zoom-image") ||
      el.getAttribute("data-src") ||
      el.getAttribute("src") ||
      "";
    addImage(src);
  });

  // 2. Open Graph images
  doc
    .querySelectorAll('meta[property="og:image"], meta[name="og:image"]')
    .forEach((el) => addImage(el.getAttribute("content") || ""));

  // 3. srcset attributes
  doc.querySelectorAll("[srcset], [data-srcset]").forEach((el) => {
    const srcset = el.getAttribute("srcset") || el.getAttribute("data-srcset") || "";
    srcset.split(",").forEach((part) => {
      const urlPart = part.trim().split(/\s+/)[0];
      if (urlPart) addImage(urlPart);
    });
  });

  // 4. anchor links to CDN images
  doc.querySelectorAll("a[href]").forEach((el) => {
    const href = el.getAttribute("href") || "";
    if (isThomannCdnUrl(href)) addImage(href);
  });

  // 5. inline scripts (JSON data)
  doc.querySelectorAll("script").forEach((el) => {
    const content = el.textContent || "";
    const cdnMatches = content.match(
      /https?:\/\/thumbs\.static-thomann\.de\/thumb\/[^"'\s,)]+/g
    );
    if (cdnMatches) cdnMatches.forEach((match) => addImage(match));
  });

  // 6. JSON-LD structured data
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
    try {
      const json = JSON.parse(el.textContent || "{}");
      const imgUrls: string[] = [];
      if (json.image) {
        if (Array.isArray(json.image)) imgUrls.push(...json.image);
        else imgUrls.push(json.image);
      }
      if (json.offers?.image) imgUrls.push(json.offers.image);
      imgUrls.forEach((u) => typeof u === "string" && addImage(u));
    } catch {
      // ignore malformed JSON
    }
  });

  return images;
}

async function downloadAsZip(imgs: ImageState[]): Promise<void> {
  const zip = new JSZip();
  const usedFilenames = new Set<string>();

  for (const img of imgs) {
    try {
      const response = await fetch(img.url);
      if (!response.ok) continue;
      const buffer = await response.arrayBuffer();

      let filename = img.filename || "image.jpg";
      if (usedFilenames.has(filename)) {
        const ext = filename.includes(".")
          ? "." + filename.split(".").pop()
          : "";
        const base = ext ? filename.slice(0, -ext.length) : filename;
        let counter = 1;
        while (usedFilenames.has(`${base}_${counter}${ext}`)) counter++;
        filename = `${base}_${counter}${ext}`;
      }
      usedFilenames.add(filename);
      zip.file(filename, buffer);
    } catch {
      // skip failed downloads, continue with others
    }
  }

  if (Object.keys(zip.files).length === 0) {
    throw new Error("Failed to download any images");
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = "thomann-images.zip";
  a.click();
  URL.revokeObjectURL(objectUrl);
}

// ── component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [url, setUrl] = useState("");
  const [images, setImages] = useState<ImageState[]>([]);
  const [status, setStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });
  const [downloading, setDownloading] = useState(false);

  const selectedImages = images.filter((img) => img.selected);
  const allSelected =
    images.length > 0 && images.every((img) => img.selected);

  const handleFetch = useCallback(async () => {
    if (!url.trim()) return;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      setStatus({ type: "error", message: "Invalid URL" });
      return;
    }

    const host = parsedUrl.hostname;
    const isThomann = THOMANN_DOMAIN_PATTERN.test(host);
    if (!isThomann) {
      setStatus({
        type: "error",
        message: "URL must be a Thomann product page (e.g. thomann.de, thomann.co.uk)",
      });
      return;
    }

    setStatus({ type: "loading", message: "Fetching product images…" });
    setImages([]);

    try {
      const imgs = await scrapeImages(url.trim());

      if (imgs.length === 0) {
        setStatus({
          type: "error",
          message:
            "No product images found on this page. Make sure you are using a valid Thomann product URL.",
        });
        return;
      }

      const imageStates: ImageState[] = imgs.map((img) => ({
        ...img,
        selected: true,
        loading: true,
        error: false,
      }));
      setImages(imageStates);
      setStatus({
        type: "success",
        message: `Found ${imageStates.length} image${imageStates.length !== 1 ? "s" : ""}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus({ type: "error", message });
    }
  }, [url]);

  const toggleSelect = (index: number) => {
    setImages((prev) =>
      prev.map((img, i) =>
        i === index ? { ...img, selected: !img.selected } : img
      )
    );
  };

  const toggleSelectAll = () => {
    setImages((prev) => prev.map((img) => ({ ...img, selected: !allSelected })));
  };

  const downloadSingle = async (img: ImageState) => {
    try {
      const response = await fetch(img.url);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = img.filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      alert(`Failed to download ${img.filename}`);
    }
  };

  const downloadSelected = async () => {
    if (selectedImages.length === 0) return;

    if (selectedImages.length === 1) {
      downloadSingle(selectedImages[0]);
      return;
    }

    setDownloading(true);
    try {
      await downloadAsZip(selectedImages);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Download failed";
      alert(message);
    } finally {
      setDownloading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleFetch();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900/60 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center gap-3">
          <div className="bg-red-600 rounded-lg p-2">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Thomann Image Downloader
            </h1>
            <p className="text-xs text-slate-400">
              Download high-resolution product images from Thomann
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-10">
        {/* URL Input Section */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-8 shadow-xl">
          <label
            htmlFor="product-url"
            className="block text-sm font-medium text-slate-300 mb-2"
          >
            Thomann Product URL
          </label>
          <div className="flex gap-3">
            <input
              id="product-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://www.thomann.de/gb/product-name.htm"
              className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-sm
                         placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500
                         focus:border-transparent transition-all"
            />
            <button
              onClick={handleFetch}
              disabled={status.type === "loading" || !url.trim()}
              className="bg-red-600 hover:bg-red-500 disabled:bg-slate-600 disabled:cursor-not-allowed
                         text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200
                         flex items-center gap-2 min-w-[130px] justify-center shadow-lg"
            >
              {status.type === "loading" ? (
                <>
                  <svg
                    className="animate-spin w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Fetching...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  Fetch Images
                </>
              )}
            </button>
          </div>

          {/* Status message */}
          {status.type !== "idle" && status.message && (
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <div
                className={`text-sm flex items-center gap-2 ${
                  status.type === "error"
                    ? "text-red-400"
                    : status.type === "success"
                    ? "text-green-400"
                    : "text-slate-400"
                }`}
              >
                {status.type === "error" && (
                  <svg
                    className="w-4 h-4 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                {status.type === "success" && (
                  <svg
                    className="w-4 h-4 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                {status.message}
              </div>
              {status.type === "error" && url.trim() && (
                <button
                  onClick={handleFetch}
                  className="text-sm text-red-400 hover:text-red-300 border border-red-700
                             hover:border-red-500 rounded-lg px-3 py-1 transition-all flex items-center gap-1.5"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Try Again
                </button>
              )}
            </div>
          )}
        </div>

        {/* Toolbar */}
        {images.length > 0 && (
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="text-sm text-slate-300 hover:text-white border border-slate-600
                           hover:border-slate-400 rounded-lg px-3 py-1.5 transition-all"
              >
                {allSelected ? "Deselect All" : "Select All"}
              </button>
              <span className="text-sm text-slate-400">
                {selectedImages.length} of {images.length} selected
              </span>
            </div>
            <button
              onClick={downloadSelected}
              disabled={selectedImages.length === 0 || downloading}
              className="bg-red-600 hover:bg-red-500 disabled:bg-slate-600 disabled:cursor-not-allowed
                         text-white font-semibold px-5 py-2.5 rounded-xl transition-all duration-200
                         flex items-center gap-2 shadow-lg text-sm"
            >
              {downloading ? (
                <>
                  <svg
                    className="animate-spin w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Preparing ZIP...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  {selectedImages.length === 1
                    ? "Download Image"
                    : `Download ${selectedImages.length} as ZIP`}
                </>
              )}
            </button>
          </div>
        )}

        {/* Image Grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {images.map((img, index) => (
              <div
                key={img.url}
                onClick={() => toggleSelect(index)}
                className={`group relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-200
                  ${
                    img.selected
                      ? "border-red-500 shadow-lg shadow-red-500/20"
                      : "border-slate-700 hover:border-slate-500"
                  }`}
              >
                {/* Thumbnail */}
                <div className="aspect-square bg-slate-700 relative">
                  {img.loading && !img.error && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg
                        className="animate-spin w-6 h-6 text-slate-400"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                    </div>
                  )}
                  {img.error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-1">
                      <svg
                        className="w-8 h-8"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="text-xs">No preview</span>
                    </div>
                  )}
                  <Image
                    src={img.thumbnail}
                    alt={img.filename}
                    fill
                    className={`object-cover transition-opacity duration-300 ${
                      img.loading ? "opacity-0" : "opacity-100"
                    }`}
                    onLoad={() =>
                      setImages((prev) =>
                        prev.map((p, i) =>
                          i === index ? { ...p, loading: false } : p
                        )
                      )
                    }
                    onError={() =>
                      setImages((prev) =>
                        prev.map((p, i) =>
                          i === index
                            ? { ...p, loading: false, error: true }
                            : p
                        )
                      )
                    }
                    unoptimized
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
                  />
                </div>

                {/* Checkbox overlay */}
                <div
                  className={`absolute top-2 left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center
                    transition-all duration-200
                    ${
                      img.selected
                        ? "bg-red-500 border-red-500"
                        : "bg-slate-900/70 border-slate-400 group-hover:border-white"
                    }`}
                >
                  {img.selected && (
                    <svg
                      className="w-3 h-3 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>

                {/* Individual download button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadSingle(img);
                  }}
                  className="absolute top-2 right-2 w-7 h-7 bg-slate-900/80 hover:bg-red-600
                             rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100
                             transition-all duration-200"
                  title="Download this image"
                >
                  <svg
                    className="w-3.5 h-3.5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                </button>

                {/* Filename label */}
                <div className="bg-slate-800 px-2 py-1.5">
                  <p
                    className="text-xs text-slate-300 truncate"
                    title={img.filename}
                  >
                    {img.filename}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {images.length === 0 && status.type !== "loading" && (
          <div className="text-center py-20 text-slate-500">
            <svg
              className="w-16 h-16 mx-auto mb-4 opacity-30"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-lg font-medium mb-1">No images yet</p>
            <p className="text-sm">
              Paste a Thomann product URL above and click &ldquo;Fetch Images&rdquo;
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
