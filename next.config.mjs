/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Mantemos a checagem de tipos do TypeScript no build, mas não bloqueamos por
  // regras de estilo do ESLint (o projeto prioriza a checagem de tipos).
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
