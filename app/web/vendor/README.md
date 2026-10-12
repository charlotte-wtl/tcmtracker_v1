# Vendored libraries

`anthropic-sdk-0.129.0.mjs` is the official Anthropic TypeScript SDK
(`@anthropic-ai/sdk@0.129.0`, MIT — see `LICENSE-anthropic-sdk`) bundled into
one browser ES module, so the app keeps loading without a build step or a
CDN. To update it:

```sh
npm i @anthropic-ai/sdk@<version> esbuild
echo 'export { default } from "@anthropic-ai/sdk";' > entry.mjs
npx esbuild entry.mjs --bundle --format=esm --minify --platform=browser \
  --target=es2020 --legal-comments=eof --outfile=anthropic-sdk-<version>.mjs
```

then point `js/ai.js` and `sw.js` at the new file.
