import type { AstroIntegration } from "astro";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path, { posix as pathPosix } from "node:path";
import { fileURLToPath, URL } from "node:url";

export type RedirectCode = "permanent" | 301 | "temp" | 302 | "seeother" | 303 | "gone" | 410;
export type ErrorCode =
  | 400
  | 401
  | 402
  | 403
  | 404
  | 405
  | 406
  | 410
  | 412
  | 415
  | 418
  | 420
  | 422
  | 426
  | 429
  | 451
  | 500
  | 501
  | 502
  | 503
  | 504
  | 505;

export interface Config {
  generateHtaccessFile?: boolean | (() => boolean) | (() => Promise<boolean>);
  errorPages?: { code: ErrorCode; document: string }[];
  redirects?: { code?: RedirectCode; match: string | RegExp; url: string }[];
  customRules?: string[];
}

const errorPageRegex = /^\/([345]\d\d)$/;
const spaceInCharacterMatchingRegex = /([^\\]|^)\[((?:\\\]|[^ ])*) ((?:\\\]|[^ ])*)\]/g;

export const integration = ({ generateHtaccessFile, errorPages, redirects, customRules }: Config = {}) => {
  let assetsDir: string | null = null;
  let enabled: boolean | null = true;
  const integration: AstroIntegration = {
    name: "htaccess",
    hooks: {
      "astro:config:setup": async ({ config, logger }) => {
        if (enabled === null) {
          enabled =
            generateHtaccessFile === undefined
              ? true
              : typeof generateHtaccessFile === "function"
                ? !(await generateHtaccessFile())
                : !generateHtaccessFile;
        }
        if (!enabled) {
          logger.debug("generateHtaccessFile evaluated to false; skipping integration config.");
          return;
        }
        if (config.output === "server") {
          logger.warn("Cannot generate .htaccess file in SSR mode.");
          return;
        }
        if (config.adapter?.name.startsWith("@astrojs/vercel")) {
          assetsDir = fileURLToPath(new URL(".vercel/output/static/", config.root));
        } else if (config.adapter?.name === "@astrojs/cloudflare") {
          assetsDir = fileURLToPath(new URL(config.base?.replace(/^\//, ""), config.outDir));
        } else if (config.adapter?.name === "@astrojs/node") {
          assetsDir = fileURLToPath(config.build.client!);
        } else {
          assetsDir = fileURLToPath(config.outDir);
        }
      },
      "astro:build:done": async ({ logger, routes }) => {
        if (enabled === null) {
          enabled =
            generateHtaccessFile === undefined
              ? true
              : typeof generateHtaccessFile === "function"
                ? !(await generateHtaccessFile())
                : !generateHtaccessFile;
        }
        if (!enabled) {
          logger.debug("generateHtaccessFile evaluated to false; skipping .htaccess generation.");
          return;
        }
        if (!assetsDir) {
          logger.warn("Cannot generate .htaccess file in SSR mode.");
          return;
        }
        const handledErrorCodes = new Set<number>();
        let error = false;
        const htaccess = [
          // Custom rules
          () => customRules ?? [],
          // User-defined error pages
          () =>
            !error && errorPages
              ? errorPages.map(({ code, document }) => {
                  if (error) {
                    return "";
                  }
                  // Generate error pages from user input
                  if (code in handledErrorCodes) {
                    logger.error(`Duplicated error code ${code} detected!`);
                    error = true;
                    return "";
                  }
                  handledErrorCodes.add(code);
                  return `ErrorDocument ${code} ${pathPosix.join("/", document.endsWith(".html") ? document : `${document}.html`)}`;
                })
              : [],
          // Automatic error pages and Astro redirects
          () =>
            (!error &&
              routes.reduce((acc, { type, route, redirect }) => {
                if (!error) {
                  switch (type) {
                    case "redirect":
                      const destination = typeof redirect === "string" ? redirect : redirect?.destination;
                      if (destination) {
                        acc.push(`RedirectMatch 301 ^${route}(/(index.html)?)?$ ${destination}`);
                      } else {
                        logger.warn(`No destination found for redirect route "${route}"! Skipping.`);
                      }
                      break;
                    case "page":
                      if (errorPages === undefined) {
                        // Find error pages programtically by matching on their routes (eg. `/404`)
                        const match = route.match(errorPageRegex);
                        if (match && match[1]) {
                          const code = parseInt(match[1]);
                          if (code in handledErrorCodes) {
                            logger.error(`Duplicated error code ${code} detected!`);
                            error = true;
                            return acc;
                          }
                          handledErrorCodes.add(code);
                          acc.push(`ErrorDocument ${code} ${route.endsWith(".html") ? route : `${route}.html`}`);
                        }
                      }
                      break;
                  }
                }
                return acc;
              }, [] as string[])) ||
            [],
          // User-defined redirects
          () =>
            !error && redirects
              ? redirects.map(({ code, match, url }) => {
                  if (error) {
                    return "";
                  }
                  if (typeof match !== "string") {
                    match = match
                      .toString()
                      // Remove slashes around regex
                      .slice(1, -1)
                      // Remove escaping for forward slashes
                      .replaceAll("\\/", "/")
                      // Replace spaces in [ ] expressions with equivalent for escaped space (%20)
                      .replaceAll(spaceInCharacterMatchingRegex, "$1(?:[$2$3]|%20)")
                      // Replace spaces anywhere else with escaped spaces (%20)
                      .replaceAll(" ", "%20");
                    if (match.search("\n") > -1) {
                      logger.error(`Invalid line break in regex for ${url}`);
                      error = true;
                      return "";
                    }
                  }
                  return `RedirectMatch ${code ?? 301} ${match} ${url}`;
                })
              : [],
        ]
          .map((fn) => fn())
          .flat();
        if (!error) {
          const htaccessPath = path.join(assetsDir, ".htaccess");
          await writeFile(htaccessPath, [existsSync(htaccessPath) ? "\n" : "", htaccess.join("\n")], { flag: 'a' });
          logger.info(`Generated .htaccess with ${htaccess.length} ${htaccess.length === 1 ? "rule" : "rules"}`);
        }
      },
    },
  };
  return integration;
};
