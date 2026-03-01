const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT) || 5000;
const ROOT_DIR = process.cwd();
const SOURCES = {
  pce: {
    key: "pce",
    dataFilePath: path.join(ROOT_DIR, "S4PCE.json"),
    remoteApiUrl: "https://api.sap.com/api/1.0/container/SAPS4HANACloudPrivateEdition/artifacts?containerType=product&$filter=Type%20eq%20%27API%27&$orderby=DisplayName%20asc"
  },
  cloud: {
    key: "cloud",
    dataFilePath: path.join(ROOT_DIR, "S4Cloud.json"),
    remoteApiUrl: "https://api.sap.com/api/1.0/container/SAPS4HANACloud/artifacts?containerType=product&$filter=Type%20eq%20%27API%27&$orderby=DisplayName%20asc"
  }
};
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;
const FETCH_TIMEOUT_MS = 20000;
const MAX_FETCH_ATTEMPTS = 2;
const activeSyncPromises = new Map();

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function getFilePathFromUrl(urlPathname) {
  const requestedPath = urlPathname === "/" ? "/index.html" : urlPathname;
  const normalizedPath = path.normalize(requestedPath).replace(/^([.][.][/\\])+/, "");
  return path.join(ROOT_DIR, normalizedPath);
}

async function serveStaticFile(urlPathname, response) {
  const filePath = getFilePathFromUrl(urlPathname);
  const resolvedPath = path.resolve(filePath);

  if (!resolvedPath.startsWith(path.resolve(ROOT_DIR))) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(resolvedPath);
    const extension = path.extname(resolvedPath).toLowerCase();
    const contentType = CONTENT_TYPES[extension] || "application/octet-stream";

    response.writeHead(200, { "Content-Type": contentType });
    response.end(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not Found");
      return;
    }

    response.writeHead(500);
    response.end("Internal Server Error");
  }
}

