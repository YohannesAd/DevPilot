import type { NextConfig } from "next";
import { proxyConfig } from "./lib/server/proxy-config";

proxyConfig(); // Validate at build/start as well as at request time.

const config: NextConfig = {
  outputFileTracingRoot: __dirname,
};

export default config;
