// Docker-aware fetch wrapper for the Unity bridge.
// Node's built-in fetch (undici) silently drops the Host header,
// so when UNITY_BRIDGE_HOST_HEADER is set we fall back to http.request.
import http from "http";
import { CONFIG } from "./config.js";

export function bridgeFetch(url, options = {}) {
  if (!CONFIG.editorBridgeHostHeader) {
    return fetch(url, options);
  }

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqHeaders = { ...options.headers, Host: CONFIG.editorBridgeHostHeader };

    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: reqHeaders,
      timeout: 60000,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("error", reject);
      res.on("end", () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: () => Promise.resolve(data),
          json: () => {
            try {
              return Promise.resolve(JSON.parse(data));
            } catch (e) {
              return Promise.reject(e);
            }
          },
        });
      });
    });

    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        req.destroy();
        reject(new DOMException("The operation was aborted", "AbortError"));
      });
    }

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
    req.on("error", reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}
