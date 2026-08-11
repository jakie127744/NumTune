import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig();

// Next 16 builds with Turbopack by default, but the OpenNext Cloudflare
// adapter version compatible with our Next version (16.1.6) doesn't
// support Turbopack's output shape yet (fails at runtime with
// "ComponentMod.handler is not a function"). Force webpack for this
// build only - the `build` script Vercel uses stays on Turbopack.
// `buildCommand` exists on the base OpenNext config type but isn't part of
// the CloudflareOverrides param type, so it's set directly on the result.
config.buildCommand = "npx next build --webpack";

export default config;
