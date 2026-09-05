export interface ServerConfig {
  port: number;
  host: string;
  corsOrigin: string;
  enableProber: boolean;
  probeIntervalDefaultMs: number;
  logLevel: string;
}

export const config: ServerConfig = {
  port: parseInt(process.env.PORT || '8765', 10),
  host: process.env.HOST || '0.0.0.0',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  enableProber: process.env.ENABLE_PROBER !== 'false',
  probeIntervalDefaultMs: 60000,
  logLevel: process.env.LOG_LEVEL || 'info',
};
