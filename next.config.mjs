/** @type {import('next').NextConfig} */
const nextConfig = {
  // The mapping/AOP/manual-input config files are read at runtime by the API routes.
  outputFileTracingIncludes: { "/api/data": ["./config/**/*"] },
};
export default nextConfig;
