"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { ProductImage } from "./api/scrape/route";

interface ImageState extends ProductImage {
  selected: boolean;
  loading: boolean;
  error: boolean;
}

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
    setStatus({ type: "loading", message: "Fetching product images…" });
    setImages([]);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus({ type: "error", message: data.error || "Unknown error" });
        return;
      }

      const imageStates: ImageState[] = (data.images as ProductImage[]).map(
        (img) => ({ ...img, selected: true, loading: true, error: false })
      );
      setImages(imageStates);
      setStatus({
        type: "success",
        message: `Found ${imageStates.length} image${imageStates.length !== 1 ? "s" : ""}`,
      });
    } catch {
      setStatus({
        type: "error",
        message: "Network error – could not reach the server.",
      });
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
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: selectedImages.map(({ url, filename }) => ({ url, filename })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Download failed");
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "thomann-images.zip";
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      alert("Failed to download images");
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
            <div
              className={`mt-3 text-sm flex items-center gap-2 ${
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
