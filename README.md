# Thomann Image Downloader

A modern web application to download high-resolution product images from [Thomann](https://www.thomann.de) product pages.

![Thomann Image Downloader](https://github.com/user-attachments/assets/6eea6bb8-8e55-443a-b239-95885e2d472b)

## Features

- 🔍 **Scrape any Thomann product page** – paste a product URL and instantly extract all high-resolution images
- 🖼️ **Image gallery** – preview all found images in a responsive grid
- ✅ **Select/deselect images** – choose exactly which images to download
- 📦 **Bulk download as ZIP** – download multiple images packaged in a ZIP file
- ⬇️ **Single image download** – hover over any image and click the download button
- 🌐 **Server-side scraping** – bypasses CORS restrictions by fetching pages server-side

## Tech Stack

- **[Next.js 16](https://nextjs.org/)** (App Router) – React framework with API routes
- **[Tailwind CSS v4](https://tailwindcss.com/)** – utility-first styling
- **[Cheerio](https://cheerio.js.org/)** – HTML scraping/parsing on the server
- **[JSZip](https://stuk.github.io/jszip/)** – ZIP archive generation for bulk downloads
- **TypeScript** – full type safety

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Install & run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for production

```bash
npm run build
npm start
```

## Usage

1. Go to a Thomann product page, e.g.:
   `https://www.thomann.de/gb/gibson_les_paul_standard_50s_hc_hs.htm`
2. Copy the URL and paste it into the input field
3. Click **Fetch Images** (or press Enter)
4. Review the image gallery – all images are selected by default
5. Click individual images to toggle selection, or use **Select All / Deselect All**
6. Click **Download as ZIP** to save all selected images, or hover an image and click the download icon for a single file

## How It Works

The `/api/scrape` route:
1. Fetches the Thomann product page HTML server-side (avoiding CORS)
2. Uses Cheerio to extract all image URLs from `<img>` tags, `srcset`, Open Graph meta tags, inline scripts, and JSON-LD structured data
3. Normalises every URL to its highest-resolution variant (replaces the CDN thumbnail size segment with `orig`)
4. Returns de-duplicated image metadata to the client

The `/api/download` route:
1. Receives a list of image URLs (must be from `*.thomann.de`)
2. Fetches each image and streams it into a JSZip archive
3. Returns the ZIP as a binary response

## License

MIT
