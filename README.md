# Thomann Image Downloader

A modern web application to download high-resolution product images from [Thomann](https://www.thomann.de) product pages. Hosted on [GitHub Pages](https://19jvjeffery.github.io/Thomann-Images-Downloader/).

![Thomann Image Downloader](https://github.com/user-attachments/assets/6eea6bb8-8e55-443a-b239-95885e2d472b)

## Features

- 🔍 **Scrape any Thomann product page** – paste a product URL and instantly extract all high-resolution images
- 🖼️ **Image gallery** – preview all found images in a responsive grid
- ✅ **Select/deselect images** – choose exactly which images to download
- 📦 **Bulk download as ZIP** – download multiple images packaged in a ZIP file
- ⬇️ **Single image download** – click any image and download it individually
- 🌐 **Fully client-side** – runs entirely in the browser with no backend required, deployable as a static site

## Tech Stack

- **[Next.js 16](https://nextjs.org/)** (App Router, static export) – React framework
- **[Tailwind CSS v4](https://tailwindcss.com/)** – utility-first styling
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
```

The static output is generated in the `out/` directory and can be served by any static file host.

## Deployment

This app is automatically deployed to GitHub Pages on every push to `main` via the included GitHub Actions workflow (`.github/workflows/deploy.yml`). To deploy your own fork:

1. Go to your repository **Settings → Pages**
2. Under **Source**, select **GitHub Actions**
3. Push to `main` – the workflow will build and deploy automatically

## Usage

1. Go to a Thomann product page, e.g.:
   `https://www.thomann.de/gb/gibson_les_paul_standard_50s_hc_hs.htm`
2. Copy the URL and paste it into the input field
3. Click **Fetch Images** (or press Enter)
4. Review the image gallery – all images are selected by default
5. Click individual images to toggle selection, or use **Select All / Deselect All**
6. Click **Download as ZIP** to save all selected images, or click a single image to download it individually

## How It Works

All processing happens in the browser:

1. The product page is fetched via the public [allorigins.win](https://allorigins.win) CORS proxy
2. The HTML is parsed with the browser's native `DOMParser` to extract image URLs from `<img>` tags, `srcset`, Open Graph meta tags, inline scripts, and JSON-LD structured data
3. Every URL is normalised to its highest-resolution variant (replaces the CDN thumbnail size segment with `orig`)
4. Duplicate URLs are filtered out and the image gallery is rendered
5. Downloads are fetched directly from the Thomann CDN and saved via browser APIs; multiple images are packaged into a ZIP using JSZip

## License

MIT