async function proxyArtifacts(response, source) {
  try {
    const records = await readArtifactsFromFile(source);

    if (records.length === 0) {
      triggerBackgroundSync(source, "auto-empty-file").catch(() => {
      });
    }

    sendJson(response, 200, records);
  } catch (error) {
    sendJson(response, 500, {
      error: "Failed to read local cache file",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

async function readArtifactsFromFile(source) {
  try {
    const fileContent = await fs.readFile(source.dataFilePath, "utf8");
    if (!fileContent.trim()) {
      return [];
    }

    const parsed = JSON.parse(fileContent);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function fetchArtifactsFromUpstream(source) {
  const allRecords = [];
  const seenRecordKeys = new Set();

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const skip = pageIndex * PAGE_SIZE;
    const pageUrl = new URL(source.remoteApiUrl);
    pageUrl.searchParams.set("$top", String(PAGE_SIZE));
    pageUrl.searchParams.set("$skip", String(skip));

    const upstreamResponse = await fetchUpstreamPage(pageUrl, pageIndex);

    if (!upstreamResponse.ok) {
      const upstreamError = new Error(`Upstream request failed with HTTP ${upstreamResponse.status}`);
      upstreamError.status = upstreamResponse.status;
      upstreamError.details = await upstreamResponse.text();
      throw upstreamError;
    }

    const pagePayload = await upstreamResponse.json();
    const pageRecords = Array.isArray(pagePayload)
      ? pagePayload
      : Array.isArray(pagePayload?.value)
        ? pagePayload.value
        : Array.isArray(pagePayload?.results)
          ? pagePayload.results
          : null;

    if (!pageRecords) {
      break;
    }

    let newItemsInPage = 0;
    for (const item of pageRecords) {
      const itemKey = `${item.reg_id ?? ""}|${item.Name ?? ""}|${item.Version ?? ""}`;
      if (seenRecordKeys.has(itemKey)) {
        continue;
      }

      seenRecordKeys.add(itemKey);
      allRecords.push(item);
      newItemsInPage += 1;
    }

    if (newItemsInPage === 0 || pageRecords.length < PAGE_SIZE) {
      break;
    }
  }

  return allRecords;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableError(error) {
  return error?.name === "AbortError" || error?.isNetworkError === true || (typeof error?.status === "number" && error.status >= 500);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function fetchUpstreamPage(pageUrl, pageIndex) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const upstreamResponse = await fetchWithTimeout(pageUrl, {
        method: "GET",
        headers: { Accept: "application/json" }
      }, FETCH_TIMEOUT_MS);

      if (!upstreamResponse.ok) {
        const upstreamError = new Error(`Upstream request failed with HTTP ${upstreamResponse.status}`);
        upstreamError.status = upstreamResponse.status;
        upstreamError.details = await upstreamResponse.text();
        throw upstreamError;
      }

      return upstreamResponse;
    } catch (error) {
      if (error.name === "TypeError") {
        error.isNetworkError = true;
      }

      lastError = error;
      const isRetry = isRetriableError(error) && attempt < MAX_FETCH_ATTEMPTS;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      console.error(`Upstream fetch failed for page ${pageIndex + 1} (attempt ${attempt}/${MAX_FETCH_ATTEMPTS}): ${errorMessage}`);

      if (!isRetry) {
        throw error;
      }

      await sleep(500 * attempt);
    }
  }

  throw lastError || new Error("Unknown upstream fetch error");
}

async function runSync(source) {
  const allRecords = await fetchArtifactsFromUpstream(source);
  const tempFilePath = `${source.dataFilePath}.tmp`;
  await fs.writeFile(tempFilePath, JSON.stringify(allRecords, null, 2), "utf8");
  await fs.rename(tempFilePath, source.dataFilePath);
  return allRecords.length;
}

function triggerBackgroundSync(source, reason) {
  const currentPromise = activeSyncPromises.get(source.key);
  if (currentPromise) {
    return currentPromise;
  }

  const nextPromise = (async () => {
    try {
      const count = await runSync(source);
      const dataFileName = path.basename(source.dataFilePath);      
      return count;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Sync failed (${source.key}/${reason}): ${message}`);
      throw error;
    } finally {
      activeSyncPromises.delete(source.key);
    }
  })();

  activeSyncPromises.set(source.key, nextPromise);
  return nextPromise;
}

async function syncArtifacts(response, source) {
  try {
    const syncedCount = await triggerBackgroundSync(source, "manual-sync-button");
    sendJson(response, 200, {
      ok: true,
      count: syncedCount
    });
  } catch (error) {
    console.error("Manual sync endpoint error:", error);
    sendJson(response, error.status || 502, {
      error: "Failed to sync artifacts from api.sap.com",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

async function ensureInitialDataSync(source) {
  try {
    const records = await readArtifactsFromFile(source);
    if (records.length === 0) {
      triggerBackgroundSync(source, "startup-empty-file").catch(() => {
      });
    }
  } catch (error) {
    console.error(`Failed to check initial cache file (${source.key}):`, error);
    triggerBackgroundSync(source, "startup-read-error").catch(() => {
    });
  }
}

const server = http.createServer(async (request, response) => {
  const parsedUrl = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && parsedUrl.pathname === "/api/artifacts") {
    await proxyArtifacts(response, SOURCES.pce);
    return;
  }

  if (request.method === "POST" && parsedUrl.pathname === "/api/sync") {
    await syncArtifacts(response, SOURCES.pce);
    return;
  }

  if (request.method === "GET" && parsedUrl.pathname === "/api/s4cloud/artifacts") {
    await proxyArtifacts(response, SOURCES.cloud);
    return;
  }

  if (request.method === "POST" && parsedUrl.pathname === "/api/s4cloud/sync") {
    await syncArtifacts(response, SOURCES.cloud);
    return;
  }

  if (request.method === "POST") {
    response.writeHead(405, { Allow: "GET, HEAD, POST /api/sync, POST /api/s4cloud/sync" });
    response.end("Method Not Allowed");
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "POST") {
    response.writeHead(405, { Allow: "GET, HEAD, POST /api/sync, POST /api/s4cloud/sync" });
    response.end("Method Not Allowed");
    return;
  }

  await serveStaticFile(parsedUrl.pathname, response);
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  ensureInitialDataSync(SOURCES.pce);
  ensureInitialDataSync(SOURCES.cloud);
});
