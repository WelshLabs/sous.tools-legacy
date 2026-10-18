module.exports = {
  apps: [
    {
      name: "api",
      script: "pnpm",
      interpreter: "none",
      
      args: "run --filter api dev",
      env: {
        NODE_ENV: "development",
        // Ensure pnpm cache/store is writable in this environment
        XDG_CACHE_HOME: "/tmp/.cache",
        PNPM_HOME: "/tmp/.pnpm-home",
        PNPM_STORE_PATH: "/tmp/.pnpm-store",
      },
      autorestart: true,
      watch: false,
    },
    {
      name: "web",
      script: "pnpm",
      interpreter: "none",
      
      args: "run --filter web dev",
      env: {
        NODE_ENV: "development",
        XDG_CACHE_HOME: "/tmp/.cache",
        PNPM_HOME: "/tmp/.pnpm-home",
        PNPM_STORE_PATH: "/tmp/.pnpm-store",
      },
      autorestart: true,
      watch: false,
    },
    {
      name: "setup-portal",
      script: "pnpm",
      interpreter: "none",
      
      args: "run --filter @soustools/setup-portal dev",
      env: {
        NODE_ENV: "development",
        XDG_CACHE_HOME: "/tmp/.cache",
        PNPM_HOME: "/tmp/.pnpm-home",
        PNPM_STORE_PATH: "/tmp/.pnpm-store",
      },
      autorestart: true,
      watch: false,
    },
  ],
};
