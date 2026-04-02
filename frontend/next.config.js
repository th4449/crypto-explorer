/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.blockscout.com https://api.etherscan.io https://api.opensanctions.org " +
              (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") +
              "; font-src 'self';",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
