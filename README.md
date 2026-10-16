# Price Scanner (Next.js)

Scan product barcodes with a phone camera, a handheld scanner or the keyboard. You see the price, and every product found is added to a cart that shows the running total. You can change prices, add product photos, and give items without a barcode a printable in-store barcode.

Built with Next.js 16 (App Router), React 19 and TypeScript. It runs on Node.js 22 or newer.

## Run it

```bash
npm install
cp .env.example .env.local   # then set ADMIN_PIN
npm run dev                  # http://localhost:3000

npm run build && npm start   # production
npm test                     # unit + API tests (Vitest)
npm run typecheck
npm run lint
```

| Variable | Meaning |
|---|---|
| `ADMIN_PIN` | PIN needed to change prices or photos. Leave it empty and anyone with the link can change prices. |
| `DATA_DIR` | File storage only: folder holding `products.json`, `images/` and `barcode-sequence.json` (default `./data`) |
| `STORAGE` | `file` or `netlify-blobs`. Optional: Netlify builds pick `netlify-blobs` automatically, everything else uses `file`. |

> **Phones need HTTPS for the camera.** `http://localhost` works on the computer itself. To test on a phone, run `npx cloudflared tunnel --url http://localhost:3000` and open the `https://…` link it prints.

> **Where data is kept:** on your PC or your own server, products and photos are files in `DATA_DIR`. On Netlify, which has no permanent disk, they are kept in **Netlify Blobs** instead (see below). Both use the same `ProductStore` interface, so the rest of the app is identical.

## Deploy to Netlify

1. **Create the site.** In Netlify, choose **Add new project → Import an existing project → GitHub**, then pick this repository. The build settings come from `netlify.toml`, so leave them as they are.
2. **Set the PIN before the first deploy.** Go to **Project configuration → Environment variables** and add `ADMIN_PIN`. Without it, anyone with the link can change prices.
3. **Deploy.** Every push to `main` deploys again automatically.
4. **Copy your products and photos** from `data/` into the site. They are not in Git. You need two values:
   - `BLOBS_SITE_ID`: **Project configuration → General → Project ID**
   - `BLOBS_TOKEN`: **User settings → Applications → Personal access tokens → New access token**

   ```powershell
   # PowerShell
   $env:BLOBS_SITE_ID="..."; $env:BLOBS_TOKEN="..."; npm run upload-data
   ```
   ```bash
   # Git Bash / macOS / Linux
   BLOBS_SITE_ID=... BLOBS_TOKEN=... npm run upload-data
   ```
   Products already online are skipped, so running it again never overwrites prices changed on the site. Add `-- --overwrite` to replace them.

On Netlify the camera works straight away, because the site is HTTPS.

