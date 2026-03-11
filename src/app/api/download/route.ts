import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";

export async function POST(request: NextRequest) {
  let body: { images?: Array<{ url: string; filename: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { images } = body;
  if (!Array.isArray(images) || images.length === 0) {
    return NextResponse.json({ error: "No images provided" }, { status: 400 });
  }

  // Validate all URLs point to Thomann CDN
  for (const img of images) {
    if (!img.url || typeof img.url !== "string") {
      return NextResponse.json(
        { error: "Invalid image entry" },
        { status: 400 }
      );
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(img.url);
    } catch {
      return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
    }
    if (
      !parsedUrl.hostname.endsWith("static-thomann.de") &&
      !parsedUrl.hostname.endsWith("thomann.de")
    ) {
      return NextResponse.json(
        { error: "Image URL must be from thomann.de domain" },
        { status: 400 }
      );
    }
  }

  const zip = new JSZip();
  const usedFilenames = new Set<string>();

  for (const img of images) {
    try {
      const response = await fetch(img.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) continue;

      const buffer = await response.arrayBuffer();
      let filename = img.filename || "image.jpg";

      // Ensure unique filenames
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
      // Skip failed downloads, continue with others
    }
  }

  if (Object.keys(zip.files).length === 0) {
    return NextResponse.json(
      { error: "Failed to download any images" },
      { status: 502 }
    );
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

  return new NextResponse(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="thomann-images.zip"',
    },
  });
}
