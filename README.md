# astro-htaccess

SSG-only integration for Astro 4+ to generate an Apache `.htaccess` file, from user-defined rules and Astro's configuration.

## Installation

To automatically install the integration with the default configuration:

```sh
astro add astro-htaccess
```

Or to install it manually, first run:

```sh
npm install --save astro-htaccess@latest
```

Then add it to your astro configuration (i.e. `astro.config.mjs`):

```diff
import { defineConfig } from 'astro/config';
+import htaccessIntegration from "astro-htaccess";

export default defineConfig({
-  integrations: [],
+  integrations: [htaccessIntegration()],
})
```

## Configuration

The following properties can be passed to an object when calling `htaccessIntegration()`:

| Option                 | Description                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateHtaccessFile` | a boolean, or function that returns a boolean or a `Promise<boolean>`. If false, then no files will not be generated; if true or omitted, then `.htaccess` will be created at the root of the output directory.                                                                                                                                                                                                         |
| `errorPages`           | List of custom error pages to generate for user-specified HTTP errors. If omitted, `astro-htaccess` will generate these for you based on any `src/content/*.astro` routes that match a valid HTTP error.                                                                                                                                                                                                                |
| `redirects`            | List of custom redirects to add as [`RedirectMatch` rules](https://httpd.apache.org/docs/2.2/mod/mod_alias.html#redirectmatch), on top of the redirects defined in the `redirects` property of your Astro config. You can use Javascript regular expressions as the matcher, or a plain string for finer control over the output expression; and you can specify a custom redirect code for each rule (default is 301). |
| `customRules`          | Custom rules to add to the output `.htaccess` file directly.                                                                                                                                                                                                                                                                                                                                                            |

### Example configuration

Here, we are using an [environment variable](https://docs.astro.build/en/guides/environment-variables/) with Astro's [experimental `astro:env` API](https://docs.astro.build/en/reference/configuration-reference/#experimentalenv) to decide whether to generate our configuration file. We use a custom error in `src/content/errors/404.astro` (but we could've simply placed it at `src/content/404.astro` and removed the `errorPages` field to automatically detect it). Then, we specify two outward-bound redirects on top of Astro's redirect, and finally, we add some custom rules to enforce HTTP authentication for the whole site.

```js
import { defineConfig, envField } from "astro/config";
import htaccessIntegration from "astro-htaccess";

// https://astro.build/config
export default defineConfig({
  site: "https://example.astro.build/",
  integrations: [
    htaccessIntegration({
      generateHtaccessFile: import.meta.env.GENERATE_HTACCESS_FILE === "true",
      errorPages: [{ code: 404, document: "/errors/404" }],
      redirects: [
        { match: /^\/package@npm$/, url: "https://www.npmjs.com/package/astro-htaccess" },
        { match: "^/github\\b", url: "https://github.com/BadMannersXYZ/astro-htaccess", code: 302 },
      ],
      customRules: [
        `AuthType Basic`,
        `AuthName "Protected website"`,
        `AuthUserFile ../private/.htpasswd`,
        `require valid-user`,
      ],
    }),
  ],
  redirects: {
    "/faq": "/about_this_project",
  },
  experimental: {
    env: {
      schema: {
        GENERATE_HTACCESS_FILE: envField.boolean({ context: "server", access: "private", default: false }),
      },
    },
  },
});
```

In this example, when the `GENERATE_HTACCESS_FILE` environment variable is true, a `.htaccess` file containing the following rules is generated to our output directory:

```txt
AuthType Basic
AuthName "Protected website"
AuthUserFile ../private/.htpasswd
require valid-user
ErrorDocument 404 /errors/404.html
RedirectMatch 301 ^/faq(/(index.html)?)?$ /about_this_project
RedirectMatch 301 ^/package@npm$ https://www.npmjs.com/package/astro-htaccess
RedirectMatch 302 ^/github\b https://github.com/BadMannersXYZ/astro-htaccess
```
