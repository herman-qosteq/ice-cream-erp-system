import http from 'http';
import { app } from './app';
import { env } from './config/env';
import { initRealtime } from './realtime';

const server = http.createServer(app);
initRealtime(server);

server.listen(env.port, () => {
  console.log(`FrostyFlow API listening on http://localhost:${env.port}`);
});
