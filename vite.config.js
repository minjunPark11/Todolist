import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/**
 * Serve POST /api/mcp from the dev server.
 *
 * The MCP endpoint is a Vercel function in production, and nothing in this
 * repo runs Vercel functions locally. Without this, Phase 4 could only be
 * checked by deploying — which is the slowest possible loop for a protocol you
 * are meant to poke at with `mcp-inspector`.
 *
 * Vite already compiles TypeScript for the app, so `ssrLoadModule` gets the
 * server module with no build step and no new dependency. Dev only: this
 * plugin has no `apply: "build"` path and never reaches the bundle.
 *
 *   npm run dev
 *   npx @modelcontextprotocol/inspector
 *     → http://127.0.0.1:5173/api/mcp, with a Supabase access token as the
 *       bearer (see src/server/mcp/auth.ts for what is and is not checked).
 */
function mcpDevEndpoint() {
  return {
    name: "focusflow-mcp-dev",
    apply: "serve",
    configureServer(server) {
      // The server layer reads process.env, the way it will on Vercel. Vite
      // puts .env into import.meta.env instead, which that layer is forbidden
      // to touch (src/server/purity.test.ts), so the bridge is built here —
      // in dev-only config, where a browser-shaped assumption cannot follow.
      const env = loadEnv(server.config.mode, process.cwd(), "");
      for (const key of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]) {
        if (env[key] && !process.env[key]) process.env[key] = env[key];
      }

      // The RFC 9728 document, at the address a connector actually looks for.
      // In production a rewrite in vercel.json maps this path to the function
      // under api/; here the middleware is the rewrite.
      server.middlewares.use("/.well-known/oauth-protected-resource", async (_req, res) => {
        try {
          const { protectedResourceMetadata, readAppUrl } = await server.ssrLoadModule("/src/server/mcp/index.ts");
          const { readSupabaseEnv } = await server.ssrLoadModule("/src/server/data/repository.ts");
          const appUrl = readAppUrl() ?? `http://127.0.0.1:${server.config.server.port ?? 5173}`;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(protectedResourceMetadata({ appUrl, supabaseUrl: readSupabaseEnv().url })));
        } catch (error) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: String(error) }));
        }
      });

      server.middlewares.use("/api/mcp", async (req, res) => {
        try {
          const { serveMcp } = await server.ssrLoadModule("/src/server/mcp/index.ts");
          const body = await readJsonBody(req);
          const response = await serveMcp({ method: req.method ?? "POST", headers: req.headers, body });

          for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value);
          res.statusCode = response.status;
          if (response.body === null) {
            res.end();
            return;
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(response.body));
        } catch (error) {
          // Only the dev server sees this, and seeing it is the point.
          console.error("[mcp dev]", error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(error) }));
        }
      });
    },
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("error", reject);
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        // Handed on as a string: the server's own parser answers with the
        // JSON-RPC parse error the client expects, rather than a 500 from here.
        resolve(raw);
      }
    });
  });
}

export default defineConfig({
  plugins: [react(), mcpDevEndpoint()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
});
