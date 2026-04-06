import { resolve } from 'path';

export default {
  server: {
    port: 34200,
    host: true,
    allowedHosts: ['batumi.typingrealm.org'],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ropewar: resolve(__dirname, 'ropewar.html'),
      },
    },
  },
}