**If saving fails with `MissingBlobsEnvironmentError`** (in the site's function logs), add `BLOBS_SITE_ID` and `BLOBS_TOKEN` as environment variables of the site too, then redeploy. The app then uses them to reach Blobs explicitly.

## Pages

| URL | What it does |
|---|---|
| `/` | Scanner: camera / handheld / typed code → price card, cart with total, recent scans. Includes "Product has no barcode? Create one". |
| `/products` | All products (loaded on the server). Search, add, edit price and photo. A barcode scanned into the search box followed by Enter opens that product. |
| `/barcodes` | Printable test sheet with "Mixed positions" (rotated or resized tags) for testing the camera. `?barcodes=a,b&print=1` prints only those labels. |

## Project structure

```
src/
  domain/               Pure business rules: no React, no Next.js, no I/O
    Barcode.ts            barcode value object + format registry (EAN-13, UPC-A, EAN-8)
    Product.ts            product value object + ProductData (plain JSON shape)
    Cart.ts               cart reducer + summarizeCart (exact totals in minor units)
    Money.ts              currency minor-unit maths
    InternalBarcode.ts    in-store codes 20xxxxxxxxxxC

  barcodes/             EAN bar patterns and bar geometry (drawn by <BarcodeSvg>)

  lib/
    config.ts             browser settings (cache time, locale, default currency…)
    format.ts             price/date formatting, label print URL
    EventBus.ts           typed publish/subscribe
    server/               Server-only code (marked with 'server-only')
      container.ts          builds the server services (one instance per process)
      ProductStore.ts       storage interface
      FileProductStore.ts   products.json + images/, queued atomic writes (PC / own server)
      NetlifyBlobsProductStore.ts  Netlify Blobs: one blob per product, create-only barcode claims
      InternalBarcodeAllocator.ts  issues unique in-store barcodes
      http.ts, errors.ts    error → HTTP status, PIN check, body size limits
    client/               Browser-side code
      container.ts          builds the browser services
      api/ProductApiClient.ts    REST calls + PIN prompt/retry
      repositories/         lookup sources (REST API + TTL cache)
      services/             PriceLookupService, ProductEditService, event types
      scanners/             camera (native / ZXing), handheld scanner, de-duplication

  components/           React UI (each component has its own *.module.css)
    providers/            ServicesProvider (dependency injection), AppProviders
    scanner/              ScannerScreen + Camera, Result, Cart and History panels, scanner hooks
    products/             ProductsScreen, ProductEditorDialog (+ provider), LabelDialog, ProductPhoto
    barcodes/             BarcodeSvg, ProductTag, BarcodeSheet

  app/                  Next.js routes
    page.tsx, products/page.tsx, barcodes/page.tsx
    api/products/…        GET list · GET/PUT one · PUT/DELETE photo
    api/barcodes/next     POST: new in-store barcode
    images/[file]         serves uploaded photos

tests/                  Vitest: domain, barcodes, client services, scanners, server + API routes
```

**Dependencies point inwards:** `app` and `components` → `lib` → `domain`. The domain imports nothing from the outer layers, so the rules can be tested and reused without React or Next.js.

## Design patterns

| Pattern | Where | Why |
|---|---|---|
| **Repository** | `ProductStore` (server), `ProductRepository` (browser) | Storage and lookup sources can be swapped without touching the rest |
| **Decorator** | `CachedProductRepository` | Adds caching to any repository |
| **Gateway / Adapter** | `ProductApiClient`, `ZxingCameraScanner` | Hides HTTP details and the ZXing library behind our own interfaces |
| **Strategy** | `BarcodeScanner` implementations, `BARCODE_FORMATS` | Input methods and barcode rules are interchangeable |
| **Template Method** | `CameraScanner` | Camera engines only implement frame decoding |
| **Factory** | `ScannerFactory` | Picks the best camera engine for the browser |
| **Facade** | `PriceLookupService` | One call per scan, and it never throws |
| **Observer** | `EventBus` + `useAppEvent` | The cart, result card and label dialog react to events. Nobody calls them directly. |
| **Reducer** | `cartReducer` | Every cart change is an action, handled by one pure function |
| **Dependency injection** | `lib/*/container.ts`, `ServicesProvider` | Concrete classes are chosen in one place, and tests pass in fakes |

## API

Requests that change data need the `X-Admin-Pin` header when `ADMIN_PIN` is set. The app asks for the PIN once per browser tab.

| Method | Path | |
|---|---|---|
| GET | `/api/products` | all products |
| GET | `/api/products/:barcode` | one product, 404 if unknown |
| PUT | `/api/products/:barcode` | create/update `{ name, price, currency, unit }` |
| PUT | `/api/products/:barcode/image` | upload photo (raw JPEG/PNG/WebP body, max 3 MB) |
| DELETE | `/api/products/:barcode/image` | remove photo |
| POST | `/api/barcodes/next` | new in-store barcode `{ barcode }` (201) |

## Common changes

- **Currency or locale:** set `locale` and `currency` in `src/lib/config.ts`. Each product keeps its own currency.
- **Use a database:** write a class that implements `ProductStore` (`src/lib/server/ProductStore.ts`) and a `BarcodeAllocator`, and return them from `createServices()` in `src/lib/server/container.ts`. `NetlifyBlobsProductStore.ts` is a worked example. Nothing else changes.
- **Support another barcode format:** add an entry to `BARCODE_FORMATS` in `src/domain/Barcode.ts`, then add the name to `WANTED_FORMATS` in `NativeCameraScanner.ts` and to the hints in `ZxingCameraScanner.ts`.
- **React to scans elsewhere** (a beep, a receipt…): in a client component, call `useAppEvent('lookup:completed', handler)`.
- **Back up your data:** with file storage, copy the whole `DATA_DIR` folder (`products.json`, `images/`, `barcode-sequence.json`). On Netlify the data lives in Blobs; see **Project → Blobs** in the Netlify UI.
