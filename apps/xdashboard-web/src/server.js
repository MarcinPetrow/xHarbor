import http from "node:http";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const port = 3002;
const apiBaseURL = new URL("http://127.0.0.1:8082");
const sessionBaseURL = new URL("http://127.0.0.1:8080");
const tagBaseURL = new URL("http://127.0.0.1:8085");
const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
const sharedPublicRoot = fileURLToPath(new URL("../../_shared-web/public/", import.meta.url));
const logoPath = fileURLToPath(new URL("../../../go_home.png", import.meta.url));

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function sendNotFound(response) {
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not Found");
}

function sendServerError(response, error) {
  response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(String(error?.message || error));
}

async function serveFromRoot(rootPath, pathname, response) {
  const filePath = normalize(join(rootPath, pathname));

  if (!filePath.startsWith(rootPath)) {
    return sendNotFound(response);
  }

  try {
    await access(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    sendNotFound(response);
  }
}

async function serveStatic(pathname, response) {
  const target = pathname === "/" ? "/index.html" : pathname;

  if (target === "/shared/go_home.png") {
    return serveFromRoot("/", logoPath, response);
  }

  if (target === "/shared/platform-mark.svg") {
    return serveFromRoot(sharedPublicRoot, "/platform-mark.svg", response);
  }

  if (target.startsWith("/shared/")) {
    return serveFromRoot(sharedPublicRoot, target.replace("/shared/", "/"), response);
  }

  return serveFromRoot(publicRoot, target, response);
}

async function proxyToAPI(request, response, pathname, targetBaseURL = apiBaseURL) {
  const url = new URL(pathname, targetBaseURL);

  const proxyRequest = http.request(
    url,
    {
      method: request.method,
      headers: {
        "content-type": request.headers["content-type"] || "application/json",
        "x-user-id": request.headers["x-user-id"] || "",
        "cookie": request.headers.cookie || ""
      }
    },
    (proxyResponse) => {
      const headers = {
        "Content-Type": proxyResponse.headers["content-type"] || "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      };
      if (proxyResponse.headers["set-cookie"]) {
        headers["Set-Cookie"] = proxyResponse.headers["set-cookie"];
      }
      response.writeHead(proxyResponse.statusCode || 500, headers);
      proxyResponse.pipe(response);
    }
  );

  request.pipe(proxyRequest);
  proxyRequest.on("error", (error) => sendServerError(response, error));
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/session" || url.pathname === "/api/users") {
      return proxyToAPI(request, response, url.pathname, sessionBaseURL);
    }

    if (url.pathname.startsWith("/api/tags")) {
      return proxyToAPI(request, response, `${url.pathname}${url.search}`, tagBaseURL);
    }

    if (url.pathname.startsWith("/api/")) {
      return proxyToAPI(request, response, `${url.pathname}${url.search}`);
    }

    return serveStatic(url.pathname, response);
  } catch (error) {
    return sendServerError(response, error);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`xdashboard-web listening on http://127.0.0.1:${port}`);
});
