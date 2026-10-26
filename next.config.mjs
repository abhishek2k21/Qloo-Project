/** @type {import('next').NextConfig} */
const nextConfig = {
  // Qloo returns verbose entity payloads (akas, images); compress to keep
  // agent-loop payloads small when streamed through the API route.
  compress: true,
};

export default nextConfig;
