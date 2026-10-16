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
| `DATA_DIR` | Folder holding `products.json`, `images/` and `barcode-sequence.json` (default `./data`) |

> **Phones need HTTPS for the camera.** `http://localhost` works on the computer itself. To test on a phone, run `npx cloudflared tunnel --url http://localhost:3000` and open the `https://…` link it prints.

> **Hosting:** products and photos are saved as files in `DATA_DIR`, so the app needs a server with a disk that keeps its files: your own PC, a VPS, or Docker with a volume. Serverless hosts such as Vercel don't keep files between requests. To host there, write a database-backed `ProductStore` (see below).

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
      FileProductStore.ts   products.json + images/, queued atomic writes
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
- **Use a database:** write a class that implements `ProductStore` (`src/lib/server/ProductStore.ts`) and return it from `createServices()` in `src/lib/server/container.ts`. Also store the allocator's counter in the database. Nothing else changes.
- **Support another barcode format:** add an entry to `BARCODE_FORMATS` in `src/domain/Barcode.ts`, then add the name to `WANTED_FORMATS` in `NativeCameraScanner.ts` and to the hints in `ZxingCameraScanner.ts`.
- **React to scans elsewhere** (a beep, a receipt…): in a client component, call `useAppEvent('lookup:completed', handler)`.
- **Back up your data:** copy the whole `DATA_DIR` folder (`products.json`, `images/`, `barcode-sequence.json`).
