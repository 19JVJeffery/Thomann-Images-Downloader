import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export interface ProductImage {
  url: string;
  thumbnail: string;
  filename: string;
}

function toOriginalUrl(url: string): string {
  // Transform any Thomann CDN thumbnail URL to the highest-resolution version.
  // CDN pattern: https://thumbs.static-thomann.de/thumb/{size}/pics/...
  // Replace any size segment with "orig" and normalise the extension to .jpg.
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

export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url: rawUrl } = body;

  if (!rawUrl || typeof rawUrl !== "string") {
    return NextResponse.json({ error: "Missing URL" }, { status: 400 });
  }

  const url: string = rawUrl;

  // Validate the URL is a Thomann product page
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (!parsedUrl.hostname.includes("thomann.de")) {
    return NextResponse.json(
      { error: "URL must be a Thomann product page (thomann.de)" },
      { status: 400 }
    );
  }

  let html: string;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      // 15 second timeout
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch page: HTTP ${response.status}` },
        { status: 502 }
      );
    }

    html = await response.text();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch page: ${message}` },
      { status: 502 }
    );
  }

  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const images: ProductImage[] = [];

  function addImage(rawUrl: string) {
    const normalized = normalizeUrl(rawUrl, url);
    if (!normalized || !isThomannCdnUrl(normalized)) return;
    const orig = toOriginalUrl(normalized);
    if (seen.has(orig)) return;
    seen.add(orig);
    // Build thumbnail by replacing "orig" with a mid-size variant
    const thumb = orig
      .replace("/thumb/orig/", "/thumb/pad630x630/")
      .replace(/\.jpg(\?.*)?$/, ".webp");
    images.push({
      url: orig,
      thumbnail: thumb,
      filename: extractFilename(orig),
    });
  }

  // 1. Look for product gallery / lightbox images
  $("img[data-zoom-image], img[data-src], img[src]").each((_, el) => {
    const src =
      $(el).attr("data-zoom-image") ||
      $(el).attr("data-src") ||
      $(el).attr("src") ||
      "";
    addImage(src);
  });

  // 2. Look for Open Graph images
  $('meta[property="og:image"], meta[name="og:image"]').each((_, el) => {
    addImage($(el).attr("content") || "");
  });

  // 3. Look for srcset attributes
  $("[srcset], [data-srcset]").each((_, el) => {
    const srcset =
      $(el).attr("srcset") || $(el).attr("data-srcset") || "";
    // srcset format: "url1 1x, url2 2x" or "url1 100w, url2 200w"
    srcset.split(",").forEach((part) => {
      const urlPart = part.trim().split(/\s+/)[0];
      if (urlPart) addImage(urlPart);
    });
  });

  // 4. Look for anchor links to full images
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (isThomannCdnUrl(href)) addImage(href);
  });

  // 5. Try to extract from inline JSON / scripts
  $("script").each((_, el) => {
    const content = $(el).html() || "";
    const cdnMatches = content.match(
      /https?:\/\/thumbs\.static-thomann\.de\/thumb\/[^"'\s,)]+/g
    );
    if (cdnMatches) {
      cdnMatches.forEach((match) => addImage(match));
    }
  });

  // 6. Look for JSON-LD structured data
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || "{}");
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

  if (images.length === 0) {
    return NextResponse.json(
      {
        error:
          "No product images found on this page. Make sure you are using a valid Thomann product URL.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ images });
}
